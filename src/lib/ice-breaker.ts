/**
 * ice-breaker — กติกาของ "คำถามยอดฮิต" ที่ Meta แสดงก่อนเริ่มแชทครั้งแรก (2026-08-27)
 *
 * ฟังก์ชันบริสุทธิ์ล้วน (ไม่แตะ DB/network) เพื่อให้เกณฑ์ทุกข้อมีที่ให้เทสจับ —
 * ค่าพวกนี้ตัดสิน **สิ่งที่ยิงออกไปหา Meta** ซึ่งถ้าผิดจะถูกปฏิเสธทั้งก้อนโดยไม่มีอะไรบอกผู้ขาย
 * (`docs/conventions/ui-boolean-needs-a-testable-home.md`)
 */

/** เพดานของ Meta — เอกสาร: "A maximum of 4 questions can be set via the Ice Breaker API" */
export const ICE_BREAKER_MAX = 4

/**
 * ความยาวคำถาม — คำถามถูกวาดเป็น **ปุ่มในกล่องแชทของ Meta** ซึ่งพื้นที่แคบมาก
 *
 * นับด้วย `Array.from()` ไม่ใช่ `.length`
 *
 * 🛑 **ไม่ใช่เพราะภาษาไทย** — สระ/วรรณยุกต์ไทยอยู่ใน BMP ทั้งหมด `.length` กับจำนวน code point
 * จึงเท่ากันเป๊ะ (รีโปนี้บันทึกไว้แล้วที่ feature 00045: *"ไทยเป็น BMP เลขเท่ากัน"* — ผมเผลอเขียน
 * คอมเมนต์ผิดเป็นเหตุผลนี้รอบแรก แล้ว mutation ที่เปลี่ยนเป็น `.length` **ยังเขียว** ซึ่งเป็นสิ่งที่
 * เปิดโปงว่าเหตุผลที่เขียนไว้ไม่จริง)
 *
 * เหตุผลจริงคือ **อักขระนอก BMP** — อิโมจิที่ผู้ขายพิมพ์เองในคำถาม (เช่น 🛵) เป็น surrogate pair
 * `.length` นับเป็น 2 ทั้งที่คนเห็นตัวเดียว ⇒ คำถามที่ดูสั้นจะถูกตีตกก่อนถึงเพดานจริง
 * (HR12 ห้าม emoji ใน UI **ของเรา** ไม่ได้ห้ามข้อความที่ผู้ขายพิมพ์)
 *
 * Meta ไม่ได้ประกาศเพดานตัวเลขไว้ในเอกสาร — 80 เป็นค่าที่เราเลือกเองจากความกว้างปุ่มจริง
 * ถ้าวันหนึ่งพบว่า Meta ตัดสั้นกว่านี้ ให้ลดตัวเลขที่นี่ที่เดียว
 */
export const ICE_BREAKER_QUESTION_MAX = 80

/** คำตอบเป็นข้อความแชทธรรมดา — ใช้เพดานเดียวกับข้อความที่ IG รับได้ (1,000 ตัวอักษร) */
export const ICE_BREAKER_ANSWER_MAX = 1000

export type IceBreakerDraft = { id?: string; question: string; answer: string }

/**
 * payload ที่ส่งให้ Meta แล้ววิ่งกลับมาทาง webhook ตอนลูกค้าแตะ
 *
 * รูปแบบ: `ICEBREAKER:<shopChannelId>:<order>`
 *
 * 🛑 ต้องมี prefix — `postback` มาจากหลายที่ (Get Started · ปุ่มใน template · persistent menu)
 * ไม่ใช่แค่ Ice Breakers ถ้าใช้ id เปล่า ๆ แล้ววันหนึ่ง payload ของฟีเจอร์อื่นบังเอิญตรงกับ id
 * จะตอบคำถามผิดใบโดยไม่มีอะไรฟ้อง
 *
 * 🛑 **ประกอบจาก (ช่องทาง, ลำดับ) ไม่ใช่จาก id ของแถว** — เพราะมันตัดสิน *ลำดับการทำงาน*
 * ทั้งหมดของการบันทึก: id ของแถวมีอยู่ก็ต่อเมื่อเขียน DB ไปแล้ว ⇒ บังคับให้ต้อง **เขียน DB ก่อน
 * ยิง Meta** ⇒ Meta ปฏิเสธเมื่อไหร่ ฐานเราจะมีคำถามชุดใหม่ทั้งที่ลูกค้ายังเห็นชุดเก่า และหน้าจอจะ
 * รายงานว่า "ลูกค้าเห็นอยู่" ซึ่งไม่จริง (ย้อนกลับก็ไม่ได้เพราะทรานแซกชันปิดไปแล้ว)
 * ค่าที่ประกอบเองได้ล่วงหน้าทำให้สลับเป็น **ยิง Meta ก่อน สำเร็จแล้วค่อยเขียน DB** — ล้มแล้ว
 * ไม่มีอะไรเปลี่ยนทั้งสองฝั่ง
 */
const PREFIX = 'ICEBREAKER:'

export function iceBreakerPayload(shopChannelId: string, order: number): string {
  return `${PREFIX}${shopChannelId}:${order}`
}

