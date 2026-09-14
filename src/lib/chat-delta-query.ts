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
