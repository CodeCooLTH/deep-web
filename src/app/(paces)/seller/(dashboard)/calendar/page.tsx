/**
 * ปฏิทินการจอง (feature 00017 Phase 2, FR-LODG-09)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/page.tsx (โครง gate + PageBreadcrumb เดียวกัน)
 *
 * IMPORTANT: gate ด้วย vertical เองที่ระดับหน้า — การซ่อนเมนูไม่ใช่การควบคุมสิทธิ์ (BR-LODG-03)
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { listRooms } from '@/services/room.service'
import BookingCalendar from './components/BookingCalendar'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'

export const metadata: Metadata = { title: 'ปฏิทินการจอง' }

export default async function CalendarPage() {
  const session = await getServerSession(authOptions)
  // 00071 P3 (Q1): บทบาทที่ไม่มีสิทธิ์เห็นการ์ดบอกเหตุผล ไม่ใช่หน้าว่าง/404 เงียบ — ตัดก่อน query ข้อมูลของหน้า
  const gate = await gatePage(session, 'Q1')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return (
      <>
        <PageBreadcrumb title="ห้องพัก" />
        <NoPermissionCard capability="Q1" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }
  if (!session?.user) return null

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) return null
  if (active.shop.vertical !== 'LODGING') notFound()

  // ส่งเฉพาะ id/name ไปให้ dropdown กรอง — ข้อมูลการจองโหลดฝั่ง client ตามเดือนที่มองเห็น
  // (ไม่ preload ทั้งปีมาใน payload)
  const rooms = await listRooms(active.shop.id, { activeOnly: true })

  return (
    <>
      <PageBreadcrumb title="ปฏิทินการจอง" subtitle="ห้องพัก" />
      <BookingCalendar rooms={rooms.map((r) => ({ id: r.id, name: r.name }))} />
    </>
  )
}
