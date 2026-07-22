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

export const metadata: Metadata = { title: 'ปฏิทินการจอง' }

export default async function CalendarPage() {
  const session = await getServerSession(authOptions)
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
