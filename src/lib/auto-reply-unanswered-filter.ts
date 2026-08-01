// feature 00023 Deep Chat-Bot Assistant — phase `00023-qna` S-06
// SSOT: docs/20 - Features/00023 - Deep Chat-Bot Assistant/DATABASE.md §3.10.1 + SRS.md TFR-033
//
// ตัวกรองที่ตัดสินว่า "ข้อความที่บอทตอบไม่ได้" ข้อความไหน **ควรถูกคัดลอกไปเก็บในคิว**
//
// WARNING: การกรองอยู่ที่ **ขาเขียน** ไม่ใช่ขาแสดงผล — กรองตอนแสดงแปลว่าข้อมูลถูกเก็บไปแล้ว
// ที่อยู่/เบอร์โทรของลูกค้าไม่ควรถูกทำสำเนาไปอยู่ตารางใหม่ที่มีปุ่ม "ส่งออกเป็นไฟล์" อยู่ข้าง ๆ
// (memory `feedback_rsc_pii_neutralize_at_source`)
//
// ข้อความที่ถูกกรองออก **ไม่ได้หายไปไหน** — ยังอยู่ใน AutoReplyLog ตามเดิมทุกแถว
// ไฟล์นี้แค่ตัดสินว่า "ไม่ทำสำเนาเพิ่ม" ไม่ใช่การลบข้อมูล
//
// ฟังก์ชันในไฟล์นี้ต้องบริสุทธิ์ (pure) — ไม่มี I/O ไม่มีเวลา ไม่มีสถานะ

/** เหตุผลที่ข้อความไม่ถูกเก็บเข้าคิว — ใช้ใน log/เทส ไม่ได้เก็บลง DB */
export type UnansweredRejectReason =
  | 'TOO_SHORT'
  | 'ACKNOWLEDGEMENT'
  | 'LOOKS_LIKE_PHONE'
  | 'LOOKS_LIKE_ADDRESS'
  | 'TOO_LONG'

export type UnansweredFilterResult = { keep: true } | { keep: false; reason: UnansweredRejectReason }

/**
 * F-1 — ยาว **≤ ค่านี้** ไม่ใช่คำถาม (พบจริง: "รับ" "110" "เลส" "คับ" ยาว 3 ตัวอักษรพอดีทุกตัว)
 *
 * WARNING: เป็น `<=` ไม่ใช่ `<` — user ตัดสินว่า "กรองความยาว ≤3" (Scope Baseline A4)
 * และคำที่พบจริงในข้อมูล prod ยาว 3 พอดี ถ้าใช้ `<` จะหลุดทั้งหมด
 */
const REJECT_LENGTH_AT_MOST = 3

/**
 * F-4 — ยาวกว่านี้ไม่ใช่คำถามที่นำกลับมาใช้ซ้ำได้ (พบจริง: 119 / 142 / 171 ตัวอักษร ล้วนเป็นที่อยู่
 * จัดส่งหรือข้อความสั่งซื้อ) · เผื่อไว้กว้างมาก — คำถามจริงในข้อมูล prod ยาวสุดราว 35 ตัวอักษร
 */
const MAX_LENGTH = 80

/**
 * ข้อความ "รับคำ" ที่ไม่ใช่คำถาม — เทียบแบบตรงตัวหลัง normalize เท่านั้น (ไม่ใช่ substring)
 *
 * WARNING: ห้ามเปลี่ยนเป็นการเทียบแบบ "ขึ้นต้นด้วย" หรือ "มีคำนี้อยู่" — "ได้ไหมครับ" ขึ้นต้นด้วย
 * "ได้" และ "ราคาเท่าไหร่ครับ" มีคำว่า "ครับ" อยู่ ทั้งคู่เป็นคำถามจริงที่ร้านอยากได้
 *
 * รายการนี้ **ตายตัวในโค้ด ร้านแก้ไม่ได้** (user ตัดสิน 2026-07-31 — Scope Baseline A4)
 * เก็บเฉพาะคำที่เป็นการรับคำล้วน ๆ — คำที่ "อาจเป็นคำถาม" เช่น "ปลายทาง" (ถามเรื่องเก็บเงิน
 * ปลายทาง) หรือ "สนใจ" ตั้งใจไม่ใส่ เพราะร้านอาจอยากตั้งคำตอบให้จริง
 */
