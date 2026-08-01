// feature 00023 Deep Chat-Bot Assistant — phase `00023-ai-enhance` A-04
// SSOT: docs/scope/2026-08-01-00023-ai-enhance-scope-baseline.md
//       + PRD.md §3.9 BR-AR-31/32/33 · BRD.md §2.8 FR-025/026
//
// ให้ AI เรียบเรียงคำตอบสำเร็จรูปก่อนส่ง + ด่านตรวจกฎห้ามตอบ
//
// WARNING: สัญญาที่ห้ามผิด — ฟังก์ชันนี้ **ห้าม throw ออกนอกเด็ดขาด**
//    มันอยู่ในเส้นทางที่ลูกค้ากำลังรอคำตอบอยู่ — throw เมื่อไหร่ = ทั้ง job ล้ม = ลูกค้าไม่ได้
//    อะไรเลย ทั้งที่คำตอบดิบของร้านพร้อมส่งอยู่แล้ว ทุกความล้มเหลวต้องกลายเป็น
//    `{ text: rawAnswer, reason }` เสมอ
//
// ทำไมไม่ reuse `generateReplySuggestions` ของ 00019:
//    ตัวนั้นบังคับรูปแบบผลลัพธ์เป็น JSON 3 ข้อเสนอ, ใช้ timeout 15 วินาที (มีแอดมินนั่งรอ),
//    และรองรับไฟล์แนบ — ทั้งสามอย่างไม่ใช่สิ่งที่เส้นทางนี้ต้องการ การดัดตัวนั้นให้ทำสองงาน
//    จะทำให้ทั้งสองฟีเจอร์ผูกกันจนแก้ตัวหนึ่งพังอีกตัว

import {
  AI_ENHANCE_TIMEOUT_MS,
  type AiEnhanceSkipReason,
} from '@/lib/auto-reply-constants'
import type { TokenUsage } from '@/lib/ai-pricing'

/** รุ่นที่ใช้ — flash-lite เร็วและถูกที่สุดในสาย 2.5 (ปิดการคิดโดยดีฟอลต์) */
const AI_ENHANCE_MODEL = process.env.AI_ENHANCE_MODEL || 'gemini-2.5-flash-lite'

const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

export interface EnhanceInput {
  /** คำตอบสำเร็จรูปที่ร้านเขียนไว้ — ต้นฉบับที่ห้ามเพี้ยน */
  rawAnswer: string
  /** ข้อความล่าสุดของลูกค้า — ให้ AI รู้บริบทว่ากำลังตอบอะไร */
  customerText: string
  /** กฎห้ามตอบที่เปิดใช้งานอยู่ของกลุ่มคำนี้ */
  guardrails: { rule: string; denyPhrases: string[] }[]
}

export interface EnhanceResult {
  /** ข้อความที่จะส่งจริง — คำตอบดิบเสมอเมื่อ enhance ไม่สำเร็จ */
  text: string
  /** เรียบเรียงสำเร็จไหม */
  enhanced: boolean
  /** ต้องหยุดไม่ส่งอะไรเลยและส่งต่อคนไหม (ชนกฎจริงเท่านั้น) */
  blocked: boolean
  reason: AiEnhanceSkipReason | null
  usage: TokenUsage | null
  elapsedMs: number
}

/* ── prompt (user อนุมัติ 2026-08-01) ──────────────────────────────────────── */

