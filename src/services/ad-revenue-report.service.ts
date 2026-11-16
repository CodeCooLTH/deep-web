/**
 * ad-revenue-report.service — หน้า "วิเคราะห์ยอดขายจากโฆษณา" (00091 เฟส 3 · FR-011..FR-019)
 *
 * ── นิยาม (HR16) — ไม่มีสูตรเงินใหม่ในไฟล์นี้ ─────────────────────────────────
 * - ยอดขาย/คำสั่งซื้อ = `salesOrderWhere` + Σ qty×price หลังหักคืน (ตัวเดียวกับ /reports/ads และรายงานสินค้า)
 * - รับเงินแล้ว = ใบที่ `isOrderUnpaid` = false (มีบันทึกรับเงิน / ร้านยืนยันรับเงิน / รับเงินปลายทาง)
 *   ไม่มีบันทึก ≠ ค้างจ่ายแน่ ⇒ เรียก "ยังไม่บันทึกรับเงิน" (partial-data-must-be-labeled)
 * - คุณภาพออเดอร์ = ใบทุกสถานะยกเว้นร่าง ตามวันที่สั่ง (ชุดเดียวกับชีตคำสั่งซื้อของแอด `listOrdersForAd`)
 * - กำไร = ใบที่ P&L นับเป็นยอดขาย (`revenueWindowWhere`) + `pnlOrderParts` + ค่าส่งขากลับของใบคืนที่รับของแล้ว
 *   ชุดเดียวกับ `getPnlReport` ⇒ แอด + ไม่ใช่แอด = P&L ทั้งร้าน (เทส parity) · ไม่หักค่าใช้จ่ายร้านที่บันทึกเอง
 * - ลูกค้าใหม่ = ไม่มีใบที่ `countsAsCustomerOrder` ของลูกค้าคนนี้ก่อนใบนี้ · ไม่มี customerId = ไม่ทราบ
 * - แคมเปญ/ชุดโฆษณา = จาก Meta Insights เท่านั้น (ฐานเก็บแค่รหัสแอด) — ไม่มีข้อมูล = "ไม่ทราบ" ห้ามเดาจากชื่อ
 * - ที่มา: หนึ่งใบหนึ่งแอด (last-touch บันทึกตอนสร้าง · ไม่จำกัดเวลา) ⇒ ไม่มีการนับซ้ำข้ามแอด
 */
import { prisma } from '@/lib/prisma'
import { getReturnAdjustments } from '@/services/return-adjustment.service'
import { shopUsesServiceFinanceRules } from '@/services/finance-rules.service'
import { firstImage, MAX_ITEM_ROWS, salesOrderWhere } from '@/services/product-sales-series.service'
import { ORDER_SELECT, SERVICE_ORDER_SELECT, pnlOrderParts, type PnlOrder } from '@/services/pnl.service'
import { getShopVariableCosts } from '@/services/variable-cost.service'
import { getAdSpend, type SpendResult, type SpendSource } from '@/services/meta-ads-spend.service'
import { revenueWindowWhere } from '@/lib/order-revenue'
import { RETURN_STATUS, sumReturnShippingCost, type ReturnAdjustment } from '@/lib/order-return'
import { isOrderUnpaid } from '@/lib/order-payment-state'
import { countsAsCustomerOrder } from '@/lib/customer-behavior'
import { ACTIVE_FORWARD_SHIPMENT } from '@/lib/shipment-direction'
import { thaiDayKey } from '@/lib/format-date'
import {
  buildInsights, buildWaterfall, emptyStatus, median, STATUS_KEYS, thaiWeekdayHour,
  type AdMetrics, type Insight, type StatusKey, type Waterfall,
} from '@/lib/ad-revenue-view'

export type AdRevenueRange = { from: Date; to: Date; shopChannelId?: string | null }

export type AdRevenueProduct = {
  key: string
  productId: string | null
  name: string
  sku: string | null
  image: string | null
  orders: number
  units: number
  sales: number
  /** % ใบที่มีสินค้านี้แล้วยกเลิก/ตีกลับ (จากใบทุกสถานะตามวันที่สั่ง) — null = ไม่มีใบ */
  lostRatePct: number | null
  /** แอดที่ขายสินค้านี้ได้มากสุด */
  topAdId: string | null
}

