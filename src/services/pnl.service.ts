/**
 * pnl.service.ts — P&L report ของ Expense & Cost Tracking (feature 00016)
 * SSOT: docs/20 - Features/00016 - Expense & Cost Tracking/SDS.md §4.2 (copy เป๊ะ); SRS.md TFR-006/007/008
 */
import { prisma } from '@/lib/prisma'
import { revenueOrderWhere } from '@/lib/order-revenue'
import { RETURN_STATUS, sumReturnShippingCost } from '@/lib/order-return'
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
  /* ค่าช่วงก่อนหน้าของแต่ละตัว — คำนวณจาก query ชุดเดิมที่ยิงอยู่แล้ว ไม่เพิ่ม query
     ใช้ทำ badge %เปลี่ยนแปลงบนการ์ดสถิติ (โครง 3 แถวของธีม Paces บังคับให้มี badge)
     `null` = ช่วงก่อนหน้าไม่มีออเดอร์เลย → ไม่มีฐานให้เทียบ UI ต้องซ่อน badge ทั้งก้อน
     ยกเว้น prevExpense ที่ aggregate คืน 0 จริงเมื่อไม่มีแถว (เป็นค่าจริง ไม่ใช่ "ไม่มีข้อมูล") */
  prevRevenue: number | null
  prevCogs: number | null
  prevGrossProfit: number | null
  prevExpense: number
  /**
   * ค่าส่ง **ขากลับ** ของใบคืนที่รับของแล้วในช่วงนี้ (feature 00056 · D-3c)
   *
   * รวมอยู่ใน `totalExpense`/`netProfit` แล้ว — แยกออกมาเป็นช่องต่างหากเพื่อให้หน้าจอ
   * อธิบายที่มาของตัวเลขได้ ไม่ใช่ให้ผู้ใช้เดาว่าค่าใช้จ่ายโตขึ้นเพราะอะไร
   */
  returnShippingCost: number
  /**
   * จำนวนใบคืนที่ **ยังไม่รู้ค่าส่ง** (iShip ยังไม่เปิดราคา และร้านยังไม่กรอกเอง)
   *
   * 🛑 ต้องส่งออกไปให้หน้าจอติดป้าย — ใบพวกนี้ถูกนับเป็น 0 ซึ่งหน้าตาเหมือน "ไม่มีค่าส่ง"
   * ทุกประการ ถ้าไม่บอก ร้านจะอ่านกำไรที่สูงกว่าความจริงโดยไม่มีอะไรเตือน
   * (docs/conventions/partial-data-must-be-labeled-or-filled.md)
   */
  returnShippingUnknownCount: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100 // เหมือน order.service.ts::round2

/** โครง select เดียวกันทั้งช่วงปัจจุบันและช่วงก่อนหน้า — กันสูตรสองชุดหลุดจากกัน */
const ORDER_SELECT = { totalAmount: true, items: { select: { cost: true, qty: true } } } as const

type PnlOrder = { totalAmount: unknown; items: { cost: unknown; qty: number }[] }

