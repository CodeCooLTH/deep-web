// 00095 TFR-FB-05 — "1 ช่องทาง 1 บอทต่อสถานะ" (pure · ใช้ทั้ง client ล็อกช่องทางและ server ตัดสินจริง — ฟังก์ชันเดียว)

export interface ConflictBot {
  id: string
  name: string
  channelIds: readonly string[]
  /** ว่าง = ทุกสถานะ */
  salesStatuses: readonly string[]
  /** จำนวนแท็กที่ยังมีอยู่ในร้าน (ไม่นับแท็กหาย) */
  usableTagCount: number
}
export interface ConflictOther extends ConflictBot {
  status: string
  deletedAt: Date | string | null
}
export interface ChannelConflict {
  channelId: string
  botId: string
  botName: string
}

const hasNoCondition = (b: Pick<ConflictBot, 'salesStatuses' | 'usableTagCount'>) =>
  b.salesStatuses.length === 0 && b.usableTagCount === 0

/**
 * ชนเมื่อ: others = บอทอื่นที่ยังไม่ลบและไม่ปิด · ช่องทางร่วมกัน · สถานะซ้อนกัน หรือฝ่ายใดฝ่ายหนึ่งว่าง (= ทุกสถานะ ซ้อนกับทุกอย่าง)
 * ยกเว้นบอทที่ไม่เหลือเงื่อนไข (AC-FB-22 — แท็กหายหมดและไม่มีสถานะ = ไม่แนบอยู่แล้ว จึงไม่ควรบล็อกคนอื่น)
 */
export function findChannelConflicts(candidate: ConflictBot, others: readonly ConflictOther[]): ChannelConflict[] {
  if (hasNoCondition(candidate)) return []
  const out: ChannelConflict[] = []
  for (const o of others) {
    if (o.id === candidate.id || o.deletedAt != null || o.status === 'CLOSED' || hasNoCondition(o)) continue
    const overlap =
      candidate.salesStatuses.length === 0 ||
      o.salesStatuses.length === 0 ||
      candidate.salesStatuses.some((s) => o.salesStatuses.includes(s))
    if (!overlap) continue
    for (const ch of candidate.channelIds) if (o.channelIds.includes(ch)) out.push({ channelId: ch, botId: o.id, botName: o.name })
  }
  return out
}
