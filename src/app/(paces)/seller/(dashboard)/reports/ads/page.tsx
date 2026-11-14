/**
 * ยอดขายตามโฆษณา — รายงานเจ้าของร้าน (feature 00091 FR-008)
 *
 * Base (โครงหน้า: breadcrumb → แถบกรอง → กริดการ์ด FR-009 → ตาราง):
 *   src/app/(paces)/seller/(dashboard)/reports/products/page.tsx + reports/agents/page.tsx
 *   (ซึ่ง copy โครงมาจาก theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx)
 *
 * ── สิ่งที่ไฟล์นี้รับผิดชอบ ──────────────────────────────────────────────────
 * ตัดสินสิทธิ์ (F1 = เจ้าของร้านเท่านั้น) · แปลง query · เรียก service · ส่งของที่ serialize ได้ลงไปให้ client
 * **ไม่มีสูตรอะไรอยู่ในไฟล์นี้** — ยอดขายมาจาก ad-sales-report.service ซึ่งใช้ตัวคำนวณเดียวกับรายงานยอดขายรายสินค้า (HR16)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { MAX_RANGE_DAYS } from '@/lib/agent-report-query'
import { parseAdReportQuery } from '@/lib/ad-report-query'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import { FINANCE_NO_PERMISSION_DETAIL } from '@/lib/no-permission-copy'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { prisma } from '@/lib/prisma'
import { requireActiveShop } from '@/lib/shop-context'
import { getT } from '@/i18n/server'
import { getAdSalesReport } from '@/services/ad-sales-report.service'
import NoPermissionCard from '../../_shared/NoPermissionCard'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import SellerErrorState from '../../_shared/SellerErrorState'
import AdReportFilters from './components/AdReportFilters'
import AdSalesClient from './components/AdSalesClient'
import { AdReportPendingProvider } from './components/PendingContext'

export const metadata: Metadata = { title: 'ยอดขายตามโฆษณา' }

type SearchParams = { from?: string; to?: string; shopChannelId?: string }

export default async function AdSalesReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const t = await getT()

  const title = t.adReport.title
  const parent = t.adReport.parent

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

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
  if (!active) {
    return (
      <>
        <PageBreadcrumb title={title} subtitle={parent} />
        <SellerEmptyState
          icon="building-store"
          title={t.adReport.noShopTitle}
          description={t.adReport.noShopDesc}
          action={{ label: 'สร้างร้านค้า', href: '/shop' }}
        />
      </>
    )
  }
  const shop = active.shop

  // คำว่า "คำสั่งซื้อ" ผันตามประเภทกิจการ (บทเรียน clarify 2026-08-27: ร้านบริการเรียก "การเข้ารับบริการ") — ห้าม hardcode
  const noun = resolveOrderVocab(shop.vertical ?? '').noun
  const q = parseAdReportQuery({ from: sp.from, to: sp.to, shopChannelId: sp.shopChannelId })

  let report
  let channels: { id: string; name: string; provider: string }[]
  try {
    ;[report, channels] = await Promise.all([
      getAdSalesReport(shop.id, { from: q.filters.from, to: q.filters.to, shopChannelId: q.filters.shopChannelId }),
      prisma.shopChannel.findMany({
        where: { shopId: shop.id },
        select: { id: true, name: true, provider: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])
  } catch (e) {
    // ฐานล่มต้องไม่หน้าตาเหมือน "ร้านนี้ไม่มีข้อมูลโฆษณา" — บทเรียนเดียวกับ /reports/products และ /reports/agents
    console.error('[reports/ads] getAdSalesReport failed', e)
    return (
      <>
        <PageBreadcrumb title={title} subtitle={parent} />
        <SellerErrorState title={t.adReport.errorTitle} message={t.adReport.errorMessage} retryHref="/reports/ads" />
      </>
    )
  }

  // ร้านไม่เคยมีข้อมูลโฆษณาเลย: ไม่มีอะไรให้กรอง → ไม่แสดงแถบกรอง/การ์ดสรุป
  if (!report.hasAnyAdData) {
    return (
      <>
        <PageBreadcrumb title={title} subtitle={parent} hideTitleBelowLg />
        <div className="card">
          <div className="card-body">
            <SellerEmptyState
              compact
              icon="speakerphone"
              title={t.adReport.emptyAllTitle}
              description={t.adReport.emptyAllDesc}
              action={{ label: t.adReport.emptyAllAction, href: '/inbox' }}
            />
          </div>
        </div>
      </>
    )
  }

  const rangeQs = new URLSearchParams({ from: q.label.from, to: q.label.to })
  if (q.filters.shopChannelId) rangeQs.set('shopChannelId', q.filters.shopChannelId)

  // rows ส่งแยก (ไม่ซ้ำใน view) — ลดขนาด payload ข้ามเส้น RSC
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rows, hasAnyAdData, ...view } = report

  return (
    <>
      <PageBreadcrumb title={title} subtitle={parent} hideTitleBelowLg />
      <AdReportPendingProvider>
        <AdReportFilters
          from={q.label.from}
          to={q.label.to}
          prevFrom={report.prevRange.from}
          prevTo={report.prevRange.to}
          shopChannelId={q.filters.shopChannelId ?? null}
          channels={channels}
          clamped={q.clamped}
          maxRangeDays={MAX_RANGE_DAYS}
        />
        <AdSalesClient
          // key ผูกกับช่วง/เพจ — เปลี่ยนตัวกรองคือรายงานใหม่ รีเซ็ตหน้า/ชีต/การเรียงทั้งชุด
          key={rangeQs.toString()}
          rows={rows}
          report={view}
          noun={noun}
          rangeQuery={rangeQs.toString()}
          pageCount={channels.length}
          pageFiltered={Boolean(q.filters.shopChannelId)}
        />
      </AdReportPendingProvider>
    </>
  )
}
