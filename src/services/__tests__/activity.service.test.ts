/**
 * activity.service.test.ts — unit tests สำหรับ getRecentActivity (T6, S-12)
 *
 * ทำไม mock แทน integration test:
 * - test environment ไม่มี real DB connection (vitest node, ไม่ใช่ playwright)
 * - unit test ครอบ mapper logic: mask phone, sort desc, slice take, error → []
 * - mock prisma และ getTransactions ตาม pattern ของ project (ดู lib/*.test.ts)
 *
 * Pattern: vi.mock module-level, ใช้ vi.mocked ใน test เพื่อ setup return value
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── mock prisma ──────────────────────────────────────────────────────────────
// ทำไม mock ทั้ง module: prisma เชื่อม DB จริง ซึ่งไม่มีใน test env
vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      findMany: vi.fn(),
    },
    smsCode: {
      findMany: vi.fn(),
    },
    review: {
      findMany: vi.fn(),
    },
    sellerWallet: {
      findUnique: vi.fn(),
    },
  },
}))

// ─── mock wallet.service.getTransactions ──────────────────────────────────────
vi.mock('@/services/wallet.service', () => ({
  getTransactions: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getTransactions } from '@/services/wallet.service'
import { getRecentActivity, type ActivityItem } from '@/services/activity.service'

// helper สร้าง Date ที่ต่างกัน n นาที (สำหรับ sort test)
function dMinsAgo(mins: number): Date {
  return new Date(Date.now() - mins * 60 * 1000)
}

// ─── setup mock defaults ───────────────────────────────────────────────────────
function setupMocks({
  orders = [],
  smsCodes = [],
  reviews = [],
  transactions = [],
}: {
  orders?: Array<{ publicToken: string; status: string; createdAt: Date; updatedAt: Date }>
  smsCodes?: Array<{ buyerPhone: string; createdAt: Date }>
  reviews?: Array<{ rating: number; createdAt: Date }>
  transactions?: Array<{ type: string; amount: number; createdAt: Date; id: string; balanceAfter: number; description: string; refId: string | null }>
}) {
  vi.mocked(prisma.order.findMany).mockResolvedValue(orders as never)
  vi.mocked(prisma.smsCode.findMany).mockResolvedValue(smsCodes as never)
  vi.mocked(prisma.review.findMany).mockResolvedValue(reviews as never)
  vi.mocked(getTransactions).mockResolvedValue(transactions as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getRecentActivity', () => {

  // --- empty cases ---
  it('ไม่มีข้อมูลใด ๆ → คืน []', async () => {
    setupMocks({})
    const result = await getRecentActivity('shop-1')
    expect(result).toEqual([])
  })

  it('shopId ว่าง (edge) → prisma ถูกเรียกด้วย where:{shopId:""} และคืน []', async () => {
    setupMocks({})
    const result = await getRecentActivity('')
    expect(result).toEqual([])
    expect(vi.mocked(prisma.order.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId: '' } })
    )
  })

  // --- ORDER_CREATED mapper ---
  it('order 1 รายการ → ActivityItem type ORDER_CREATED ครบ field', async () => {
    const createdAt = dMinsAgo(5)
    const updatedAt = dMinsAgo(4)
    setupMocks({
      orders: [{ publicToken: 'abcdef12-3456-7890-abcd-ef1234567890', status: 'PENDING', createdAt, updatedAt }],
    })
    const result = await getRecentActivity('shop-1')
    const item = result.find((i) => i.type === 'ORDER_CREATED')
    expect(item).toBeDefined()
    expect(item!.type).toBe('ORDER_CREATED')
    // label ใช้ 8 char แรก uppercase
    expect(item!.label).toBe('สร้างคำสั่งซื้อ ABCDEF12')
    expect(item!.at).toBe(createdAt)
    expect(item!.href).toBe('/orders/abcdef12-3456-7890-abcd-ef1234567890')
  })

  // --- ORDER_CONFIRMED mapper ---
  it('order status CONFIRMED → มีทั้ง ORDER_CREATED และ ORDER_CONFIRMED', async () => {
    const createdAt = dMinsAgo(60)
    const updatedAt = dMinsAgo(10)
    setupMocks({
      orders: [{ publicToken: 'token-aaa-bbb-ccc-ddd', status: 'CONFIRMED', createdAt, updatedAt }],
    })
    const result = await getRecentActivity('shop-1')
    const types = result.map((i) => i.type)
    expect(types).toContain('ORDER_CREATED')
    expect(types).toContain('ORDER_CONFIRMED')
    // ORDER_CONFIRMED ใช้ updatedAt
    const confirmed = result.find((i) => i.type === 'ORDER_CONFIRMED')
    expect(confirmed!.at).toBe(updatedAt)
    expect(confirmed!.label).toContain('ผู้ซื้อยืนยัน')
    expect(confirmed!.href).toBe('/orders/token-aaa-bbb-ccc-ddd')
  })

  it('order status PENDING → มีเฉพาะ ORDER_CREATED ไม่มี ORDER_CONFIRMED', async () => {
    setupMocks({
      orders: [{ publicToken: 'tok-1', status: 'PENDING', createdAt: dMinsAgo(5), updatedAt: dMinsAgo(4) }],
    })
    const result = await getRecentActivity('shop-1')
    expect(result.some((i) => i.type === 'ORDER_CONFIRMED')).toBe(false)
    expect(result.some((i) => i.type === 'ORDER_CREATED')).toBe(true)
  })

  // --- SMS_SENT mapper + phone masking ---
  it('smsCode: buyerPhone 0812345678 → label มี 081-xxx-5678 (masked)', async () => {
    setupMocks({
      smsCodes: [{ buyerPhone: '0812345678', createdAt: dMinsAgo(3) }],
    })
    const result = await getRecentActivity('shop-1')
    const item = result.find((i) => i.type === 'SMS_SENT')
    expect(item).toBeDefined()
    expect(item!.label).toContain('081-xxx-5678')
    // ห้ามมี raw phone ใน label
    expect(item!.label).not.toContain('0812345678')
  })

  it('smsCode: buyerPhone ไม่ใช่ 10 หลัก → label มี *** (fail-safe mask)', async () => {
    setupMocks({
      smsCodes: [{ buyerPhone: '123', createdAt: dMinsAgo(2) }],
    })
    const result = await getRecentActivity('shop-1')
    const item = result.find((i) => i.type === 'SMS_SENT')
    expect(item!.label).toContain('***')
  })

  it('smsCode: ไม่มี href (SMS item ไม่มี link)', async () => {
    setupMocks({
      smsCodes: [{ buyerPhone: '0812345678', createdAt: dMinsAgo(3) }],
    })
    const result = await getRecentActivity('shop-1')
    const item = result.find((i) => i.type === 'SMS_SENT')
    expect(item!.href).toBeUndefined()
  })

  // --- REVIEW_RECEIVED mapper ---
  it('review rating 5 → label "ได้รับรีวิว 5 ดาว"', async () => {
    setupMocks({
      reviews: [{ rating: 5, createdAt: dMinsAgo(20) }],
    })
    const result = await getRecentActivity('shop-1')
    const item = result.find((i) => i.type === 'REVIEW_RECEIVED')
    expect(item).toBeDefined()
    expect(item!.label).toBe('ได้รับรีวิว 5 ดาว')
  })

  it('review ไม่มี href', async () => {
    setupMocks({
      reviews: [{ rating: 4, createdAt: dMinsAgo(20) }],
    })
    const result = await getRecentActivity('shop-1')
    const item = result.find((i) => i.type === 'REVIEW_RECEIVED')
    expect(item!.href).toBeUndefined()
  })

  // --- TOPUP mapper ---
  it('transaction TOPUP amount 200 → label "เติมเงิน ฿200"', async () => {
    setupMocks({
      transactions: [{
        id: 'tx-1', type: 'TOPUP', amount: 200, balanceAfter: 200,
        description: 'TopUp', refId: null, createdAt: dMinsAgo(30),
      }],
    })
    const result = await getRecentActivity('shop-1')
    const item = result.find((i) => i.type === 'TOPUP')
    expect(item).toBeDefined()
    expect(item!.label).toBe('เติมเงิน ฿200')
  })

  it('transaction DEDUCT → ไม่ถูก include ใน activity', async () => {
    setupMocks({
      transactions: [{
        id: 'tx-2', type: 'DEDUCT', amount: 1, balanceAfter: 199,
        description: 'ส่ง SMS', refId: null, createdAt: dMinsAgo(15),
      }],
    })
    const result = await getRecentActivity('shop-1')
    expect(result.some((i) => i.type === 'TOPUP')).toBe(false)
  })

  // --- sort desc ---
  it('items จาก source ต่างกัน → sort desc by at (ใหม่สุดอยู่ก่อน)', async () => {
    const oldest = dMinsAgo(60)
    const middle = dMinsAgo(30)
    const newest = dMinsAgo(5)

    setupMocks({
      orders: [{ publicToken: 'tok-old', status: 'PENDING', createdAt: oldest, updatedAt: oldest }],
      reviews: [{ rating: 5, createdAt: middle }],
      smsCodes: [{ buyerPhone: '0812345678', createdAt: newest }],
    })

    const result = await getRecentActivity('shop-1')
    // item แรก ต้องใหม่สุด
    expect(result[0].type).toBe('SMS_SENT')
    expect(result[0].at).toBe(newest)
    // item สุดท้าย ต้องเก่าสุด
    expect(result[result.length - 1].at).toBe(oldest)
  })

  // --- slice take ---
  it('take=2 → คืนเพียง 2 item (slice ถูก)', async () => {
    const orders = Array.from({ length: 5 }, (_, i) => ({
      publicToken: `tok-${i}`,
      status: 'PENDING',
      createdAt: dMinsAgo(i + 1),
      updatedAt: dMinsAgo(i + 1),
    }))
    setupMocks({ orders })

    const result = await getRecentActivity('shop-1', 2)
    expect(result).toHaveLength(2)
  })

  it('take default 10 → ไม่เกิน 10 item', async () => {
    // สร้าง 5 orders + 3 reviews + 2 smsCodes = 10 item
    const orders = Array.from({ length: 5 }, (_, i) => ({
      publicToken: `tk-${i}`,
      status: 'PENDING',
      createdAt: dMinsAgo(i + 10),
      updatedAt: dMinsAgo(i + 10),
    }))
    setupMocks({
      orders,
      reviews: [
        { rating: 5, createdAt: dMinsAgo(1) },
        { rating: 4, createdAt: dMinsAgo(2) },
        { rating: 3, createdAt: dMinsAgo(3) },
      ],
      smsCodes: [
        { buyerPhone: '0811111111', createdAt: dMinsAgo(4) },
        { buyerPhone: '0822222222', createdAt: dMinsAgo(5) },
      ],
    })
    const result = await getRecentActivity('shop-1')
    expect(result.length).toBeLessThanOrEqual(10)
  })

  // --- error handling ---
  it('prisma throw → คืน [] ไม่ throw', async () => {
    vi.mocked(prisma.order.findMany).mockRejectedValue(new Error('DB connection failed'))

    const result = await getRecentActivity('shop-1')
    expect(result).toEqual([])
    // ไม่ throw error ออกมา
  })

  it('getTransactions throw → ครอบด้วย try/catch → คืน [] ไม่ crash', async () => {
    setupMocks({
      orders: [],
      smsCodes: [],
      reviews: [],
    })
    vi.mocked(getTransactions).mockRejectedValue(new Error('wallet error'))

    // ทั้งหมดอยู่ใน try/catch เดียวกัน → catch → []
    const result = await getRecentActivity('shop-1')
    expect(result).toEqual([])
  })

  // --- PII safety: ห้ามมี raw phone ใน label ของทุก item ---
  it('ไม่มี raw phone ใน label ของ SMS_SENT items', async () => {
    const rawPhones = ['0812345678', '0987654321']
    setupMocks({
      smsCodes: rawPhones.map((p, i) => ({ buyerPhone: p, createdAt: dMinsAgo(i + 1) })),
    })
    const result = await getRecentActivity('shop-1')
    const smsItems = result.filter((i) => i.type === 'SMS_SENT')
    for (const item of smsItems) {
      for (const raw of rawPhones) {
        expect(item.label).not.toContain(raw)
      }
    }
  })

  // --- ActivityItem type shape ---
  it('type shape ครบ field ที่กำหนด', async () => {
    const at = dMinsAgo(1)
    setupMocks({
      orders: [{ publicToken: 'abc-def-ghi', status: 'PENDING', createdAt: at, updatedAt: at }],
    })
    const result = await getRecentActivity('shop-1')
    const item = result[0] as ActivityItem
    expect(item).toHaveProperty('type')
    expect(item).toHaveProperty('label')
    expect(item).toHaveProperty('at')
    // href optional — ไม่บังคับ undefined แต่ถ้ามีต้องเป็น string
    if (item.href !== undefined) {
      expect(typeof item.href).toBe('string')
    }
  })
})
