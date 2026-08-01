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
  AI_CHATBOT_FREE_TIMEOUT_MS,
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

const CHATBOT_SYSTEM = `คุณคือผู้ช่วยตอบแชทของร้านค้าออนไลน์ ตอบคำถามลูกค้าโดยใช้ "คลังความรู้ของร้าน" ที่ให้มาเป็นแหล่งข้อมูลเดียว

คุณ **ต้องประมวลผลข้อมูลในคลัง** ไม่ใช่แค่หาข้อที่ถ้อยคำตรงกัน:
- ประกอบคำตอบจากหลายข้อรวมกันได้ เช่น ถามถึงสินค้าหลายตัวพร้อมกัน
- คำนวณจากตัวเลขในคลังได้ เช่น ราคารวม ส่วนต่าง จำนวนเท่าตัว
- เทียบสินค้า จัดกลุ่ม หรือแนะนำจากรายการที่มีในคลังได้
- ลูกค้าเรียกชื่อสินค้าไม่ตรงเป๊ะ พิมพ์ผิด หรือใช้คำเรียกอื่น ให้เข้าใจว่าหมายถึงอะไรในคลัง
- ตอบได้แค่บางส่วนก็ตอบส่วนนั้นไปก่อน แล้วบอกว่าเรื่องที่เหลือจะให้แอดมินมาตอบ — ดีกว่าเงียบใส่ลูกค้า

กฎที่ห้ามฝ่าฝืน:
- ห้ามสร้างข้อเท็จจริงที่ไม่มีในคลังและอนุมานจากคลังไม่ได้ โดยเฉพาะราคา ระยะเวลาจัดส่ง การรับประกัน ช่องทางชำระเงิน สต็อก
- ตัวเลขที่มีในคลังต้องตรงเป๊ะ ห้ามปัด ห้ามประมาณ ส่วนตัวเลขที่คำนวณเองต้องคำนวณจากตัวเลขในคลังเท่านั้น
- ห้ามสัญญาอะไรแทนร้าน
- ตอบว่า NO_ANSWER คำเดียว **เฉพาะเมื่อคำถามไม่เกี่ยวกับสิ่งที่มีในคลังเลย** ไม่ใช่เพราะไม่มีข้อไหนถ้อยคำตรงกัน
- ถ้าลูกค้าส่งรูปมา ให้ดูรูปแล้วเทียบกับสินค้าในคลัง — บอกได้ว่าตรงกับรายการไหน ราคาเท่าไร
  ถ้าดูแล้วไม่แน่ใจว่าเป็นตัวไหน ให้บอกตามตรงและถามกลับ ห้ามทายส่ง ๆ ว่าเป็นตัวใดตัวหนึ่ง
- ตอบภาษาไทย สั้นและตรงคำถาม

เป้าหมายของทุกคำตอบคือพาลูกค้าไปสู่การสั่งซื้อ **สินค้าที่ร้านมีขายจริง** เท่านั้น:
- ถ้าลูกค้าถามถึงของที่ร้านไม่มี ให้บอกตรง ๆ ว่าไม่มี แล้วเสนอตัวที่ร้านมีและใกล้เคียงที่สุด
- เมื่อลูกค้าสนใจตัวไหนแล้ว ให้ชวนสั่งซื้อและถามสิ่งที่ต้องใช้ต่อ เช่น จำนวน สี รุ่นรถ
- ห้ามเสนอสินค้าที่ไม่มีในรายการที่ให้มา และห้ามรับปากเรื่องที่ไม่มีข้อมูล

น้ำเสียงที่ร้านต้องการ: {{TONE}}

ตอบกลับเป็นข้อความที่จะส่งให้ลูกค้าเท่านั้น ห้ามมีคำอธิบายอื่น
ปิดท้ายด้วยบรรทัดใหม่ที่ระบุหมายเลขข้อในคลังที่ใช้ตอบ รูปแบบ [[USED:1,3]] — ระบบจะตัดบรรทัดนี้ทิ้งก่อนส่งให้ลูกค้า`

/**
 * prompt โหมด AI_FREE — ใช้ตอนคลังตอบไม่ได้และร้านเลือกให้ AI ตอบเอง
 *
 * WARNING: เส้นที่ห้ามข้ามคือ "ข้อเท็จจริงของร้าน" — ราคา สต็อก เงื่อนไขส่ง การรับประกัน
 * ต้องมาจากข้อมูลร้านที่ให้มาเท่านั้น สิ่งที่โหมดนี้ปลดล็อกคือความรู้ทั่วไป (เช่น รุ่นรถ
 * ใช้อะไหล่ขนาดไหน) ไม่ใช่ใบอนุญาตให้แต่งเรื่องของร้าน
 */
