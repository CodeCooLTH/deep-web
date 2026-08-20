/**
 * comment-row-chips — "แถวคอมเมนต์ในรายการซ้ายควรขึ้นชิปอะไรบ้าง" (SSOT ตาม HR16)
 *
 * user สั่งโครงใหม่ 2026-08-20: `[ยังไม่ตอบ] [ยังไม่ทักแชท]` เป็น 2 ชิป
 *
 * ## 🛑 นี่คือการกลับมติที่ทำไปเมื่อเช้าวันเดียวกัน
 *
 * แถวนี้เคยมี 2 ชิปคนละโทนสีติดกัน แล้วถูกยุบเหลือใบเดียวตาม impeccable critique P2-D เพราะ
 * *"สองใบที่สีไม่เหมือนกันติดกันอ่านเป็น 'มีสองปัญหา' ทั้งที่เป็นปัญหาเดียวมองสองมุม"*
 * user เห็นของจริงแล้วสั่งกลับเป็น 2 ชิป — แต่แทนที่จะทำซ้ำปัญหาเดิม กติกาข้อแรกของไฟล์นี้คือ:
 *
 *   **เมื่อ "ยังไม่ตอบ" ชิปทั้งสองใบต้องมีโทนสีเดียวกันเสมอ**
 *
 * ชิปซ้าย (สถานะการตอบ) จึง **ไม่มีสีของตัวเอง** ในเคสนั้น แต่ยืมโทนจากชิปขวา (เส้นตายทักแชท)
 * ⇒ อ่านเป็น "เรื่องเดียวกันมองสองมุม" ไม่ใช่ "สองปัญหา" ซึ่งเป็นสิ่งที่มติเดิมกังวล
 *
 * ## กติกาข้อสอง: บรรทัดชิปมีเมื่อมีอะไรให้ทำเท่านั้น
 *
 * user สั่งให้ "ลดความสูง" ด้วย ⇒ แถวที่ **จบงานแล้วจริง** (ตอบแล้ว + ทักแล้ว/หมดเวลา) ไม่มีชิป
 * สักใบ บรรทัดที่ 3 หายไปทั้งบรรทัด แถวกลับไปสูงเท่าเดิม
 * ถ้าไม่มีกติกานี้ โครงใหม่จะทำให้แถวที่เคยสั้นที่สุด (ตอบแล้ว ไม่มี badge เลย) สูงขึ้น 1 บรรทัด
 * ทุกแถว = ตรงข้ามกับสิ่งที่ user ขอ
 *
 * ## ทำไมเป็นฟังก์ชันบริสุทธิ์
 *
 * เกณฑ์ 2 แกน × 4 สถานะ = คอมโบที่เขียนกลับด้านแล้วยังคอมไพล์ผ่านทุกทาง — ถ้าอยู่ในเทอร์นารี
 * กลาง JSX จะไม่มีอะไรจับได้เลยเวลาใครแก้ผิด (docs/conventions/ui-boolean-needs-a-testable-home.md)
 */

/** โทนของชิป — `neutral` = เทา (เลยจุดรีบแล้ว/ชั่วคราว) · `success` = ยืนยันได้จริงเท่านั้น */
export type CommentChipTone = 'danger' | 'warning' | 'neutral' | 'success'

export type CommentRowChips = {
  /** ชิปซ้าย: สถานะการตอบ — `null` = ไม่ต้องแสดง */
  answer: { kind: 'unanswered' | 'botAnswered' | 'resolved'; tone: CommentChipTone } | null
  /** ชิปขวา: สถานะทักแชท — `null` = ไม่ต้องแสดง */
  privateReply: { kind: 'sent' | 'sending' | 'expired' | 'available'; tone: CommentChipTone } | null
}

export function commentRowChips(input: {
  /** สถานะจาก deriveCommentState ฝั่ง server */
  state: string
  /** ผู้ขายกด "จัดการแล้ว" หรือ Facebook ยืนยันว่าทักไปแล้วนอกระบบ */
  resolved: boolean
  privateReply: 'SENT' | 'SENDING' | 'EXPIRED' | 'AVAILABLE'
  /** โทนของเส้นตายทักแชทตามเวลาที่เหลือจริง (มาจาก privateReplyWindow — ห้ามเลือกเองที่ call site) */
  windowTone: 'danger' | 'warning'
}): CommentRowChips {
  const prTone: CommentChipTone =
    input.privateReply === 'SENT'
      ? 'success'
      : input.privateReply === 'AVAILABLE'
        ? input.windowTone
        : 'neutral'

  const prKind = {
    SENT: 'sent',
    SENDING: 'sending',
    EXPIRED: 'expired',
    AVAILABLE: 'available',
  }[input.privateReply] as 'sent' | 'sending' | 'expired' | 'available'

  /** ยังมีอะไรให้ทำกับการทักแชทไหม — ทักไปแล้ว/หมดเวลาแล้ว = ไม่มี */
  const prActionable = input.privateReply === 'AVAILABLE' || input.privateReply === 'SENDING'

  if (input.state === 'UNANSWERED') {
    // ชิปซ้ายยืมโทนจากชิปขวาเสมอ — หัวใจของการกลับมติ P2-D โดยไม่ทำซ้ำปัญหาเดิม
    return { answer: { kind: 'unanswered', tone: prTone }, privateReply: { kind: prKind, tone: prTone } }
  }

  const pr = prActionable ? { kind: prKind, tone: prTone } : null

  // "จัดการแล้ว" มาก่อน BOT_ANSWERED — server นับ resolved เป็น HUMAN_ANSWERED อยู่แล้ว
  // แต่ป้ายต้องบอกความจริงว่าไม่ใช่คำตอบที่เกิดในระบบเรา (ห้ามเขียว — Verified-Means-Green)
  if (input.resolved) return { answer: { kind: 'resolved', tone: 'neutral' }, privateReply: pr }

  // บอทตอบแล้วแต่ยังไม่มีคนยืนยัน = เหลืองตายตัว ไม่ยืมโทน (ไม่ใช่เคส "ปัญหาเดียวมองสองมุม")
  if (input.state === 'BOT_ANSWERED') return { answer: { kind: 'botAnswered', tone: 'warning' }, privateReply: pr }

  // คนตอบเองแล้ว — ไม่ต้องมีชิปซ้าย เครื่องหมายถูกหน้าบรรทัดลูกค้าบอกไปแล้ว
  // ถ้าทักแชทก็ไม่มีอะไรให้ทำต่อ ⇒ ทั้งบรรทัดหายไป แถวกลับไปสูงเท่าเดิม (กติกาข้อสอง)
  return { answer: null, privateReply: pr }
}
