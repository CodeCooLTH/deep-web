/**
 * ad-sales-report.service — รายงาน "ยอดขายตามโฆษณา" (feature 00091 FR-008)
 *
 * ── นิยาม (HR16) ─────────────────────────────────────────────────────────────
 * 🛑 "ยอดขาย" = **ตัวเดียวกับรายงานยอดขายรายสินค้า** — ใช้ `salesOrderWhere()` (ใบที่นับ) +
 * ผลรวม `qty × price` รายบรรทัดหลังหักคืนบางส่วน จาก `product-sales-series.service.ts` ตรง ๆ
 * ไม่รวมส่วนลด/VAT ระดับใบ (เหมือนกัน) ⇒ ยอดจากโฆษณา + ยอดที่ไม่ได้มาจากโฆษณา = ยอดรวมของรายงานเดิม
 * ในช่วงเดียวกัน (เทส parity)
 * - แชทจากโฆษณา = จำนวนห้องที่มีการคลิก ADS ของแอดนั้นในช่วง (ห้องเดียวคลิกซ้ำ = 1) · นับตามวันคลิก
 * - คำสั่งซื้อ = ใบที่นับเป็นยอดขายและบันทึกแอดนี้ไว้ · นับตามวันของคำสั่งซื้อ (ร้านบริการ = วันปิดงาน เหมือนรายงานเดิม)
 * - ยกเลิก/คืน = ใบที่ถูกยกเลิกหรือคืนทั้งใบของแอดนั้นในช่วง (ตามวันสร้าง)
 * - ห้องที่ถูกลบ: แชทของแอดนั้นหายจากตัวนับแชท (cascade) แต่คำสั่งซื้อยังอยู่ (ภาพนิ่ง)
 */
import { prisma } from '@/lib/prisma'
import { getReturnAdjustments } from '@/services/return-adjustment.service'
import { shopUsesServiceFinanceRules } from '@/services/finance-rules.service'
import { MAX_ITEM_ROWS, salesOrderWhere } from '@/services/product-sales-series.service'
import { resolveOrderBuyerNameForShop } from '@/lib/buyer-name'
import type { ReturnAdjustment } from '@/lib/order-return'

export type AdReportRow = {
  adId: string
  /** ชื่อแอดล่าสุดที่เห็น (null = ไม่มีชื่อ → UI แสดงรหัส) */
  adTitle: string | null
  adPhotoFileId: string | null
  chats: number
  orders: number
  /** orders ÷ chats เป็น % — null เมื่อ chats = 0 (ห้ามหาร 0) · เกิน 100 ได้ (คลิกก่อนช่วงแล้วสั่งในช่วง) */
  closeRatePct: number | null
  sales: number
  /** sales ÷ orders — null เมื่อ orders = 0 */
  avgPerOrder: number | null
  cancelledOrReturned: number
}

export type AdReport = {
  rows: AdReportRow[]
  summary: { adSales: number; nonAdSales: number; adOrders: number; nonAdOrders: number; adSharePct: number | null }
  /** ร้านเคยมีข้อมูลโฆษณาเลยไหม — แยก "ยังไม่เคยมี" ออกจาก "ช่วงนี้ไม่มี" */
  hasAnyAdData: boolean
  truncated: boolean
}

export type AdReportRange = { from: Date; to: Date; shopChannelId?: string | null }

const round2 = (n: number) => Math.round(n * 100) / 100

