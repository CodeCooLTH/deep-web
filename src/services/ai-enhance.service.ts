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
// ใช้ `generateText` ของ `lib/gemini.ts` ร่วมกับ 00019 — **ห้ามเขียน client เรียก Gemini
// ขึ้นใหม่ในไฟล์นี้อีก** (บทเรียน 2026-08-01: เคยเขียนซ้ำแล้วใช้ `systemInstruction`
// camelCase ซึ่ง REST v1beta ไม่รับ -> 400 -> ตกกลับคำตอบดิบเงียบ ๆ โดยไม่มีใครรู้
// เพราะฟังก์ชันนี้กลืน error ทุกชนิดตามสัญญาข้างบน)

import {
  AI_ENHANCE_TIMEOUT_MS,
  type AiEnhanceSkipReason,
} from '@/lib/auto-reply-constants'
import type { TokenUsage } from '@/lib/ai-pricing'
import { generateText } from '@/lib/gemini'

export interface EnhanceInput {
  /** คำตอบสำเร็จรูปที่ร้านเขียนไว้ — ต้นฉบับที่ห้ามเพี้ยน */
  rawAnswer: string
  /** ข้อความล่าสุดของลูกค้า — ให้ AI รู้บริบทว่ากำลังตอบอะไร */
  customerText: string
  /** กฎห้ามตอบที่เปิดใช้งานอยู่ของกลุ่มคำนี้ */
  guardrails: { rule: string; denyPhrases: string[] }[]
  /** น้ำเสียงที่ร้านตั้งไว้ — null/ว่าง = ใช้ค่ากลาง */
  tone?: string | null
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

const DEFAULT_TONE = 'สุภาพ เป็นกันเอง อ่านง่าย'

/**
 * น้ำเสียงถูกแทรกเข้า prompt ตรง ๆ (ข้อความที่ร้านพิมพ์เอง)
 *
 * WARNING: ห้ามให้น้ำเสียงมีอำนาจเหนือกฎข้อมูล — กฎ "ห้ามเพิ่ม/ตัดข้อมูล" ต้องอยู่ **หลัง**
 * บรรทัดน้ำเสียงเสมอ เพื่อให้เป็นสิ่งสุดท้ายที่โมเดลอ่าน ร้านที่เขียนน้ำเสียงแบบ
 * "ขายของเก่ง ๆ กระตุ้นให้รีบซื้อ" จะได้ไม่กลายเป็นใบอนุญาตให้แต่งเงื่อนไขเอง
 */
function buildRewriteSystem(tone: string | null | undefined): string {
  const t = (tone ?? '').trim() || DEFAULT_TONE
  return REWRITE_SYSTEM.replace('{{TONE}}', t)
}

const REWRITE_SYSTEM = `คุณคือผู้ช่วยของร้านค้าออนไลน์ หน้าที่เดียวของคุณคือเรียบเรียงข้อความที่ร้านเขียนไว้ให้อ่านลื่นขึ้น

น้ำเสียงที่ร้านต้องการ: {{TONE}}

กฎที่ห้ามฝ่าฝืน (สำคัญกว่าน้ำเสียงเสมอ):
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
      const r = await generateText({
        system: buildRewriteSystem(input.tone),
        user: `ข้อความล่าสุดของลูกค้า: ${input.customerText}\n\nข้อความที่ร้านเขียนไว้:\n${raw}`,
        maxOutputTokens: 1024,
        signal,
      })
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
        // 128 ไม่ใช่ 16: คำตอบที่ต้องการคือคำเดียว แต่โมเดลอาจนำหน้าด้วยช่องว่าง/บรรทัดใหม่
        // ถ้าเพดานเตี้ยเกินจะถูกตัดจนได้ข้อความว่าง -> ตัดสินไม่ได้ -> ถอยคำตอบดิบทุกครั้ง
        const j = await generateText({
          user: buildJudgePrompt(rules, rewritten),
          maxOutputTokens: 128,
          temperature: 0,
          signal,
        })
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
