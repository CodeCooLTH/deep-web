/**
 * ตัวโหลดข้อมูลรายงานร้านบริการ (feature 00078 · BRD FR-003/FR-004) — ร้านบริการเท่านั้น
 *
 * หนึ่งช่วง = `getSalesSeries` (ทางร้านบริการเดิมของ 00073 ไม่แก้กติกา) + ค่าใช้จ่ายรายวัน (query เดียว)
 * แล้วป้อนตัวคำนวณกลาง `src/lib/service-report/view-model.ts`
 *
 * 🛑 ไม่ดึงออเดอร์ทั้งร้าน (`getOrdersByShop`) แบบที่หน้า /sales เดิมทำ — จำนวน query ไม่โตตามอายุร้าน
 * 🛑 รายงานกลุ่ม LINE ไม่เรียกไฟล์นี้ (LINE เรียก getSalesSeries แบบไม่ส่ง vertical — 00070 #165)
 * 🛑 ผู้เรียกต้องผ่านด่าน F1 + ตรวจว่าเป็นร้านบริการแล้ว (route/page) — ไฟล์นี้ไม่ตัดสินสิทธิ์
 */
import { prisma } from '@/lib/prisma'
import { TZ_OFFSET_MS } from '@/lib/date-range'
import { RETURN_STATUS, netOfReturns, sumReturnShippingCost } from '@/lib/order-return'
import { isServiceNoShow, serviceNoShowRevenue, serviceRevenueOrderWhere, serviceUnclosedOrderWhere } from '@/lib/order-revenue'
import type { ServiceReportData, ServiceReportMode } from '@/lib/service-report/view-model'
import { getSalesSeries, type SalesSeries } from '@/services/dashboard.service'
import { getReturnAdjustments } from '@/services/return-adjustment.service'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * ค่าใช้จ่ายต่อ bucket — นิยามเดียวกับการ์ด P&L/กราฟการเงินเดิม (HR16):
 * ค่าใช้จ่ายที่ร้านบันทึก (ตาม `expenseDate` = เที่ยงคืน UTC ของวันปฏิทิน) + ค่าส่งขากลับของใบคืนที่รับแล้ว
 * (ตัดวันด้วย UTC ของ instant แบบเดียวกับ finance-chart.service)
 */
export async function expenseBuckets(shopId: string, mode: ServiceReportMode, year: number, month0: number, count: number) {
  const dateGte = mode === 'daily' ? new Date(Date.UTC(year, month0, 1)) : new Date(Date.UTC(year, 0, 1))
  const dateLt = mode === 'daily' ? new Date(Date.UTC(year, month0 + 1, 1)) : new Date(Date.UTC(year + 1, 0, 1))
  const bucketOf = (d: Date) => (mode === 'daily' ? d.getUTCDate() - 1 : d.getUTCMonth())
  const out = new Array<number>(count).fill(0)
  const [expenses, returns] = await Promise.all([
    prisma.expense.findMany({
      where: { shopId, expenseDate: { gte: dateGte, lt: dateLt } },
      select: { amount: true, expenseDate: true },
    }),
    prisma.orderReturn.findMany({
      where: { shopId, status: RETURN_STATUS.RECEIVED, receivedAt: { gte: dateGte, lt: dateLt } },
      select: {
        receivedAt: true,
        countAsCost: true,
        shippingCost: true,
        shipment: { select: { carrierPrice: true, estimatedPrice: true } },
      },
    }),
  ])
  for (const e of expenses) {
    const i = bucketOf(e.expenseDate)
    if (i >= 0 && i < count) out[i] += Number(e.amount)
  }
  for (const r of returns) {
    if (!r.receivedAt) continue
    const i = bucketOf(new Date(Math.floor(r.receivedAt.getTime() / DAY_MS) * DAY_MS))
    if (i < 0 || i >= count) continue
    out[i] += sumReturnShippingCost([
      {
        countAsCost: r.countAsCost,
        shippingCost: r.shippingCost != null ? Number(r.shippingCost) : null,
        carrierPrice: r.shipment?.carrierPrice != null ? Number(r.shipment.carrierPrice) : null,
        estimatedPrice: r.shipment?.estimatedPrice != null ? Number(r.shipment.estimatedPrice) : null,
      },
    ]).total
  }
  return out
}

/** ข้อมูลหนึ่งช่วง (เดือนแบบรายวัน หรือ ปีแบบรายเดือน) สำหรับตัวคำนวณกลาง */
export async function getServiceReportData(
  shopId: string,
  vertical: string,
  mode: ServiceReportMode,
  period: { year: number; month?: number },
): Promise<ServiceReportData> {
  const month0 = (period.month ?? 1) - 1
  const [series, expense] = await Promise.all([
    getSalesSeries(shopId, mode, period, true, vertical),
    // จำนวน bucket รู้ก่อนได้ — รายวัน = วันในเดือน · รายเดือน = 12
    expenseBuckets(shopId, mode, period.year, month0, mode === 'daily' ? new Date(Date.UTC(period.year, month0 + 1, 0)).getUTCDate() : 12),
  ])
  return toServiceReportData(series, expense, mode, period)
}

