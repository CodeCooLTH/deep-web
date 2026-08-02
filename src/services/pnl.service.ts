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
  /** กำไรสุทธิของช่วงก่อนหน้า (ยาวเท่ากัน ต่อเนื่องก่อน start) — ใช้คำนวณ %เปลี่ยนแปลงบนการ์ด P&L
   *  `null` = ช่วงก่อนหน้าไม่มีทั้งออเดอร์และค่าใช้จ่ายเลย → ไม่มีอะไรให้เทียบ UI ต้องซ่อนตัวชี้วัด
   *  (ห้ามแสดง "+100%" จากฐาน 0 — โกหก). UI ต้องซ่อนเมื่อ `prevNetProfit <= 0` ด้วย เพราะ
   *  %เปลี่ยนแปลงจากฐานติดลบอ่านกลับหัว (ขาดทุนน้อยลง จะออกมาเป็นลบ) */
  prevNetProfit: number | null
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100 // เหมือน order.service.ts::round2

/** โครง select เดียวกันทั้งช่วงปัจจุบันและช่วงก่อนหน้า — กันสูตรสองชุดหลุดจากกัน */
const ORDER_SELECT = { totalAmount: true, items: { select: { cost: true, qty: true } } } as const

type PnlOrder = { totalAmount: unknown; items: { cost: unknown; qty: number }[] }

/** รวมยอดจากออเดอร์ CONFIRMED — คืน revenue/cogs และธงว่ามีสินค้าที่ยังไม่ตั้งต้นทุนไหม */
function sumOrders(orders: PnlOrder[]): { revenue: number; cogs: number; hasMissingCost: boolean } {
  let revenue = 0, cogs = 0, hasMissingCost = false
  for (const o of orders) {
    revenue += Number(o.totalAmount)
    for (const item of o.items) {
      if (item.cost == null) { hasMissingCost = true; continue }
      cogs += Number(item.cost) * item.qty
    }
  }
  return { revenue, cogs, hasMissingCost }
}

export async function getPnlReport(shopId: string, range: ResolvedDateRange): Promise<PnlReport> {
  const [orders, expenseAgg, prevOrders, prevExpenseAgg] = await Promise.all([
    prisma.order.findMany({
      where: { shopId, status: 'CONFIRMED', createdAt: { gte: range.orderRange.gte, lt: range.orderRange.lt } },
      select: ORDER_SELECT,
    }),
    prisma.expense.aggregate({
      where: { shopId, expenseDate: { gte: range.expenseRange.gte, lt: range.expenseRange.lt } },
      _sum: { amount: true },
    }),
    // ช่วงก่อนหน้า — ใช้คำนวณ %เปลี่ยนแปลงเท่านั้น ไม่ได้ส่งตัวเลขดิบออกไป
    prisma.order.findMany({
      where: {
        shopId, status: 'CONFIRMED',
        createdAt: { gte: range.prevRange.orderRange.gte, lt: range.prevRange.orderRange.lt },
      },
      select: ORDER_SELECT,
    }),
    prisma.expense.aggregate({
      where: {
        shopId,
        expenseDate: { gte: range.prevRange.expenseRange.gte, lt: range.prevRange.expenseRange.lt },
      },
      _sum: { amount: true },
    }),
  ])

  const { revenue, cogs, hasMissingCost } = sumOrders(orders)
  const grossProfit = round2(revenue - cogs)
  const totalExpense = Number(expenseAgg._sum.amount ?? 0)
  const netProfit = round2(grossProfit - totalExpense)

  const prevExpense = Number(prevExpenseAgg._sum.amount ?? 0)
  // ไม่มีทั้งออเดอร์และค่าใช้จ่ายในช่วงก่อนหน้า = ไม่มีฐานให้เทียบ (ไม่ใช่ "กำไร 0")
  const prevSums = sumOrders(prevOrders)
  const prevNetProfit =
    prevOrders.length === 0 && prevExpense === 0
      ? null
      : round2(round2(prevSums.revenue - prevSums.cogs) - prevExpense)

  return {
    range: range.label, revenue: round2(revenue), cogs: round2(cogs),
    grossProfit, totalExpense, netProfit, orderCount: orders.length, hasMissingCost,
    prevNetProfit,
  }
}
