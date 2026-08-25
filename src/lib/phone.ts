/**
 * เบอร์โทรไทย — SSOT ของทั้งระบบ
 *
 * 🛑 ไฟล์นี้มี **2 เกณฑ์ที่ไม่เท่ากันโดยเจตนา** และต้องอยู่ติดกันตาม Hard Rule 16
 * (นิยามที่ต่างกันของศัพท์เดียวกัน ห้ามกระจายไปคนละไฟล์ ไม่งั้นคนถัดไปจะเจอตัวใดตัวหนึ่ง
 * แล้วนึกว่าเป็นตัวเดียวในระบบ):
 *
 *   1. `MOBILE_PHONE_RE` = `^0[689][0-9]{8}$` — **ด่านขาเข้า** ตอบคำถาม *"ค่าใหม่ที่ยอมรับ"*
 *      ใช้ที่ validator ทุกตัว (CreateOrderSchema, สมัคร/ล็อกอิน, OTP, พัสดุ) และเป็นเกณฑ์
 *      ที่ chip แนะนำเบอร์ต้องเคารพ — chip เสนออะไรที่กดแล้วเด้ง = ระบบโกหกร้านต่อหน้า
 *
 *   2. `normalizePhone()` = `^0[0-9]{9}$` (หลวมกว่า) — **ตัวตีความ** ตอบคำถาม
 *      *"ค่าที่มีอยู่แล้วแปลว่าอะไร"* ใช้ที่ `order-access.service.ts` (ตัดสินว่าผู้ซื้อเปิด
 *      ออเดอร์ตัวเองได้ไหม), `order-pii-mask.ts`, `order.service.ts` (derive Customer)
 *
 * 🛑 **ห้ามบีบข้อ 2 ให้เท่าข้อ 1** — นั่นคือการเปลี่ยนความหมายของข้อมูลเก่าย้อนหลัง
 * บน prod มี 13 ออเดอร์ที่ `buyerContact` เป็น `00000000xx` (ข้อมูลเดโมของทีมรีวิว
 * Meta/Apple) ถ้า normalize คืน null จอฝั่งผู้ซื้อของใบพวกนั้นจะเปลี่ยนพฤติกรรมทันที
 * โดยไม่มีใครขอ — ที่มา `docs/20 - Features/00014 - Customer Directory/EXTENSIONS-2026-08-21-phone-format.md`
 *
 * แผนเลขหมายไทย (ยืนยันกับวิกิพีเดีย 2026-08-21): มือถือ = 10 หลัก ขึ้นต้น 06/08/09 เท่านั้น
 * (`01/03/04/05/07` ที่ยังพบในเอกสารเก่าคือระบบ 9 หลัก **ก่อนการขยายเลขหมายปี 2549**)
 */

/** ด่านขาเข้า — เกณฑ์เดียวที่ใช้ตัดสินว่า "เบอร์นี้บันทึกได้ไหม" ทั้งระบบ */
export const MOBILE_PHONE_RE = /^0[689][0-9]{8}$/

/**
 * ประโยคที่อธิบายกฎข้างบนให้ผู้ใช้ — **ที่เดียวทั้งระบบ** (Hard Rule 16)
 *
 * 🛑 ต้องอยู่ติดกับ regex ที่มันอธิบาย ไม่งั้นวันที่เกณฑ์เปลี่ยน ข้อความจะค้างอยู่แบบเดิม
 * แล้วบอกผู้ใช้ผิด — เกิดจริงในรอบนี้: หลังบีบเป็น 06/08/09 ยังมี 3 จุดเขียนว่า
 * "ขึ้นต้นด้วย 0" อยู่ ซึ่งทำให้ผู้ใช้แก้ตามคำแนะนำแล้วยังบันทึกไม่ผ่าน
 *
 * เขียนแบบเดียวเสมอ ห้ามผันคำ (`06/08/09` กับ `06 08 หรือ 09` เคยอยู่ปนกัน 3 แบบ)
 */
export const MOBILE_RULE_TEXT = 'เบอร์มือถือ 10 หลัก ขึ้นต้นด้วย 06, 08 หรือ 09'

