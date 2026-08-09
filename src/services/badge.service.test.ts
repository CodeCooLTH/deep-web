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
    order: { count: vi.fn() },
    review: { aggregate: vi.fn(), findMany: vi.fn() },
  },
}))
vi.mock('@/services/app-push.service', () => ({ pushToUser: vi.fn() }))
vi.mock('@/services/trust-score.service', () => ({ recalculateTrustScore: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { pushToUser } from '@/services/app-push.service'
import { awardBadge, notifyBadgeEarned, evaluateBadges, checkReactionCount, checkWatchlistCount, getUserBadgeRarityMap, getBadgeProgress, toBadgeScope } from '@/services/badge.service'
import { displayProgressPct } from '@/app/(paces)/seller/(dashboard)/badges/_constants/badge-labels'

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

/**
 * [blocker] Regression — บั๊ก prod 2026-08-09 "ได้ noti ว่าได้เหรียญ แต่หน้า /badges ว่าง"
 *
 * ฝั่งเขียนมอบเหรียญของร้าน BUSINESS ด้วย UserBadge.shopId = shop.id แต่ฝั่งอ่านทั้ง 4 จุด
 * เรียก getBadgeProgress(userId, 'SELLER') เปล่า ๆ ซึ่งตกไปร้าน PERSONAL เสมอ → query
 * `where { userId, shopId: null }` → เหรียญของร้าน BUSINESS ไม่เคยถูกดึงมาเลย
 *
 * เทสชุดนี้ล็อก "where ที่ยิงออกไปจริง" ไม่ใช่แค่ผลลัพธ์ — เพราะบั๊กเดิมคืนค่าถูก type ทุกอย่าง
 * (array ว่าง = "ยังไม่ได้เหรียญ" ซึ่งเป็นคำตอบที่ valid) จึงไม่มี assertion แบบผลลัพธ์ใดจับได้
 * แดงเมื่อไหร่ห้าม merge
 */
describe('[blocker] toBadgeScope + getBadgeProgress — scope ตามร้านที่เปิดอยู่', () => {
  beforeEach(() => {
    // ไม่มี badge ให้ประเมิน — ตัดตัวแปรอื่นทิ้ง เหลือแค่ where ของ userBadge.findMany ที่กำลังพิสูจน์
    vi.mocked(prisma.badge.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.userBadge.findMany).mockResolvedValue([] as never)
  })

  it('BUSINESS → ownerUserId = เจ้าของร้าน (ไม่ใช่คนที่เปิดหน้า) + shop context ของร้านนั้น', () => {
    const scope = toBadgeScope(
      { shop: { id: 'shopB', userId: 'owner1' }, kind: 'BUSINESS' },
      'staff9', // พนักงาน role ADMIN เป็นคนเปิดหน้า
    )
    expect(scope).toEqual({
      ownerUserId: 'owner1',
      shop: { id: 'shopB', userId: 'owner1', kind: 'BUSINESS' },
    })
  })

  it('ไม่มี active shop → shop=null + ถอยไปใช้ userId ที่ส่งมา', () => {
    expect(toBadgeScope(null, 'u1')).toEqual({ ownerUserId: 'u1', shop: null })
  })

  it('BUSINESS scope → query ด้วย { shopId } และ **ห้าม** fallback ไปหาร้าน PERSONAL', async () => {
    const scope = toBadgeScope({ shop: { id: 'shopB', userId: 'owner1' }, kind: 'BUSINESS' }, 'owner1')
    await getBadgeProgress(scope.ownerUserId, 'SELLER', scope.shop)

    expect(prisma.userBadge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId: 'shopB' } }),
    )
    // หัวใจของบั๊ก: เดิมตัวนี้ถูกเรียกเสมอเพื่อ resolve ร้าน PERSONAL มาทับ scope ที่ส่งมา
    expect(prisma.shop.findFirst).not.toHaveBeenCalled()
  })

  it('PERSONAL scope → คง where { userId, shopId: null } เดิม (zero-regression)', async () => {
    const scope = toBadgeScope({ shop: { id: 'shopP', userId: 'u1' }, kind: 'PERSONAL' }, 'u1')
    await getBadgeProgress(scope.ownerUserId, 'SELLER', scope.shop)

    expect(prisma.userBadge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', shopId: null } }),
    )
  })
})

