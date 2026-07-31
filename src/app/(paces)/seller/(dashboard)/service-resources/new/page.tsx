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
import { canUseAppointments, type AppointmentGranularity } from '@/lib/appointments'
import { requireActiveShop } from '@/lib/shop-context'
import ResourceForm from '../components/ResourceForm'

export const metadata: Metadata = { title: 'เพิ่มคิวงาน' }

export default async function NewServiceResourcePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) return null
  if (!canUseAppointments({ kind: active.kind, vertical: active.shop.vertical })) notFound()

  return (
    <>
      <PageBreadcrumb title="เพิ่มคิวงาน" subtitle="คิวงาน" />
      <ResourceForm granularity={(active.shop.appointmentGranularity as AppointmentGranularity) ?? 'DAY'} />
    </>
  )
}
