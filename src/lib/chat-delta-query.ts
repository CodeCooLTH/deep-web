import type { Prisma } from '@prisma/client'

/**
 * chat-delta-query — เกณฑ์ "อะไรคือของที่จอยังไม่รู้" ของห้องแชท (ส่วนขยาย 00018, 2026-09-14)
 *
 * สองแกน เพราะข้อความเปลี่ยนได้ 2 แบบที่ไม่เหมือนกันเลย:
 *   · แกน seq        — มีใบใหม่เกิดขึ้น
 *   · แกน updatedAt  — ใบเดิมถูกแก้ค่า (reaction / unsend / แก้ข้อความ / สถานะส่ง)
 *
 * 🛑 `afterSeq: 0` เป็นค่าที่ถูกต้อง (ห้องที่ยังไม่มีข้อความเลย) ⇒ ห้ามเช็คด้วย truthiness
 *    ที่ไหนทั้งสิ้น ต้องเช็ค `!== undefined` เสมอ
 */

export type DeltaInput = { afterSeq?: number; afterUpdatedAt?: string }

export function isDeltaRequest(input: DeltaInput): boolean {
  return input.afterSeq !== undefined || input.afterUpdatedAt !== undefined
}

export function buildDeltaWhere(
  input: DeltaInput & { conversationId: string },
): Prisma.ChatMessageWhereInput {
  const or: Prisma.ChatMessageWhereInput[] = []
  if (input.afterSeq !== undefined) or.push({ seq: { gt: input.afterSeq } })
  if (input.afterUpdatedAt !== undefined) or.push({ updatedAt: { gt: new Date(input.afterUpdatedAt) } })
  return { conversationId: input.conversationId, OR: or }
}

/**
 * ระยะที่ client ถอยแกน updatedAt ของ watermark ลงก่อนส่ง (R31)
 *
 * 🛑 watermark ไม่มีระยะเผื่อ = แถวที่ commit ช้ากว่าเพื่อนหายเงียบ ๆ ถาวร — seq/updatedAt ถูกกำหนด
 *    ตอนรันคำสั่ง แต่มองเห็นได้ตอน commit: `$transaction` แบบ interactive ใน send/ingest commit
 *    B ก่อน A ได้ ⇒ broadcast ของ B ยก watermark เลย A ไปแล้ว A จึงไม่เข้าเงื่อนไขทั้งสองแกน
 *    และ `@updatedAt` ถูกประทับด้วยนาฬิกาของ app server แต่ละเครื่องซึ่งเหลื่อมกันได้
 * ถอยเฉพาะแกน updatedAt พอ — แถวใหม่ทุกแถวได้ updatedAt = ตอน insert แกนนี้จึงครอบแถวใหม่ด้วย
 * แถวที่ถูกคืนซ้ำเพราะระยะเผื่อไม่มีผลต่อจอ: mergeMessages คง object เดิม · pickNewIncoming ไม่นับ id
 * ที่อยู่บนจอแล้ว · planDeltaApply ไม่นับแถวนอกหน้าต่างของจอเป็นเหตุให้แทนที่จอ
 */
export const DELTA_UPDATED_AT_OVERLAP_MS = 5_000

/** ค่า `afterUpdatedAt` ที่ส่งจริงจาก watermark ของ store (ISO เข้า ISO ออก) */
export function deltaAfterUpdatedAt(lastUpdatedAt: string): string {
  return new Date(new Date(lastUpdatedAt).getTime() - DELTA_UPDATED_AT_OVERLAP_MS).toISOString()
}