/**
 * [blocker] Regression — แถบความคืบหน้ากับป้ายใต้แถบต้องไม่ขัดกันเอง
 * (impeccable critique 2026-08-09 P1) เดิมจอโชว์ "แถบเต็ม 100% + ยังไม่เริ่ม" พร้อมกันได้
 */
describe('[blocker] progress: แถบกับป้ายต้องไม่ขัดกันเอง', () => {
  beforeEach(() => {
    vi.mocked(prisma.userBadge.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.shop.findFirst).mockResolvedValue({ id: 's1', userId: 'u1', kind: 'PERSONAL' } as never)
  })

  it('ZERO_COMPLAINT ครบเงื่อนไขทุกข้อ → ต้องมี progressLabel (เดิมเป็น null → การ์ดขึ้น "ยังไม่เริ่ม" ทับแถบเต็ม)', async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([
      { id: 'b1', nameEN: 'Zero', audience: 'SELLER', criteria: { type: 'ZERO_COMPLAINT', minOrders: 10 } },
    ] as never)
    // completed = 10 (ครบ), cancelled = 0 (ไม่มียกเลิก) — เรียงตามลำดับที่ checkZeroComplaint ยิง
    vi.mocked(prisma.order.count).mockResolvedValueOnce(10 as never).mockResolvedValueOnce(0 as never)

    const [row] = await getBadgeProgress('u1', 'SELLER')
    expect(row.progressLabel).not.toBeNull()
    expect(row.progressLabel).toContain('ครบเงื่อนไขแล้ว')
  })

  it('HIGH_RATING: รีวิวครบแต่คะแนนเฉลี่ยยังไม่ถึง → ratio ต้องไม่เต็ม (คิดจากมิติที่ห่างที่สุด)', async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([
      { id: 'b2', nameEN: 'High', audience: 'SELLER', criteria: { type: 'HIGH_RATING', minReviews: 10, minRating: 4.5 } },
    ] as never)
    // รีวิว 10 ใบ (ครบ) แต่เฉลี่ย 3.6 จากเกณฑ์ 4.5 → 3.6/4.5 = 0.8
    vi.mocked(prisma.review.aggregate).mockResolvedValue({ _avg: { rating: 3.6 }, _count: { rating: 10 } } as never)

    const [row] = await getBadgeProgress('u1', 'SELLER')
    expect(row.progressRatio).toBeCloseTo(0.8, 5)
    expect(row.progressLabel).toContain('3.60')
  })
})

/**
 * [blocker] displayProgressPct — cap ต้องอยู่ชั้นแสดงผล ไม่ใช่ชั้นข้อมูล
 * ถ้ามีคนย้าย cap นี้ไปไว้ใน getBadgeProgress ตัว getBadgePaceEstimate จะคิด remaining ผิด
 * แล้ว badge ที่ครบเกณฑ์แล้วจะขึ้นว่า "อีก N วัน" ทั้งที่ไม่เหลืออะไรต้องทำ
 */
describe('[blocker] displayProgressPct', () => {
  it('ยังไม่ได้รับ + ratio เต็ม → cap ที่ 95% (ห้ามโชว์แถบเต็มในกล่อง "ยังล็อกอยู่")', () => {
    expect(displayProgressPct(1, false)).toBe(95)
  })

  it('ได้รับแล้ว → 100% ตามจริง', () => {
    expect(displayProgressPct(1, true)).toBe(100)
  })

  it('ยังไม่ถึงเพดาน → ปล่อยผ่านตามจริง ไม่บิดตัวเลข', () => {
    expect(displayProgressPct(0.42, false)).toBe(42)
    expect(displayProgressPct(0, false)).toBe(0)
  })

  it('getBadgeProgress ต้องคืน ratio ตัวจริง (ไม่ถูก cap) — cap อยู่ชั้นแสดงผลเท่านั้น', async () => {
    vi.mocked(prisma.userBadge.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.shop.findFirst).mockResolvedValue({ id: 's1', userId: 'u1', kind: 'PERSONAL' } as never)
    vi.mocked(prisma.badge.findMany).mockResolvedValue([
      { id: 'b3', nameEN: 'First', audience: 'SELLER', criteria: { type: 'FIRST_ORDER' } },
    ] as never)
    vi.mocked(prisma.order.count).mockResolvedValue(1 as never)

    const [row] = await getBadgeProgress('u1', 'SELLER')
    expect(row.earned).toBe(false)
    expect(row.progressRatio).toBe(1)
  })
})