/**
 * เกณฑ์ "เบอร์นี้ใช้ล็อกอิน/ขอ OTP ได้ไหม" — เท่ากับ `MOBILE_PHONE_RE` ทุกประการบน production
 *
 * 🛑 ต่างกันเฉพาะ **นอก production**: ยอมรับเบอร์บัญชีทดสอบ `000000000X` ด้วย
 *
 * ทำไมต้องมี — `lib/otp.ts` มี `TEST_ACCOUNTS` (`0000000001`–`0000000009` รหัส `123456`)
 * ที่ **bypass การส่ง SMS จริง** และเป็นทางเดียวที่ QA/dev ล็อกอินได้ แต่พอบีบ
 * `MOBILE_PHONE_RE` เป็น `^0[689][0-9]{8}$` เมื่อ 2026-08-21 **ด่านขาเข้าเริ่มปฏิเสธเบอร์
 * เหล่านั้นตั้งแต่ช่องกรอก** ⇒ ฝั่งตรวจ OTP ยังยอมรับอยู่ แต่ไม่มีใครไปถึงมันได้อีกเลย
 * = บัญชีทดสอบทั้งชุดตายเงียบ ๆ ไม่มีเทสไหนจับ เพราะทั้งสองฝั่ง "ถูก" ในตัวเอง
 * (หัวหน้าเจอเองตอนจะเปิด prototype ดู 2026-08-25)
 *
 * 🛑 ห้ามเอาไปใช้แทน `MOBILE_PHONE_RE` ที่ validator ของ **ข้อมูลลูกค้า** (ออเดอร์/พัสดุ/
 * โปรไฟล์) — ตรงนั้นเบอร์ปลอมต้องถูกปฏิเสธเสมอแม้บนเครื่อง dev ไม่งั้นจะได้ข้อมูลทดสอบ
 * ที่ iShip ปฏิเสธทีหลัง · ที่นี่คือ "ใครเข้าระบบได้" ซึ่งเป็นคนละคำถาม
 */
const TEST_ACCOUNT_PHONE_RE = /^000000000[0-9]$/

export function isLoginPhone(raw: string): boolean {
  if (MOBILE_PHONE_RE.test(raw)) return true
  return process.env.NODE_ENV !== 'production' && TEST_ACCOUNT_PHONE_RE.test(raw)
}

/**
 * normalize เบอร์ไทย → '0xxxxxxxxx' (digits only, strip space/dash/ฯลฯ)
 * ไม่ตรงรูปแบบ (^0[0-9]{9}$) → null. ใช้เป็น SSOT ก่อนเขียน Customer.phone (feat 00014).
 *
 * 🛑 เกณฑ์ที่นี่ **หลวมกว่า** `MOBILE_PHONE_RE` โดยเจตนา — ดูหัวไฟล์
 */
export function normalizePhone(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  return /^0[0-9]{9}$/.test(digits) ? digits : null
}

// ─── chip แนะนำเบอร์ (feat 00014 ext 2026-08-21) ──────────────────────────────

/** สูงสุด 3 — เจอเกินนี้แปลว่าตีความผิดตั้งแต่ต้น ไม่ใช่ว่าเจอเบอร์เยอะ */
const MAX_SUGGESTIONS = 3

/**
 * อักขระที่ถือว่าเป็น "ตัวคั่นภายในเบอร์" — ลูกค้าพิมพ์คั่นด้วยอะไรก็ได้ในชุดนี้
 * (`0_9_2_0791649`, `092-0791649`, `(+66)920791649`, `092 0791649` มาจริงจากหน้างาน)
 *
 * 🛑 `/` ไม่อยู่ในชุด เพราะมันคือบ้านเลขที่ (`99/9`) และเป็นตัวคั่นเบอร์ 2 เบอร์
 * ที่ร้านเจอบ่อย (`โทร 0612929865/ 0843642147`)
 */
const SEPARATORS = ' -._()+'

const isDigit = (ch: string) => ch >= '0' && ch <= '9'
const isChunkChar = (ch: string) => isDigit(ch) || SEPARATORS.includes(ch)

export type PhoneSuggestReason = 'ok' | 'too-short' | 'too-long' | 'not-mobile' | 'no-digits'

