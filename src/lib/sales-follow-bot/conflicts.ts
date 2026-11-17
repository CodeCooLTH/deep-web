import { hasLimitingCondition, possibleStages, type ConditionMatch, type ConditionRule } from './conditions'

// 00095 TFR-FB-05 — "1 ช่องทาง 1 บอทต่อสถานะ" (pure · ใช้ทั้ง client ล็อกช่องทางและ server ตัดสินจริง — ฟังก์ชันเดียว)

export interface ConflictBot {
  id: string
  name: string
  channelIds: readonly string[]
  /** เงื่อนไขการเริ่มติดตาม — ชุดสถานะที่อาจตรงคำนวณจาก possibleStages (ไม่มีแถว stage = ทุกสถานะ) */
  conditionMatch: ConditionMatch
  rules: readonly ConditionRule[]
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

const hasNoCondition = (b: Pick<ConflictBot, 'rules' | 'conditionMatch'>) => !hasLimitingCondition(b.rules, b.conditionMatch)

/**
 * ชนเมื่อ: others = บอทอื่นที่ยังไม่ลบและไม่ปิด · ช่องทางร่วมกัน · ชุดสถานะที่อาจตรงซ้อนกัน (ไม่มีแถวสถานะ = ทุกสถานะ)
 * ยกเว้นบอทที่ไม่มีแถวจำกัดวง (ไม่แนบอยู่แล้ว จึงไม่ควรบล็อกคนอื่น)
 */
export function findChannelConflicts(candidate: ConflictBot, others: readonly ConflictOther[]): ChannelConflict[] {
  if (hasNoCondition(candidate)) return []
  const out: ChannelConflict[] = []
  for (const o of others) {
    if (o.id === candidate.id || o.deletedAt != null || o.status === 'CLOSED' || hasNoCondition(o)) continue
    const theirs = possibleStages(o.rules, o.conditionMatch)
    const overlap = possibleStages(candidate.rules, candidate.conditionMatch).some((s) => theirs.includes(s))
    if (!overlap) continue
    for (const ch of candidate.channelIds) if (o.channelIds.includes(ch)) out.push({ channelId: ch, botId: o.id, botName: o.name })
  }
  return out
}