const CHATBOT_FREE_SYSTEM = `คุณคือผู้ช่วยตอบแชทของร้านค้าออนไลน์ ลูกค้าถามคำถามที่คลังความรู้ของร้านตอบไม่ได้

คุณตอบจากความรู้ทั่วไปได้ แต่มีเส้นที่ห้ามข้าม:
- ราคา สต็อก ค่าส่ง เงื่อนไข การรับประกัน ของร้านนี้ ต้องมาจากข้อมูลร้านที่ให้มาเท่านั้น ไม่มีข้อมูลให้บอกว่าจะให้แอดมินมาตอบ
- ห้ามเสนอสินค้าที่ไม่มีในรายการที่ให้มา
- ห้ามสัญญาอะไรแทนร้าน
- ถ้าไม่มั่นใจ ให้บอกตามตรงแล้วชวนคุยต่อ ดีกว่าตอบมั่ว

พาบทสนทนาไปสู่การสั่งซื้อสินค้าที่ร้านมีขายจริงเสมอ

น้ำเสียงที่ร้านต้องการ: {{TONE}}

ตอบกลับเป็นข้อความที่จะส่งให้ลูกค้าเท่านั้น ห้ามมีคำอธิบายอื่น`

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
  /** รูปที่ลูกค้าส่งมาพร้อมคำถาม — ลูกค้าจำนวนมากส่งรูปอะไหล่มาถามแทนการพิมพ์ชื่อ */
  imageUrls?: string[]
  /** สินค้าที่ร้านมีขายจริง — บอทต้องเสนอได้เฉพาะในรายการนี้ */
  products?: { name: string; price: string }[]
  /** บทสนทนาก่อนหน้าในห้องนี้ (เก่า -> ใหม่) กรอง PII แล้วจากผู้เรียก */
  history?: { role: 'ลูกค้า' | 'ร้าน'; text: string }[]
  /** ให้ AI ตอบเองเมื่อคลังตอบไม่ได้ (โหมด AI_FREE ของร้าน) */
  allowFreeAnswer?: boolean
  /** ให้ค้นเว็บประกอบ (เฉพาะรอบ AI_FREE) */
  useWebSearch?: boolean
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
/**
 * ด่านตรวจกฎท้ายทาง — ใช้ร่วมกันทั้งคำตอบจากคลังและคำตอบโหมด AI_FREE
 *
 * แยกออกมาเพราะทั้งสองเส้นทางต้องผ่านด่านเดียวกันเป๊ะ ๆ การก๊อปโค้ดตรวจกฎไปไว้สองที่
 * แปลว่าวันหนึ่งจะมีเส้นทางที่ลืมอัปเดต แล้วคำตอบที่ควรถูกบล็อกหลุดออกไปหาลูกค้า
 */
async function finishAnswer(
  answer: string,
  usedIds: string[],
  usage: TokenUsage | null,
  input: ChatbotAnswerInput,
  signal: AbortSignal
): Promise<ChatbotAnswerResult> {
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
      // ตัดสินไม่ได้ = ไม่ผ่าน — fail-closed แรงกว่า enhance เพราะไม่มีคำตอบดิบให้ถอยไป
      if (!verdict.includes('PASS')) {
        return { text: null, blocked: false, reason: 'GUARDRAILS_CHECK_FAILED', usage }
      }
    } catch {
      return { text: null, blocked: false, reason: 'GUARDRAILS_CHECK_FAILED', usage }
    }
  }

  return { text: answer, usedKnowledgeIds: usedIds, blocked: false, reason: null, usage }
}

