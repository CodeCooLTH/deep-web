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
import { canonicalProvince } from '@/lib/parse-order-message'
import { thaiDayKey } from '@/lib/format-date'

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
  summary: {
    adSales: number; nonAdSales: number; adOrders: number; nonAdOrders: number; adSharePct: number | null
    /** แชทจากโฆษณาทั้งช่วง = จำนวน "ห้อง" ไม่ซ้ำข้ามทุกแอด (ห้องที่กดสองแอดนับ 1) — แถวรวมของตารางใช้ค่าเดียวกัน */
    chats: number
    /** adOrders ÷ chats เป็น % — null เมื่อ chats = 0 */
    closeRatePct: number | null
  }
  /** ช่วงก่อนหน้า = เลื่อนถอยหลังเท่าความยาวช่วง — นิยามเดียวกับ summary ทุกตัว */
  previous: { adSales: number; adOrders: number; chats: number; closeRatePct: number | null; nonAdSales: number }
  /** ป้ายช่วง (YYYY-MM-DD วันสุดท้ายแบบรวม) */
  range: { from: string; to: string }
  prevRange: { from: string; to: string }
  /** รายวัน (ช่วงวันเดียว = รายชั่วโมง 24 ช่อง `YYYY-MM-DDTHH`) วันว่าง = 0 ไม่ใช่ null */
  daily: AdDailyPoint[]
  /** ช่วงก่อนหน้า เรียงตามตำแหน่งวัน (index ตรงกับ daily) */
  prevDaily: AdDailyPoint[]
  /** ยอดจากโฆษณาตามจังหวัดที่อยู่จัดส่ง — name null = ไม่มีที่อยู่/จังหวัด */
  provinces: { name: string | null; sales: number }[]
  /** ยอดขายทั้งร้านตามช่องทาง (รวมที่ไม่ได้มาจากโฆษณา) — provider null = หน้าร้าน/อื่น ๆ */
  channels: { provider: string | null; sales: number }[]
  /** ยอดจากโฆษณาตามเพจ/บัญชี */
  pages: { shopChannelId: string; name: string; provider: string; avatarUrl: string | null; sales: number; prevSales: number }[]
  /** ร้านเคยมีข้อมูลโฆษณาเลยไหม — แยก "ยังไม่เคยมี" ออกจาก "ช่วงนี้ไม่มี" */
  hasAnyAdData: boolean
  truncated: boolean
}

export type AdDailyPoint = { day: string; adSales: number; nonAdSales: number; adOrders: number }

export type AdReportRange = { from: Date; to: Date; shopChannelId?: string | null }

const round2 = (n: number) => Math.round(n * 100) / 100

