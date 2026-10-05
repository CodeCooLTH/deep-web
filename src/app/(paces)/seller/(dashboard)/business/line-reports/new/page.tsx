/**
 * /business/line-reports/new — ผูกกลุ่ม LINE ใหม่ (feature 00070 · E2) · RSC
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx (page shell + PageBreadcrumb)
 *   chase ผ่าน ../page.tsx (guard เดียวกับรายการ) · ฟอร์มอยู่ใน _components/BindWizard.tsx
 * Spec: docs/superpowers/specs/2026-10-05-line-group-summary-report-design-addendum-E.md §1/§4.1
 *
 * Guard: ANON → sign-in · NOT_OWNER → notFound() · สร้างไม่ได้ (LOCKED / ครบ 10 / บอทไม่พร้อม) → กลับรายการ
 *   (หน้ารายการแสดงเหตุผลจาก `createBlockedReason` ของ meta ชุดเดียวกัน)
 * `addFriendUrl()` อ่าน env ฝั่ง server แล้วส่งลงเป็น prop — client ห้าม import config.ts
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { addFriendUrl } from '@/lib/line-report/config'
import { listGroups } from '@/services/line-report-group.service'
import { resolveReportAccess } from '@/services/line-report-access.service'
import { listReportableShops } from '@/services/line-report-shop.service'
import BindWizard from '../_components/BindWizard'

export const metadata: Metadata = { title: 'ผูกกลุ่มใหม่' }

export default async function NewLineReportGroupPage() {
  const access = await resolveReportAccess(await getServerSession(authOptions))
  if (access.kind === 'ANON') redirect('/auth/sign-in')
  if (access.kind === 'NOT_OWNER') notFound()
  if (access.kind === 'LOCKED') redirect('/business/line-reports')

  const [{ meta }, shops] = await Promise.all([listGroups(access.userId), listReportableShops(access.userId)])
  if (!meta.canCreate) redirect('/business/line-reports')

  return (
    <>
      <PageBreadcrumb
        title="ผูกกลุ่มใหม่"
        trail={[
          { label: 'ธุรกิจ', href: '/business' },
          { label: 'รายงานเข้ากลุ่ม LINE', href: '/business/line-reports' },
        ]}
      />
      <BindWizard mode="create" shops={shops.map((s) => ({ id: s.id, name: s.name, vertical: s.vertical ?? '', kind: s.kind }))} addFriendUrl={addFriendUrl()} />
    </>
  )
}
