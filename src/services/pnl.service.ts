/**
 * pnl.service.ts — P&L report ของ Expense & Cost Tracking (feature 00016)
 * SSOT: docs/20 - Features/00016 - Expense & Cost Tracking/SDS.md §4.2 (copy เป๊ะ); SRS.md TFR-006/007/008
 */
import { prisma } from '@/lib/prisma'
import { ACTIVE_FORWARD_SHIPMENT } from '@/lib/shipment-direction'
import { netOfReturns, costNetOfReturns, type ReturnAdjustment } from '@/lib/order-return'
import { getReturnAdjustments } from '@/services/return-adjustment.service'
import { round2 } from '@/lib/round2'
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
  /**
   * ค่าส่ง **ขาไป** ที่จ่ายขนส่งจริง (ราคาจริง → ราคาประมาณ) + ค่าธรรมเนียม COD ของใบที่นับเป็นยอดขาย
   * รวมอยู่ใน `totalExpense`/`netProfit` แล้ว — D-EXT-10 / FR-EXP-18 (user 2026-08-09: "ค่าส่งคือค่าใช้จ่าย
   * ไปลดกำไรสุทธิ") ซึ่ง **ไม่เคยถูก implement ที่นี่** จนถึง 2026-10-01 ⇒ กำไรสุทธิเคยสูงกว่า "กำไรจากการขาย"
   * ของ /sales (เป็นไปไม่ได้ตามนิยาม) · กติการาคา/ขอบเขตเดียวกับ /sales และชีตหน้าหลักเป๊ะ
   */
  shippingCost: number
  /** ใบที่ค่าส่งยังเป็นราคาประมาณ (ขนส่งยังไม่ชั่ง) — ต้องติดป้าย ห้ามแสดงเงียบ ๆ */
  shippingPendingCount: number
}

/** โครง select เดียวกันทั้งช่วงปัจจุบันและช่วงก่อนหน้า — กันสูตรสองชุดหลุดจากกัน */
const ORDER_SELECT = {
  id: true,
  totalAmount: true,
  items: { select: { cost: true, qty: true } },
  // พัสดุขาไปใบล่าสุดที่ active — ชุดเดียวกับ /sales (orderListInclude) และชีต (find FORWARD CREATED)
  shipments: {
    where: ACTIVE_FORWARD_SHIPMENT,
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { carrierPrice: true, estimatedPrice: true, codFee: true },
  },
} as const

type PnlOrder = {
  id: string
  totalAmount: unknown
  items: { cost: unknown; qty: number }[]
  shipments: { carrierPrice: unknown; estimatedPrice: unknown; codFee: unknown }[]
}

/** รวมยอดจากออเดอร์ที่นับเป็นยอดขายแล้ว — คืน revenue/cogs และธงว่ามีสินค้าที่ยังไม่ตั้งต้นทุนไหม */
function sumOrders(
  orders: PnlOrder[],
  returns: Map<string, ReturnAdjustment>,
): { revenue: number; cogs: number; hasMissingCost: boolean; shipping: number; shippingPending: number } {
  let revenue = 0, cogs = 0, hasMissingCost = false, shipping = 0, shippingPending = 0
  for (const o of orders) {
    const adj = returns.get(o.id)
    // คืนบางส่วนที่รับของแล้ว: หักยอดคืน + ต้นทุนชิ้นที่คืน (มติ 2026-10-01 · ตัวกลาง return-adjustment)
    revenue += netOfReturns(Number(o.totalAmount), adj)
    let orderCogs = 0
    for (const item of o.items) {
      if (item.cost == null) { hasMissingCost = true; continue }
      orderCogs += Number(item.cost) * item.qty
    }
    cogs += costNetOfReturns(orderCogs, adj)
    // ค่าส่งขาไป: ราคาจริง → ราคาประมาณ + COD fee (กติกาเดียวกับ /sales · ชีต — D-EXT-10)
    const sp = o.shipments[0]
    if (sp) {
      shipping += Number(sp.carrierPrice ?? sp.estimatedPrice ?? 0) + Number(sp.codFee ?? 0)
      if (sp.carrierPrice == null) shippingPending += 1
    }
  }
  return { revenue, cogs, hasMissingCost, shipping, shippingPending }
}

export async function getPnlReport(shopId: string, range: ResolvedDateRange): Promise<PnlReport> {
  const [orders, expenseAgg, prevOrders, prevExpenseAgg, returnRows, prevReturnRows, returnAdj] =
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
    getReturnAdjustments(shopId),
  ])

  const { revenue, cogs, hasMissingCost, shipping, shippingPending } = sumOrders(orders, returnAdj)
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
  const shippingCost = round2(shipping)
  // ค่าใช้จ่าย = ที่ร้านบันทึกเอง + ค่าส่งขาไปที่จ่ายจริง (D-EXT-10) + ค่าส่งขากลับของใบคืน (00056)
  const totalExpense = round2(Number(expenseAgg._sum.amount ?? 0) + shippingCost + returnShippingCost)
  const netProfit = round2(grossProfit - totalExpense)

  // ไม่มีทั้งออเดอร์และค่าใช้จ่ายในช่วงก่อนหน้า = ไม่มีฐานให้เทียบ (ไม่ใช่ "กำไร 0")
  const prevSums = sumOrders(prevOrders, returnAdj)
  // ช่วงก่อนหน้าต้องนับด้วยเกณฑ์เดียวกันเป๊ะ (รวมค่าส่งขาไป) ไม่งั้น %เทียบเทียบของคนละชนิด
  const prevExpense = round2(Number(prevExpenseAgg._sum.amount ?? 0) + prevSums.shipping + prevReturnCost.total)
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
    shippingCost,
    shippingPendingCount: shippingPending,
  }
}
