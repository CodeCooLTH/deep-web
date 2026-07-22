/**
 * รายละเอียดการจอง (feature 00017 Phase 2)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/[roomId]/page.tsx (โครง gate + load + notFound)
 *
 * IMPORTANT: gate ด้วย vertical เองที่ระดับหน้า (BR-LODG-03) และ getBookingDetail
 * scope shopId ใน where ตั้งแต่ query แรก — การจองของร้านอื่นไม่ถูกอ่านขึ้นมาเลย
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import {
  getBookingDetail,
  toDateOnlyString,
  nightsBetween,
  BookingNotFoundError,
} from '@/services/booking.service'
import BookingDetail from './components/BookingDetail'

export const metadata: Metadata = { title: 'รายละเอียดการจอง' }

/** PDPA: แสดง 4 ตัวท้าย ปิดที่เหลือ — pattern เดียวกับหน้าลูกค้า */
function maskPhone(c: string | null): string | null {
  if (!c) return null
  if (c.length <= 4) return c
  return '•'.repeat(c.length - 4) + c.slice(-4)
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) return null
  if (active.shop.vertical !== 'LODGING') notFound()

  let b
  try {
    b = await getBookingDetail(active.shop.id, token)
  } catch (e) {
    if (e instanceof BookingNotFoundError) notFound()
    throw e
  }

  // สร้าง absolute URL ของลิงก์ผู้จองจาก host จริง (dev/prod คนละโดเมน)
  const h = await headers()
  const host = h.get('host') ?? ''
  const proto = host.startsWith('localhost') || host.includes('.local') ? 'http' : 'https'
  const publicHost = host.replace(/^seller\./, '')
  const publicUrl = `${proto}://${publicHost}/o/${b.publicToken}`

  return (
    <>
      <PageBreadcrumb title="รายละเอียดการจอง" subtitle="การจอง" />
      {/* IMPORTANT: neutralize PII ที่ server boundary — หน้า seller อยู่ใต้ client layout
          ข้อมูลทั้งก้อนจะถูก serialize ลง payload ต่อให้ไม่ได้แสดงผล จึงต้อง mask ที่ต้นทาง
          ไม่ใช่แค่ตอนแสดง (feedback_rsc_pii_neutralize_at_source) */}
      <BookingDetail
        booking={{
          token: b.publicToken,
          shortCode: b.shortCode,
          status: b.status,
          roomName: b.room?.name ?? '—',
          guestName: b.buyerName,
          guestContactMasked: maskPhone(b.buyerContact),
          checkIn: b.checkIn ? toDateOnlyString(b.checkIn) : null,
          checkOut: b.checkOut ? toDateOnlyString(b.checkOut) : null,
          nights: b.checkIn && b.checkOut ? nightsBetween(b.checkIn, b.checkOut) : null,
          totalAmount: b.totalAmount.toFixed(2),
          depositAmount: b.depositAmount?.toFixed(2) ?? null,
          slipFileId: b.slipFileId,
          cancelReason: b.cancelReason,
          internalNote: b.internalNote,
          publicUrl,
        }}
      />
    </>
  )
}
