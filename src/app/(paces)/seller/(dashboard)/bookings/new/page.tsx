/**
 * สร้างการจอง (feature 00017 Phase 2, FR-LODG-08)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/new/page.tsx (โครง gate + PageBreadcrumb เดียวกัน)
 *
 * IMPORTANT: gate ด้วย vertical เองที่ระดับหน้า (BR-LODG-03)
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { listRooms, serializeRoom } from '@/services/room.service'
import BookingForm from '../components/BookingForm'

export const metadata: Metadata = { title: 'สร้างการจอง' }

export default async function NewBookingPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) return null
  if (active.shop.vertical !== 'LODGING') notFound()

  // เฉพาะห้องที่เปิดรับจอง — ห้องที่ปิดไว้ต้องไม่ปรากฏให้เลือก (BR-LODG-07)
  const rooms = await listRooms(active.shop.id, { activeOnly: true })

  return (
    <>
      <PageBreadcrumb title="สร้างการจอง" subtitle="การจอง" />
      <BookingForm
        rooms={rooms.map((r) => {
          const s = serializeRoom(r)
          return { id: s.id, name: s.name, pricePerNight: s.pricePerNight }
        })}
      />
    </>
  )
}
