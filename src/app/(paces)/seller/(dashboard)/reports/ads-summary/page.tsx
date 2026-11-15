/**
 * สรุปโฆษณา — หน้าเดียวที่ตอบว่าโฆษณาคุ้มไหมและควรทำอะไรต่อ (feature 00094)
 *
 * Base (กริดการ์ด + แถว 8/4): theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx
 *   โครงหน้า breadcrumb → แถบกรอง → กริด + ด่านสิทธิ์/สถานะว่าง/สถานะล้ม: src/app/(paces)/seller/(dashboard)/reports/ad-quality/page.tsx (sibling ที่ Base เป็นไฟล์เดียวกัน)
 *
 * ── สิ่งที่ไฟล์นี้รับผิดชอบ ──────────────────────────────────────────────────
 * ตัดสินสิทธิ์ (F1 = เจ้าของร้านเท่านั้น) · แปลง query · เรียก getAdSummaryReport ครั้งเดียว (Meta อยู่ในแคชของ service) · ส่งก้อนข้อมูลลงการ์ด
 * **ไม่มีสูตรอยู่ในไฟล์นี้** — สูตรอยู่ใน src/lib/ad-summary/* · การตัดสินฝั่งจออยู่ใน src/lib/ad-summary/view.ts (มีเทส)
 * ทำไมไม่ Suspense ต่อส่วน: ทุกส่วนมาจากก้อนเดียวกัน (ผลรวมตาราง = ตัวเลขหลัก) — แยกส่วนจะดึงซ้ำ/ตัวเลขเหลื่อม · loading.tsx คือ skeleton ทั้งหน้า
 * ส่วนไหนข้อมูลเป็น null แสดงสถานะของส่วนนั้นเอง (Meta ไม่ OK → แบนเนอร์บรรทัดเดียว + ส่วน Meta "—" ส่วนของร้านยังแสดง)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { MAX_RANGE_DAYS } from '@/lib/agent-report-query'
import { parseAdReportQuery } from '@/lib/ad-report-query'
import { showInsightBubble } from '@/lib/ad-summary/view'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import { FINANCE_NO_PERMISSION_DETAIL } from '@/lib/no-permission-copy'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { prisma } from '@/lib/prisma'
import { getT } from '@/i18n/server'
import { getAdSummaryReport } from '@/services/ad-summary-report.service'
import NoPermissionCard from '../../_shared/NoPermissionCard'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import SellerErrorState from '../../_shared/SellerErrorState'
import PendingGrid from '../ad-quality/components/PendingGrid'
import { AdReportPendingProvider } from '../ads/components/PendingContext'
import AdSummaryFilters from './components/AdSummaryFilters'
import AudienceCard from './components/AudienceCard'
import CampaignTable from './components/CampaignTable'
import CreativeCards from './components/CreativeCards'
import FunnelCard from './components/FunnelCard'
import InsightBubble from './components/InsightBubble'
import KpiCards from './components/KpiCards'
import MetaNotice from './components/MetaNotice'
import ProfitCard from './components/ProfitCard'
import StatTiles from './components/StatTiles'
import TrendCard from './components/TrendCard'

export const metadata: Metadata = { title: 'สรุปโฆษณา' }

type SearchParams = { from?: string; to?: string; shopChannelId?: string }

export default async function AdsSummaryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const t = await getT()
  const title = t.adSummary.title
  const parent = t.adSummary.parent

  // ด่านกลาง F1 (literal ให้ทะเบียน/สแกนเนอร์เห็น) — เจ้าของร้านเท่านั้น
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
  // ใช้ร้านเดียวกับที่ด่านตัดสิน (ไม่ resolve ซ้ำด้วยตัวอื่น)
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
  const q = parseAdReportQuery({ from: sp.from, to: sp.to, shopChannelId: sp.shopChannelId })

  let report, channels: { id: string; name: string; provider: string }[]
  try {
    ;[report, channels] = await Promise.all([
      getAdSummaryReport(shop.id, { from: q.filters.from, to: q.filters.to, shopChannelId: q.filters.shopChannelId }),
      prisma.shopChannel.findMany({ where: { shopId: shop.id }, select: { id: true, name: true, provider: true }, orderBy: { createdAt: 'asc' } }),
    ])
  } catch (e) {
    // ฐานล่มต้องไม่หน้าตาเหมือน "ร้านนี้ไม่มีข้อมูลโฆษณา"
    console.error('[reports/ads-summary] getAdSummaryReport failed', e instanceof Error ? e.message : 'unknown')
    return (
      <>
        <PageBreadcrumb title={title} subtitle={parent} />
        <SellerErrorState title={t.adReport.errorTitle} message={t.adReport.errorMessage} retryHref="/reports/ads-summary" />
      </>
    )
  }

  if (!report.hasAnyAdData) {
    return (
      <>
        <PageBreadcrumb title={title} subtitle={parent} hideTitleBelowLg />
        <div className="card">
          <div className="card-body">
            <SellerEmptyState compact icon="speakerphone" title={t.adReport.emptyAllTitle} description={t.adReport.emptyAllDesc} action={{ label: t.adReport.emptyAllAction, href: '/inbox' }} />
          </div>
        </div>
      </>
    )
  }

  // query ของช่วง/เพจที่ดูอยู่ — ลิงก์ในเนื้อหาที่พาไปหน้าอื่นพกไปด้วยเสมอ (BRD FR-001 AC-3)
  const rangeQuery = new URLSearchParams({ from: q.label.from, to: q.label.to, ...(q.filters.shopChannelId ? { shopChannelId: q.filters.shopChannelId } : {}) }).toString()

  return (
    <>
      <PageBreadcrumb title={title} subtitle={parent} hideTitleBelowLg />
      <AdReportPendingProvider>
        <AdSummaryFilters
          from={q.label.from} to={q.label.to} shopChannelId={q.filters.shopChannelId ?? null} channels={channels}
          clamped={q.clamped} maxRangeDays={MAX_RANGE_DAYS}
        />
        <PendingGrid>
          <MetaNotice meta={report.meta} />
          <KpiCards report={report} />
          <StatTiles report={report} />
          <div className="gap-base grid grid-cols-1">
            <div className="min-w-0"><TrendCard report={report} /></div>
            <div className="gap-base grid grid-cols-1 xl:grid-cols-12">
              <div className="min-w-0 xl:col-span-8"><FunnelCard report={report} rangeQuery={rangeQuery} /></div>
              <div className="min-w-0 xl:col-span-4"><AudienceCard report={report} rangeQuery={rangeQuery} /></div>
            </div>
            <div className="min-w-0"><CampaignTable report={report} rangeQuery={rangeQuery} noun={noun} shopChannelId={q.filters.shopChannelId ?? null} /></div>
            <div className="min-w-0"><CreativeCards report={report} rangeQuery={rangeQuery} /></div>
            <div className="min-w-0"><ProfitCard report={report} /></div>
          </div>
        </PendingGrid>
      </AdReportPendingProvider>
      {showInsightBubble(report) && <InsightBubble insights={report.insights} rangeQuery={rangeQuery} />}
    </>
  )
}