const ACKNOWLEDGEMENTS = new Set([
  'ครับ',
  'คับ',
  'ครับผม',
  'ค่ะ',
  'คะ',
  'จ้า',
  'จ้าา',
  'ได้',
  'ได้ครับ',
  'ได้ค่ะ',
  'รับ',
  'รับครับ',
  'รับได้ครับ',
  'ใช่',
  'ใช่ครับ',
  'ใช่ค่ะ',
  'โอเค',
  'ตกลง',
  'ok',
  'okay',
  'thanks',
  'thank you',
  'ขอบคุณ',
  'ขอบคุณครับ',
  'ขอบคุณค่ะ',
  'อ๋อ',
  'อือ',
])

/**
 * F-2 — เบอร์โทร
 *
 * เทียบ **หลังถอดตัวคั่นออก** ไม่ใช่บนข้อความดิบ: เบอร์ที่ลูกค้าพิมพ์จริงมีทั้ง `0852995863`
 * และ `086 015 9046` ถ้าเทียบเลขติดกันบนข้อความดิบ แบบหลังจะหลุด (เห็นเป็น 3/3/4 หลัก)
 */
const PHONE_MIN_DIGITS = 9

/**
 * F-3 — คำบ่งชี้ที่อยู่
 *
 * เทียบบนข้อความ **ดิบ** ไม่ใช่ข้อความที่ normalize แล้ว เพราะ `normalizeMessage` ลบจุดทิ้ง
 * ⇒ "ต.ลุ่มสุ่ม" กลายเป็น "ตลุ่มสุ่ม" และ "จ.กาญจนบุรี" กลายเป็น "จกาญจนบุรี"
 * ซึ่งจับด้วยรูปแบบ "ต." ไม่ได้อีกแล้ว (ตัวอย่างจริงจาก prod ทั้งคู่)
 */
const ADDRESS_MARKERS =
  /ตำบล|อำเภอ|จังหวัด|แขวง|เขต|หมู่ที่|หมู่\s*\d|ถนน|ซอย|ต\.\s*\S|อ\.\s*\S|จ\.\s*\S|ม\.\s*\d|รหัสไปรษณีย์/

/** รหัสไปรษณีย์ไทย 5 หลักที่ยืนเป็นคำของตัวเอง (กัน "ราคา 15000" ที่เป็นตัวเลขราคา) */
const POSTAL_CODE = /(?:^|\s)\d{5}(?:\s|$)/

/**
 * ตัดสินว่าข้อความที่บอทตอบไม่ได้ควรถูกเก็บเข้าคิวไหม (DATABASE §3.10.1)
 *
 * @param rawText ข้อความดิบของลูกค้า — ใช้ตรวจที่อยู่ (จุดยังอยู่ครบ)
 * @param normalizedText ผลของ `normalizeMessage(rawText)` — ใช้ตรวจความยาวและคำรับคำ
 */
export function shouldQueueUnanswered(rawText: string, normalizedText: string): UnansweredFilterResult {
  const n = normalizedText.trim()

  // F-1 — สั้นเกินไป (ครอบ "" ไปในตัว)
  if (n.length <= REJECT_LENGTH_AT_MOST) return { keep: false, reason: 'TOO_SHORT' }

  // คำรับคำ — เทียบตรงตัวเท่านั้น
  if (ACKNOWLEDGEMENTS.has(n)) return { keep: false, reason: 'ACKNOWLEDGEMENT' }

  // F-4 — ยาวเกินไป
  if (n.length > MAX_LENGTH) return { keep: false, reason: 'TOO_LONG' }

  // F-2 — เบอร์โทร (ถอดช่องว่าง/ขีดออกก่อนนับ)
  const digitsOnly = rawText.replace(/[\s\-().]/g, '')
  if (new RegExp(`\\d{${PHONE_MIN_DIGITS},}`).test(digitsOnly)) {
    return { keep: false, reason: 'LOOKS_LIKE_PHONE' }
  }

  // F-3 — ที่อยู่
  if (ADDRESS_MARKERS.test(rawText) || POSTAL_CODE.test(rawText)) {
    return { keep: false, reason: 'LOOKS_LIKE_ADDRESS' }
  }

  return { keep: true }
}
