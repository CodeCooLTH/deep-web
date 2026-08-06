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
        where: { productId: { not: null }, order: { shopId: 'shopX', status: { not: 'CANCELLED' } } },
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
   * เกณฑ์ผ่าน 2 รอบ อย่าวนกลับ:
   * 1. เดิมไม่กรองสถานะเลย → นับ CANCELLED เป็นยอดขายด้วย ตัวเลขจึงสูงกว่าจริง
   * 2. 2026-07-30 กรองเหลือ `status: 'CONFIRMED'` → แกว่งไปอีกทาง: หลังร้านนับยอดเฉพาะออเดอร์
   *    ที่ผู้ซื้อกดยืนยันปลายทางแล้ว ซึ่งของที่ส่งไปแล้วแต่ยังไม่มีใครกดยืนยันหายจากอันดับหมด
   * 3. 2026-08-06 (commit 9687fde3) เกณฑ์ปัจจุบัน = `status: { not: 'CANCELLED' }` — "ขายดี"
   *    ของหลังร้านนับตั้งแต่ *สร้างออเดอร์* เพราะคนขายใช้ตัวเลขนี้ตัดสินใจสต็อก ซึ่งต้องรู้ตั้งแต่
   *    ของออกจากร้าน ไม่ใช่รอปลายทางกดยืนยัน
   * เทสนี้ล็อกข้อ 3 ไว้ ไม่ให้ใครเปลี่ยนตัวกรองโดยไม่รู้ว่าเคยแกว่งมาแล้ว 2 รอบ
   */
  it('ไม่นับออเดอร์ที่ยกเลิก — PENDING/SHIPPED/CONFIRMED นับหมด (เกณฑ์หลังร้าน)', async () => {
    vi.mocked(prisma.orderItem.groupBy).mockResolvedValue([{ productId: 'p1', _sum: { qty: 2 } }] as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([{ id: 'p1' }] as never)

    await getBestSellerProducts('shopX')

    const where = vi.mocked(prisma.orderItem.groupBy).mock.calls[0][0].where as {
      order: { status?: { not?: string } }
    }
    expect(where.order.status).toEqual({ not: 'CANCELLED' })
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