/** รวมยอดจากออเดอร์ที่นับเป็นยอดขายแล้ว — คืน revenue/cogs และธงว่ามีสินค้าที่ยังไม่ตั้งต้นทุนไหม */
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
  const [orders, expenseAgg, prevOrders, prevExpenseAgg, returnRows, prevReturnRows] =
    await Promise.all([
    prisma.order.findMany({
      // ยอดขายนับ CONFIRMED + ใบที่ขนส่งรับของไปแล้วจริง (SSOT: lib/order-revenue.ts)
      where: { shopId, ...revenueOrderWhere, createdAt: { gte: range.orderRange.gte, lt: range.orderRange.lt } },
      select: ORDER_SELECT,
    }),
    prisma.expense.aggregate({
      where: { shopId, expenseDate: { gte: range.expenseRange.gte, lt: range.expenseRange.lt } },
      _sum: { amount: true },
    }),
    // ช่วงก่อนหน้า — ใช้คำนวณ %เปลี่ยนแปลงเท่านั้น ไม่ได้ส่งตัวเลขดิบออกไป
    prisma.order.findMany({
      where: {
        shopId, ...revenueOrderWhere,
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
    /**
     * ค่าส่งขากลับของใบคืนที่ **รับของแล้ว** ในช่วงนี้ (feature 00056)
     *
     * 🛑 ตัดช่วงด้วย `receivedAt` ไม่ใช่ `createdAt` — เกณฑ์เดียวกับที่ BRD §2 ประกาศว่า
     * "ผลทางบัญชีเกิดที่ RECEIVED เท่านั้น" ถ้าใช้วันเปิดใบ ค่าใช้จ่ายจะโผล่ในเดือนที่ยังไม่มี
     * อะไรเกิดขึ้นจริง แล้วเดือนที่ของกลับมาถึงจริงจะไม่มีอะไรเลย
     */
    prisma.orderReturn.findMany({
      where: {
        shopId,
        status: RETURN_STATUS.RECEIVED,
        receivedAt: { gte: range.expenseRange.gte, lt: range.expenseRange.lt },
      },
      select: {
        countAsCost: true,
        shippingCost: true,
        shipment: { select: { carrierPrice: true, estimatedPrice: true } },
      },
    }),
    prisma.orderReturn.findMany({
      where: {
        shopId,
        status: RETURN_STATUS.RECEIVED,
        receivedAt: {
          gte: range.prevRange.expenseRange.gte,
          lt: range.prevRange.expenseRange.lt,
        },
      },
      select: {
        countAsCost: true,
        shippingCost: true,
        shipment: { select: { carrierPrice: true, estimatedPrice: true } },
      },
    }),
  ])

  const { revenue, cogs, hasMissingCost } = sumOrders(orders)
  const grossProfit = round2(revenue - cogs)

  /**
   * ค่าส่งขากลับเป็น **ค่าใช้จ่าย** ตัวหนึ่ง ไม่ใช่ตัวหักยอดขาย — เงินที่จ่ายให้ขนส่งไม่ได้ทำให้
   * "ยอดขาย" ลดลง (ยอดขายลดจากการที่ใบนั้นหลุดจาก revenueOrderWhere ไปแล้วเมื่อเป็น RETURNED)
   *
   * ไม่สร้างแถวใน `Expense` โดยเจตนา: ราคาจริงจาก iShip มา **ทีหลัง** การเปิดพัสดุ ถ้าสร้างแถว
   * ตอนรับคืนแล้วราคาเปลี่ยน แถวนั้นจะค้างเป็นค่าเก่าตลอดไป (และถ้าไล่อัปเดตก็จะชนกับแถวที่
   * ร้านแก้เอง) — คิดสดจากข้อมูลต้นทางทุกครั้งจึงไม่มีวันเลื่อนออกจากกัน
   */
  const toCostInput = (r: {
    countAsCost: boolean
    shippingCost: unknown
    shipment: { carrierPrice: unknown; estimatedPrice: unknown } | null
  }) => ({
    countAsCost: r.countAsCost,
    shippingCost: r.shippingCost != null ? Number(r.shippingCost) : null,
    carrierPrice: r.shipment?.carrierPrice != null ? Number(r.shipment.carrierPrice) : null,
    estimatedPrice: r.shipment?.estimatedPrice != null ? Number(r.shipment.estimatedPrice) : null,
  })

  const returnCost = sumReturnShippingCost(returnRows.map(toCostInput))
  const prevReturnCost = sumReturnShippingCost(prevReturnRows.map(toCostInput))

  const returnShippingCost = round2(returnCost.total)
  const totalExpense = round2(Number(expenseAgg._sum.amount ?? 0) + returnShippingCost)
  const netProfit = round2(grossProfit - totalExpense)

  const prevExpense = round2(Number(prevExpenseAgg._sum.amount ?? 0) + prevReturnCost.total)
  // ไม่มีทั้งออเดอร์และค่าใช้จ่ายในช่วงก่อนหน้า = ไม่มีฐานให้เทียบ (ไม่ใช่ "กำไร 0")
  const prevSums = sumOrders(prevOrders)
  const prevNetProfit =
    prevOrders.length === 0 && prevExpense === 0
      ? null
      : round2(round2(prevSums.revenue - prevSums.cogs) - prevExpense)

  const noPrevOrders = prevOrders.length === 0
  return {
    range: range.label, revenue: round2(revenue), cogs: round2(cogs),
    grossProfit, totalExpense, netProfit, orderCount: orders.length, hasMissingCost,
    prevNetProfit,
    prevRevenue: noPrevOrders ? null : round2(prevSums.revenue),
    prevCogs: noPrevOrders ? null : round2(prevSums.cogs),
    prevGrossProfit: noPrevOrders ? null : round2(prevSums.revenue - prevSums.cogs),
    prevExpense,
    returnShippingCost,
    returnShippingUnknownCount: returnCost.unknownCount,
  }
}
