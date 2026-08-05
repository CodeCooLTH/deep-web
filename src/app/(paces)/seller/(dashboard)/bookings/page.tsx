/**
 * รายการจอง (feature 00017 Phase 2)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/page.tsx (โครง gate + PageBreadcrumb เดียวกัน)
 *   การ์ด mobile / ตาราง desktop chase จาก rooms/components/RoomList.tsx
 *
 * IMPORTANT: gate ด้วย vertical เองที่ระดับหน้า (BR-LODG-03)
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { listBookings, toDateOnlyString, nightsBetween } from '@/services/booking.service'
import { formatDateTH } from '@/lib/format-date'

export const metadata: Metadata = { title: 'การจอง' }

/**
 * สีสถานะ — IMPORTANT: "รอยืนยัน" ห้ามเป็นเขียว
 * สีเขียว verified ของระบบสงวนไว้สำหรับ "ยืนยันแล้ว" เท่านั้น (Verified-Means-Green)
 * การจองที่ล็อกคิวแล้วดูเหมือนสำเร็จ แต่ยังไม่ได้รับเงิน — ใช้เขียวจะหลอกตาเจ้าของเอง
 */
const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'รอยืนยัน', cls: 'bg-warning/15 text-warning' },
  CONFIRMED: { label: 'ยืนยันแล้ว', cls: 'bg-success/15 text-success' },
  CANCELLED: { label: 'ยกเลิก', cls: 'bg-default-200 text-default-600' },
}

function baht(v: string): string {
  return Number(v).toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

export default async function BookingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) return null
  if (active.shop.vertical !== 'LODGING') notFound()

  const raw = await listBookings(active.shop.id)

  // serialize ที่ server boundary — Decimal/Date ข้าม RSC ไม่ได้
  // PII: ไม่ส่ง buyerContact (เบอร์โทร) มาที่หน้ารายการเลย ไม่ได้ใช้แสดงผล
  const bookings = raw.map((b) => ({
    token: b.publicToken,
    roomName: b.room?.name ?? '—',
    guestName: b.buyerName,
    checkIn: b.checkIn ? toDateOnlyString(b.checkIn) : null,
    checkOut: b.checkOut ? toDateOnlyString(b.checkOut) : null,
    nights: b.checkIn && b.checkOut ? nightsBetween(b.checkIn, b.checkOut) : null,
    totalAmount: b.totalAmount.toFixed(2),
    depositAmount: b.depositAmount?.toFixed(2) ?? null,
    status: b.status,
    hasSlip: !!b.slipFileId,
  }))

  const pendingCount = bookings.filter((b) => b.status === 'PENDING').length

  return (
    <>
      {/* desktop เท่านั้น — ตรงกับพี่น้อง /orders (มือถือมีชื่อหน้าใน SellerMobileHeader แล้ว กันซ้ำ) */}
      <div className="hidden lg:block">
        <PageBreadcrumb title="การจอง" />
        {/* คู่ขนานกับ /orders ที่มี "บิลเข้าพัก — ยอดเงินและการชำระ..." — ร้านบ้านพักเห็นสองหน้านี้
            พร้อมกัน ต้องอ่านแล้วแยกออกโดยไม่ต้องกดเข้าไปลอง (00030 UX-Copy §6) — เขียน <p> sibling
            ห้ามใช้ prop subtitle ของ PageBreadcrumb (prop นั้นคือ breadcrumb crumb ไม่ใช่คำอธิบาย) */}
        <p className="text-default-400 text-xs mt-0.5">
          การจองห้องพัก — วันเข้าพักและห้องที่กันไว้
        </p>
      </div>

      <div className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="card-title">การจองทั้งหมด</h4>
            <p className="text-default-500 mt-0.5 text-sm">
              {bookings.length} รายการ · รอยืนยัน {pendingCount}
            </p>
          </div>
          <Link href="/bookings/new" className="btn bg-primary min-h-11 text-white hover:bg-primary-hover">
            <Icon icon="tabler:plus" className="me-1 size-4" />
            สร้างการจอง
          </Link>
        </div>

        {bookings.length === 0 ? (
          <div className="card-body flex flex-col items-center gap-3 py-12 text-center">
            <div className="bg-default-100 flex size-14 items-center justify-center rounded-full">
              <Icon icon="tabler:calendar-event" className="text-default-400 size-7" />
            </div>
            <div>
              <h5 className="text-default-800 font-medium">ยังไม่มีการจอง</h5>
              <p className="text-default-500 mt-1 text-sm">สร้างการจองแรกแล้วส่งลิงก์ให้ผู้จอง</p>
            </div>
            <Link href="/bookings/new" className="btn bg-primary text-white hover:bg-primary-hover">
              สร้างการจอง
            </Link>
          </div>
        ) : (
          <>
            {/* mobile: การ์ด */}
            <div className="divide-default-200 divide-y lg:hidden">
              {bookings.map((b) => (
                <Link key={b.token} href={`/bookings/${b.token}`} className="block p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-default-800 font-medium">{b.guestName ?? 'ไม่ระบุชื่อ'}</p>
                      <p className="text-default-600 mt-0.5 text-sm">{b.roomName}</p>
                      <p className="text-default-500 mt-0.5 text-sm">
                        {b.checkIn ? formatDateTH(new Date(b.checkIn)) : '—'}
                        {b.nights ? ` · ${b.nights} คืน` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <span className={`badge ${STATUS[b.status]?.cls ?? ''}`}>
                        {STATUS[b.status]?.label ?? b.status}
                      </span>
                      <p className="text-default-700 mt-1 text-sm">฿{baht(b.totalAmount)}</p>
                      {b.status === 'PENDING' && b.hasSlip && (
                        <p className="text-warning mt-0.5 text-xs">มีสลิปรอตรวจ</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* desktop: ตาราง */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="table w-full">
                <thead>
                  <tr>
                    {['ผู้จอง', 'ห้องพัก', 'เข้าพัก', 'คืน', 'ยอดรวม', 'มัดจำ', 'สถานะ'].map((h) => (
                      <th key={h} className="text-default-500 px-4 py-3 text-start text-sm font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-default-200 divide-y">
                  {bookings.map((b) => (
                    <tr key={b.token}>
                      <td className="px-4 py-3">
                        <Link href={`/bookings/${b.token}`} className="text-default-800 font-medium">
                          {b.guestName ?? 'ไม่ระบุชื่อ'}
                        </Link>
                      </td>
                      <td className="text-default-700 px-4 py-3">{b.roomName}</td>
                      <td className="text-default-700 px-4 py-3">
                        {b.checkIn ? formatDateTH(new Date(b.checkIn)) : '—'}
                      </td>
                      <td className="text-default-700 px-4 py-3">{b.nights ?? '—'}</td>
                      <td className="text-default-700 px-4 py-3">฿{baht(b.totalAmount)}</td>
                      <td className="text-default-700 px-4 py-3">
                        {b.depositAmount ? `฿${baht(b.depositAmount)}` : '—'}
                        {b.status === 'PENDING' && b.hasSlip && (
                          <span className="text-warning ms-1 text-xs">มีสลิป</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${STATUS[b.status]?.cls ?? ''}`}>
                          {STATUS[b.status]?.label ?? b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  )
}
