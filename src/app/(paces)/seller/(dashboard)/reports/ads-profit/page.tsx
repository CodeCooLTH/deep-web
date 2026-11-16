/**
 * /reports/ads-profit — รายงานกำไรและประสิทธิภาพโฆษณารายวัน (00096 P0 · PRD/BRD อนุมัติ 2026-11-16)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx (KPI แถวบน → ตารางหลัก) ผ่านหน้าพี่น้อง reports/ad-revenue/page.tsx
 * ด่าน F1 (เจ้าของร้าน) · ข้อมูลจาก ads-profit.service (ต่อยอด ad-revenue-report — ตัวเลขตรงกันทุกหน้า HR16)
 * ค่าตั้งต้น = วันนี้ · ?mode=realized = กำไรรับรู้แล้ว
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
import { prisma } from '@/lib/prisma'
import { getT } from '@/i18n/server'
import { getAdsProfitReport } from '@/services/ads-profit.service'
import NoPermissionCard from '../../_shared/NoPermissionCard'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import SellerErrorState from '../../_shared/SellerErrorState'
import AdSpendNotice from '../ads/components/AdSpendNotice'
import { AdReportPendingProvider } from '../ads/components/PendingContext'
import PendingGrid from '../ad-quality/components/PendingGrid'
import AdsProfitFilters from './components/AdsProfitFilters'
import AdsProfitCharts from './components/AdsProfitCharts'
import AdsProfitInsights from './components/AdsProfitInsights'
import AdsProfitKpis from './components/AdsProfitKpis'
import AdsProfitTable from './components/AdsProfitTable'

export const metadata: Metadata = { title: 'กำไรโฆษณารายวัน' }

type SearchParams = { from?: string; to?: string; shopChannelId?: string; mode?: string }

export default async function AdsProfitPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const t = await getT()
  const title = t.adsProfit.title
  const parent = t.adsProfit.parent

  // ด่านกลาง F1 (literal ให้ทะเบียน/สแกนเนอร์เห็น) — เจ้าของร้านเท่านั้น
  const gate = await gatePage(session, 'F1')
  if (!gate.ok) {
    return (
      <>
        <PageBreadcrumb title={title} subtitle={parent} />
        <NoPermissionCard capability="F1" viewerRoles={await viewerRolesOf(session as unknown as { user: { id: string; activeShopId?: string | null } })} detail={FINANCE_NO_PERMISSION_DETAIL} />
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
  const noun = resolveOrderVocab(shop.vertical ?? '').noun
  const { q, mode, partial } = parseAdsProfitQuery(sp)

  let report, channels: { id: string; name: string; provider: string; avatarUrl: string | null }[]
  try {
    ;[report, channels] = await Promise.all([
      getAdsProfitReport(shop.id, shop.vertical, { from: q.filters.from, to: q.filters.to, shopChannelId: q.filters.shopChannelId }),
      prisma.shopChannel.findMany({ where: { shopId: shop.id }, select: { id: true, name: true, provider: true, avatarUrl: true }, orderBy: { createdAt: 'asc' } }),
    ])
  } catch (e) {
    console.error('[reports/ads-profit] getAdsProfitReport failed', e instanceof Error ? e.message : 'unknown')
    return (
      <>
        <PageBreadcrumb title={title} subtitle={parent} />
        <SellerErrorState title={t.adReport.errorTitle} message={t.adReport.errorMessage} retryHref="/reports/ads-profit" />
      </>
    )
  }

  const ar = t.adRevenue
  const noticeCopy = {
    noneTitle: ar.noticeNoneTitle, noneBody: '', connectCta: ar.connectAds,
    authTitle: ar.noticeAuthTitle, authBody: '', reconnectCta: ar.reconnect,
    currencyTitle: ar.noticeCurrencyTitle, currencyBody: '',
    errorBody: ar.noticeErrorBody, retry: ar.retry,
  }
  const detailQs = new URLSearchParams({ from: q.label.from, to: q.label.to })
  if (q.filters.shopChannelId) detailQs.set('shopChannelId', q.filters.shopChannelId)
  if (mode === 'realized') detailQs.set('mode', mode)

  return (
    // จอเกิน 1920: เนื้อหากว้างไม่เกิน 1920 จัดกลาง (เหมือนหน้าวิเคราะห์ยอดขายจากโฆษณา)
    <div className="mx-auto w-full max-w-480">
      <PageBreadcrumb title={title} subtitle={parent} />
      <AdReportPendingProvider>
        <AdsProfitFilters from={q.label.from} to={q.label.to} shopChannelId={q.filters.shopChannelId ?? null} channels={channels} mode={mode} />
        <PendingGrid>
          {report.base.truncated && <p className="text-warning-ink bg-warning/15 mb-base rounded-lg px-3 py-2 text-sm">{ar.truncated}</p>}
          {report.base.spend.state !== 'OK' && <AdSpendNotice ads={{ state: report.base.spend.state, currency: report.base.spend.currency }} noun={noun} copy={noticeCopy} />}
          <AdsProfitKpis report={report} mode={mode} noun={noun} partial={partial} />
          <AdsProfitInsights report={report} mode={mode} noun={noun} detailQuery={detailQs.toString()} partial={partial} />
          <AdsProfitTable report={report} mode={mode} noun={noun} detailQuery={detailQs.toString()} rangeLabel={`${q.label.from}_${q.label.to}`} />
          <div className="mt-base"><AdsProfitCharts report={report} mode={mode} noun={noun} /></div>
        </PendingGrid>
      </AdReportPendingProvider>
    </div>
  )
}
