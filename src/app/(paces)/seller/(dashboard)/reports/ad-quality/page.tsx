/**
 * คุณภาพโฆษณา — รายงานเจ้าของร้าน (feature 00093 FR-001): ตัวชี้วัดจาก Meta Insights เทียบแชท (Deep)/คำสั่งซื้อ
 *
 * Base (กริดการ์ด + แถวตาราง): theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx
 *   โครงหน้า breadcrumb → แถบกรอง → กริด: src/app/(paces)/seller/(dashboard)/reports/ads/page.tsx (sibling ที่ Base เป็นไฟล์เดียวกัน)
 *
 * ── สิ่งที่ไฟล์นี้รับผิดชอบ ──────────────────────────────────────────────────
 * ตัดสินสิทธิ์ (F1 = เจ้าของร้านเท่านั้น) · แปลง query · ฝั่ง Deep ขึ้นทันที · เปิดคำขอ Meta Q1–Q4 ขนานกันแล้วส่ง promise ให้การ์ดรอของตัวเอง
 * **ไม่มีสูตรอยู่ในไฟล์นี้** — ฝั่ง Deep มาจาก getAdSalesReport (ตัวเดียวกับ /reports/ads) สูตรทั้งหมดอยู่ใน src/lib/ad-quality-formulas.ts
 * การเชื่อมไม่พร้อม (NOT_CONNECTED/AUTH/CURRENCY) → ไม่ยิง Meta · ซ่อน ② ③ ④ ⑥ · เหลือ ① (แชท (Deep)) + แบนเนอร์ + ⑤ (มติ O1)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { Suspense } from 'react'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { MAX_RANGE_DAYS } from '@/lib/agent-report-query'
import { parseAdReportQuery } from '@/lib/ad-report-query'
import { buildQualityRows } from '@/lib/ad-quality-view'
import { thaiDayKey } from '@/lib/format-date'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import { FINANCE_NO_PERMISSION_DETAIL } from '@/lib/no-permission-copy'
import { MAX_FILTER_ADS } from '@/lib/meta-ads-quality'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { prisma } from '@/lib/prisma'
import { getT } from '@/i18n/server'
import { getQualityDeepSide } from '@/services/ad-quality-report.service'
import { getQualityBundle } from '@/services/meta-ads-quality.service'
import NoPermissionCard from '../../_shared/NoPermissionCard'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import SellerErrorState from '../../_shared/SellerErrorState'
import { AdReportPendingProvider } from '../ads/components/PendingContext'
import AdQualityFilters from './components/AdQualityFilters'
import ChatCompareHero from './components/ChatCompareHero'
import ChatGapTable from './components/ChatGapTable'
import { BreakdownMeta, FetchedLine, TablesMeta, TopRowMeta } from './components/MetaSections'
import PendingGrid from './components/PendingGrid'
import QualityNotice from './components/QualityNotice'
import { ChartCardSkeleton, TableCardSkeleton, TopRowSkeleton } from './components/Skeletons'

export const metadata: Metadata = { title: 'คุณภาพโฆษณา' }

type SearchParams = { from?: string; to?: string; shopChannelId?: string; ad?: string }

export default async function AdQualityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const t = await getT()
  const title = t.adQuality.title
  const parent = t.adQuality.parent

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
        <SellerEmptyState icon="building-store" title={t.adReport.noShopTitle} description={t.adReport.noShopDesc} action={{ label: 'สร้างร้านค้า', href: '/shop' }} />
      </>
    )
  }
  const shop = active.shop
  const noun = resolveOrderVocab(shop.vertical ?? '').noun
  const q = parseAdReportQuery({ from: sp.from, to: sp.to, shopChannelId: sp.shopChannelId })
  const pageFiltered = Boolean(q.filters.shopChannelId)
  // ?ad= ใช้กับการ์ด ④ เท่านั้น — ตัวเลขล้วน (เข้า filtering ของ Graph)
  const rawAd = sp.ad && /^\d{1,30}$/.test(sp.ad) ? sp.ad : null

  let deep, channels: { id: string; name: string; provider: string }[]
  try {
    ;[deep, channels] = await Promise.all([
      getQualityDeepSide(shop.id, { from: q.filters.from, to: q.filters.to, shopChannelId: q.filters.shopChannelId }),
      prisma.shopChannel.findMany({ where: { shopId: shop.id }, select: { id: true, name: true, provider: true }, orderBy: { createdAt: 'asc' } }),
    ])
  } catch (e) {
    // ฐานล่มต้องไม่หน้าตาเหมือน "ร้านนี้ไม่มีข้อมูลโฆษณา"
    console.error('[reports/ad-quality] getQualityDeepSide failed', e instanceof Error ? e.message : 'unknown')
    return (
      <>
        <PageBreadcrumb title={title} subtitle={parent} />
        <SellerErrorState title={t.adReport.errorTitle} message={t.adReport.errorMessage} retryHref="/reports/ad-quality" />
      </>
    )
  }

  if (!deep.hasAnyAdData) {
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

  const ads = { state: deep.ads.state, accountName: deep.ads.accountName, currency: deep.ads.currency }
  const deepOnly = ads.state === 'NOT_CONNECTED' || ads.state === 'AUTH' || ads.state === 'CURRENCY'
  const includesToday = q.label.to >= thaiDayKey(new Date())

  // เลือกเพจ: Meta ไม่รู้จักเพจ → กรอง Q2/Q3/Q4 ด้วยชุดแอดที่มีแชท (Deep) ในเพจนั้น (เรียงตามแชท (Deep) มาก→น้อย เผื่อเกินเพดาน)
  // ?ad= ต้องเป็นแอดของร้านในช่วงนี้ — กันการไล่ยิง Graph ด้วยรหัสสุ่ม
  const selectedAd = rawAd && deep.deepAds.some((d) => d.adId === rawAd) ? rawAd : null
  const scopeAdIds = pageFiltered ? [...deep.deepAds].sort((a, b) => b.chats - a.chats).slice(0, MAX_FILTER_ADS).map((d) => d.adId) : undefined
  const bundle = deepOnly
    ? null
    : getQualityBundle({
        shopId: shop.id, since: q.label.from, until: q.label.to, scopeAdIds, adId: selectedAd,
      })
  const key = `${q.label.from}|${q.label.to}|${q.filters.shopChannelId ?? ''}|${selectedAd ?? ''}`
  const common = { deep, pageFiltered }

  return (
    <>
      <PageBreadcrumb title={title} subtitle={parent} hideTitleBelowLg />
      <AdReportPendingProvider>
        <AdQualityFilters
          from={q.label.from} to={q.label.to} shopChannelId={q.filters.shopChannelId ?? null} channels={channels}
          clamped={q.clamped} maxRangeDays={MAX_RANGE_DAYS} includesToday={includesToday} ads={ads}
        />
        {bundle && (
          <div className="mb-base">
            <Suspense fallback={<p className="text-default-700 mb-0 text-xs">{t.adQuality.fetching}</p>}>
              <FetchedLine bundle={bundle} />
            </Suspense>
          </div>
        )}
        <PendingGrid>
          {ads.state === 'ERROR' && <QualityNotice ads={ads} />}
          {bundle ? (
            <>
              <div className="gap-base mb-base grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                <Suspense key={`top|${key}`} fallback={<TopRowSkeleton />}>
                  <TopRowMeta bundle={bundle} {...common} noun={noun} />
                </Suspense>
              </div>
              <div className="gap-base grid grid-cols-1">
                <Suspense key={`bd|${key}`} fallback={<ChartCardSkeleton />}>
                  <BreakdownMeta bundle={bundle} deep={deep} selectedAd={selectedAd} />
                </Suspense>
                <Suspense key={`tb|${key}`} fallback={<TableCardSkeleton />}>
                  <TablesMeta bundle={bundle} {...common} noun={noun} />
                </Suspense>
              </div>
            </>
          ) : (
            <>
              {/* การเชื่อมไม่พร้อม: ① (แชท (Deep)) + แบนเนอร์เป็นผู้อธิบายเหตุผลจุดเดียว — ไม่วาดการ์ดว่าง 4 ใบซ้ำกัน (มติ O1) */}
              <div className="gap-base mb-base grid grid-cols-1 xl:grid-cols-3">
                <ChatCompareHero deepOnly status="EMPTY" totals={null} deepTotal={deep.chatsTotal} top={null} />
                <div className="xl:col-span-2"><QualityNotice ads={ads} /></div>
              </div>
              <ChatGapTable rows={buildQualityRows(deep.deepAds, null, { pageFiltered })} totals={null} deepOnly status="EMPTY" />
            </>
          )}
        </PendingGrid>
      </AdReportPendingProvider>
    </>
  )
}
