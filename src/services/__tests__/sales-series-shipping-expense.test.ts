/** withShippingExpenses — ค่าใช้จ่ายหมวดค่าขนส่งเข้าคอลัมน์ค่าส่งของชีต (user 2026-10-18) */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: { expense: { findMany: vi.fn() } } }))

import { prisma } from '@/lib/prisma'
import { withShippingExpenses } from '@/services/dashboard.service'

describe('withShippingExpenses — ค่าใช้จ่ายหมวดค่าขนส่งเข้าคอลัมน์ค่าส่งของชีต (user 2026-10-18)', () => {
  const expenseFindMany = vi.mocked(prisma.expense.findMany)
  const base = {
    labels: ['1', '2', '3'], values: [0, 0, 0], confirmedValues: [100, 0, 0], unconfirmedValues: [0, 0, 0],
    orderCounts: [0, 0, 0], codPendingValues: [0, 0, 0], total: 100, prevTotal: 0, prevTotalToDate: 0, futureFromIndex: 3,
    shippingValues: [10, 0, 0], shippingConfirmedValues: [10, 0, 0], netProfitValues: [90, 0, 0], totalShipping: 10, netProfit: 90,
  }
  beforeEach(() => expenseFindMany.mockReset())

  it('บวกตามวันที่ของค่าใช้จ่าย เข้าทั้งสองชุดค่าส่ง และหักจากกำไร · query เฉพาะหมวด SHIPPING', async () => {
    expenseFindMany.mockResolvedValue([
      { amount: 25.5, expenseDate: new Date(Date.UTC(2026, 9, 2)) },
      { amount: 4.5, expenseDate: new Date(Date.UTC(2026, 9, 2)) },
    ] as never)
    const r = await withShippingExpenses('shop1', base as never, 'daily', { year: 2026, month: 10 }, 'ONLINE_SALES')
    expect(expenseFindMany.mock.calls[0][0]).toMatchObject({ where: { shopId: 'shop1', category: 'SHIPPING' } })
    expect(r.shippingValues).toEqual([10, 30, 0])
    expect(r.shippingConfirmedValues).toEqual([10, 30, 0])
    expect(r.netProfitValues).toEqual([90, -30, 0])
    expect(r.totalShipping).toBe(40)
    expect(r.netProfit).toBe(60)
  })

  it('ร้านบริการ / ไม่มีชุดการเงิน → ค่าเดิม ไม่ query (กันนับซ้ำกับรายงานร้านบริการ)', async () => {
    expect(await withShippingExpenses('s', base as never, 'daily', { year: 2026, month: 10 }, 'SERVICE_QUEUE')).toBe(base)
    const noFin = { ...base, shippingValues: undefined }
    expect(await withShippingExpenses('s', noFin as never, 'daily', { year: 2026, month: 10 }, 'ONLINE_SALES')).toBe(noFin)
    expect(expenseFindMany).not.toHaveBeenCalled()
  })

  it('รายเดือน: ลงเดือนของค่าใช้จ่าย', async () => {
    expenseFindMany.mockResolvedValue([{ amount: 7, expenseDate: new Date(Date.UTC(2026, 1, 14)) }] as never)
    const m = { ...base, labels: Array(12).fill('x'), shippingValues: Array(12).fill(0), shippingConfirmedValues: Array(12).fill(0), netProfitValues: Array(12).fill(0) }
    const r = await withShippingExpenses('s', m as never, 'monthly', { year: 2026 }, undefined)
    expect(r.shippingValues![1]).toBe(7)
  })
})