export async function answerFromKnowledge(input: ChatbotAnswerInput): Promise<ChatbotAnswerResult> {
  const none = (reason: ChatbotAnswerResult['reason'], usage: TokenUsage | null = null): ChatbotAnswerResult => ({
    text: null, blocked: false, reason, usage,
  })

  // ไม่มีทั้งข้อความและรูป = ไม่มีคำถามให้ตอบ
  if (!input.customerText.trim() && !input.imageUrls?.length) return none('NO_KNOWLEDGE_ANSWER')
  // คลังว่างและร้านไม่ได้เปิดให้ AI ตอบเอง = ไม่มีอะไรให้ทำงานด้วย
  if (input.knowledge.length === 0 && !input.allowFreeAnswer) return none('NO_KNOWLEDGE_ANSWER')

  try {
    // โหมดตอบอิสระอาจเรียกโมเดล 3 รอบในงบก้อนเดียว จึงต้องมีงบของตัวเอง
    const signal = AbortSignal.timeout(
      input.allowFreeAnswer ? AI_CHATBOT_FREE_TIMEOUT_MS : AI_ENHANCE_TIMEOUT_MS
    )
    const tone = (input.tone ?? '').trim() || DEFAULT_TONE

    // คลังส่งเข้า prompt เป็นคู่ถาม-ตอบ เรียงตามที่ service คัดมาแล้ว (ใช้บ่อยอยู่บน)
    const kb = input.knowledge
      .map((k, i) => `${i + 1}. ถาม: ${k.question}\n   ตอบ: ${k.answer}`)
      .join('\n')

    // รายการสินค้าจริง — แยกจากคลังความรู้เพราะเป็นข้อมูลที่ระบบรู้แน่ ไม่ใช่สิ่งที่ร้านพิมพ์ไว้
    const productBlock = input.products?.length
      ? `\n\nสินค้าที่ร้านมีขายตอนนี้ (เสนอได้เฉพาะในรายการนี้):\n${input.products
          .map((p) => `- ${p.name} ราคา ${p.price} บาท`)
          .join('\n')}`
      : ''

    // บทสนทนาก่อนหน้า — ทำให้ตอบต่อเนื่องได้ ("แล้วสีแดงล่ะ" ต้องรู้ว่าพูดถึงอะไรอยู่)
    const historyBlock = input.history?.length
      ? `\n\nบทสนทนาก่อนหน้า (เก่าไปใหม่):\n${input.history.map((h) => `${h.role}: ${h.text}`).join('\n')}`
      : ''

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
        user: `คลังความรู้ของร้าน:\n${kb || '(ยังไม่มีข้อมูลในคลัง)'}${productBlock}${historyBlock}\n\nคำถามของลูกค้า:\n${redacted.text || '(ลูกค้าส่งมาแต่รูป ไม่ได้พิมพ์ข้อความ)'}`,
        imageUrls: input.imageUrls,
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

    /**
     * โมเดลบอกเองว่าคลังตอบไม่ได้
     *
     * ร้านที่เลือกโหมด AI_FREE ให้ลองรอบสองโดยปลดข้อจำกัด "ตอบจากคลังเท่านั้น"
     * แต่ยังคงเส้นห้ามแต่งข้อเท็จจริงของร้านไว้ครบ — และรอบนี้ค้นเว็บได้ถ้าร้านเปิดไว้
     * ร้านที่เลือก SILENT/MESSAGE ไม่เข้ารอบนี้เลย จึงไม่มีต้นทุนเพิ่ม
     */
    if (answer.toUpperCase().includes(NO_ANSWER_TOKEN)) {
      if (!input.allowFreeAnswer) return none('NO_KNOWLEDGE_ANSWER', usage)
      try {
        const f = await generateText({
          system: CHATBOT_FREE_SYSTEM.replace('{{TONE}}', tone),
          user: `ข้อมูลของร้าน (ใช้ตอบเรื่องราคา/เงื่อนไขได้เฉพาะจากตรงนี้):\n${kb || '(ไม่มี)'}${productBlock}${historyBlock}\n\nคำถามของลูกค้า:\n${redactPii(input.customerText).text || '(ลูกค้าส่งมาแต่รูป)'}`,
          imageUrls: input.imageUrls,
          useWebSearch: input.useWebSearch,
          maxOutputTokens: 1024,
          signal,
        })
        usage = mergeUsage(usage, f.usage)
        answer = f.text.replace(/\[\[USED:[^\]]*\]\]/gi, '').trim()
        if (!answer || answer.toUpperCase().includes(NO_ANSWER_TOKEN)) {
          return none('NO_KNOWLEDGE_ANSWER', usage)
        }
        // รอบนี้ไม่มีข้อในคลังที่ "ถูกใช้" จริง จึงไม่นับสถิติให้ข้อไหน
        return finishAnswer(answer, [], usage, input, signal)
      } catch (e) {
        const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
        return none(timedOut ? 'AI_ENHANCE_TIMEOUT' : 'AI_ENHANCE_ERROR', usage)
      }
    }

    return finishAnswer(answer, used.usedIds, usage, input, signal)
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