export interface PhoneSuggestion {
  /** เบอร์ที่เสนอได้ (≤3) — **ทุกตัวผ่าน MOBILE_PHONE_RE แน่นอน** */
  suggestions: string[]
  reason: PhoneSuggestReason
  /** จำนวนหลักของก้อนที่ "ใกล้เป็นเบอร์ที่สุด" — ใช้เขียนข้อความเตือน "ได้ 11 หลัก" */
  digitCount: number
}

/**
 * แปลงชุดตัวเลขให้อยู่ในรูป local (`0…`) ถ้ามันมาในรูป `+66` / `66`
 * `66920791649` (11 หลัก) → `0920791649` · อย่างอื่นคืนตามเดิม
 */
function toLocalDigits(digits: string): string {
  if (digits.length === 11 && digits.startsWith('66')) return '0' + digits.slice(2)
  return digits
}

/**
 * ตัดข้อความเป็น "ก้อนที่อาจเป็นเบอร์" — maximal run ของ [ตัวเลข + ตัวคั่น] ที่มีเลขอย่างน้อย 1 ตัว
 * ตัวอักษรไทย/อังกฤษ, `/`, `,`, `:` และขึ้นบรรทัดใหม่ = จุดตัดก้อน
 */
interface Chunk {
  text: string
  start: number
  end: number
}

function extractChunks(text: string): Chunk[] {
  const chunks: Chunk[] = []
  let start = -1
  for (let i = 0; i <= text.length; i++) {
    const ch = i < text.length ? text[i] : ''
    if (ch && isChunkChar(ch)) {
      if (start === -1) start = i
    } else if (start !== -1) {
      const slice = text.slice(start, i)
      if (/[0-9]/.test(slice)) chunks.push({ text: slice, start, end: i })
      start = -1
    }
  }
  return chunks
}

/**
 * ผู้สมัครจาก 1 ก้อน = ตัวก้อนเต็ม **และ** ก้อนย่อยที่แยกด้วยช่องว่าง
 *
 * 🛑 ต้องมีทั้งสองชั้น เพราะช่องว่างเป็นได้ทั้ง 2 อย่างคนละความหมาย:
 *   - ตัวคั่น**ใน**เบอร์ — `092 0791649` และ `0 8 6 5 3 5 2960` (เคสจริงจากภาพหน้าจอ user)
 *     ⇒ ต้องรวมทั้งก้อนถึงจะได้เบอร์
 *   - ตัวคั่น**ระหว่าง**เบอร์กับเลขอื่น — `0920791649 25`
 *     ⇒ ต้องแยกก้อนย่อยถึงจะได้เบอร์ (รวมทั้งก้อนจะได้ 12 หลักแล้วตกไป)
 *
 * 🛑 ไม่ใช่การเลื่อนหน้าต่าง 10 หลัก — ผู้สมัครทุกตัวต้อง "ทั้งก้อนพอดีเป๊ะ" เท่านั้น
 * การเลือกว่าจะตัดหลักไหนทิ้งจากก้อนที่ยาวเกิน คือการเดาแทนลูกค้า = การปลอมเบอร์
 */
function candidatesOf(chunk: Chunk): Chunk[] {
  const out: Chunk[] = [chunk]
  const parts = chunk.text.split(/ +/)
  if (parts.filter((p) => /[0-9]/.test(p)).length > 1) {
    let offset = 0
    for (const p of parts) {
      if (/[0-9]/.test(p)) {
        out.push({ text: p, start: chunk.start + offset, end: chunk.start + offset + p.length })
      }
      offset += p.length + 1 // +1 = ช่องว่างที่ split กินไป
    }
  }
  return out
}

const digitsOf = (s: string) => s.replace(/[^0-9]/g, '')

/**
 * ตำแหน่งของเบอร์มือถือทุกตัวในข้อความ (ไม่ทับซ้อนกัน เรียงตามตำแหน่ง)
 *
 * มีไว้ให้ผู้เรียกที่ต้อง **ลบเบอร์ออกจากข้อความ** ไม่ใช่แค่ดึงออกมา —
 * 🛑 `parse-order-message.ts` ทำทั้งสองอย่าง (ดึงเบอร์ + ตัดเบอร์ออกจากบรรทัดก่อนหาที่อยู่)
 * ถ้าสองงานนี้ใช้คนละนิยาม จะได้ที่อยู่ที่มีเบอร์ค้างอยู่ข้างในเงียบ ๆ
 */
