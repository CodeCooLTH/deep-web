/**
 * แคชรายวัน (TD-05): เก็บ promise · หมดอายุ 60 วินาที · ล้ม = UNAVAILABLE และไม่จำ — ไม่ต้องใช้ DB
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const summary = vi.hoisted(() => vi.fn())
const count = vi.hoisted(() => vi.fn())
vi.mock('@/services/agent-performance.service', () => ({ getShopResponseSummary: summary }))
vi.mock('@/lib/prisma', () => ({ prisma: { conversation: { count } } }))

import { __resetDailyCacheForTests, getDailyMetrics } from '@/services/chat-desk.service'

const OK = {
  firstResponseAvgSec: 10, responseAvgSec: 20, responseSampleCount: 3, unattributedReplyCount: 1, answeredOutsideSystemConversations: 0,
}
const T = new Date('2026-10-16T05:00:00.000Z')

describe('getDailyMetrics — แคช globalThis', () => {
  beforeEach(() => {
    __resetDailyCacheForTests()
    summary.mockReset().mockResolvedValue(OK)
    count.mockReset().mockResolvedValue(4)
  })

  it('คำขอพร้อมกัน/ภายใน 60 วินาที ใช้ผลเดียว (คำนวณ 1 ครั้ง) · ครบ 60 วินาทีคำนวณใหม่', async () => {
    const [a, b] = await Promise.all([getDailyMetrics('s1', T), getDailyMetrics('s1', T)])
    expect(a).toBe(b)
    expect(a).toMatchObject({ status: 'OK', resolvedToday: 4, responseAvgSec: 20 })
    await getDailyMetrics('s1', new Date(T.getTime() + 59_999))
    expect(summary).toHaveBeenCalledTimes(1)
    await getDailyMetrics('s1', new Date(T.getTime() + 60_000))
    expect(summary).toHaveBeenCalledTimes(2)
    await getDailyMetrics('s2', T) // คนละร้านคนละแคช
    expect(summary).toHaveBeenCalledTimes(3)
  })

  it('ช่วงวันของ summary = วันนี้เวลาไทย [00:00, +24h) (AC-CD-16)', async () => {
    await getDailyMetrics('s1', T)
    expect(summary).toHaveBeenCalledWith('s1', { from: new Date('2026-10-15T17:00:00.000Z'), to: new Date('2026-10-16T17:00:00.000Z') })
  })

  it('ล้ม → UNAVAILABLE (ไม่ throw) และไม่จำ รอบถัดไปลองใหม่', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    summary.mockRejectedValueOnce(new Error('db down'))
    const bad = await getDailyMetrics('s1', T)
    expect(bad.status).toBe('UNAVAILABLE')
    expect(bad.responseAvgSec).toBeNull()
    const good = await getDailyMetrics('s1', new Date(T.getTime() + 1000))
    expect(good.status).toBe('OK')
  })
})
