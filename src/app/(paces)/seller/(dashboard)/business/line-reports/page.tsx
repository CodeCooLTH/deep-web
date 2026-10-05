/**
 * /business/line-reports — รายการกลุ่ม LINE ที่รับรายงานสรุปยอด (feature 00070 · E1) · RSC
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx (page shell + PageBreadcrumb)
 *   chase ผ่าน src/app/(paces)/seller/(dashboard)/business/page.tsx + business/[shopId]/invites/page.tsx (session guard)
 * Spec: docs/superpowers/specs/2026-10-05-line-group-summary-report-design-addendum-E.md §1/§8
 *
 * Guard ตาม `resolveReportAccess`: ANON → sign-in · NOT_OWNER → notFound() (ไม่บอกว่ามีหน้านี้) ·
 *   LOCKED ไม่มีกลุ่ม → E1 (ReportLockedState) · LOCKED มีกลุ่ม → รายการ + แบนเนอร์แพ็กเกจหยุด (ทุกแถว "หยุดส่ง") · OK → รายการ/หน้าว่าง
 * เรียก service ตรง (`listGroups` = DTO เดียวกับ GET /groups) ไม่ fetch API ของตัวเอง
 *
 * 🛑 ฟีเจอร์นี้เปิดทุกเปลือก (ไม่ใช่ Deep Stock) — ห้ามใช้ `shouldHidePaidFeatures` · เปลือกมีผลแค่ CTA/ข้อความของ presenter
 *   (`lockedCta`/`bannerFor` คืน null ในแอป Android: ไม่มีปุ่ม ไม่มีราคา ไม่มีลิงก์)
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { getAppShell, shouldHidePayments } from '@/lib/app-shell-server'
import { resolveActiveShopRef } from '@/lib/line-report/active-shop'
import { createBlockedReason } from '@/lib/line-report/list-view'
import { bannerFor, lockedCta } from '@/lib/line-report/presenter'
import { listGroups } from '@/services/line-report-group.service'
import { resolveReportAccess } from '@/services/line-report-access.service'
import ReportBanner from './_components/ReportBanner'
import ReportEmptyState from './_components/ReportEmptyState'
import ReportGroupList from './_components/ReportGroupList'
import ReportLockedState from './_components/ReportLockedState'

export const metadata: Metadata = { title: 'รายงานเข้ากลุ่ม LINE' }

export default async function LineReportsPage() {
  const session = await getServerSession(authOptions)
  const access = await resolveReportAccess(session)
  if (access.kind === 'ANON') redirect('/auth/sign-in')
  if (access.kind === 'NOT_OWNER') notFound()

  const [shell, hidePayments, { groups, meta }, activeShop] = await Promise.all([getAppShell(), shouldHidePayments(), listGroups(access.userId), resolveActiveShopRef(session)])
  const now = new Date()
  const reason = access.kind === 'LOCKED' ? access.reason : 'RENEWAL_FAILED'
  // ในแอปที่ซ่อนการจ่ายเงิน /business เด้งออก → ไม่ทำ crumb เป็นลิงก์ (กดแล้วหลุดไปหน้าอื่นโดยไม่รู้ตัว)
  const crumb = <PageBreadcrumb title="รายงานเข้ากลุ่ม LINE" trail={[{ label: 'ธุรกิจ', href: hidePayments ? undefined : '/business' }]} />

  if (groups.length === 0) {
    return (
      <>
        {crumb}
        {access.kind === 'LOCKED' ? (
          <ReportLockedState cta={lockedCta(shell, access.reason)} now={now} />
        ) : (
          <ReportEmptyState blockedReason={createBlockedReason(meta)} now={now} />
        )}
      </>
    )
  }

  // list ไม่มีข้อมูลร้านต่อกลุ่ม → สร้าง PresenterGroup จาก {status} เปล่า (ตามด่านแบนเนอร์ระดับบัญชี: แพ็กเกจหยุด)
  const banner = meta.paused ? bannerFor({ status: 'ACTIVE' }, true, shell, reason) : null
  return (
    <>
      {crumb}
      {banner && <ReportBanner banner={banner} />}
      <ReportGroupList groups={groups} meta={meta} now={now} activeShopId={activeShop?.id ?? null} />
    </>
  )
}
