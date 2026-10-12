/**
 * ตั้งค่ารายงานการเงิน — ร้านบริการเท่านั้น · เจ้าของเท่านั้น (feature 00073 เฟส B · FR-010)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/job-types/page.tsx (gate 3 ชั้น: เมนู · หน้า · API
 *   + PageBreadcrumb + NoPermissionCard) · การ์ดสวิตช์ ยกจาก public-profile/components/PriceVisibilityToggleClient.tsx
 *
 * 🛑 ซ่อนเมนูไม่ใช่การควบคุมสิทธิ์ — หน้านี้ gate เอง (F1) และร้านที่ไม่ใช่บริการพิมพ์ URL ตรงได้ notFound
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import { usesServiceFinanceRules } from '@/lib/finance-rules'
import { REPORT_SETTINGS_LABEL, resolveReportSettings } from '@/lib/report-settings'
import { resolveOrderVocab } from '@/lib/seller-menu'
import NoPermissionCard from '../../_shared/NoPermissionCard'
import ReportSettingsForm from './components/ReportSettingsForm'

export const metadata: Metadata = { title: REPORT_SETTINGS_LABEL }

export default async function ReportSettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const gate = await gatePage(session, 'F1')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return (
      <>
        <PageBreadcrumb title={REPORT_SETTINGS_LABEL} />
        <NoPermissionCard capability="F1" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }
  if (!gate.ok) return null
  const shop = gate.active.shop
  if (!usesServiceFinanceRules(shop.vertical)) notFound()

  return (
    <>
      <PageBreadcrumb title={REPORT_SETTINGS_LABEL} trail={[{ label: 'ตั้งค่า' }]} />
      <ReportSettingsForm
        initial={resolveReportSettings(shop.reportSettings, shop.vertical)}
        costNoun={resolveOrderVocab(shop.vertical).costNoun}
      />
    </>
  )
}