export async function getAdSalesReport(shopId: string, range: AdReportRange): Promise<AdReport> {
  const { from, to } = range
  const channelId = range.shopChannelId || null
  const newRules = await shopUsesServiceFinanceRules(shopId)
  // ช่วงก่อนหน้า: เลื่อนถอยหลังเท่าความยาวช่วง จบพอดีที่ from
  const span = to.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - span)

  const orderSelect = {
    id: true, adId: true, adTitle: true, adPhotoFileId: true, createdAt: true, serviceClosedAt: true, shopChannelId: true,
    items: { select: { id: true, qty: true, price: true } },
  } as const
  const chanFilter = channelId ? { shopChannelId: channelId } : {}

  const [referrals, orders, lostGroups, anyRef, anyOrder, returnAdj, prevOrders, prevReferrals, shopChannels] = await Promise.all([
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
      select: { ...orderSelect, shippingAddress: true },
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
    prisma.order.findMany({
      where: { ...salesOrderWhere(shopId, newRules, { gte: prevFrom, lt: from }), ...chanFilter },
      select: orderSelect,
      orderBy: { createdAt: 'desc' },
      take: MAX_ITEM_ROWS + 1,
    }),
    prisma.conversationAdReferral.findMany({
      where: { source: 'ADS', adId: { not: null }, receivedAt: { gte: prevFrom, lt: from }, conversation: { shopId, ...chanFilter } },
      select: { conversationId: true },
    }),
    prisma.shopChannel.findMany({ where: { shopId }, select: { id: true, name: true, provider: true, avatarUrl: true } }),
  ])

  // ช่วงก่อนหน้าเกินเพดานด้วย = ตัวเลขเทียบอาจต่ำกว่าจริง → ใช้แถบเตือนเดียวกัน
  const truncated = orders.length > MAX_ITEM_ROWS || prevOrders.length > MAX_ITEM_ROWS
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

  // เหมือนรายงานเดิมทุกประการ: qty หักชิ้นที่คืนบางส่วน (เฉพาะกติการ้านบริการ) แล้วคูณราคา snapshot
  const amountOf = (o: { id: string; items: { id: string; qty: number; price: unknown }[] }) => {
    let amount = 0
    for (const it of o.items) {
      const qty = it.qty - (returnAdj.get(o.id)?.returnedQtyByItem[it.id] ?? 0)
      if (newRules && qty <= 0) continue
      amount += qty * Number(it.price)
    }
    return amount
  }

  // ── ซีรีส์รายวัน/รายชั่วโมง: ตำแหน่ง = (เวลา − จุดเริ่มช่วง) ÷ ความกว้างช่อง (เที่ยงคืนไทยไม่มี DST ช่องจึงตรงวันไทยเสมอ)
  const DAY = 86_400_000
  const hourly = span <= DAY
  const slotMs = hourly ? 3_600_000 : DAY
  const slots = Math.max(1, Math.round(span / slotMs))
  const emptySeries = (start: Date): AdDailyPoint[] =>
    Array.from({ length: slots }, (_, i) => {
      const t = new Date(start.getTime() + i * slotMs)
      return { day: hourly ? `${thaiDayKey(t)}T${String(i).padStart(2, '0')}` : thaiDayKey(t), adSales: 0, nonAdSales: 0, adOrders: 0 }
    })
  const daily = emptySeries(from)
  const prevDaily = emptySeries(prevFrom)
  const bump = (series: AdDailyPoint[], start: Date, o: { createdAt: Date; serviceClosedAt: Date | null; adId: string | null }, amount: number) => {
    // ร้านบริการตัดช่วงด้วยวันปิดงาน (เหมือน salesOrderWhere)
    const at = (newRules ? o.serviceClosedAt ?? o.createdAt : o.createdAt).getTime()
    const p = series[Math.floor((at - start.getTime()) / slotMs)]
    if (!p) return
    if (o.adId) { p.adSales += amount; p.adOrders += 1 } else p.nonAdSales += amount
  }

  const pageInfo = new Map(shopChannels.map((c) => [c.id, c]))
  const provinceSales = new Map<string | null, number>()
  const channelSales = new Map<string | null, number>()
  const pageSales = new Map<string, { sales: number; prevSales: number }>()
  const bumpPage = (id: string, k: 'sales' | 'prevSales', amount: number) => {
    const cur = pageSales.get(id) ?? { sales: 0, prevSales: 0 }
    cur[k] += amount
    pageSales.set(id, cur)
  }

  let adSales = 0, nonAdSales = 0, adOrders = 0, nonAdOrders = 0
  for (const o of salesOrders) {
    const amount = amountOf(o)
    bump(daily, from, o, amount)
    const provider = (o.shopChannelId && pageInfo.get(o.shopChannelId)?.provider) || null
    channelSales.set(provider, (channelSales.get(provider) ?? 0) + amount)
    if (!o.adId) {
      nonAdSales += amount
      nonAdOrders += 1
      continue
    }
    adSales += amount
    adOrders += 1
    const addr = o.shippingAddress as { province?: unknown } | null
    const prov = canonicalProvince(typeof addr?.province === 'string' ? addr.province : undefined) ?? null
    provinceSales.set(prov, (provinceSales.get(prov) ?? 0) + amount)
    if (o.shopChannelId) bumpPage(o.shopChannelId, 'sales', amount)
    const a = get(o.adId)
    a.orders += 1
    a.sales += amount
    // ไม่มีการคลิกในช่วงนี้ (คลิกก่อนช่วงแล้วสั่งในช่วง) → ใช้ชื่อ/รูปที่บันทึกในใบ
    if (a.title === null) a.title = o.adTitle
    if (a.photo === null) a.photo = o.adPhotoFileId
  }
  let prevAdSales = 0, prevNonAdSales = 0, prevAdOrders = 0
  for (const o of prevOrders.length > MAX_ITEM_ROWS ? prevOrders.slice(0, MAX_ITEM_ROWS) : prevOrders) {
    const amount = amountOf(o)
    bump(prevDaily, prevFrom, o, amount)
    if (!o.adId) { prevNonAdSales += amount; continue }
    prevAdSales += amount
    prevAdOrders += 1
    if (o.shopChannelId) bumpPage(o.shopChannelId, 'prevSales', amount)
  }
  const distinct = (ids: string[]) => new Set(ids).size
  const chatsTotal = distinct(referrals.map((r) => r.conversationId))
  const prevChats = distinct(prevReferrals.map((r) => r.conversationId))
  const rate = (o: number, c: number) => (c > 0 ? round2((o / c) * 100) : null)
  const roundSeries = (a: AdDailyPoint[]) => a.map((p) => ({ ...p, adSales: round2(p.adSales), nonAdSales: round2(p.nonAdSales) }))
  const dayLabel = (d: Date) => thaiDayKey(d)

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
      chats: chatsTotal, closeRatePct: rate(adOrders, chatsTotal),
    },
    previous: { adSales: round2(prevAdSales), adOrders: prevAdOrders, chats: prevChats, closeRatePct: rate(prevAdOrders, prevChats), nonAdSales: round2(prevNonAdSales) },
    range: { from: dayLabel(from), to: dayLabel(new Date(to.getTime() - 1)) },
    prevRange: { from: dayLabel(prevFrom), to: dayLabel(new Date(from.getTime() - 1)) },
    daily: roundSeries(daily),
    prevDaily: roundSeries(prevDaily),
    provinces: [...provinceSales].map(([name, sales]) => ({ name, sales: round2(sales) })).sort((a, b) => b.sales - a.sales),
    channels: [...channelSales].map(([provider, sales]) => ({ provider, sales: round2(sales) })).sort((a, b) => b.sales - a.sales),
    pages: [...pageSales].flatMap(([id, v]) => {
      const c = pageInfo.get(id)
      return c ? [{ shopChannelId: id, name: c.name, provider: c.provider, avatarUrl: c.avatarUrl, sales: round2(v.sales), prevSales: round2(v.prevSales) }] : []
    }).sort((a, b) => b.sales - a.sales),
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
