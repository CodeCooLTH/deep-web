/**
 * ปฏิทินคิว — นัดหมายของร้าน (feature 00024, FR-RSV-04)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/page.tsx (โครง gate + PageBreadcrumb)
 *   + src/app/(paces)/seller/(dashboard)/bookings/page.tsx (โครง list การ์ด mobile / ตาราง desktop)
 *   ซึ่ง chase ต่อไปที่ theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/components/CustomerTable.tsx
 *
 * Design Spec: safepay-ux ส่วน B (2026-07-31)
 *
 * IMPORTANT: route นี้แยกจาก /calendar ของ feature 00017 โดยตั้งใจ — slug 'seller:calendar'
 * ถูก gate เป็น LODGING-only อยู่แล้ว ส่วนนี่เป็น BUSINESS+GENERAL เท่านั้น
 *
 * IMPORTANT: gate ด้วย canUseAppointments เองที่ระดับหน้า การซ่อนเมนูไม่ใช่การควบคุมสิทธิ์
 * (BR-RSV-02)
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { canUseAppointments } from '@/lib/appointments'
import { requireActiveShop } from '@/lib/shop-context'
import { listServiceResources } from '@/services/service-resource.service'
import AppointmentCalendar from './components/AppointmentCalendar'

export const metadata: Metadata = { title: 'ปฏิทินคิว' }

export default async function AppointmentsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) return null
  if (!canUseAppointments({ kind: active.kind, vertical: active.shop.vertical })) notFound()

  // ตัวเลือกของตัวกรอง — เอาเฉพาะที่ยังเปิดใช้งาน เพราะกรองด้วยทรัพยากรที่ปิดแล้วไม่มีประโยชน์
  // ส่งแค่ id/name/capacity ที่ตัวกรองใช้จริง ไม่ส่งทั้ง object (หน้านี้อยู่ใต้ client layout)
  const resources = await listServiceResources(active.shop.id, { activeOnly: true })

  return (
    <>
      <PageBreadcrumb title="ปฏิทินคิว" />
      <AppointmentCalendar
        resources={resources.map((r) => ({
          id: r.id,
          name: r.name,
          capacity: r.capacity,
        }))}
      />
    </>
  )
}