export async function getAdSalesReport(shopId: string, range: AdReportRange): Promise<AdReport> {
  const { from, to } = range
  const channelId = range.shopChannelId || null
  const newRules = await shopUsesServiceFinanceRules(shopId)

  const [referrals, orders, lostGroups, anyRef, anyOrder, returnAdj] = await Promise.all([
    prisma.conversationAdReferral.findMany({
      where: {
        source: 'ADS',
        adId: { not: null },
        receivedAt: { gte: from, lt: to },
        conversation: { shopId, ...(channelId ? { shopChannelId: channelId } : {}) },
      },
      select: { conversationId: true, adId: true, adTitle: true, photoFileId: true, receivedAt: true },
    }),
    prisma.order.findMany({
      where: { ...salesOrderWhere(shopId, newRules, { gte: from, lt: to }), ...(channelId ? { shopChannelId: channelId } : {}) },
      select: {
        id: true, adId: true, adTitle: true, adPhotoFileId: true, createdAt: true,
        items: { select: { id: true, qty: true, price: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ITEM_ROWS + 1,
    }),
    prisma.order.groupBy({
      by: ['adId'],
      where: {
        shopId, adId: { not: null }, status: { in: ['CANCELLED', 'RETURNED'] },
        createdAt: { gte: from, lt: to },
        ...(channelId ? { shopChannelId: channelId } : {}),
      },
      _count: { _all: true },
    }),
    prisma.conversationAdReferral.findFirst({ where: { source: 'ADS', conversation: { shopId } }, select: { id: true } }),
    prisma.order.findFirst({ where: { shopId, adId: { not: null } }, select: { id: true } }),
    newRules ? getReturnAdjustments(shopId) : Promise.resolve(new Map<string, ReturnAdjustment>()),
  ])

  const truncated = orders.length > MAX_ITEM_ROWS
  const salesOrders = truncated ? orders.slice(0, MAX_ITEM_ROWS) : orders

  type Acc = { adId: string; title: string | null; photo: string | null; titleAt: number; chats: Set<string>; orders: number; sales: number; lost: number }
  const byAd = new Map<string, Acc>()
  const get = (adId: string): Acc => {
    let a = byAd.get(adId)
    if (!a) byAd.set(adId, (a = { adId, title: null, photo: null, titleAt: 0, chats: new Set(), orders: 0, sales: 0, lost: 0 }))
    return a
  }

  for (const r of referrals) {
    const a = get(r.adId!)
    a.chats.add(r.conversationId)
    // ชื่อ/รูปล่าสุดที่เห็นในช่วง — แอดเดียวกันเปลี่ยนชื่อได้ จัดกลุ่มตามรหัส
    const t = r.receivedAt.getTime()
    if (t >= a.titleAt) {
      a.titleAt = t
      a.title = r.adTitle ?? a.title
      a.photo = r.photoFileId ?? a.photo
    }
  }

  let adSales = 0, nonAdSales = 0, adOrders = 0, nonAdOrders = 0
  for (const o of salesOrders) {
    // เหมือนรายงานเดิมทุกประการ: qty หักชิ้นที่คืนบางส่วน (เฉพาะกติการ้านบริการ) แล้วคูณราคา snapshot
    let amount = 0
    for (const it of o.items) {
      const qty = it.qty - (returnAdj.get(o.id)?.returnedQtyByItem[it.id] ?? 0)
      if (newRules && qty <= 0) continue
      amount += qty * Number(it.price)
    }
    if (!o.adId) {
      nonAdSales += amount
      nonAdOrders += 1
      continue
    }
    adSales += amount
    adOrders += 1
    const a = get(o.adId)
    a.orders += 1
    a.sales += amount
    // ไม่มีการคลิกในช่วงนี้ (คลิกก่อนช่วงแล้วสั่งในช่วง) → ใช้ชื่อ/รูปที่บันทึกในใบ
    if (a.title === null) a.title = o.adTitle
    if (a.photo === null) a.photo = o.adPhotoFileId
  }
  for (const g of lostGroups) if (g.adId) get(g.adId).lost = g._count._all

  const rows: AdReportRow[] = [...byAd.values()].map((a) => {
    const chats = a.chats.size
    return {
      adId: a.adId,
      adTitle: a.title,
      adPhotoFileId: a.photo,
      chats,
      orders: a.orders,
      closeRatePct: chats > 0 ? round2((a.orders / chats) * 100) : null,
      sales: round2(a.sales),
      avgPerOrder: a.orders > 0 ? round2(a.sales / a.orders) : null,
      cancelledOrReturned: a.lost,
    }
  })
  rows.sort((x, y) => y.sales - x.sales || y.orders - x.orders || y.chats - x.chats)

  const total = adSales + nonAdSales
  return {
    rows,
    summary: {
      adSales: round2(adSales), nonAdSales: round2(nonAdSales), adOrders, nonAdOrders,
      adSharePct: total > 0 ? round2((adSales / total) * 100) : null,
    },
    hasAnyAdData: Boolean(anyRef || anyOrder),
    truncated,
  }
}

export type AdOrderListItem = {
  id: string
  publicToken: string
  orderNo: string | null
  buyerName: string | null
  createdAtISO: string
  status: string
  totalAmount: number
}

/** ชีตคำสั่งซื้อของแอดหนึ่งตัว — ≤50 ใบล่าสุดในช่วง (รวมใบที่ยกเลิก/คืนให้เห็น แสดงจาง) */
export async function listOrdersForAd(shopId: string, vertical: string | null | undefined, adId: string, range: AdReportRange, limit = 50): Promise<{ items: AdOrderListItem[]; hasMore: boolean }> {
  const channelId = range.shopChannelId || null
  const rows = await prisma.order.findMany({
    where: {
      shopId, adId, status: { not: 'DRAFTED' },
      createdAt: { gte: range.from, lt: range.to },
      ...(channelId ? { shopChannelId: channelId } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true, publicToken: true, orderNo: true, createdAt: true, status: true, totalAmount: true,
      buyerName: true, buyer: { select: { displayName: true } },
    },
  })
  const hasMore = rows.length > limit
  return {
    hasMore,
    items: rows.slice(0, limit).map((o) => ({
      id: o.id, publicToken: o.publicToken, orderNo: o.orderNo,
      buyerName: resolveOrderBuyerNameForShop(vertical, { typedName: o.buyerName, accountName: o.buyer?.displayName }).name,
      createdAtISO: o.createdAt.toISOString(), status: o.status, totalAmount: Number(o.totalAmount),
    })),
  }
}
