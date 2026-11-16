/**
 * /reports/ads-profit/[adId] — รายละเอียดโฆษณา (00096 BRD FR-009/FR-010 · P0 แท็บยอดขายและกำไร + คำสั่งซื้อ)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx ผ่านหน้าแม่ reports/ads-profit/page.tsx
 * 🛑 adId ต้องเป็นแถวในรายงานของร้านนี้ช่วงนี้ ไม่งั้น "ไม่พบ" (กันไล่ยิงรหัสสุ่ม — ท่า 00093) · ทุก query ผูก shopId
 * แถวโฆษณามาจาก getAdsProfitReport ตัวเดียวกับตาราง ⇒ ตัวเลขหัวหน้า = แถวในตาราง
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { parseAdsProfitQuery } from '@/lib/ad-report-query'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import { FINANCE_NO_PERMISSION_DETAIL } from '@/lib/no-permission-copy'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { formatOrderNo } from '@/lib/order-no'
import { thaiDayKey } from '@/lib/format-date'
import { isOrderUnpaid } from '@/lib/order-payment-state'
import { buildProfitInsights } from '@/lib/ads-profit-insights'
import { getT } from '@/i18n/server'
import { getAdProfitOrders, getAdsProfitReport } from '@/services/ads-profit.service'
import { getAdSpend } from '@/services/meta-ads-spend.service'
import NoPermissionCard from '../../../_shared/NoPermissionCard'
import SellerEmptyState from '../../../_shared/SellerEmptyState'
import AdProfitDetail, { type DetailOrder, type DetailTab } from '../components/AdProfitDetail'

export const metadata: Metadata = { title: 'รายละเอียดโฆษณา' }

type SearchParams = { from?: string; to?: string; shopChannelId?: string; mode?: string; tab?: string }
const DAY = 86_400_000

export default async function AdProfitDetailPage({ params, searchParams }: { params: Promise<{ adId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ adId: rawAdId }, sp] = await Promise.all([params, searchParams])
  const adId = decodeURIComponent(rawAdId)
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const t = await getT()
  const title = t.adsProfit.title

  const gate = await gatePage(session, 'F1')
  if (!gate.ok) {
    return (
      <>
        <PageBreadcrumb title={title} subtitle={t.adsProfit.parent} />
        <NoPermissionCard capability="F1" viewerRoles={await viewerRolesOf(session as unknown as { user: { id: string; activeShopId?: string | null } })} detail={FINANCE_NO_PERMISSION_DETAIL} />
      </>
    )
  }
  const shop = gate.active?.shop
  if (!shop) return null
  const noun = resolveOrderVocab(shop.vertical ?? '').noun
  const { q, mode } = parseAdsProfitQuery(sp)
  const range = { from: q.filters.from, to: q.filters.to, shopChannelId: q.filters.shopChannelId }

  const qs = new URLSearchParams({ from: q.label.from, to: q.label.to })
  if (q.filters.shopChannelId) qs.set('shopChannelId', q.filters.shopChannelId)
  if (mode === 'realized') qs.set('mode', mode)
  const backHref = `/reports/ads-profit?${qs.toString()}`

  const report = await getAdsProfitReport(shop.id, shop.vertical, range)
  const row = report.rows.find((r) => r.adId === adId)
  if (!row) {
    return (
      <>
        <PageBreadcrumb title={title} subtitle={t.adsProfit.parent} />
        <SellerEmptyState icon="speakerphone" title={t.adsProfit.notFound} action={{ label: t.adsProfit.detailBack, href: backHref }} />
      </>
    )
  }

  const tab: DetailTab = sp.tab === 'orders' || sp.tab === 'perf' || sp.tab === 'diag' ? sp.tab : 'profit'
  const [list, spendRes] = await Promise.all([
    getAdProfitOrders(shop.id, shop.vertical, { ...range, adId, mode }),
    getAdSpend(shop.id, q.label.from, q.label.to).catch(() => null),
  ])

  const orders: DetailOrder[] = list.map(({ order: o, parts }) => ({
    id: o.id, token: o.publicToken, no: o.orderNo ?? formatOrderNo(o.publicToken, o.createdAt), createdAt: o.createdAt.toISOString(),
    customer: o.buyerName ?? null, items: o.items.map((it) => `${it.name} ×${it.qty}`).join(', '),
    revenue: parts.revenue, cogs: parts.cogs, variable: parts.variable,
    paid: !isOrderUnpaid({ totalAmount: String(o.totalAmount), payments: (o.payments ?? []).map((x) => ({ kind: x.kind, amount: String(x.amount), voidedAt: x.voidedAt })), paymentConfirmedAt: o.paymentConfirmedAt, codReceivedAt: o.codReceivedAt }),
    status: o.status,
  }))

  // รายวันของโฆษณานี้: ค่าโฆษณาจาก Insights · ยอด/กำไรจากใบในรายการ (ชุดเดียวกับตาราง)
  const span = q.filters.to.getTime() - q.filters.from.getTime()
  const days = Array.from({ length: Math.max(1, Math.round(span / DAY)) }, (_, i) => thaiDayKey(new Date(q.filters.from.getTime() + i * DAY)))
  const idx = new Map(days.map((d, i) => [d, i]))
  const daily = days.map((day) => ({ day, spend: 0, revenue: 0, profit: 0 }))
  if (spendRes?.state === 'OK') for (const r of spendRes.rows) { const i = idx.get(r.day); if (r.adId === adId && i !== undefined) daily[i].spend += r.spend }
  for (const o of orders) { const i = idx.get(thaiDayKey(new Date(o.createdAt))); if (i !== undefined) { daily[i].revenue += o.revenue; daily[i].profit += o.revenue - o.cogs - o.variable } }
  for (const d of daily) d.profit -= d.spend

  return (
    <div className="mx-auto w-full max-w-480">
      <PageBreadcrumb title={title} subtitle={t.adsProfit.parent} />
      <AdProfitDetail row={row} mode={mode} noun={noun} tab={tab} baseHref={`/reports/ads-profit/${encodeURIComponent(adId)}?${qs.toString()}`} backHref={backHref} orders={orders} daily={daily} insights={buildProfitInsights(report.rows.map((r) => ({ adId: r.adId, spend: r.spend, parts: r.parts[mode], metrics: r.metrics[mode], status: r.status[mode], cancelled: r.cancelled, returned: r.returned, objective: r.objective })), 1000).filter((i) => i.adId === adId)} />
    </div>
  )
}