const REWRITE_SYSTEM = `คุณคือผู้ช่วยของร้านค้าออนไลน์ หน้าที่เดียวของคุณคือเรียบเรียงข้อความที่ร้านเขียนไว้ให้อ่านลื่นและสุภาพขึ้น

กฎที่ห้ามฝ่าฝืน:
- ห้ามเพิ่มข้อมูลที่ไม่มีในต้นฉบับ — ราคา วันส่ง เงื่อนไข จำนวน ต้องตรงเป๊ะ ห้ามเดา ห้ามปัด
- ห้ามตัดข้อมูลที่มีในต้นฉบับออก
- ห้ามสัญญาอะไรแทนร้าน
- ตอบภาษาไทย ความยาวใกล้เคียงต้นฉบับ ห้ามยาวกว่าสองเท่า
- ถ้าต้นฉบับดีอยู่แล้ว ส่งกลับตามเดิมได้เลย

ตอบกลับเป็นข้อความที่จะส่งให้ลูกค้าเท่านั้น ห้ามมีคำอธิบายอื่น`

function buildJudgePrompt(rules: string[], text: string): string {
  return `ร้านนี้มีกฎห้ามตอบดังนี้:
${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

ข้อความที่กำลังจะส่งให้ลูกค้า:
${text}

ข้อความนี้ฝ่าฝืนกฎข้อใดข้อหนึ่งหรือไม่
ตอบคำเดียว: PASS หรือ BLOCK`
}

/* ── ด่านแรก: denylist (ไม่มีต้นทุน AI) ────────────────────────────────────── */

/**
 * ตรวจว่าข้อความชนคำดักไหม — ฟังก์ชันบริสุทธิ์ ไม่มี I/O
 *
 * เทียบแบบ substring ตรงตัว ไม่ normalize: คำดักเป็นสิ่งที่ร้านพิมพ์เองเพื่อดักคำที่ AI
 * อาจพูด ซึ่งเป็นภาษาเขียนปกติ — การ normalize (ตัดวรรณยุกต์/ช่องว่าง) จะทำให้ดักเกินจริง
 * แล้วบอทเงียบใส่ลูกค้าโดยไม่มีเหตุผลที่ดี
 */
export function hitsDenylist(text: string, guardrails: { denyPhrases: string[] }[]): string | null {
  const lower = text.toLowerCase()
  for (const g of guardrails) {
    for (const p of g.denyPhrases) {
      const needle = p.trim().toLowerCase()
      if (needle && lower.includes(needle)) return p
    }
  }
  return null
}

/* ── การเรียก Gemini แบบข้อความเดียว ───────────────────────────────────────── */

async function callGemini(
  systemText: string | null,
  userText: string,
  signal: AbortSignal,
  maxOutputTokens: number
): Promise<{ text: string; usage: TokenUsage | null }> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_NOT_CONFIGURED')

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: {
      maxOutputTokens,
      temperature: 0.3, // ต่ำ — งานนี้คือเรียบเรียง ไม่ใช่สร้างสรรค์
      // flash-lite ไม่คิดอยู่แล้ว แต่ระบุให้ชัดกันรุ่นเปลี่ยนพฤติกรรม
      thinkingConfig: { thinkingBudget: 0 },
    },
  }
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] }

  const res = await fetch(ENDPOINT(AI_ENHANCE_MODEL, key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`GEMINI_HTTP_${res.status}`)

  const data = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
  } | null

  const parts = data?.candidates?.[0]?.content?.parts ?? []
  const text = parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')
    .trim()
  if (!text) throw new Error('GEMINI_EMPTY_RESPONSE')

  const um = data?.usageMetadata
  const usage: TokenUsage | null =
    um && typeof um.promptTokenCount === 'number'
      ? {
          inputTokens: um.promptTokenCount,
          outputTokens:
            um.candidatesTokenCount ?? Math.max(0, (um.totalTokenCount ?? 0) - um.promptTokenCount),
          model: AI_ENHANCE_MODEL,
        }
      : null

  return { text, usage }
}

/* ── ตัวหลัก ────────────────────────────────────────────────────────────────── */

