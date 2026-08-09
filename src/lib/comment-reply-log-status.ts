/**
 * comment-reply-log-status — นิยามเดียวของ "แถวประวัตินี้จบยังไง" (feature 00038)
 *
 * แถวใน `CommentReplyLog` มีสองสถานะแยกกัน (`publicReplyStatus` = ตอบใต้คอมเมนต์,
 * `privateReplyStatus` = ทักแชทส่วนตัว) แต่ผู้ขายที่เปิดตารางประวัติถามคำถามเดียว:
 * **"มีอันไหนล้มเหลวไหม"** — ตัวกรองกับป้ายสถานะจึงต้องตอบด้วยเกณฑ์ชุดเดียวกัน ไม่ใช่ต่างคนต่างคิด
 * (HR16 · impeccable critique 2026-08-09 P2)
 *
 * ลำดับความสำคัญ **FAILED > SENT > SKIPPED** — ไม่ใช่การเรียงตามตัวอักษร แต่เพราะเป็นลำดับที่
 * ผู้ขายใช้คัดกรองจริง: แถวที่มีอะไรล้มต้องโผล่ก่อนเสมอ แม้ในแถวเดียวกันจะมีอีกฝั่งที่ส่งสำเร็จ
 *
 * pure module — ไม่ import อะไรเลย ใช้ได้ทั้ง client (badge) และ server (where clause)
 */

export type CommentReplyLogStatus = 'SENT' | 'SKIPPED' | 'FAILED'
export type CommentReplyLogStatusFilter = 'ALL' | CommentReplyLogStatus

/**
 * คำ + สีของแต่ละสถานะ — **แหล่งเดียว** ที่ทั้ง badge ในตารางและตัวกรองใน toolbar อ่าน
 *
 * เดิมคำสามคำนี้ถูกพิมพ์แยกกันสองที่ (`REPLY_STATUS_META` กับรายการตัวเลือกของ FilterDropdown)
 * ซึ่งเป็น HR16 ตรงตัว: ผู้ใช้กรอง "ไม่สำเร็จ" แล้วเห็น badge เขียนคำอื่น ก็ไม่มีอะไรฟ้อง
 * เพราะทั้งสองสตริงถูกในตัวเอง
 *
 * class ต้องเป็น `-ink` บนพื้นจาง 15% เสมอ (paces-component-reference.md §6)
 */
export const LOG_STATUS_META: Record<CommentReplyLogStatus, { label: string; className: string }> = {
  SENT: { label: 'ส่งแล้ว', className: 'bg-success/15 text-success-ink' },
  SKIPPED: { label: 'ข้าม', className: 'bg-default-200 text-default-700' },
  FAILED: { label: 'ไม่สำเร็จ', className: 'bg-danger/15 text-danger-ink' },
}

/** ตัวเลือกของตัวกรอง — เรียงตามลำดับที่ผู้ขายมองหา (ล้มเหลวก่อน) ไม่ใช่ตามตัวอักษร */
export const LOG_STATUS_FILTER_OPTIONS: Array<{ value: CommentReplyLogStatusFilter; label: string }> = [
  { value: 'ALL', label: 'สถานะ: ทั้งหมด' },
  ...(['FAILED', 'SENT', 'SKIPPED'] as const).map((v) => ({
    value: v as CommentReplyLogStatusFilter,
    label: `สถานะ: ${LOG_STATUS_META[v].label}`,
  })),
]

/**
 * allow-list ค่าที่รับจาก query param — ค่าแปลกตกไป 'ALL' (fail-open = ไม่กรองอะไรเลย)
 * ไม่โยน error เพราะเป็นค่าที่ client แก้เองได้ และการเห็นทุกแถวไม่ใช่ความเสียหาย
 */
export function parseLogStatusFilter(raw: string | null | undefined): CommentReplyLogStatusFilter {
  return raw === 'SENT' || raw === 'SKIPPED' || raw === 'FAILED' ? raw : 'ALL'
}

// 🛑 เคยมี `deriveLogStatus()` (สถานะ "รวมทั้งแถว") อยู่ตรงนี้ — ถอดออกแล้ว 2026-08-09 เพราะ
// **ไม่มี production code เรียกเลยสักที่** มีแต่เทสของตัวเอง: badge ในตารางแสดงสถานะ *รายคอลัมน์*
// (public/private แยกกัน) ไม่ใช่สถานะรวม ส่วนฝั่งกรองใช้ SQL ที่ logStatusWhere() ประกอบ
//
// SSOT ที่มีผู้บริโภคศูนย์รายคือเอกสารที่ใส่เสื้อโค้ด — มันเน่าเงียบและเทสจะเขียวตลอดไม่ว่าโค้ดจริง
// ทำอะไร สิ่งที่กัน drift ได้จริงคือ "มีผู้เรียกอย่างน้อยสองราย" ไม่ใช่ "มีไฟล์"
// (impeccable critique 2026-08-09 รอบ 2 — ข้อนี้เป็นของที่รอบเดียวกันนั้นเพิ่งสร้างขึ้นมาเอง)
// ถ้าวันหลังต้องการสถานะรวมทั้งแถวจริง ๆ ให้เขียนใหม่พร้อม call site ในคอมมิตเดียวกัน

/**
 * เงื่อนไข Prisma `where` ของตัวกรองสถานะ
 *
 * 🛑 ทุกเงื่อนไข "ไม่เท่ากับ" ต้อง OR ด้วย `null` เสมอ — คอลัมน์ทั้งสองเป็น nullable และใน SQL
 * `col <> 'FAILED'` **ไม่คืนแถวที่ col เป็น NULL** (NULL เทียบอะไรก็ได้ NULL ไม่ใช่ true)
 * ถ้าลืมข้อนี้ แถวที่ถูกข้ามตั้งแต่ก่อนยิง Graph (ซึ่งเป็น NULL ทั้งคู่ และเป็น **แถวส่วนใหญ่**
 * ของตาราง) จะหายไปจากตัวกรอง "ข้าม" ทั้งหมด โดยไม่มี error อะไรเลย
 */
export function logStatusWhere(status: CommentReplyLogStatusFilter): Record<string, unknown> {
  const isFailed = { OR: [{ publicReplyStatus: 'FAILED' }, { privateReplyStatus: 'FAILED' }] }
  const isSent = { OR: [{ publicReplyStatus: 'SENT' }, { privateReplyStatus: 'SENT' }] }
  const notFailed = {
    AND: [
      { OR: [{ publicReplyStatus: null }, { publicReplyStatus: { not: 'FAILED' } }] },
      { OR: [{ privateReplyStatus: null }, { privateReplyStatus: { not: 'FAILED' } }] },
    ],
  }
  const notSent = {
    AND: [
      { OR: [{ publicReplyStatus: null }, { publicReplyStatus: { not: 'SENT' } }] },
      { OR: [{ privateReplyStatus: null }, { privateReplyStatus: { not: 'SENT' } }] },
    ],
  }

  switch (status) {
    case 'FAILED':
      return isFailed
    case 'SENT':
      // ล้มเหลวชนะเสมอ — แถวที่ public สำเร็จแต่ private ล้ม ต้องไม่โผล่ในตัวกรอง "ส่งแล้ว"
      return { AND: [isSent, notFailed] }
    case 'SKIPPED':
      return { AND: [notSent, notFailed] }
    default:
      return {}
  }
}
