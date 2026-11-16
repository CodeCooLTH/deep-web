import { describe, expect, it } from 'vitest'
import { aggregateBotStats, repliedPct } from '../stats'

const s = (botId: string, runId: string, status: string) => ({ botId, runId, status })

describe('aggregateBotStats', () => {
  it('นับ SENT/FAILED แยก · run ที่ส่งหลายรอบนับเป็น 1 แชท · ตอบกลับนับเฉพาะ run ที่ได้รับข้อความ', () => {
    const r = aggregateBotStats(
      [s('b1', 'r1', 'SENT'), s('b1', 'r1', 'SENT'), s('b1', 'r2', 'SENT'), s('b1', 'r3', 'FAILED'), s('b2', 'r4', 'SENT')],
      [{ id: 'r1', stopReason: 'CUSTOMER_REPLIED' }, { id: 'r2', stopReason: 'STAGE_CHANGED' }, { id: 'r4', stopReason: null }],
    )
    expect(r.byBot.b1).toEqual({ sent: 3, failed: 1, reached: 2, replied: 1 })
    expect(r.byBot.b2).toEqual({ sent: 1, failed: 0, reached: 1, replied: 0 })
    expect(r.total).toEqual({ sent: 4, failed: 1, reached: 3, replied: 1 })
  })
  it('run ที่มีแต่ FAILED ไม่นับเป็นแชทที่ได้รับข้อความ แม้ตอบกลับ', () => {
    const r = aggregateBotStats([s('b1', 'r1', 'FAILED')], [{ id: 'r1', stopReason: 'CUSTOMER_REPLIED' }])
    expect(r.total).toEqual({ sent: 0, failed: 1, reached: 0, replied: 0 })
  })
  it('SKIPPED/SENDING ไม่นับ', () => {
    expect(aggregateBotStats([s('b1', 'r1', 'SKIPPED'), s('b1', 'r2', 'SENDING')], []).total).toEqual({ sent: 0, failed: 0, reached: 0, replied: 0 })
  })
})

describe('repliedPct', () => {
  it('ปัดเศษ · ไม่มีตัวหาร = null', () => {
    expect(repliedPct({ reached: 302, replied: 88 })).toBe(29)
    expect(repliedPct({ reached: 3, replied: 2 })).toBe(67)
    expect(repliedPct({ reached: 0, replied: 0 })).toBeNull()
  })
})
