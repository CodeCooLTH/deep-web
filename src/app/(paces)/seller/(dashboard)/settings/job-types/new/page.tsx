/**
 * เพิ่มคิวงานที่รับได้ (feature 00024, FR-RSV-01)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/new/page.tsx (โครง gate + PageBreadcrumb เดียวกัน)
 *
 * IMPORTANT: gate ด้วย canUseAppointments เองที่ระดับหน้า — การซ่อนเมนูไม่ใช่การควบคุมสิทธิ์
 * (BR-RSV-02)
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { canUseAppointments } from '@/lib/appointments'
import { requireActiveShop } from '@/lib/shop-context'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionCard from '../../../_shared/NoPermissionCard'
import ResourceForm from '../components/ResourceForm'

export const metadata: Metadata = { title: 'เพิ่มประเภทงาน' }

export default async function NewServiceResourcePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  // 00071 Q2: ตั้งค่าประเภทงาน = เจ้าของ/ผู้ดูแลเท่านั้น — การ์ดบอกเหตุผล ไม่ใช่หน้าว่าง (BRD FR-RP-02)
  const gate = await gatePage(session, 'Q2')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return (
      <>
        <PageBreadcrumb title="เพิ่มประเภทงาน" />
        <NoPermissionCard capability="Q2" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) return null
  if (!canUseAppointments({ kind: active.kind, vertical: active.shop.vertical })) notFound()

  return (
    <>
      <PageBreadcrumb title="เพิ่มประเภทงาน" subtitle="ประเภทงาน" />
      <ResourceForm />
    </>
  )
}
