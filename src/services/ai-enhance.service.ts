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
import { redactPii } from '@/lib/pii-redact'

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
        // ลูกค้าอาจพิมพ์เบอร์/ที่อยู่มาในข้อความ — กรองก่อนออกจากระบบเราเสมอ
        // (คำตอบดิบของร้านไม่ต้องกรอง: ร้านเขียนเอง ไม่ใช่ข้อมูลส่วนบุคคลของคนอื่น)
        user: `ข้อความล่าสุดของลูกค้า: ${redactPii(input.customerText).text}\n\nข้อความที่ร้านเขียนไว้:\n${raw}`,
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
        // รอบตรวจกฎเสียเงินจริง — ต้องรวมเข้า usage ไม่ใช่ทิ้ง ไม่งั้นบิลต่ำกว่าที่จ่ายจริง
        usage = mergeUsage(usage, j.usage)
        const verdict = j.text.toUpperCase()
        if (verdict.includes('BLOCK')) {
          return { text: raw, enhanced: false, blocked: true, reason: 'GUARDRAILS_BLOCKED', usage, elapsedMs: Date.now() - started }
        }
        // ไม่ตอบ PASS ชัดเจน = ตัดสินไม่ได้ ไม่ใช่ผ่าน — ถอยคำตอบดิบ (fail-closed แบบ BR-AR-33)
        // คืน usage ที่ใช้ไปแล้วด้วย: ถอยคำตอบไม่ได้แปลว่าโทเคนที่เผาไปไม่ต้องจ่าย
        if (!verdict.includes('PASS')) {
          return { text: raw, enhanced: false, blocked: false, reason: 'GUARDRAILS_CHECK_FAILED', usage, elapsedMs: Date.now() - started }
        }
      } catch {
        // ตัวตรวจเองล่ม/หมดเวลา -> ถอยคำตอบดิบ **ไม่ใช่** ส่งต่อคน (BR-AR-33)
        return { text: raw, enhanced: false, blocked: false, reason: 'GUARDRAILS_CHECK_FAILED', usage, elapsedMs: Date.now() - started }
      }
    }

    return { text: rewritten, enhanced: true, blocked: false, reason: null, usage, elapsedMs: Date.now() - started }
  } catch (e) {
    // ตาข่ายสุดท้าย — อะไรที่หลุดมาถึงนี่ต้องไม่ทำให้ลูกค้าไม่ได้คำตอบ
    console.error('[ai-enhance] unexpected', e)
    return fail('AI_ENHANCE_ERROR')
  }
}

/* ══ ChatBot — ตอบคำถามที่ไม่เข้าเงื่อนไขไหนเลย โดยอ่านจากคลังความรู้ ══════════
 * user ตัดสิน 2026-08-01 · สวิตช์ระดับร้าน (OFFLINE/TEST/LIVE)
 */

const CHATBOT_SYSTEM = `คุณคือผู้ช่วยตอบแชทของร้านค้าออนไลน์ ตอบคำถามลูกค้าโดยใช้ "คลังความรู้ของร้าน" ที่ให้มาเท่านั้น

กฎที่ห้ามฝ่าฝืน:
- ตอบได้เฉพาะสิ่งที่มีอยู่ในคลังความรู้ — ห้ามเดา ห้ามเติมข้อมูลจากความรู้ทั่วไป
- ราคา เงื่อนไข ระยะเวลาจัดส่ง ต้องตรงกับคลังเป๊ะ ห้ามปัด ห้ามประมาณ
- ห้ามสัญญาอะไรแทนร้าน
- ถ้าคลังไม่มีข้อมูลพอจะตอบคำถามนี้ ให้ตอบว่า NO_ANSWER คำเดียว ห้ามพยายามตอบแบบกว้าง ๆ
- ตอบภาษาไทย สั้นและตรงคำถาม

น้ำเสียงที่ร้านต้องการ: {{TONE}}

ตอบกลับเป็นข้อความที่จะส่งให้ลูกค้าเท่านั้น ห้ามมีคำอธิบายอื่น
ปิดท้ายด้วยบรรทัดใหม่ที่ระบุหมายเลขข้อในคลังที่ใช้ตอบ รูปแบบ [[USED:1,3]] — ระบบจะตัดบรรทัดนี้ทิ้งก่อนส่งให้ลูกค้า`

/** สัญญาณที่โมเดลใช้บอกว่า "คลังไม่มีข้อมูลพอ" — ต้องเงียบดีกว่าตอบมั่ว */
const NO_ANSWER_TOKEN = 'NO_ANSWER'

