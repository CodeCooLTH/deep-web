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

/** ป้ายไทยของตัวกรอง — เรียงตามลำดับที่ผู้ขายมองหา ไม่ใช่ตามตัวอักษร */
export const LOG_STATUS_FILTER_OPTIONS: Array<{ value: CommentReplyLogStatusFilter; label: string }> = [
  { value: 'ALL', label: 'สถานะ: ทั้งหมด' },
  { value: 'FAILED', label: 'สถานะ: ไม่สำเร็จ' },
  { value: 'SENT', label: 'สถานะ: ส่งแล้ว' },
  { value: 'SKIPPED', label: 'สถานะ: ข้าม' },
]

/**
 * allow-list ค่าที่รับจาก query param — ค่าแปลกตกไป 'ALL' (fail-open = ไม่กรองอะไรเลย)
 * ไม่โยน error เพราะเป็นค่าที่ client แก้เองได้ และการเห็นทุกแถวไม่ใช่ความเสียหาย
 */
export function parseLogStatusFilter(raw: string | null | undefined): CommentReplyLogStatusFilter {
  return raw === 'SENT' || raw === 'SKIPPED' || raw === 'FAILED' ? raw : 'ALL'
}

/** สถานะรวมของแถว — ใช้ตัวนี้ทุกที่ที่ต้องบอกว่า "แถวนี้จบยังไง" */
export function deriveLogStatus(row: {
  publicReplyStatus: string | null
  privateReplyStatus: string | null
}): CommentReplyLogStatus {
  if (row.publicReplyStatus === 'FAILED' || row.privateReplyStatus === 'FAILED') return 'FAILED'
  if (row.publicReplyStatus === 'SENT' || row.privateReplyStatus === 'SENT') return 'SENT'
  return 'SKIPPED'
}

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