/**
 * เรียบเรียงคำตอบ + ตรวจกฎ ภายใต้งบเวลารวม 8 วินาที (BR-AR-31)
 *
 * ลำดับตาม BR-AR-32: denylist -> เรียบเรียง -> ด่านตัดสิน AI (ตรวจ **ข้อความที่เรียบเรียงแล้ว**)
 *
 * WARNING: งบเวลาเป็น "ก้อนเดียวของทั้ง pipeline" — ใช้ `AbortSignal.timeout` ตัวเดียวคุมทั้งสอง
 * การเรียก ไม่ใช่ตัวละ 8 วินาที (จะกลายเป็น 16) และไม่ไล่โมเดลสำรองเมื่อหมดเวลา
 */
export async function enhanceReply(input: EnhanceInput): Promise<EnhanceResult> {
  const started = Date.now()
  const raw = input.rawAnswer
  const fail = (reason: AiEnhanceSkipReason): EnhanceResult => ({
    text: raw,
    enhanced: false,
    blocked: false,
    reason,
    usage: null,
    elapsedMs: Date.now() - started,
  })

  const active = input.guardrails
  try {
    // ── ด่าน 1: denylist บนคำตอบดิบ ──
    // ตรวจคำตอบดิบด้วยเพราะถ้าตัวต้นฉบับเองชนกฎอยู่แล้ว การให้ AI แต่งไม่ได้ทำให้ปลอดภัยขึ้น
    if (hitsDenylist(raw, active)) {
      return { text: raw, enhanced: false, blocked: true, reason: 'GUARDRAILS_BLOCKED', usage: null, elapsedMs: Date.now() - started }
    }

    const signal = AbortSignal.timeout(AI_ENHANCE_TIMEOUT_MS)

    // ── ด่าน 2: เรียบเรียง ──
    let rewritten: string
    let usage: TokenUsage | null = null
    try {
      const r = await callGemini(
        REWRITE_SYSTEM,
        `ข้อความล่าสุดของลูกค้า: ${input.customerText}\n\nข้อความที่ร้านเขียนไว้:\n${raw}`,
        signal,
        1024
      )
      rewritten = r.text
      usage = r.usage
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
      return fail(timedOut ? 'AI_ENHANCE_TIMEOUT' : 'AI_ENHANCE_ERROR')
    }

    // ── ด่าน 3: denylist บนข้อความที่ AI แต่ง ──
    if (hitsDenylist(rewritten, active)) {
      return { text: raw, enhanced: false, blocked: true, reason: 'GUARDRAILS_BLOCKED', usage, elapsedMs: Date.now() - started }
    }

    // ── ด่าน 4: ด่านตัดสิน AI (เฉพาะเมื่อมีกฎ) ──
    const rules = active.map((g) => g.rule).filter(Boolean)
    if (rules.length > 0) {
      try {
        const j = await callGemini(null, buildJudgePrompt(rules, rewritten), signal, 16)
        const verdict = j.text.toUpperCase()
        if (verdict.includes('BLOCK')) {
          return { text: raw, enhanced: false, blocked: true, reason: 'GUARDRAILS_BLOCKED', usage, elapsedMs: Date.now() - started }
        }
        // ไม่ตอบ PASS ชัดเจน = ตัดสินไม่ได้ ไม่ใช่ผ่าน — ถอยคำตอบดิบ (fail-closed แบบ BR-AR-33)
        if (!verdict.includes('PASS')) return fail('GUARDRAILS_CHECK_FAILED')
      } catch {
        // ตัวตรวจเองล่ม/หมดเวลา -> ถอยคำตอบดิบ **ไม่ใช่** ส่งต่อคน (BR-AR-33)
        return fail('GUARDRAILS_CHECK_FAILED')
      }
    }

    return { text: rewritten, enhanced: true, blocked: false, reason: null, usage, elapsedMs: Date.now() - started }
  } catch (e) {
    // ตาข่ายสุดท้าย — อะไรที่หลุดมาถึงนี่ต้องไม่ทำให้ลูกค้าไม่ได้คำตอบ
    console.error('[ai-enhance] unexpected', e)
    return fail('AI_ENHANCE_ERROR')
  }
}
