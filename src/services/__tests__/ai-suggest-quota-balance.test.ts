import { describe, it, expect, vi, beforeEach } from 'vitest'

/** 00071 T3 — canSeeBalance=false: balance เป็น null แต่ canUseCredit ยังตัดสินจากยอดจริงที่ server */
const getBalanceMock = vi.hoisted(() => vi.fn())
vi.mock('@/services/wallet.service', () => ({ getBalance: getBalanceMock }))
vi.mock('@/services/business-package.service', () => ({ getSubscriptionStatus: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    shop: { findUnique: vi.fn().mockResolvedValue({ userId: 'owner' }) },
    aiSuggestDailyUsage: { findUnique: vi.fn().mockResolvedValue({ count: 10 }) },
  },
}))

import { getAiSuggestQuotaStatus } from '../ai-suggest-quota.service'

describe('getAiSuggestQuotaStatus — canSeeBalance', () => {
  beforeEach(() => vi.clearAllMocks())

  it('เจ้าของ (default) → balance เป็นตัวเลข', async () => {
    getBalanceMock.mockResolvedValue(50)
    expect((await getAiSuggestQuotaStatus('s1', { canSeeBalance: true })).balance).toBe(50)
  })

  it('canSeeBalance=false → balance null แต่ canUseCredit ยัง true เมื่อยอดพอ', async () => {
    getBalanceMock.mockResolvedValue(50)
    const r = await getAiSuggestQuotaStatus('s1', { canSeeBalance: false })
    expect(r.balance).toBeNull()
    expect(r.canUseCredit).toBe(true)
    expect(JSON.stringify(r)).not.toContain('50')
  })

  it('canSeeBalance=false → canUseCredit false เมื่อยอด 0 (ไม่ใช่ null→พอ)', async () => {
    getBalanceMock.mockResolvedValue(0)
    const r = await getAiSuggestQuotaStatus('s1', { canSeeBalance: false })
    expect(r.balance).toBeNull()
    expect(r.canUseCredit).toBe(false)
  })
})
