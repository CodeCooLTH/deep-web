/**
 * sales-series.test.ts — unit tests สำหรับ getSalesSeries (Sales Chart, command center)
 *
 * mock prisma.order.findMany (test env ไม่มี DB จริง). ครอบ:
 * - daily: bucket ต่อวัน (tz ไทย), exclude CANCELLED, total, prevTotal (เดือนก่อน)
 * - monthly: 12 bucket, labels เดือนไทย
 * - Decimal totalAmount → number
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { getSalesSeries } from '@/services/dashboard.service'

const findMany = vi.mocked(prisma.order.findMany)

// helper: UTC instant ที่ตรงกับเวลาไทย (Asia/Bangkok = UTC+7) เที่ยงวัน → หนีขอบวัน
// เวลาไทย y-m-d 12:00 = UTC 05:00 วันเดียวกัน
const thaiNoon = (y: number, m1: number, d: number) => new Date(Date.UTC(y, m1 - 1, d, 5, 0, 0))

beforeEach(() => findMany.mockReset())

describe('getSalesSeries — daily', () => {
  it('bucket ต่อวัน, exclude CANCELLED, total + prevTotal ถูก', async () => {
    // period = มีนาคม 2026 (31 วัน). row ที่ query คืน = ทั้งช่วง prevGte..lt (ก.พ.+มี.ค.)
    findMany.mockResolvedValue([
      { totalAmount: 100, createdAt: thaiNoon(2026, 3, 5) },
      { totalAmount: 200, createdAt: thaiNoon(2026, 3, 5) }, // วันเดียวกัน → รวม 300
      { totalAmount: 50, createdAt: thaiNoon(2026, 3, 10) },
      { totalAmount: 70, createdAt: thaiNoon(2026, 2, 15) }, // เดือนก่อน → prevTotal
    ] as never)

    const res = await getSalesSeries('shop1', 'daily', { year: 2026, month: 3 })

    expect(res.labels).toHaveLength(31)
    expect(res.labels[0]).toBe('1')
    expect(res.labels[30]).toBe('31')
    expect(res.values[4]).toBe(300) // วันที่ 5 (index 4)
    expect(res.values[9]).toBe(50) // วันที่ 10 (index 9)
    expect(res.total).toBe(350)
    expect(res.prevTotal).toBe(70)
    // มีนาคม 2026 เป็นอดีต (now > period) → ไม่มีแท่งอนาคต
    expect(res.futureFromIndex).toBe(31)
  })

  it('CANCELLED ไม่ถูกนับ (where filter) + query ใช้ status not CANCELLED', async () => {
    findMany.mockResolvedValue([{ totalAmount: 100, createdAt: thaiNoon(2026, 3, 2) }] as never)
    const res = await getSalesSeries('shop1', 'daily', { year: 2026, month: 3 })
    expect(res.total).toBe(100)
    // ยืนยัน where ส่ง status != CANCELLED + shopId
    const arg = findMany.mock.calls[0][0] as { where: Record<string, unknown> }
    expect(arg.where.shopId).toBe('shop1')
    expect(arg.where.status).toEqual({ not: 'CANCELLED' })
  })
})

describe('getSalesSeries — monthly', () => {
  it('12 bucket, labels เดือนไทย, bucket ตามเดือน', async () => {
    findMany.mockResolvedValue([
      { totalAmount: 500, createdAt: thaiNoon(2026, 1, 20) }, // ม.ค.
      { totalAmount: 300, createdAt: thaiNoon(2026, 7, 3) }, // ก.ค.
      { totalAmount: 250, createdAt: thaiNoon(2025, 11, 9) }, // ปีก่อน → prevTotal
    ] as never)

    const res = await getSalesSeries('shop1', 'monthly', { year: 2026 })

    expect(res.labels).toHaveLength(12)
    expect(res.labels[0]).toBe('ม.ค.')
    expect(res.labels[11]).toBe('ธ.ค.')
    expect(res.values[0]).toBe(500) // ม.ค.
    expect(res.values[6]).toBe(300) // ก.ค.
    expect(res.total).toBe(800)
    expect(res.prevTotal).toBe(250)
  })
})