export function findThaiMobileSpans(raw: string): { start: number; end: number; phone: string }[] {
  const text = raw ?? ''
  const spans: { start: number; end: number; phone: string }[] = []
  for (const chunk of extractChunks(text)) {
    for (const cand of candidatesOf(chunk)) {
      const local = toLocalDigits(digitsOf(cand.text))
      if (!MOBILE_PHONE_RE.test(local)) continue
      // ก้อนเต็มชนะก้อนย่อยเสมอ — ถ้าก้อนเต็มผ่าน ก้อนย่อยจะสั้นเกินจนไม่ผ่านอยู่แล้ว
      // เช็คทับซ้อนไว้กันเคสที่คิดไม่ถึง (ผลลัพธ์ต้องไม่ลบข้อความซ้อนกัน)
      if (spans.some((s) => cand.start < s.end && s.start < cand.end)) continue
      spans.push({ start: cand.start, end: cand.end, phone: local })
    }
  }
  return spans.sort((a, b) => a.start - b.start)
}

/**
 * หาเบอร์มือถือที่ "ตัดอักขระแล้วลงตัวพอดี" จากข้อความที่ผู้ใช้พิมพ์/วาง
 *
 * ใช้ 3 ที่: chip ในหน้าสร้างคำสั่งซื้อ · `parse-order-message.ts` (ปุ่มวางจากแชท) ·
 * `iship.service.ts` (ตรวจเบอร์ผู้รับก่อน import) — ห้ามเขียนตรรกะนี้ซ้ำที่อื่น
 */
export function suggestThaiMobile(raw: string): PhoneSuggestion {
  const text = raw ?? ''
  const chunks = extractChunks(text)

  if (chunks.length === 0) {
    return { suggestions: [], reason: 'no-digits', digitCount: 0 }
  }

  const suggestions: string[] = []
  for (const { phone } of findThaiMobileSpans(text)) {
    if (!suggestions.includes(phone)) suggestions.push(phone)
  }

  // ก้อนที่ "ใกล้เป็นเบอร์ที่สุด" = ก้อนที่มีเลขเยอะสุด (หลังแปลงรูป +66 แล้ว)
  // ใช้เฉพาะตอนเขียนข้อความเตือน — ไม่มีผลกับ suggestions
  const closest = chunks
    .map((c) => toLocalDigits(digitsOf(c.text)))
    .reduce((a, b) => (b.length > a.length ? b : a), '')

  if (suggestions.length > 0) {
    return {
      suggestions: suggestions.slice(0, MAX_SUGGESTIONS),
      reason: 'ok',
      digitCount: closest.length,
    }
  }

  // 10 หลักขึ้นต้น 0 แต่หลักที่สองไม่ใช่ 6/8/9 = เบอร์บ้าน/เลขหมายอื่น — คนละสาเหตุกับหลักไม่พอ
  // จึงต้องเป็นข้อความคนละอัน (ทางแก้ต่างกัน: อันนี้ "ใช้เบอร์อื่น" ไม่ใช่ "พิมพ์ให้ครบ")
  const reason: PhoneSuggestReason =
    closest.length === 10 && closest.startsWith('0')
      ? 'not-mobile'
      : closest.length < 10
        ? 'too-short'
        : 'too-long'

  return { suggestions: [], reason, digitCount: closest.length }
}

/**
 * เบอร์เดียวจากข้อความ (เอาตัวแรกที่เจอ) — สำหรับผู้เรียกที่ **เติมค่าให้เลยโดยไม่ถาม**
 * (ปุ่ม "วางจากแชท", iShip import)
 *
 * 🛑 ต่างจาก `suggestThaiMobile` ตรงที่ตัวนี้ **ตัดสินใจแทนผู้ใช้** จึงเลือกได้ตัวเดียว
 * และต้องไม่เปลี่ยนพฤติกรรมเดิมของปุ่มวาง (เดิมก็เอาตัวแรก) — การเสนอหลายตัวทำได้
 * เฉพาะที่ที่มีคนกดยืนยัน
 */
export function firstThaiMobile(raw: string): string | null {
  return suggestThaiMobile(raw).suggestions[0] ?? null
}