/**
 * รวม usage ของหลายรอบเรียกให้เป็นก้อนเดียว
 *
 * รอบตรวจกฎ (judge) เป็นการเรียกโมเดลจริงและเสียเงินจริง — เดิมโยน `j.usage` ทิ้ง
 * ค่าใช้จ่ายที่บันทึกจึงต่ำกว่าที่จ่ายจริงทุกครั้งที่ร้านตั้งกฎห้ามตอบไว้
 * ชื่อรุ่นใช้ของรอบแรก (รอบหลักที่กำหนดเรตส่วนใหญ่) และรอบ judge มักเป็นรุ่นเดียวกันอยู่แล้ว
 */
/**
 * แกะบรรทัด [[USED:1,3]] ออกจากคำตอบ แล้วแปลงหมายเลขข้อเป็น id
 *
 * โมเดลอาจไม่ใส่มาเลย หรือใส่เลขนอกช่วง — ทั้งสองกรณีไม่ถือเป็นความล้มเหลว
 * แค่ไม่ได้นับสถิติรอบนั้น ดีกว่าทิ้งคำตอบที่ใช้ได้เพราะเรื่องนับเลข
 * แต่ **ต้องตัดบรรทัดนี้ทิ้งเสมอ** แม้แกะเลขไม่ได้ ไม่งั้นลูกค้าจะเห็น [[USED:...]] ในแชท
 */
function extractUsedIds(answer: string, ids: string[] | undefined): { text: string; usedIds: string[] } {
  const re = /\[\[USED:([^\]]*)\]\]/gi
  const matches = [...answer.matchAll(re)]
  const text = answer.replace(re, '').trim()
  if (!ids || ids.length === 0 || matches.length === 0) return { text, usedIds: [] }

  const usedIds = new Set<string>()
  for (const m of matches) {
    for (const raw of (m[1] ?? '').split(',')) {
      const n = Number(raw.trim())
      if (Number.isInteger(n) && n >= 1 && n <= ids.length) usedIds.add(ids[n - 1])
    }
  }
  return { text, usedIds: [...usedIds] }
}

function mergeUsage(a: TokenUsage | null, b: TokenUsage | null): TokenUsage | null {
  if (!a) return b
  if (!b) return a
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    model: a.model,
  }
}

export interface ChatbotAnswerInput {
  customerText: string
  /** คลังความรู้ของร้าน — คู่คำถาม/คำตอบที่ใช้งานอยู่ */
  knowledge: { question: string; answer: string }[]
  /** id เรียงตรงกับ knowledge — ใช้แปลงหมายเลขข้อที่โมเดลอ้างกลับเป็น id (ไม่ส่งเข้า prompt) */
  knowledgeIds?: string[]
  guardrails: { rule: string; denyPhrases: string[] }[]
  tone?: string | null
}

export interface ChatbotAnswerResult {
  /** null = ไม่ตอบ (คลังไม่มีข้อมูล / ชนกฎ / ล้มเหลว) — ผู้เรียกต้องเงียบตามเดิม */
  text: string | null
  /** id ของความรู้ที่โมเดลบอกว่าใช้ตอบ — ว่างได้ถ้าโมเดลไม่ระบุ (ไม่ถือเป็นความล้มเหลว) */
  usedKnowledgeIds?: string[]
  blocked: boolean
  reason: AiEnhanceSkipReason | 'NO_KNOWLEDGE_ANSWER' | null
  usage: TokenUsage | null
}

/**
 * ให้ AI ตอบจากคลังความรู้ (BR ของ ChatBot)
 *
 * WARNING: ไม่ throw เด็ดขาด เหมือน `enhanceReply` — อยู่ในเส้นทางเดียวกับการตอบลูกค้า
 *
 * ต่างจาก `enhanceReply` ตรงที่ **ความเสี่ยงสูงกว่ามาก**: ตัวนั้นเรียบเรียงข้อความที่ร้าน
 * เขียนเองอยู่แล้ว ส่วนตัวนี้ AI แต่งประโยคขึ้นมาใหม่ — จึงบังคับให้ตอบจากคลังเท่านั้น
 * และให้ตอบ NO_ANSWER เมื่อข้อมูลไม่พอ ดีกว่าปล่อยให้เดาแล้วสัญญาสิ่งที่ร้านให้ไม่ได้
 */
