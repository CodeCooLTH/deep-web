// 00095 redesign — ตัวเลข 7 วันของบอท (pure: ห้าม import prisma/react) · query อยู่ที่ service ส่วนนี้แค่รวมตัวเลข
// นิยาม: ส่งแล้ว = Send SENT · ส่งไม่สำเร็จ = Send FAILED · ได้รับข้อความ = run ที่มี SENT ≥1 ในช่วง
// ตอบกลับ = ในกลุ่ม "ได้รับข้อความ" ที่ run หยุดเพราะ CUSTOMER_REPLIED (ลูกค้าที่ตอบก่อนบอทส่งไม่ถูกนับเป็นผลของบอท)

export const STATS_WINDOW_DAYS = 7

export interface StatsSendRow {
  botId: string
  runId: string
  status: string
}
export interface StatsRunRow {
  id: string
  stopReason: string | null
}
export interface BotStats {
  sent: number
  failed: number
  /** จำนวนแชท (run) ที่ได้รับข้อความ ≥1 ใน 7 วัน — ตัวหารของ % ตอบกลับ */
  reached: number
  replied: number
}
export interface BotStatsResult {
  byBot: Record<string, BotStats>
  total: BotStats
}

const zero = (): BotStats => ({ sent: 0, failed: 0, reached: 0, replied: 0 })

export function aggregateBotStats(sends: readonly StatsSendRow[], runs: readonly StatsRunRow[]): BotStatsResult {
  const replied = new Set(runs.filter((r) => r.stopReason === 'CUSTOMER_REPLIED').map((r) => r.id))
  const byBot: Record<string, BotStats> = {}
  const total = zero()
  const reachedSeen = new Set<string>()
  for (const s of sends) {
    const b = (byBot[s.botId] ??= zero())
    if (s.status === 'FAILED') {
      b.failed++
      total.failed++
    } else if (s.status === 'SENT') {
      b.sent++
      total.sent++
      // run หนึ่งอาจส่งหลายรอบ — นับเป็น 1 แชทต่อบอท
      if (!reachedSeen.has(s.runId)) {
        reachedSeen.add(s.runId)
        b.reached++
        total.reached++
        if (replied.has(s.runId)) {
          b.replied++
          total.replied++
        }
      }
    }
  }
  return { byBot, total }
}

/** % ตอบกลับ (ปัดเศษ) · ไม่มีแชทที่ได้รับข้อความ = null (แสดง "–" ไม่ใช่ 0%) */
export const repliedPct = (s: Pick<BotStats, 'reached' | 'replied'>): number | null => (s.reached > 0 ? Math.round((s.replied / s.reached) * 100) : null)
