/**
 * วิเคราะห์ยอดขายจากโฆษณา — รายงานเจ้าของร้าน (feature 00091 เฟส 3 FR-011..FR-020) · 7 แท็บผูก ?tab=
 *
 * Base (โครงหน้า breadcrumb → กรอง → แท็บ → เนื้อหา · สิทธิ์/ว่าง/ผิดพลาด): src/app/(paces)/seller/(dashboard)/reports/ad-quality/page.tsx
 *   (ซึ่ง Base เป็น reports/ads/page.tsx → theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx)
 * ธีมของแต่ละการ์ดอ้างที่หัวไฟล์ใน components/ (กราฟ: theme/paces/Admin/TS/src/app/(admin)/charts/apex/{heatmap,bar,column}/components/data.ts)
 *
 * ── สิ่งที่ไฟล์นี้รับผิดชอบ ──────────────────────────────────────────────────
 * ตัดสินสิทธิ์ (F1 = เจ้าของร้านเท่านั้น) · แปลง query · เรียก getAdRevenueReport **ครั้งเดียวต่อคำขอ** ทุกแท็บใช้ผลชุดเดียว
 * (service คิดทุกแท็บในรอบ query เดียวอยู่แล้ว) · `?tab=` เลือกว่าจะ render แท็บไหน + ส่งเฉพาะส่วนที่แท็บนั้นใช้ลง client
 * **ไม่มีสูตรอยู่ในไฟล์นี้** — ทุกตัวเลขมาจาก ad-revenue-report.service (HR16)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { MAX_RANGE_DAYS } from '@/lib/agent-report-query'
import { parseAdReportQuery } from '@/lib/ad-report-query'
import { resolveDateRange } from '@/lib/date-range'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import { FINANCE_NO_PERMISSION_DETAIL } from '@/lib/no-permission-copy'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { orderStatusMetaFor } from '@/lib/order-display'
import { prisma } from '@/lib/prisma'
import { getT } from '@/i18n/server'
import { fmt } from '@/i18n/fmt'
import { getAdRevenueReport } from '@/services/ad-revenue-report.service'
import NoPermissionCard from '../../_shared/NoPermissionCard'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import SellerErrorState from '../../_shared/SellerErrorState'
import AdSpendNotice from '../ads/components/AdSpendNotice'
import { AdReportPendingProvider } from '../ads/components/PendingContext'
import PendingGrid from '../ad-quality/components/PendingGrid'
import { roas } from '@/lib/ad-report-view'
import { INSIGHT_RULES } from '@/lib/ad-revenue-view'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import AdRevenueFilters from './components/AdRevenueFilters'
import AdRevenueTabs from './components/AdRevenueTabs'
import CampaignsTab from './components/CampaignsTab'
import CoverageTab from './components/CoverageTab'
import CustomersTab from './components/CustomersTab'
import ProductsTab from './components/ProductsTab'
import QualityTab from './components/QualityTab'
import RecommendationsBubble from './components/RecommendationsBubble'
import SummaryTab from './components/SummaryTab'
import TimeTab from './components/TimeTab'
import { bestTwoHours, fmtPct, hh, PANEL_ID, parseTab, TABS_NEEDING_SPEND, type AdRevenueTab } from './components/data'
import { fmtRoas } from '../ads/components/data'

export const metadata: Metadata = { title: 'วิเคราะห์ยอดขายจากโฆษณา' }

type SearchParams = { from?: string; to?: string; shopChannelId?: string; tab?: string }

export default async function AdRevenuePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const t = await getT()
  const title = t.adRevenue.title
  const parent = t.adRevenue.parent

  // ด่านกลาง F1 (literal ให้ทะเบียน/สแกนเนอร์เห็น) — เจ้าของร้านเท่านั้น (เป็นข้อมูลยอดขาย)
  const gate = await gatePage(session, 'F1')
  if (!gate.ok) {
    return (
      <>
        <PageBreadcrumb title={title} subtitle={parent} />
        <NoPermissionCard
          capability="F1"
          viewerRoles={await viewerRolesOf(session as unknown as { user: { id: string; activeShopId?: string | null } })}
          detail={FINANCE_NO_PERMISSION_DETAIL}
        />
      </>
    )
  }
  const active = gate.active
  if (!active) {
    return (
      <>
        <PageBreadcrumb title={title} subtitle={parent} />
        <SellerEmptyState icon="building-store" title={t.adReport.noShopTitle} description={t.adReport.noShopDesc} action={{ label: t.adReport.noShopAction, href: '/shop' }} />
      </>
    )
  }
  const shop = active.shop
  // คำว่า "คำสั่งซื้อ" ผันตามประเภทกิจการ — ห้าม hardcode
  const noun = resolveOrderVocab(shop.vertical ?? '').noun
  const tab = parseTab(sp.tab)
  const q = parseAdReportQuery({ from: sp.from, to: sp.to, shopChannelId: sp.shopChannelId })

  let report, channels: { id: string; name: string; provider: string; avatarUrl: string | null }[]
  try {
    ;[report, channels] = await Promise.all([
      getAdRevenueReport(shop.id, shop.vertical, { from: q.filters.from, to: q.filters.to, shopChannelId: q.filters.shopChannelId }),
      prisma.shopChannel.findMany({ where: { shopId: shop.id }, select: { id: true, name: true, provider: true, avatarUrl: true }, orderBy: { createdAt: 'asc' } }),
    ])
  } catch (e) {
    // ฐานล่มต้องไม่หน้าตาเหมือน "ร้านนี้ไม่มีข้อมูลโฆษณา"
    console.error('[reports/ad-revenue] getAdRevenueReport failed', e instanceof Error ? e.message : 'unknown')
    return (
      <>
        <PageBreadcrumb title={title} subtitle={parent} />
        <SellerErrorState title={t.adReport.errorTitle} message={t.adReport.errorMessage} retryHref="/reports/ad-revenue" />
      </>
    )
  }

  if (!report.hasAnyAdData) {
    return (
      <>
        <PageBreadcrumb title={title} subtitle={parent} />
        <div className="card">
          <div className="card-body">
            <SellerEmptyState compact icon="speakerphone" title={t.adReport.emptyAllTitle} description={t.adReport.emptyAllDesc} action={{ label: t.adReport.emptyAllAction, href: '/inbox' }} />
          </div>
        </div>
      </>
    )
  }

  const rangeQs = new URLSearchParams({ from: q.label.from, to: q.label.to })
  if (q.filters.shopChannelId) rangeQs.set('shopChannelId', q.filters.shopChannelId)
  const { summary, ads, spend } = report
  const spendOk = spend.state === 'OK'
  const noOrders = summary.orders === 0 && summary.placed === 0 && (summary.spend ?? 0) === 0 && tab !== 'coverage'
  const d30 = resolveDateRange('30d').label
  const last30 = new URLSearchParams({ from: d30.start, to: d30.end })
  if (tab !== 'summary') last30.set('tab', tab)
  if (q.filters.shopChannelId) last30.set('shopChannelId', q.filters.shopChannelId)

  const insightAdIds = new Set(report.insights.map((i) => i.adId))
  const adLite = (a: (typeof ads)[number]) => ({ adId: a.adId, adTitle: a.adTitle, adPhotoFileId: a.adPhotoFileId })
  const campaignsQs = new URLSearchParams(rangeQs)
  campaignsQs.set('tab', 'campaigns')

  // กล่องสถานะ Meta = หัวข้อ + ปุ่มเท่านั้น (user สั่งห้ามข้อความอธิบายยาว) — ใช้ copy ของหน้านี้แทนชุดของ /reports/ads ที่ยาวและมีคำว่า Deep
  const ar = t.adRevenue
  const noticeCopy = {
    noneTitle: ar.noticeNoneTitle, noneBody: '', connectCta: ar.connectAds,
    authTitle: ar.noticeAuthTitle, authBody: '', reconnectCta: ar.reconnect,
    currencyTitle: ar.noticeCurrencyTitle, currencyBody: '',
    errorBody: ar.noticeErrorBody, retry: ar.retry,
  }

  const statusMeta = orderStatusMetaFor(resolveOrderVocab(shop.vertical ?? ''))
  const statusLabels = { PENDING: statusMeta.PENDING.label, SHIPPED: statusMeta.SHIPPED.label, CONFIRMED: statusMeta.CONFIRMED.label, CANCELLED: statusMeta.CANCELLED.label, RETURNED: statusMeta.RETURNED.label }

  let body: React.ReactNode
  if (noOrders) {
    body = (
      <div className="card">
        <div className="card-body">
          <SellerEmptyState compact icon="speakerphone" title={fmt(t.adRevenue.emptyRange, { noun })} action={{ label: t.adRevenue.last30, href: `/reports/ad-revenue?${last30.toString()}` }} />
        </div>
      </div>
    )
  } else if (tab === 'summary') {
    body = <SummaryTab report={report} noun={noun} campaignsHref={`/reports/ad-revenue?${campaignsQs.toString()}`} />
  } else if (tab === 'campaigns') {
    body = <CampaignsTab report={report} noun={noun} rangeQuery={rangeQs.toString()} rangeLabel={`${q.label.from}_${q.label.to}`} />
  } else if (tab === 'quality') {
    const qAds = ads.map((a) => ({ ...adLite(a), status: a.status, gross: a.gross, collectedPlaced: a.collectedPlaced }))
    body = <QualityTab report={report} ads={qAds} noun={noun} labels={statusLabels} />
  } else if (tab === 'products') {
    const inMatrix = new Set(report.matrix.adIds)
    body = <ProductsTab report={report} matrixAds={ads.filter((a) => inMatrix.has(a.adId)).map(adLite)} noun={noun} />
  } else if (tab === 'customers') {
    body = <CustomersTab report={report} noun={noun} />
  } else if (tab === 'time') {
    body = <TimeTab report={report} noun={noun} />
  } else {
    body = (
      <CoverageTab
        report={report} noun={noun} campaignsHref={`/reports/ad-revenue?${campaignsQs.toString()}`} noticeCopy={noticeCopy}
        adsWithoutCampaign={spendOk ? ads.filter((a) => !a.campaignId).length : 0}
      />
    )
  }

  // ตัวเลขเด่นบนแถบแท็บ (ตัวเลือก A ที่ user อนุมัติ 2026-11-16) — คิดจาก report ชุดเดียวกับเนื้อหาแท็บ
  const w = report.waterfall
  const totalRoas = roas(summary.sales, summary.spend)
  const best = bestTwoHours(report.heatmap)
  const covTotal = report.coverage.adOrders + report.coverage.chatOrders + report.coverage.otherOrders
  const dv = ar.dash.tabVal
  const tabValues: Record<AdRevenueTab, string | null> = {
    summary: formatBaht(summary.collected),
    campaigns: spendOk && totalRoas !== null ? fmt(dv.campaigns, { v: fmtRoas(totalRoas) }) : null,
    quality: w.open > 0 ? fmt(dv.quality, { v: fmtPct(Math.round((w.collected / w.open) * 1000) / 10) }) : null,
    products: fmt(dv.products, { n: formatNumberNoSymbol(report.products.length) }),
    customers: fmt(dv.customers, { n: formatNumberNoSymbol(summary.newCustomers) }),
    time: summary.orders >= INSIGHT_RULES.minOrders && best.v > 0 ? fmt(ar.dash.hourRange, { a: hh(best.h), b: hh(best.h + 2) }) : null,
    coverage: covTotal > 0 ? fmtPct(Math.round((report.coverage.adOrders / covTotal) * 1000) / 10) : null,
  }

  return (
    // จอเกิน 1920: เนื้อหากว้างไม่เกิน 1920 จัดกลาง (max-w-480 = 120rem ในสเกล spacing ปกติ · user อนุมัติ 2026-11-16)
    <div className="mx-auto w-full max-w-480">
      <PageBreadcrumb title={title} subtitle={parent} />
      <AdReportPendingProvider>
        <AdRevenueFilters from={q.label.from} to={q.label.to} shopChannelId={q.filters.shopChannelId ?? null} channels={channels} clamped={q.clamped} maxRangeDays={MAX_RANGE_DAYS} />
        <AdRevenueTabs active={tab} noun={noun} values={tabValues} />
        <PendingGrid>
          {report.truncated && <p className="text-warning-ink bg-warning/15 mb-base rounded-lg px-3 py-2 text-sm">{t.adRevenue.truncated}</p>}
          {TABS_NEEDING_SPEND.includes(tab) && !noOrders && <AdSpendNotice ads={{ state: spend.state, currency: spend.currency }} noun={noun} copy={noticeCopy} />}
          <div className={report.insights.length > 0 ? 'pb-24' : undefined}> {/* ที่ว่างล่างเท่า bubble คำแนะนำ+ระยะ ไม่ให้บังคอลัมน์สุดท้ายของตาราง */}
          <div id={PANEL_ID} role="tabpanel" aria-labelledby={`ad-revenue-tab-${tab}`}>{body}</div>
          </div>
          {/* คำแนะนำแสดงทุกแท็บ (ไม่มีข้อ = ไม่วาด bubble) */}
          <RecommendationsBubble
            insights={report.insights}
            ads={ads.filter((a) => insightAdIds.has(a.adId)).map((a) => ({ ...adLite(a), chats: a.chats, orders: a.orders, sales: a.sales }))}
            noun={noun}
            rangeQuery={rangeQs.toString()}
          />
        </PendingGrid>
      </AdReportPendingProvider>
    </div>
  )
}