export async function answerFromKnowledge(input: ChatbotAnswerInput): Promise<ChatbotAnswerResult> {
  const none = (reason: ChatbotAnswerResult['reason'], usage: TokenUsage | null = null): ChatbotAnswerResult => ({
    text: null, blocked: false, reason, usage,
  })

  if (input.knowledge.length === 0) return none('NO_KNOWLEDGE_ANSWER')

  try {
    const signal = AbortSignal.timeout(AI_ENHANCE_TIMEOUT_MS)
    const tone = (input.tone ?? '').trim() || DEFAULT_TONE

    // คลังส่งเข้า prompt เป็นคู่ถาม-ตอบ เรียงตามที่ service คัดมาแล้ว (ใช้บ่อยอยู่บน)
    const kb = input.knowledge
      .map((k, i) => `${i + 1}. ถาม: ${k.question}\n   ตอบ: ${k.answer}`)
      .join('\n')

    let answer: string
    let usage: TokenUsage | null = null
    try {
      // ข้อความลูกค้าอาจมีเบอร์/ที่อยู่/เลขบัญชีปนมา — กรองก่อนออกจากระบบเราเสมอ
      const redacted = redactPii(input.customerText)
      if (redacted.found.length > 0) {
        console.info('[ai-chatbot] กรอง PII ก่อนส่งเข้า AI:', redacted.found.join(','))
      }
      const r = await generateText({
        system: CHATBOT_SYSTEM.replace('{{TONE}}', tone),
        user: `คลังความรู้ของร้าน:\n${kb}\n\nคำถามของลูกค้า:\n${redacted.text}`,
        maxOutputTokens: 1024,
        signal,
      })
      answer = r.text
      usage = r.usage
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
      return none(timedOut ? 'AI_ENHANCE_TIMEOUT' : 'AI_ENHANCE_ERROR')
    }

    // แกะและตัดบรรทัด [[USED:...]] ก่อนตรวจอย่างอื่น — ทุกเส้นทางหลังจากนี้จะได้ทำงานกับ
    // ข้อความที่สะอาดแล้ว รวมถึง denylist ที่ไม่ควรไปเจอ marker ของระบบเอง
    const used = extractUsedIds(answer, input.knowledgeIds)
    answer = used.text

    // โมเดลบอกเองว่าตอบไม่ได้ — เงียบตามเดิม (คำถามจะไปเข้าคิวให้ร้านกรอกเอง)
    if (answer.toUpperCase().includes(NO_ANSWER_TOKEN)) return none('NO_KNOWLEDGE_ANSWER', usage)

    if (hitsDenylist(answer, input.guardrails)) {
      return { text: null, blocked: true, reason: 'GUARDRAILS_BLOCKED', usage }
    }

    const rules = input.guardrails.map((g) => g.rule).filter(Boolean)
    if (rules.length > 0) {
      try {
        const j = await generateText({
          user: buildJudgePrompt(rules, answer),
          maxOutputTokens: 128,
          temperature: 0,
          signal,
        })
        usage = mergeUsage(usage, j.usage)
        const verdict = j.text.toUpperCase()
        if (verdict.includes('BLOCK')) {
          return { text: null, blocked: true, reason: 'GUARDRAILS_BLOCKED', usage }
        }
        // ตัดสินไม่ได้ = ไม่ผ่าน — ตรงนี้ fail-closed แรงกว่า enhance เพราะไม่มีคำตอบดิบให้ถอยไป
        if (!verdict.includes('PASS')) return none('GUARDRAILS_CHECK_FAILED', usage)
      } catch {
        return none('GUARDRAILS_CHECK_FAILED', usage)
      }
    }

    return { text: answer, usedKnowledgeIds: used.usedIds, blocked: false, reason: null, usage }
  } catch (e) {
    console.error('[ai-chatbot] unexpected', e)
    return none('AI_ENHANCE_ERROR')
  }
}

/**
 * ChatBot อยู่ในช่วงเวลาทำงานไหม — HH:mm เวลาไทย รองรับช่วงข้ามเที่ยงคืน
 *
 * ไม่ reuse `isWithinSchedule` ของ Auto Reply เพราะตัวนั้นรับเป็นนาที+วันในสัปดาห์
 * (โครงคนละแบบ) การดัดให้รับสองรูปแบบทำให้ตัวที่ใช้งานจริงอยู่แล้วเสี่ยงพังโดยไม่จำเป็น
 */
export function isChatbotWithinWindow(
  start: string | null | undefined,
  end: string | null | undefined,
  now: Date
): boolean {
  if (!start || !end) return true // ไม่ได้ตั้ง = ทำงานตลอดเวลา

  const parse = (t: string): number | null => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t)
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  const s = parse(start)
  const e = parse(end)
  if (s === null || e === null) return true // ค่าเสีย = ไม่ปิดกั้น ดีกว่าเงียบโดยไม่มีเหตุผล

  // เวลาไทยจาก Intl — ห้ามใช้ getHours() ของเครื่อง (serverless รันบน UTC)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  const cur = hh * 60 + mm

  // ช่วงข้ามเที่ยงคืน (18:00-09:00) = "อยู่หลังเวลาเริ่ม หรือ ก่อนเวลาจบ"
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e
}