/**
 * ประกอบจาก series ที่มีอยู่แล้ว — หน้าแรกเรียก getSalesSeries อยู่แล้ว (การ์ด) จึงไม่ต้องเรียกซ้ำ
 * เพิ่มแค่ค่าใช้จ่าย (expenseBuckets) · 🛑 series ต้องมาจาก getSalesSeries(..., includeFinance=true, vertical ร้านบริการ)
 */
export function toServiceReportData(
  series: SalesSeries,
  expense: number[],
  mode: ServiceReportMode,
  period: { year: number; month?: number },
): ServiceReportData {
  const n = series.labels.length
  const fill = (a: number[] | undefined) => (a && a.length === n ? a : new Array<number>(n).fill(0))
  return {
    mode,
    year: period.year,
    ...(mode === 'daily' ? { month: period.month } : {}),
    labels: series.labels,
    closed: series.values,
    closedCounts: series.orderCounts,
    unclosed: fill(series.unclosedValues),
    unclosedCounts: fill(series.unclosedCounts),
    cost: fill(series.cogsValues),
    expense: fill(expense),
    futureFromIndex: series.futureFromIndex,
    prevSalesToDate: series.prevTotalToDate + (series.prevUnclosedToDate ?? 0),
    ...(series.last14Labels && series.last14Confirmed
      ? {
          last14: {
            labels: series.last14Labels,
            // ร้านบริการ: last14Confirmed+Unconfirmed = งานที่ปิดแล้วตามวันปิดงาน (ทุกใบที่ปิดนับเป็นยอดขาย)
            closed: series.last14Confirmed.map((v, i) => v + (series.last14Unconfirmed?.[i] ?? 0)),
            unclosed: series.last14Unclosed ?? new Array<number>(series.last14Labels.length).fill(0),
          },
        }
      : {}),
  }
}

export interface ServiceReportBill {
  token: string
  orderNo: string | null
  buyerName: string | null
  amount: number
  closed: boolean
}

/**
 * บิลของหนึ่งวัน (โหลดเมื่อผู้ใช้แตะแถว/แท่ง · FR-004) — ชุดเดียวกับที่ getSalesSeries นับลงวันนั้น:
 * ปิดงานแล้ว = ปิดงานวันนั้น (`serviceClosedAt`) · ยังไม่ปิดงาน = เปิดบิลวันนั้น (`createdAt`)
 * ยอดหักคืนบางส่วน + งานไม่มาตามนัด = มัดจำที่เก็บ (กติกาเดียวกับ getSalesSeries) ⇒ ผลรวม = ยอดของแถว
 * @param dayIso วันที่ตามปฏิทินไทย `YYYY-MM-DD`
 */
export async function getServiceReportDayBills(shopId: string, dayIso: string): Promise<ServiceReportBill[]> {
  const [y, m, d] = dayIso.split('-').map(Number)
  const gte = new Date(Date.UTC(y, m - 1, d) - TZ_OFFSET_MS)
  const lt = new Date(gte.getTime() + DAY_MS)
  const select = {
    id: true,
    publicToken: true,
    orderNo: true,
    buyerName: true,
    totalAmount: true,
    appointmentStatus: true,
    payments: { where: { voidedAt: null }, select: { amount: true } },
  } as const
  const [closed, unclosed, adj] = await Promise.all([
    prisma.order.findMany({
      where: { shopId, ...serviceRevenueOrderWhere({ gte, lt }) },
      select,
      orderBy: { serviceClosedAt: 'desc' },
    }),
    prisma.order.findMany({
      where: { shopId, ...serviceUnclosedOrderWhere({ gte, lt }) },
      select,
      orderBy: { createdAt: 'desc' },
    }),
    getReturnAdjustments(shopId),
  ])
  const toBill = (o: (typeof closed)[number], isClosed: boolean): ServiceReportBill => ({
    token: o.publicToken,
    orderNo: o.orderNo,
    buyerName: o.buyerName,
    amount:
      isClosed && isServiceNoShow(o)
        ? serviceNoShowRevenue(o.payments.map((p) => ({ amount: p.amount, voidedAt: null })))
        : netOfReturns(Number(o.totalAmount), adj.get(o.id)),
    closed: isClosed,
  })
  return [...closed.map((o) => toBill(o, true)), ...unclosed.map((o) => toBill(o, false))]
}
