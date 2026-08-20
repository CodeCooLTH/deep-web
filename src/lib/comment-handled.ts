/**
 * comment-handled — "คอมเมนต์ใบนี้จบงานแล้วหรือยัง" ฝั่ง client
 *
 * 🛑 **ต้อง mirror `deriveCommentState()` (page-comment.service.ts) บรรทัดต่อบรรทัด** — ทั้งคู่ตอบ
 * คำถามเดียวกันคนละที่ ตัวโน้นป้อนตัวเลขบน "แท็บซ้าย" ตัวนี้ป้อนตัวเลขใน "เธรด" หลุดกันเมื่อไหร่
 * ผู้ขายจะเห็นสองเลขบนจอเดียวที่ไม่ตรงกัน
 *
 * ทำไมต้องเป็นไฟล์แยก: เกณฑ์นี้เคยถูกเขียนมือไว้ **2 ชุดในไฟล์เดียว** (`isHandled()` ในตัวสร้าง tree
 * กับ filter ของ `selectedUnanswered`) แล้วทั้งคู่ไม่รู้จัก `resolvedAt` เลยตอนที่ mark-done ขึ้น
 * 2026-08-19 ⇒ กด "จัดการแล้ว" 3 ใบ แท็บซ้ายลดจาก 10 เหลือ 7 แต่ชิปในเธรดค้างที่ 10 ตลอดกาล
 * (impeccable critique 2026-08-20 P1-C)
 *
 * ไฟล์นั้นเขียนคำเตือนเรื่อง "ซ้ายบอก 8 panel บอก 7" ไว้ **3 ที่** และเคยสกัด
 * `comment-tree-visibility.ts` ออกมาพร้อมประโยคว่า "คำเตือนสามอันไม่ได้กันอันที่สี่" —
 * ประตูที่สี่เปิดจริงเพราะคำเตือนกันได้แค่คนที่อ่านมันเจอ ไม่ได้กันคนที่เพิ่มฟีเจอร์คนละที่
 */

/** รูปร่างขั้นต่ำที่ตัดสินได้ — ตรงกับ `CommentItem` ของเธรด */
type HandledInput = {
  isFromPage: boolean
  externalCommentId: string
  privateReplySentAt: string | Date | null
  /** ส่วนขยาย 2026-08-19 — "จัดการแล้ว" โดยที่ระบบเราไม่ได้เป็นคนตอบ */
  resolvedAt: string | Date | null
}

/**
 * เกณฑ์เดียวกับ `deriveCommentState() !== 'UNANSWERED'` ทุกกิ่ง:
 *   1. คอมเมนต์ของเพจเอง — เพจไม่ต้องตอบตัวเอง
 *   2. มีคำตอบสาธารณะของเพจอยู่ข้างใต้ (ไม่ว่าคนหรือบอทเขียน)
 *   3. ทักแชทส่วนตัวสำเร็จแล้ว
 *   4. ถูกทำเครื่องหมายว่าจัดการแล้ว (กดข้ามเอง / Facebook ยืนยันว่าทักไปแล้ว)
 *
 * 🛑 ข้อ 4 ต้องอยู่ **ท้ายสุด** ให้ตรงกับ `deriveCommentState` ที่เช็ค `resolved` เป็นอันสุดท้าย
 * ก่อน UNANSWERED — ที่นี่ผลลัพธ์เป็น boolean จึงไม่เห็นความต่าง แต่ถ้าวันหน้าฟังก์ชันนี้ต้องคืน
 * "ใครเป็นคนจัดการ" ลำดับจะสำคัญทันที และคนที่มาแก้จะได้ไม่ต้องเดาว่าเรียงตามอะไร
 */
export function isCommentHandled(
  comment: HandledInput,
  /** คอมเมนต์ทั้งหมดในเธรด — ใช้หาคำตอบของเพจที่อยู่ใต้ใบนี้ */
  all: ReadonlyArray<{ isFromPage: boolean; parentExternalId: string | null }>,
): boolean {
  if (comment.isFromPage) return true
  if (all.some((r) => r.isFromPage && r.parentExternalId === comment.externalCommentId)) return true
  if (comment.privateReplySentAt) return true
  return comment.resolvedAt !== null
}

/**
 * จำนวน "ยังไม่ตอบ" ของคอมเมนต์ลูกค้าทั้งเธรด — นับทุกชั้น ไม่ใช่เฉพาะระดับบน
 *
 * ลูกค้าที่มาตอบใต้คอมเมนต์อื่นก็ยังเป็นคำถามที่รอคำตอบ ฝั่งรายการนับรวมมาตลอด ถ้าตรงนี้นับ
 * เฉพาะระดับบน ตัวเลข 2 ที่จะไม่ตรงกัน (user report 2026-08-03)
 */
export function countUnansweredInThread(
  all: ReadonlyArray<HandledInput & { isDeleted: boolean; parentExternalId: string | null }>,
): number {
  return all.filter((c) => !c.isFromPage && !c.isDeleted && !isCommentHandled(c, all)).length
}
