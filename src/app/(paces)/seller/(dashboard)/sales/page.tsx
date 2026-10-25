/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(reports)/sales/page.tsx
 *
 * หน้า "ยอดขายและกำไร" — เนื้อในเป็นคอมโพเนนต์ตัวเดียวกับชีตบนมือถือทุกประเภทร้าน
 * - ร้านบริการ: ServiceReportPanel (00078) · ข้อมูล getServiceReportData
 * - ร้านอื่น: SalesChartSheet layout="page" · ข้อมูล getSalesSeries + withShippingExpenses ชุดเดียวกับหน้าแรก
 * 🛑 เดิมร้านอื่นคิดยอดเองจากออเดอร์ทั้งร้าน (กำไร = เฉพาะใบยืนยัน) ⇒ ยอด/การ์ด/ลำดับแถวไม่ตรงมือถือ
 *    (user 2026-10-25: วันที่ 24 มือถือกำไร 4,311 เว็บได้น้อยกว่า) — ห้ามกลับไปคำนวณเองที่หน้านี้
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import NoPermissionCard from '../_shared/NoPermissionCard'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import { FINANCE_NO_PERMISSION_DETAIL } from '@/lib/no-permission-copy'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { resolveRangeFromParams, todayThaiIsoDate } from '@/lib/date-range'
import { resolveShopVertical } from '@/lib/lodging'
import { resolveOrderVocab, FINANCE_MENU_LABEL } from '@/lib/seller-menu'
import { FINANCE_TAB_PARAM } from '@/lib/finance-tabs'
import ServiceReportPanel from '../_shared/service-report/ServiceReportPanel'
import { getServiceReportData } from '@/services/service-report.service'
import { SERVICE_REPORT_WORDS } from '@/lib/service-report/words'
import { serviceReportPeriodFromRange } from '@/lib/service-report/period-from-range'
import { resolveReportSettings, serviceReportChart, serviceReportView } from '@/lib/report-settings'
import { getSalesSeries, withShippingExpenses } from '@/services/dashboard.service'
import SalesChartSheet from '../dashboard/components/SalesChartSheet'

export const metadata: Metadata = { title: 'ยอดขายและกำไร' }

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tab?: string; range?: string; start?: string; end?: string }>
}) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/auth/sign-in')

  const sessionLike = session as unknown as { user: { id: string; activeShopId?: string | null } }

  /**
   * 00071 BR-RP-08: หน้านี้ทั้งหน้า (ทุกแท็บ) เป็นการเงินเต็ม = เจ้าของร้านเท่านั้น
   * 🛑 ต้องตัดสินตรงนี้ ก่อน parse ช่วงเวลา/query ใด ๆ — ผู้ไม่ใช่เจ้าของต้องไม่ถูกดึงข้อมูลเลย
   */
  const gate = await gatePage(sessionLike, 'F1')
  if (!gate.ok && gate.reason === 'NO_SHOP') redirect('/shop')
  if (!gate.ok) {
    return (
      <>
        <PageBreadcrumb title={FINANCE_MENU_LABEL} trail={[{ label: 'ธุรกิจ' }]} />
        <NoPermissionCard capability="F1" viewerRoles={await viewerRolesOf(sessionLike)} detail={FINANCE_NO_PERMISSION_DETAIL} />
      </>
    )
  }
  const shop = gate.active.shop

  /** ตัดสิน vertical จุดเดียว — resolveShopVertical fail-closed (ห้ามเทียบสตริงเอง) */
  const isServiceQueue = resolveShopVertical(shop.vertical) === 'SERVICE_QUEUE'

  /**
   * ── feature 00078: ร้านบริการได้หน้าเดียว "ยอดขายและกำไร" ─────────────
   * ลิงก์เก่า `?tab=expense` (บุ๊กมาร์ก/ทางลัด/เมนูเดิม) → หน้า /expenses เดิม (มติ Q-1 2026-10-17)
   */
  if (isServiceQueue) {
    if (sp[FINANCE_TAB_PARAM] === 'expense') {
      const qs = new URLSearchParams()
      if (typeof sp.range === 'string') qs.set('range', sp.range)
      if (typeof sp.start === 'string') qs.set('start', sp.start)
      if (typeof sp.end === 'string') qs.set('end', sp.end)
      redirect(`/expenses${qs.size ? `?${qs}` : ''}`)
    }
    const settings = resolveReportSettings(shop.reportSettings, shop.vertical)
    const period = resolveRangeFromParams(sp, 'month')
    const { mode, ...reportPeriod } = serviceReportPeriodFromRange(period.resolved.label)
    const initial = await getServiceReportData(shop.id, shop.vertical, mode, reportPeriod)
    return (
      <>
        <PageBreadcrumb title={SERVICE_REPORT_WORDS.pageTitle} trail={[{ label: 'ธุรกิจ' }]} />
        <ServiceReportPanel initial={initial} view={serviceReportView(settings)} chart={serviceReportChart(settings)} layout="page" />
      </>
    )
  }

  // ร้านอื่น — ชุดเดียวกับการ์ด/ชีตยอดขายหน้าแรก (dashboard/page.tsx) เดือนปัจจุบันรายวัน · ชีตเลื่อนช่วงเองผ่าน /api/seller/sales-series
  const [year, month] = todayThaiIsoDate().split('-').map(Number)
  const initialSeries = await getSalesSeries(shop.id, 'daily', { year, month }, true, shop.vertical).then((s) =>
    withShippingExpenses(shop.id, s, 'daily', { year, month }, shop.vertical),
  )
  return (
    <>
      <PageBreadcrumb title="ยอดขายและกำไร" trail={[{ label: 'ภาพรวม' }]} />
      <SalesChartSheet layout="page" initialSeries={initialSeries} costNoun={resolveOrderVocab(shop.vertical).costNoun} />
    </>
  )
}
