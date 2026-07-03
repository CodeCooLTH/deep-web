import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock prisma ทั้ง module (test env ไม่มี DB) — pattern เดียวกับ activity.service.test
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userBadge: { createMany: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    badge: { findUnique: vi.fn(), findMany: vi.fn() },
    notification: { create: vi.fn() },
    verificationRecord: { findMany: vi.fn() },
    bidReaction: { count: vi.fn() },
    watchList: { count: vi.fn() },
    user: { count: vi.fn() },
    // shop: evaluateBadges resolve personal shop เสมอตอนนี้ (00008 P5-2 — DRY, ดู badge.service.ts
    // comment "ทำไม resolve personal shop ไม่ short-circuit") ต้อง mock ไว้แม้ test ไม่ใช้ seller shop
    shop: { findFirst: vi.fn() },
  },
}))
vi.mock('@/services/app-push.service', () => ({ pushToUser: vi.fn() }))
vi.mock('@/services/trust-score.service', () => ({ recalculateTrustScore: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { pushToUser } from '@/services/app-push.service'
import { awardBadge, notifyBadgeEarned, evaluateBadges, checkReactionCount, checkWatchlistCount, getUserBadgeRarityMap } from '@/services/badge.service'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.badge.findUnique).mockResolvedValue({ name: 'ชนะ 5 ดีล' } as never)
  vi.mocked(prisma.notification.create).mockResolvedValue({} as never)
})

describe('awardBadge — created detection + notify', () => {
  it('award ครั้งแรก (count=1) → return true + สร้าง notification + push', async () => {
    vi.mocked(prisma.userBadge.createMany).mockResolvedValue({ count: 1 } as never)
    const created = await awardBadge('u1', 'b1')
    expect(created).toBe(true)
    expect(prisma.notification.create).toHaveBeenCalledOnce()
    expect(pushToUser).toHaveBeenCalledOnce()
  })

  it('award ซ้ำ (count=0) → return false + ไม่ notify', async () => {
    vi.mocked(prisma.userBadge.createMany).mockResolvedValue({ count: 0 } as never)
    const created = await awardBadge('u1', 'b1')
    expect(created).toBe(false)
    expect(prisma.notification.create).not.toHaveBeenCalled()
    expect(pushToUser).not.toHaveBeenCalled()
  })

  it('notify:false → created แต่ไม่ notify', async () => {
    vi.mocked(prisma.userBadge.createMany).mockResolvedValue({ count: 1 } as never)
    const created = await awardBadge('u1', 'b1', { notify: false })
    expect(created).toBe(true)
    expect(prisma.notification.create).not.toHaveBeenCalled()
    expect(pushToUser).not.toHaveBeenCalled()
  })
})

describe('notifyBadgeEarned — content + guards', () => {
  it('สร้าง Notification kind=badge_earned + copy ไม่มี emoji + refId=badgeId', async () => {
    await notifyBadgeEarned('u1', 'b1')
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        kind: 'badge_earned',
        title: 'ได้รับ Badge ใหม่',
        body: 'คุณได้รับ "ชนะ 5 ดีล" แล้ว',
        refId: 'b1',
      },
    })
    expect(pushToUser).toHaveBeenCalledWith(
      'u1', 'ได้รับ Badge ใหม่', 'คุณได้รับ "ชนะ 5 ดีล" แล้ว', { type: 'badge_earned', badgeId: 'b1' },
    )
  })

  it('badge ไม่มีใน DB → return เงียบ ไม่สร้าง notification', async () => {
    vi.mocked(prisma.badge.findUnique).mockResolvedValue(null as never)
    await notifyBadgeEarned('u1', 'missing')
    expect(prisma.notification.create).not.toHaveBeenCalled()
    expect(pushToUser).not.toHaveBeenCalled()
  })

  it('notification.create throw → ไม่ rethrow (best-effort)', async () => {
    vi.mocked(prisma.notification.create).mockRejectedValue(new Error('db down') as never)
    await expect(notifyBadgeEarned('u1', 'b1')).resolves.toBeUndefined()
  })
})

