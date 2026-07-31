/**
 * auto-reply-takeover.service.test.ts — "พนักงานตอบเอง แล้วบอทหลบ" (feature 00023)
 *
 * กลไกนี้มี gate/skipReason/test ครบมาตั้งแต่แรก แต่ไม่เคยมีใครเขียนค่าให้เลย ผลคือบอทตอบ
 * แทรกพนักงานอยู่บน prod จริง ๆ (user เจอ 2026-07-31) — test ชุดนี้จึงล็อก "ต้องมีการเขียนค่า"
 * ไว้ตรง ๆ ไม่ใช่แค่ทดสอบว่าอ่านค่าถูก
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}))
vi.mock('@/services/auto-reply-config.service', () => ({ getConfig: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getConfig } from '@/services/auto-reply-config.service'
import {
  pauseForHumanTakeover,
  clearTakeoverOnResolve,
  HANDOFF_REASON_HUMAN,
  HANDOFF_REASON_HUMAN_UNTIL_RESOLVED,
} from '@/services/auto-reply-takeover.service'

const findUnique = vi.mocked(prisma.conversation.findUnique)
const update = vi.mocked(prisma.conversation.update)
const updateMany = vi.mocked(prisma.conversation.updateMany)
const config = vi.mocked(getConfig)

const CONV = 'conv-1'
const SHOP = 'shop-1'

const withMode = (humanTakeoverPauseMode: string) =>
  config.mockResolvedValue({ humanTakeoverPauseMode } as never)

beforeEach(() => {
  vi.clearAllMocks()
  findUnique.mockResolvedValue({ shopId: SHOP } as never)
  update.mockResolvedValue({} as never)
  updateMany.mockResolvedValue({ count: 1 } as never)
})

describe('pauseForHumanTakeover — โหมดที่วัดเป็นเวลา', () => {
  it('2H -> เขียน autoReplyPausedUntil เป็นอนาคตราว 2 ชม.', async () => {
    withMode('2H')
    const before = Date.now()
    await pauseForHumanTakeover(CONV, SHOP)

    expect(update).toHaveBeenCalledTimes(1)
    const until = update.mock.calls[0]![0].data.autoReplyPausedUntil as Date
    const delta = until.getTime() - before
    // ช่วงกว้างพอให้ทนเวลาที่ผ่านไประหว่างรัน แต่แคบพอที่ 30M/MANUAL จะไม่ผ่านเงื่อนไขนี้
    expect(delta).toBeGreaterThan(2 * 60 * 60 * 1000 - 5_000)
    expect(delta).toBeLessThan(2 * 60 * 60 * 1000 + 5_000)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('30M -> ราว 30 นาที (ไม่ใช่ค่า default 2H)', async () => {
    withMode('30M')
    const before = Date.now()
    await pauseForHumanTakeover(CONV, SHOP)

    const until = update.mock.calls[0]![0].data.autoReplyPausedUntil as Date
    const delta = until.getTime() - before
    expect(delta).toBeGreaterThan(30 * 60 * 1000 - 5_000)
    expect(delta).toBeLessThan(30 * 60 * 1000 + 5_000)
  })
})

describe('pauseForHumanTakeover — โหมดที่หยุดไม่มีกำหนด', () => {
  it('MANUAL -> ใช้ handoffAt (autoReplyPausedUntil เป็น DateTime แทน "จนกว่าจะสั่ง" ไม่ได้)', async () => {
    withMode('MANUAL')
    await pauseForHumanTakeover(CONV, SHOP)

    expect(update).not.toHaveBeenCalled()
    expect(updateMany).toHaveBeenCalledTimes(1)
    const call = updateMany.mock.calls[0]![0]
    expect(call.data).toMatchObject({ handoffReason: HANDOFF_REASON_HUMAN })
    // ต้องไม่ทับ handoff ที่มีอยู่แล้ว — เหตุผลเดิมมีค่าในการ debug มากกว่า
    expect(call.where).toMatchObject({ handoffAt: null })
  })

  it('UNTIL_RESOLVED -> handoffReason แยกจาก MANUAL (ใช้เป็นเงื่อนไขปลดตอนปิดงาน)', async () => {
    withMode('UNTIL_RESOLVED')
    await pauseForHumanTakeover(CONV, SHOP)

    expect(updateMany.mock.calls[0]![0].data).toMatchObject({
      handoffReason: HANDOFF_REASON_HUMAN_UNTIL_RESOLVED,
    })
  })
})

describe('pauseForHumanTakeover — ความทนทาน', () => {
  it('ไม่ส่ง shopId มา -> หาเองจากเธรด', async () => {
    withMode('2H')
    await pauseForHumanTakeover(CONV)

    expect(findUnique).toHaveBeenCalledTimes(1)
    expect(config).toHaveBeenCalledWith(SHOP)
  })

  it('หาเธรดไม่เจอ -> เงียบ ไม่เขียนอะไร ไม่ throw', async () => {
    findUnique.mockResolvedValue(null as never)
    await expect(pauseForHumanTakeover(CONV)).resolves.toBeUndefined()
    expect(update).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('DB ล่ม -> ห้าม throw (ข้อความส่งถึงลูกค้าไปแล้ว การพังตรงนี้ต้องไม่ทำให้ทั้ง request ล้ม)', async () => {
    withMode('2H')
    update.mockRejectedValue(new Error('P1001 connection refused') as never)
    await expect(pauseForHumanTakeover(CONV, SHOP)).resolves.toBeUndefined()
  })
})

describe('clearTakeoverOnResolve', () => {
  it('ปลดเฉพาะเธรดที่ถูกหยุดด้วย UNTIL_RESOLVED — เหตุอื่นต้องไม่ถูกปลดโดยบังเอิญ', async () => {
    await clearTakeoverOnResolve(CONV, SHOP)

    const call = updateMany.mock.calls[0]![0]
    expect(call.where).toMatchObject({
      id: CONV,
      shopId: SHOP,
      handoffReason: HANDOFF_REASON_HUMAN_UNTIL_RESOLVED,
    })
    expect(call.data).toMatchObject({ handoffAt: null, handoffReason: null })
  })

  it('DB ล่ม -> ไม่ throw', async () => {
    updateMany.mockRejectedValue(new Error('boom') as never)
    await expect(clearTakeoverOnResolve(CONV, SHOP)).resolves.toBeUndefined()
  })
})
