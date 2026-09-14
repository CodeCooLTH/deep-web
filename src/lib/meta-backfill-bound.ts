/**
 * meta-backfill-bound — "ไล่ย้อนอีกหน้าไหม และถือว่าครบหรือยัง" (ส่วนขยาย 00018, 2026-09-14)
 *
 * 🛑 stop กับ markComplete ตอบคนละคำถาม ห้ามรวมเป็นตัวเดียว:
 *    · stop         = รอบนี้พอแค่นี้
 *    · markComplete = เธรดนี้ไล่ครบถึงวันที่สร้างแล้ว ไม่ต้องไล่อีกตลอดไป
 *    การชนเพดานหน้าคือเคสที่ stop=true แต่ markComplete=false — ถ้าปักธงตรงนั้นด้วย
 *    เธรดยาว ๆ จะถูกประกาศว่า "ครบแล้ว" ทั้งที่ยังขาดอีกครึ่ง โดยไม่มีอะไรฟ้อง
 *
 * 🛑 หน้าว่าง ≠ หน้าสุดท้าย — เอกสาร Graph (Paginated Results): "it is possible that a page may be
 *    empty but contain a next paging link. Stop paging when the next link no longer appears."
 *    ⇒ หน้าว่างที่ยังมี next ต้องไล่ต่อ (ปักธงตรงนั้น = ประกาศว่าครบทั้งที่ Meta บอกว่ายังมี)
 */

export const MAX_BACKFILL_PAGES = 20

export function decideBackfillStep(input: {
  /** เวลาของข้อความเก่าสุดในหน้าที่เพิ่งดึงมา — null = หน้าว่าง */
  oldestInPage: Date | null
  conversationCreatedAt: Date
  /** หน้าที่เพิ่งดึงเสร็จ เริ่มที่ 1 */
  pageNo: number
  hasNextPage: boolean
  maxPages: number
}): { stop: boolean; markComplete: boolean } {
  if (input.oldestInPage !== null && input.oldestInPage.getTime() <= input.conversationCreatedAt.getTime()) {
    return { stop: true, markComplete: true }
  }
  if (!input.hasNextPage) return { stop: true, markComplete: true }
  if (input.pageNo >= input.maxPages) return { stop: true, markComplete: false }
  return { stop: false, markComplete: false }
}
