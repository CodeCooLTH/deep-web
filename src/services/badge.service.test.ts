import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock prisma ทั้ง module (test env ไม่มี DB) — pattern เดียวกับ activity.service.test
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userBadge: { createMany: vi.fn(), findMany: vi.fn() },
    badge: { findUnique: vi.fn(), findMany: vi.fn() },
    notification: { create: vi.fn() },
    verificationRecord: { findMany: vi.fn() },
  },
}))
vi.mock('@/services/app-push.service', () => ({ pushToUser: vi.fn() }))
vi.mock('@/services/trust-score.service', () => ({ recalculateTrustScore: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { pushToUser } from '@/services/app-push.service'
import { awardBadge, notifyBadgeEarned, evaluateBadges } from '@/services/badge.service'

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