/** คืนที่อยู่ของคำถามเมื่อ payload เป็นของ Ice Breaker · `null` เมื่อเป็นของอย่างอื่น (ห้ามเดา) */
export function parseIceBreakerPayload(
  payload: string | null | undefined,
): { shopChannelId: string; order: number } | null {
  if (!payload || !payload.startsWith(PREFIX)) return null
  const rest = payload.slice(PREFIX.length)
  const sep = rest.lastIndexOf(':')
  if (sep <= 0) return null
  const shopChannelId = rest.slice(0, sep).trim()
  const rawOrder = rest.slice(sep + 1)
  if (!shopChannelId) return null
  // 🛑 ต้องเช็ครูปแบบเป็นตัวเลขล้วนก่อน — `Number('')` และ `Number(' ')` คืน **0** ซึ่งเป็นจำนวนเต็ม
  // ในช่วงที่ถูกต้องพอดี ⇒ ด่านที่เช็คแค่ `Number.isInteger` + ช่วง จะปล่อยลำดับว่างผ่านเป็นข้อแรก
  // (เทสฉบับแรกจับได้ตรงนี้) · ค่าเหล่านี้มาจากภายนอกล้วนแล้วเอาไปเป็นคีย์ค้นฐานโดยตรง
  if (!/^\d+$/.test(rawOrder)) return null
  const order = Number(rawOrder)
  if (order >= ICE_BREAKER_MAX) return null
  return { shopChannelId, order }
}

export type IceBreakerValidation =
  | { ok: true; items: { question: string; answer: string }[] }
  | { ok: false; error: string }

/**
 * ตรวจร่างทั้งชุดก่อนบันทึก/ยิงหา Meta
 *
 * ตรวจ **ทั้งชุด** ไม่ใช่ทีละข้อ เพราะ Meta รับเป็นก้อนเดียว — ปฏิเสธข้อเดียวคือปฏิเสธทั้งชุด
 * ⇒ ต้องบอกผู้ขายก่อนยิง ไม่ใช่ให้ไปเจอ error ดิบของ Meta ที่อ่านไม่รู้เรื่อง
 */
export function validateIceBreakers(drafts: IceBreakerDraft[]): IceBreakerValidation {
  if (drafts.length === 0) return { ok: true, items: [] }
  if (drafts.length > ICE_BREAKER_MAX) {
    return { ok: false, error: `ตั้งคำถามได้สูงสุด ${ICE_BREAKER_MAX} ข้อ` }
  }

  const items: { question: string; answer: string }[] = []
  const seen = new Set<string>()
  for (const d of drafts) {
    const question = d.question.trim()
    const answer = d.answer.trim()
    // ปล่อยให้มีข้อว่างไม่ได้ — Meta จะได้ปุ่มเปล่าที่ลูกค้ากดแล้วไม่มีอะไรเกิดขึ้น
    if (!question) return { ok: false, error: 'กรอกคำถามให้ครบทุกข้อ' }
    if (!answer) return { ok: false, error: 'กรอกคำตอบให้ครบทุกข้อ' }
    if (Array.from(question).length > ICE_BREAKER_QUESTION_MAX) {
      return { ok: false, error: `คำถามยาวเกิน ${ICE_BREAKER_QUESTION_MAX} ตัวอักษร` }
    }
    if (Array.from(answer).length > ICE_BREAKER_ANSWER_MAX) {
      return { ok: false, error: `คำตอบยาวเกิน ${ICE_BREAKER_ANSWER_MAX} ตัวอักษร` }
    }
    // คำถามซ้ำ = ลูกค้าเห็นปุ่มเหมือนกันสองใบ แยกไม่ออกว่าต่างกันตรงไหน
    const key = question.toLowerCase()
    if (seen.has(key)) return { ok: false, error: 'มีคำถามซ้ำกัน' }
    seen.add(key)
    items.push({ question, answer })
  }
  return { ok: true, items }
}

/**
 * "เพจนี้มีคำถามเดิมอยู่ไหม และเป็นของใคร" — ตัวจำแนกที่หน้าจอใช้ตัดสินว่าจะเตือนหรือไม่
 *
 * 🛑 มีอยู่เพราะ **Meta ประกาศเองว่าของที่ตั้งผ่าน API ทับของที่ร้านตั้งเองใน Page Inbox
 * และปิดไม่ให้ร้านแก้จากฝั่งนั้นอีก** ⇒ การกดบันทึกโดยไม่รู้ว่ามีของเดิม = ทำให้ร้านเสียของ
 * ที่ลูกค้าเห็นอยู่จริง แบบที่ไม่มีอะไรบอกและกู้เองไม่ได้
 *
 * 🛑 **`null` (อ่านไม่สำเร็จ) ต้องไม่ถูกยุบรวมกับ `[]` (ยืนยันแล้วว่าไม่มี)** — อันแรกแปลว่า
 * "ไม่รู้" ซึ่งยังต้องเตือน อันหลังแปลว่า "รู้แล้วว่าว่าง" ซึ่งไม่ต้องเตือน
 * ยุบรวม = เคสที่อันตรายที่สุดกลายเป็นเคสที่เงียบที่สุด
 */
export type ExternalIceBreakerState = 'OURS' | 'NONE' | 'FOREIGN' | 'UNKNOWN'

export function classifyExternalIceBreakers(
  external: { question: string; payload: string }[] | null,
  shopChannelId: string,
): ExternalIceBreakerState {
  if (external === null) return 'UNKNOWN'
  if (external.length === 0) return 'NONE'
  // มีของที่ไม่ใช่ของเราแม้แถวเดียว = ต้องเตือน — ผู้ขายจะเสียแถวนั้นไปถ้ากดบันทึก
  // (เกณฑ์เป็น "ทุกแถวต้องเป็นของเรา" ไม่ใช่ "มีของเราสักแถว")
  const allOurs = external.every((it) => parseIceBreakerPayload(it.payload)?.shopChannelId === shopChannelId)
  return allOurs ? 'OURS' : 'FOREIGN'
}
