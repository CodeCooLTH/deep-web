/**
 * pnl.service.ts — P&L report ของ Expense & Cost Tracking (feature 00016)
 * SSOT: docs/20 - Features/00016 - Expense & Cost Tracking/SDS.md §4.2 (copy เป๊ะ); SRS.md TFR-006/007/008
 */
import { prisma } from '@/lib/prisma'
import type { ResolvedDateRange } from '@/lib/date-range'

export interface PnlReport {
  range: { start: string; end: string }
  revenue: number
  cogs: number
  grossProfit: number
  totalExpense: number
  netProfit: number
  orderCount: number
  hasMissingCost: boolean
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100 // เหมือน order.service.ts::round2

export async function getPnlReport(shopId: string, range: ResolvedDateRange): Promise<PnlReport> {
  const [orders, expenseAgg] = await Promise.all([
    prisma.order.findMany({
      where: { shopId, status: 'CONFIRMED', createdAt: { gte: range.orderRange.gte, lt: range.orderRange.lt } },
      select: { totalAmount: true, items: { select: { cost: true, qty: true } } },
    }),
    prisma.expense.aggregate({
      where: { shopId, expenseDate: { gte: range.expenseRange.gte, lt: range.expenseRange.lt } },
      _sum: { amount: true },
    }),
  ])

  let revenue = 0, cogs = 0, hasMissingCost = false
  for (const o of orders) {
    revenue += Number(o.totalAmount)
    for (const item of o.items) {
      if (item.cost == null) { hasMissingCost = true; continue }
      cogs += Number(item.cost) * item.qty
    }
  }
  const grossProfit = round2(revenue - cogs)
  const totalExpense = Number(expenseAgg._sum.amount ?? 0)
  const netProfit = round2(grossProfit - totalExpense)

  return {
    range: range.label, revenue: round2(revenue), cogs: round2(cogs),
    grossProfit, totalExpense, netProfit, orderCount: orders.length, hasMissingCost,
  }
}