describe('checkReactionCount', () => {
  it('met=true เมื่อ count ถึง threshold', async () => {
    vi.mocked(prisma.bidReaction.count).mockResolvedValue(20 as never)
    expect(await checkReactionCount('u1', { type: 'REACTION_COUNT', count: 20 })).toEqual({ met: true, count: 20 })
  })
  it('met=false เมื่อยังไม่ถึง', async () => {
    vi.mocked(prisma.bidReaction.count).mockResolvedValue(19 as never)
    expect(await checkReactionCount('u1', { type: 'REACTION_COUNT', count: 20 })).toEqual({ met: false, count: 19 })
  })
})

describe('checkWatchlistCount', () => {
  it('met=true เมื่อ count ถึง threshold', async () => {
    vi.mocked(prisma.watchList.count).mockResolvedValue(10 as never)
    expect(await checkWatchlistCount('u1', { type: 'WATCHLIST_COUNT', count: 10 })).toEqual({ met: true, count: 10 })
  })
  it('met=false เมื่อยังไม่ถึง', async () => {
    vi.mocked(prisma.watchList.count).mockResolvedValue(5 as never)
    expect(await checkWatchlistCount('u1', { type: 'WATCHLIST_COUNT', count: 10 })).toEqual({ met: false, count: 5 })
  })
})

describe('getUserBadgeRarityMap', () => {
  it('badgeIds ว่าง → Map ว่าง', async () => {
    const m = await getUserBadgeRarityMap([])
    expect(m.size).toBe(0)
  })
  it('userCount < 5 → gate: Map ว่าง (ไม่แสดง pill)', async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(4 as never)
    vi.mocked(prisma.userBadge.groupBy).mockResolvedValue([] as never)
    const m = await getUserBadgeRarityMap(['b1'])
    expect(m.size).toBe(0)
  })
  it('tier ตาม pct: 60%→COMMON, 30%→UNCOMMON, 10%→RARE, 2%→LEGENDARY', async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(100 as never)
    vi.mocked(prisma.userBadge.groupBy).mockResolvedValue([
      { badgeId: 'bC', _count: { badgeId: 60 } },
      { badgeId: 'bU', _count: { badgeId: 30 } },
      { badgeId: 'bR', _count: { badgeId: 10 } },
      { badgeId: 'bL', _count: { badgeId: 2 } },
    ] as never)
    const m = await getUserBadgeRarityMap(['bC', 'bU', 'bR', 'bL'])
    expect(m.get('bC')).toBe('COMMON')
    expect(m.get('bU')).toBe('UNCOMMON')
    expect(m.get('bR')).toBe('RARE')
    expect(m.get('bL')).toBe('LEGENDARY')
  })
  it('badge ที่ไม่มี earner (ไม่อยู่ใน groupBy) → LEGENDARY (0%)', async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(100 as never)
    vi.mocked(prisma.userBadge.groupBy).mockResolvedValue([] as never)
    const m = await getUserBadgeRarityMap(['bNew'])
    expect(m.get('bNew')).toBe('LEGENDARY')
  })
})

describe('evaluateBadges — thread notify param', () => {
  it('notify:false ส่งต่อ awardBadge → ไม่ notify แม้ award ใหม่', async () => {
    // badge 1 ใบ criteria FULL_VERIFICATION, user ยังไม่ได้
    vi.mocked(prisma.badge.findMany).mockResolvedValue([
      { id: 'b1', nameEN: 'X', audience: 'ANY', criteria: { type: 'FULL_VERIFICATION' } },
    ] as never)
    vi.mocked(prisma.userBadge.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.userBadge.createMany).mockResolvedValue({ count: 1 } as never)
    // checkFullVerification → met=true: ครบ L1+L2+L3
    vi.mocked(prisma.verificationRecord.findMany).mockResolvedValue([
      { level: 1 }, { level: 2 }, { level: 3 },
    ] as never)
    await evaluateBadges('u1', 'ANY', { notify: false })
    expect(prisma.notification.create).not.toHaveBeenCalled()
  })
})
