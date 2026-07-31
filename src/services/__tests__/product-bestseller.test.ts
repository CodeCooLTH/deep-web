import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock prisma ทั้ง module (test env ไม่มี DB) — pattern เดียวกับ badge.service.test
vi.mock('@/lib/prisma', () => ({
  prisma: {
    orderItem: { groupBy: vi.fn() },
    product: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { getBestSellerProducts } from '@/services/product.service'

beforeEach(() => vi.clearAllMocks())

describe('getBestSellerProducts', () => {
  it('เรียงตามยอดขาย (sum qty) มากสุดก่อน + คงลำดับ best-seller (findMany ไม่การันตีลำดับ)', async () => {
    vi.mocked(prisma.orderItem.groupBy).mockResolvedValue([
      { productId: 'p2', _sum: { qty: 50 } },
      { productId: 'p1', _sum: { qty: 10 } },
    ] as never)
    // findMany คืนสลับลำดับ (p1 ก่อน p2) → ผลลัพธ์ต้องเรียงตาม best-seller = p2 ก่อน p1
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
    ] as never)
    const res = await getBestSellerProducts('shop1', 8)
    expect(res.map((p) => p.id)).toEqual(['p2', 'p1'])
  })

  it('ไม่มียอดขาย → คืน [] และไม่ query product', async () => {
    vi.mocked(prisma.orderItem.groupBy).mockResolvedValue([] as never)
    const res = await getBestSellerProducts('shop1')
    expect(res).toEqual([])
    expect(prisma.product.findMany).not.toHaveBeenCalled()
  })

  it('query: เฉพาะ productId ไม่ null (ไม่นับ custom item) + order.shopId + product active', async () => {
    vi.mocked(prisma.orderItem.groupBy).mockResolvedValue([{ productId: 'p1', _sum: { qty: 5 } }] as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([{ id: 'p1' }] as never)
    await getBestSellerProducts('shopX', 5)
    expect(prisma.orderItem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['productId'],
        where: { productId: { not: null }, order: { shopId: 'shopX', status: 'CONFIRMED' } },
        _sum: { qty: true },
        orderBy: { _sum: { qty: 'desc' } },
        take: 5,
      }),
    )
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['p1'] }, shopId: 'shopX', isActive: true } }),
    )
  })

  /**
   * status: 'CONFIRMED' เพิ่มเข้ามา 2026-07-30 — เดิมไม่กรองสถานะเลย จึงนับ PENDING กับ
   * CANCELLED เป็นยอดขายด้วย ทำให้ตัวเลข "ขายแล้ว N ชิ้น" ที่ร้านเห็นสูงกว่าความจริงมาก และ
   * อันดับขายดีเพี้ยน — สินค้าที่มีคนสร้างออเดอร์ทิ้งไว้เยอะแต่ไม่มีใครซื้อจริงจะขึ้นนำ ซึ่งทำให้
   * ร้านตัดสินใจสต็อกผิด เทสนี้ล็อกเจตนาไว้ ไม่ให้ใครถอดตัวกรองออกโดยไม่รู้ตัว
   */
  it('นับเฉพาะออเดอร์ที่ผู้ซื้อยืนยันแล้ว — PENDING/CANCELLED ต้องไม่ถูกนับเป็นยอดขาย', async () => {
    vi.mocked(prisma.orderItem.groupBy).mockResolvedValue([{ productId: 'p1', _sum: { qty: 2 } }] as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([{ id: 'p1' }] as never)

    await getBestSellerProducts('shopX')

    const where = vi.mocked(prisma.orderItem.groupBy).mock.calls[0][0].where as {
      order: { status?: string }
    }
    expect(where.order.status).toBe('CONFIRMED')
  })

  it('product ที่ถูกปิด (isActive=false) หลุดจาก findMany → ไม่อยู่ในผลลัพธ์ (คงลำดับที่เหลือ)', async () => {
    vi.mocked(prisma.orderItem.groupBy).mockResolvedValue([
      { productId: 'p1', _sum: { qty: 30 } },
      { productId: 'p2', _sum: { qty: 20 } },
    ] as never)
    // p1 inactive → findMany คืนแค่ p2
    vi.mocked(prisma.product.findMany).mockResolvedValue([{ id: 'p2' }] as never)
    const res = await getBestSellerProducts('shop1')
    expect(res.map((p) => p.id)).toEqual(['p2'])
  })
})