export type AdRevenueReport = {
  range: { from: string; to: string }
  prevRange: { from: string; to: string }
  hasAnyAdData: boolean
  truncated: boolean
  serviceRules: boolean
  spend: { state: SpendResult['state']; accountName: string | null; currency: string | null }
  ads: AdMetrics[]
  summary: {
    sales: number; orders: number; collected: number; collectedOrders: number; unrecorded: number
    avgPerOrder: number | null
    placed: number; cancelled: number; returned: number
    lostRatePct: number | null
    /** คลิกแอดถึงสั่งซื้อ (วัน) — มัธยฐานของใบที่มีเวลาคลิก */
    medianClickToOrderDays: number | null
    spend: number | null
    profitBeforeAds: number; profitOrders: number; incompleteProfitOrders: number
    returnShippingUnknown: number
    newCustomers: number; returningCustomers: number; unknownCustomers: number
    newSales: number; returningSales: number; unknownSales: number
  }
  previous: { sales: number; orders: number; collected: number; lostRatePct: number | null; spend: number | null }
  waterfall: Waterfall
  products: AdRevenueProduct[]
  /** แอด × สินค้า (top 10 × top 10 ตามยอดขาย) — cells[adIndex][productIndex] = ยอดขาย */
  matrix: { adIds: string[]; productKeys: string[]; cells: number[][] }
  /** แถว 0 = จันทร์ … 6 = อาทิตย์ · คอลัมน์ = ชั่วโมงไทย */
  heatmap: { sales: number[][]; orders: number[][] }
  coverage: { adOrders: number; adSales: number; chatOrders: number; chatSales: number; otherOrders: number; otherSales: number }
  insights: Insight[]
  /** รายวันของช่วง (ไว้วาดกราฟเล็กบนการ์ดสรุป) — วันว่าง = 0 · ยอด/รับเงิน/ใบ ตามวันขาย · ยกเลิก/ตีกลับ ตามวันที่สั่ง */
  /** pending = ยอดของใบที่ยังไม่รับเงินและไม่ใช่ตีกลับ (รอเก็บเงิน) — ใบใหม่ที่ COD ยังไม่ถึงมือ ทำให้ "รับเงินแล้ว" ท้ายช่วงต่ำ ไม่ใช่ยอดหาย */
  /** spend = ค่าโฆษณารายวันจาก Insights (null ทั้งชุด = Meta ไม่ OK) — sparkline ค่าโฆษณา/กำไรส่วนเกินบน KPI */
  daily: { day: string; sales: number; collected: number; pending: number; orders: number; lost: number; profitBeforeAds: number; spend: number | null }[]
  /** ช่วงก่อนหน้า เรียงตามตำแหน่งวัน (index ตรงกับ daily) — ยอด/รับเงิน/ใบ เท่านั้น (ช่วงก่อนไม่ได้ดึงใบทุกสถานะ/กำไร) */
  prevDaily: { day: string; sales: number; collected: number; orders: number }[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const DAY = 86_400_000
const PRODUCTS_TOP = 50
const MATRIX_TOP = 10

const paymentSelect = {
  totalAmount: true, paymentConfirmedAt: true, codReceivedAt: true,
  payments: { select: { kind: true, amount: true, voidedAt: true } },
} as const
const itemSelect = { items: { select: { id: true, qty: true, price: true, productId: true, name: true } } } as const

type ItemRow = { id: string; qty: number; price: unknown; productId: string | null; name: string }

export async function getAdRevenueReport(
  shopId: string,
  vertical: string | null | undefined,
  range: AdRevenueRange,
  deps: { spendSource?: SpendSource } = {},
): Promise<AdRevenueReport> {
  const { from, to } = range
  const chan = range.shopChannelId ? { shopChannelId: range.shopChannelId } : {}
  const newRules = await shopUsesServiceFinanceRules(shopId)
  // 00096 P2 — ต้นทุนต่อออเดอร์ที่ร้านตั้ง (ชุดเดียวกับ getPnlReport) · ยิงขนานกับ query หลัก
  const vcP = getShopVariableCosts(shopId)
  const span = to.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - span)
  const spendSource = deps.spendSource ?? getAdSpend
  // ช่วงเดียวกับ /reports/ads (ก่อนหน้า + ปัจจุบัน) ⇒ ใช้แคชร่วมกัน ไม่ยิง Meta เพิ่ม
  const spendP: Promise<SpendResult> = spendSource(shopId, thaiDayKey(prevFrom), thaiDayKey(new Date(to.getTime() - 1))).catch(
    () => ({ state: 'ERROR', accountName: null, currency: null, tz: null, rows: [] }) as SpendResult, // Meta ห้ามทำให้หน้าล่ม
  )

  const [salesOrders, placedOrders, prevOrders, referrals, profitOrders, returnRows, anyRef, anyOrder, returnAdj, spendRes] = await Promise.all([
    // ใบที่นับเป็นยอดขายทั้งร้าน (รวมที่ไม่ได้มาจากแอด — ใช้ทำแท่งความครอบคลุม)
    prisma.order.findMany({
      where: { ...salesOrderWhere(shopId, newRules, { gte: from, lt: to }), ...chan },
      select: {
        id: true, adId: true, adTitle: true, adPhotoFileId: true, adClickedAt: true, createdAt: true, serviceClosedAt: true,
        conversationId: true, customerId: true, status: true, ...paymentSelect, ...itemSelect,
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ITEM_ROWS + 1,
    }),
    prisma.order.findMany({
      where: { shopId, adId: { not: null }, status: { not: 'DRAFTED' }, createdAt: { gte: from, lt: to }, ...chan },
      select: { id: true, adId: true, status: true, createdAt: true, ...paymentSelect, ...itemSelect },
      orderBy: { createdAt: 'desc' },
      take: MAX_ITEM_ROWS + 1,
    }),
    prisma.order.findMany({
      where: { ...salesOrderWhere(shopId, newRules, { gte: prevFrom, lt: from }), adId: { not: null }, ...chan },
      select: { id: true, adId: true, createdAt: true, serviceClosedAt: true, ...paymentSelect, items: { select: { id: true, qty: true, price: true } } },
      orderBy: { createdAt: 'desc' },
      take: MAX_ITEM_ROWS + 1,
    }),
    prisma.conversationAdReferral.findMany({
      where: { source: 'ADS', adId: { not: null }, receivedAt: { gte: from, lt: to }, conversation: { shopId, ...chan } },
      select: { conversationId: true, adId: true, adTitle: true, photoFileId: true, receivedAt: true },
    }),
    // ชุดเดียวกับ getPnlReport (ไม่กรองแอด — แยกเองข้างล่าง เพื่อให้เทส parity เทียบทั้งร้านได้)
    prisma.order.findMany({
      where: { shopId, ...revenueWindowWhere(vertical, { gte: from, lt: to }), ...chan },
      select: { ...(newRules ? SERVICE_ORDER_SELECT : ORDER_SELECT), adId: true, createdAt: true, serviceClosedAt: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_ITEM_ROWS + 1,
    }),
    prisma.orderReturn.findMany({
      where: { shopId, status: RETURN_STATUS.RECEIVED, receivedAt: { gte: from, lt: to }, order: { adId: { not: null }, ...chan } },
      select: { countAsCost: true, shippingCost: true, shipment: { select: { carrierPrice: true, estimatedPrice: true } }, order: { select: { adId: true } } },
    }),
    prisma.conversationAdReferral.findFirst({ where: { source: 'ADS', conversation: { shopId } }, select: { id: true } }),
    prisma.order.findFirst({ where: { shopId, adId: { not: null } }, select: { id: true } }),
    newRules ? getReturnAdjustments(shopId) : Promise.resolve(new Map<string, ReturnAdjustment>()),
    spendP,
  ])

  const truncated = [salesOrders, placedOrders, prevOrders, profitOrders].some((l) => l.length > MAX_ITEM_ROWS)
  const cap = <T,>(l: T[]) => (l.length > MAX_ITEM_ROWS ? l.slice(0, MAX_ITEM_ROWS) : l)

  // ตัวเดียวกับ ad-sales-report: qty หักชิ้นที่คืนบางส่วน (กติการ้านบริการ) แล้วคูณราคา snapshot
  const lineAmount = (orderId: string, it: { id: string; qty: number; price: unknown }) => {
    const qty = it.qty - (returnAdj.get(orderId)?.returnedQtyByItem[it.id] ?? 0)
    return newRules && qty <= 0 ? { qty: 0, amount: 0 } : { qty, amount: qty * Number(it.price) }
  }
  const amountOf = (o: { id: string; items: { id: string; qty: number; price: unknown }[] }) =>
    o.items.reduce((s, it) => s + lineAmount(o.id, it).amount, 0)
  const paid = (o: { totalAmount: unknown; payments: { kind: string; amount: unknown; voidedAt: Date | null }[]; paymentConfirmedAt: Date | null; codReceivedAt: Date | null }) =>
    !isOrderUnpaid({ totalAmount: String(o.totalAmount), payments: o.payments.map((p) => ({ ...p, amount: String(p.amount) })), paymentConfirmedAt: o.paymentConfirmedAt, codReceivedAt: o.codReceivedAt })

  // ── ค่าโฆษณา + ลำดับชั้นจาก Meta ────────────────────────────────────────────
  const spendOk = spendRes.state === 'OK'
  const curFromKey = thaiDayKey(from)
  const scope: Set<string> | null = range.shopChannelId
    ? new Set([...referrals.map((r) => r.adId!), ...salesOrders.flatMap((o) => (o.adId ? [o.adId] : [])), ...placedOrders.map((o) => o.adId!)])
    : null
  const spendByAd = new Map<string, number>()
  const spendByDay = new Map<string, number>()
  let prevSpend = 0
  const hier = new Map<string, { campaignId: string | null; campaignName: string | null; adsetId: string | null; adsetName: string | null; adName: string | null; day: string }>()
  if (spendOk) {
    for (const r of spendRes.rows) {
      // ชื่อ/ลำดับชั้นล่าสุดที่ Meta รายงาน (รวมช่วงก่อนหน้า — แอดที่สั่งช่วงนี้แต่หยุดยิงแล้วยังรู้แคมเปญ)
      const h = hier.get(r.adId)
      if (!h || r.day >= h.day) {
        hier.set(r.adId, {
          campaignId: r.campaignId ?? h?.campaignId ?? null, campaignName: r.campaignName ?? h?.campaignName ?? null,
          adsetId: r.adsetId ?? h?.adsetId ?? null, adsetName: r.adsetName ?? h?.adsetName ?? null,
          adName: r.adName ?? h?.adName ?? null, day: r.day,
        })
      }
      if (scope && !scope.has(r.adId)) continue
      if (r.day >= curFromKey) { spendByAd.set(r.adId, (spendByAd.get(r.adId) ?? 0) + r.spend); spendByDay.set(r.day, (spendByDay.get(r.day) ?? 0) + r.spend) }
      else prevSpend += r.spend
    }
  }

  // ── ต่อแอด ─────────────────────────────────────────────────────────────────
  const byAd = new Map<string, AdMetrics & { titleAt: number; chatSet: Set<string>; returningSet: Set<string> }>()
  const get = (adId: string) => {
    let a = byAd.get(adId)
    if (!a) {
      const h = hier.get(adId)
      byAd.set(adId, (a = {
        adId, adTitle: null, adPhotoFileId: null,
        campaignId: h?.campaignId ?? null, campaignName: h?.campaignName ?? null, adsetId: h?.adsetId ?? null, adsetName: h?.adsetName ?? null,
        chats: 0, orders: 0, sales: 0, collected: 0, collectedOrders: 0, status: emptyStatus(), gross: emptyStatus(), collectedPlaced: 0, spend: null,
        newCustomers: 0, returningCustomers: 0, unknownCustomers: 0, newSales: 0, returningSales: 0,
        profitBeforeAds: 0, profitOrders: 0, incompleteProfitOrders: 0,
        titleAt: 0, chatSet: new Set(), returningSet: new Set(),
      }))
    }
    return a
  }

  for (const r of referrals) {
    const a = get(r.adId!)
    a.chatSet.add(r.conversationId)
    const t = r.receivedAt.getTime()
    if (t >= a.titleAt) { a.titleAt = t; a.adTitle = r.adTitle ?? a.adTitle; a.adPhotoFileId = r.photoFileId ?? a.adPhotoFileId }
  }

  // ลูกค้าใหม่/เดิม: ใบที่นับเป็นการซื้อของลูกค้ากลุ่มนี้ทั้งหมดในร้าน (ทุกช่วงเวลา)
  const sales = cap(salesOrders)
  const customerIds = [...new Set(sales.flatMap((o) => (o.adId && o.customerId ? [o.customerId] : [])))]
  const history = customerIds.length
    ? await prisma.order.findMany({
        where: { shopId, customerId: { in: customerIds }, status: { notIn: ['DRAFTED', 'CANCELLED', 'RETURNED'] } },
        select: {
          id: true, customerId: true, createdAt: true, status: true, cancelInitiator: true, cancelReason: true, appointmentStatus: true,
          shipments: { where: ACTIVE_FORWARD_SHIPMENT, orderBy: { createdAt: 'desc' }, take: 1, select: { carrierStatus: true } },
        },
      })
    : []
  const firstBuyAt = new Map<string, { at: number; id: string }>()
  for (const h of history) {
    const counts = countsAsCustomerOrder({
      status: h.status, cancelInitiator: h.cancelInitiator ?? null, cancelReason: h.cancelReason ?? null,
      activeShipmentCarrierStatus: h.shipments[0]?.carrierStatus ?? null, appointmentStatus: h.appointmentStatus ?? null,
    })
    if (!counts || !h.customerId) continue
    const cur = firstBuyAt.get(h.customerId)
    const at = h.createdAt.getTime()
    // เวลาเท่ากัน ตัดสินด้วย id ให้ผลคงที่
    if (!cur || at < cur.at || (at === cur.at && h.id < cur.id)) firstBuyAt.set(h.customerId, { at, id: h.id })
  }

  const products = new Map<string, AdRevenueProduct & { orderSet: Set<string>; byAd: Map<string, number> }>()
  const heat = { sales: Array.from({ length: 7 }, () => new Array<number>(24).fill(0)), orders: Array.from({ length: 7 }, () => new Array<number>(24).fill(0)) }
  const coverage = { adOrders: 0, adSales: 0, chatOrders: 0, chatSales: 0, otherOrders: 0, otherSales: 0 }
  const clickDays: number[] = []
  const slots = Math.max(1, Math.round(span / DAY))
  const daily = Array.from({ length: slots }, (_, i) => ({ day: thaiDayKey(new Date(from.getTime() + i * DAY)), sales: 0, collected: 0, pending: 0, orders: 0, lost: 0, profitBeforeAds: 0 }))
  const slotOf = (d: Date) => daily[Math.floor((d.getTime() - from.getTime()) / DAY)]
  let unknownSales = 0
  const returningAll = new Set<string>()

  for (const o of sales) {
    const amount = amountOf(o)
    if (!o.adId) {
      if (o.conversationId) { coverage.chatOrders += 1; coverage.chatSales += amount } else { coverage.otherOrders += 1; coverage.otherSales += amount }
      continue
    }
    coverage.adOrders += 1
    coverage.adSales += amount
    const a = get(o.adId)
    a.orders += 1
    a.sales += amount
    if (a.adTitle === null) a.adTitle = o.adTitle
    if (a.adPhotoFileId === null) a.adPhotoFileId = o.adPhotoFileId
    const isPaid = paid(o)
    if (isPaid) { a.collected += amount; a.collectedOrders += 1 }
    const dp = slotOf(newRules ? o.serviceClosedAt ?? o.createdAt : o.createdAt)
    if (dp) { dp.sales += amount; dp.orders += 1; if (isPaid) dp.collected += amount; else if (o.status !== 'RETURNED') dp.pending += amount }

    if (!o.customerId) { a.unknownCustomers += 1; unknownSales += amount } else {
      const first = firstBuyAt.get(o.customerId)
      const isNew = !first || first.at > o.createdAt.getTime() || first.id === o.id
      if (isNew) { a.newCustomers += 1; a.newSales += amount } else { a.returningSet.add(o.customerId); returningAll.add(o.customerId); a.returningSales += amount }
    }

    const at = newRules ? o.serviceClosedAt ?? o.createdAt : o.createdAt
    const { row, hour } = thaiWeekdayHour(at)
    heat.sales[row][hour] += amount
    heat.orders[row][hour] += 1
    if (o.adClickedAt) clickDays.push(Math.max(0, (o.createdAt.getTime() - o.adClickedAt.getTime()) / DAY))

    for (const it of o.items as ItemRow[]) {
      const { qty, amount: line } = lineAmount(o.id, it)
      if (qty <= 0 && line === 0) continue
      const key = it.productId ?? `name:${it.name.trim()}`
      let p = products.get(key)
      if (!p) products.set(key, (p = { key, productId: it.productId, name: it.name, sku: null, image: null, orders: 0, units: 0, sales: 0, lostRatePct: null, topAdId: null, orderSet: new Set(), byAd: new Map() }))
      p.orderSet.add(o.id)
      p.units += qty
      p.sales += line
      p.byAd.set(o.adId, (p.byAd.get(o.adId) ?? 0) + line)
    }
  }

  // คุณภาพออเดอร์ (ทุกสถานะตามวันที่สั่ง)
  let collectedAmongOpen = 0
  const productPlaced = new Map<string, { placed: number; lost: number }>()
  for (const o of cap(placedOrders)) {
    const a = get(o.adId!)
    const k = (STATUS_KEYS as readonly string[]).includes(o.status) ? (o.status as StatusKey) : 'PENDING'
    const amount = amountOf(o)
    a.status[k] += 1
    a.gross[k] += amount
    const lost = k === 'CANCELLED' || k === 'RETURNED'
    if (lost) { const dp = slotOf(o.createdAt); if (dp) dp.lost += 1 }
    if (!lost && paid(o)) { collectedAmongOpen += amount; a.collectedPlaced += amount }
    for (const key of new Set((o.items as ItemRow[]).map((it) => it.productId ?? `name:${it.name.trim()}`))) {
      const c = productPlaced.get(key) ?? { placed: 0, lost: 0 }
      c.placed += 1
      if (lost) c.lost += 1
      productPlaced.set(key, c)
    }
  }

  // กำไร — ชุดและสูตรเดียวกับ P&L
  let incompleteTotal = 0
  const vc = await vcP
  for (const o of cap(profitOrders) as (PnlOrder & { adId: string | null; createdAt: Date; serviceClosedAt: Date | null })[]) {
    if (!o.adId) continue
    const p = pnlOrderParts(o, returnAdj.get(o.id), newRules, vc)
    const a = get(o.adId)
    // ร้านที่ไม่ใช่บริการ: P&L ไม่นับค่าส่งขาไปเป็นค่าใช้จ่าย (มติ 2026-10-02) — ตามเป๊ะ · ต้นทุนต่อออเดอร์ที่ร้านตั้งหักทุกร้าน (00096 P2)
    const profit = p.revenue - p.cogs - (newRules ? p.shipping : 0) - p.variable
    a.profitBeforeAds += profit
    const dp = slotOf(newRules ? o.serviceClosedAt ?? o.createdAt : o.createdAt)
    if (dp) dp.profitBeforeAds += profit
    a.profitOrders += 1
    if (p.missingCost || (newRules && (p.shippingPending || p.shippingMissing))) { a.incompleteProfitOrders += 1; incompleteTotal += 1 }
  }
  const retByAd = new Map<string, Parameters<typeof sumReturnShippingCost>[0]>()
  for (const r of returnRows) {
    const adId = r.order.adId!
    const l = retByAd.get(adId) ?? []
    l.push({
      countAsCost: r.countAsCost,
      shippingCost: r.shippingCost != null ? Number(r.shippingCost) : null,
      carrierPrice: r.shipment?.carrierPrice != null ? Number(r.shipment.carrierPrice) : null,
      estimatedPrice: r.shipment?.estimatedPrice != null ? Number(r.shipment.estimatedPrice) : null,
    })
    retByAd.set(adId, l)
  }
  let returnShippingUnknown = 0
  for (const [adId, l] of retByAd) {
    const c = sumReturnShippingCost(l)
    get(adId).profitBeforeAds -= c.total
    returnShippingUnknown += c.unknownCount
  }

  // แอดที่ใช้เงินแต่ไม่มีแชท/ใบในช่วง (ไม่กรองเพจเท่านั้น — เหมือน FR-010)
  if (spendOk && !range.shopChannelId) for (const [adId, v] of spendByAd) if (v > 0) get(adId)
  for (const [adId, a] of byAd) if (!a.adTitle) a.adTitle = hier.get(adId)?.adName ?? null

  const ads: AdMetrics[] = [...byAd.values()].map(({ titleAt: _t, chatSet, returningSet, ...a }) => ({ // eslint-disable-line @typescript-eslint/no-unused-vars
    ...a,
    chats: chatSet.size,
    returningCustomers: returningSet.size,
    sales: round2(a.sales), collected: round2(a.collected), newSales: round2(a.newSales), returningSales: round2(a.returningSales),
    profitBeforeAds: round2(a.profitBeforeAds), collectedPlaced: round2(a.collectedPlaced),
    gross: Object.fromEntries(STATUS_KEYS.map((k) => [k, round2(a.gross[k])])) as AdMetrics['gross'],
    spend: spendOk && spendByAd.has(a.adId) ? round2(spendByAd.get(a.adId)!) : null,
  })).sort((x, y) => y.sales - x.sales || y.orders - x.orders || y.chats - x.chats)

  // ── สินค้า + matrix ─────────────────────────────────────────────────────────
  const productIds = [...products.values()].flatMap((p) => (p.productId ? [p.productId] : []))
  const productInfo = productIds.length
    ? new Map((await prisma.product.findMany({ where: { shopId, id: { in: productIds } }, select: { id: true, name: true, sku: true, images: true } })).map((p) => [p.id, p]))
    : new Map()
  const productList: AdRevenueProduct[] = [...products.values()]
    .sort((x, y) => y.sales - x.sales)
    .slice(0, PRODUCTS_TOP)
    .map(({ orderSet, byAd: pa, ...p }) => {
      const info = p.productId ? productInfo.get(p.productId) : undefined
      const pl = productPlaced.get(p.key)
      return {
        ...p,
        name: info?.name ?? p.name, sku: info?.sku ?? null, image: info ? firstImage(info.images) : null,
        orders: orderSet.size, sales: round2(p.sales),
        lostRatePct: pl && pl.placed > 0 ? round2((pl.lost / pl.placed) * 100) : null,
        topAdId: [...pa].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
      }
    })
  const mAds = ads.filter((a) => a.sales > 0).slice(0, MATRIX_TOP).map((a) => a.adId)
  const mProducts = productList.slice(0, MATRIX_TOP).map((p) => p.key)
  const matrix = {
    adIds: mAds,
    productKeys: mProducts,
    cells: mAds.map((adId) => mProducts.map((k) => round2(products.get(k)?.byAd.get(adId) ?? 0))),
  }
  const topProductByAd = new Map<string, { name: string; sales: number }>()
  for (const p of products.values()) {
    const name = (p.productId && productInfo.get(p.productId)?.name) || p.name
    for (const [adId, v] of p.byAd) if (v > (topProductByAd.get(adId)?.sales ?? 0)) topProductByAd.set(adId, { name, sales: v })
  }

  // ── สรุป ────────────────────────────────────────────────────────────────────
  const sum = (f: (a: AdMetrics) => number) => round2(ads.reduce((s, a) => s + f(a), 0))
  const placed = ads.reduce((n, a) => n + STATUS_KEYS.reduce((m, k) => m + a.status[k], 0), 0)
  const cancelled = ads.reduce((n, a) => n + a.status.CANCELLED, 0)
  const returned = ads.reduce((n, a) => n + a.status.RETURNED, 0)
  const sSales = sum((a) => a.sales), sOrders = ads.reduce((n, a) => n + a.orders, 0), sCollected = sum((a) => a.collected)
  const grossAll = Object.fromEntries(STATUS_KEYS.map((k) => [k, ads.reduce((s, a) => s + a.gross[k], 0)])) as AdMetrics['gross']

  let pSales = 0, pCollected = 0
  const prevDaily = Array.from({ length: slots }, (_, i) => ({ day: thaiDayKey(new Date(prevFrom.getTime() + i * DAY)), sales: 0, collected: 0, orders: 0 }))
  for (const o of cap(prevOrders)) {
    const amount = amountOf(o)
    const isPaid = paid(o)
    pSales += amount
    if (isPaid) pCollected += amount
    const at = newRules ? o.serviceClosedAt ?? o.createdAt : o.createdAt
    const dp = prevDaily[Math.floor((at.getTime() - prevFrom.getTime()) / DAY)]
    if (dp) { dp.sales += amount; dp.orders += 1; if (isPaid) dp.collected += amount }
  }
  const totalSpend = spendOk ? round2([...spendByAd.values()].reduce((s, v) => s + v, 0)) : null
  const med = median(clickDays)

  return {
    range: { from: thaiDayKey(from), to: thaiDayKey(new Date(to.getTime() - 1)) },
    prevRange: { from: thaiDayKey(prevFrom), to: thaiDayKey(new Date(from.getTime() - 1)) },
    hasAnyAdData: Boolean(anyRef || anyOrder),
    truncated,
    serviceRules: newRules,
    spend: { state: spendRes.state, accountName: spendRes.accountName, currency: spendRes.currency },
    ads,
    summary: {
      sales: sSales, orders: sOrders, collected: sCollected, collectedOrders: ads.reduce((n, a) => n + a.collectedOrders, 0),
      unrecorded: round2(sSales - sCollected),
      avgPerOrder: sOrders > 0 ? round2(sSales / sOrders) : null,
      placed, cancelled, returned,
      lostRatePct: placed > 0 ? round2(((cancelled + returned) / placed) * 100) : null,
      medianClickToOrderDays: med === null ? null : round2(med),
      spend: totalSpend,
      profitBeforeAds: sum((a) => a.profitBeforeAds), profitOrders: ads.reduce((n, a) => n + a.profitOrders, 0),
      incompleteProfitOrders: incompleteTotal, returnShippingUnknown,
      newCustomers: ads.reduce((n, a) => n + a.newCustomers, 0),
      returningCustomers: returningAll.size,
      unknownCustomers: ads.reduce((n, a) => n + a.unknownCustomers, 0),
      newSales: sum((a) => a.newSales), returningSales: sum((a) => a.returningSales), unknownSales: round2(unknownSales),
    },
    previous: {
      sales: round2(pSales), orders: cap(prevOrders).length, collected: round2(pCollected),
      // ช่วงก่อนหน้าไม่ได้ดึงใบทุกสถานะ — ไม่แสดงตัวเทียบ % ยกเลิก (ดีกว่าเทียบของคนละชุด)
      lostRatePct: null,
      spend: spendOk ? round2(prevSpend) : null,
    },
    waterfall: buildWaterfall({ gross: grossAll, collectedAmongOpen }),
    products: productList,
    matrix,
    heatmap: { sales: heat.sales.map((r) => r.map(round2)), orders: heat.orders },
    coverage: { ...coverage, adSales: round2(coverage.adSales), chatSales: round2(coverage.chatSales), otherSales: round2(coverage.otherSales) },
    insights: buildInsights(ads, topProductByAd),
    prevDaily: prevDaily.map((d) => ({ ...d, sales: round2(d.sales), collected: round2(d.collected) })),
    daily: daily.map((d) => ({ ...d, sales: round2(d.sales), collected: round2(d.collected), pending: round2(d.pending), profitBeforeAds: round2(d.profitBeforeAds), spend: spendOk ? round2(spendByDay.get(d.day) ?? 0) : null })),
  }
}
