'use client'

/**
 * BookingDetail — รายละเอียดการจอง + ตรวจสลิป + ยืนยัน/ยกเลิก (feature 00017 P2, FR-LODG-12/16)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/components/RoomList.tsx
 *   (โครง .card + Sweet Alerts confirm + pacesToast + pattern เรียก API เดียวกัน)
 *
 * IMPORTANT: การยืนยันการจองทำผ่าน /api/shops/current/bookings/[token]/confirm เท่านั้น
 * (endpoint ของ "เจ้าของ") — /api/orders/[token]/confirm เดิมที่ผู้ซื้อกดถูก guard
 * ให้ปฏิเสธการจองแล้ว มิฉะนั้นผู้จองจะยืนยันเองได้โดยไม่ต้องโอนเงิน (TFR-006)
 */

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { CANCEL_REASONS, CANCEL_REASON_KEYS } from '@/lib/lodging'
import { formatDateTH } from '@/lib/format-date'

export type BookingDetailData = {
  token: string
  shortCode: string | null
  status: string
  roomName: string
  guestName: string | null
  /**
   * เบอร์ผู้เข้าพัก — **เต็ม ไม่ปิดบัง** ตั้งแต่ 2026-08-24 (D-13)
   *
   * 🛑 เดิมชื่อ `guestContactMasked` — เปลี่ยนชื่อพร้อมกับมติเพราะฟิลด์ชื่อ "Masked"
   * ที่ถือค่าเต็มคือกับดักที่รอให้คนถัดไปเชื่อชื่อแล้วเอาไปโชว์ในที่ที่ไม่ควรโชว์
   * (เหตุผลของมติอยู่ที่ `src/lib/seller-contact-display.ts`)
   */
  guestContact: string | null
  checkIn: string | null
  checkOut: string | null
  nights: number | null
  totalAmount: string
  depositAmount: string | null
  slipFileId: string | null
  cancelReason: string | null
  internalNote: string | null
  publicUrl: string
  // feature 00017 P3 — งานแม่บ้าน
  housekeeperId: string | null
  housekeepingStatus: string | null
}

export type HousekeeperOption = { id: string; name: string }

const STATUS: Record<string, { label: string; cls: string }> = {
  // "รอยืนยัน" ต้องไม่เป็นเขียว — ยังไม่ได้รับเงิน (Verified-Means-Green)
  PENDING: { label: 'รอยืนยัน', cls: 'bg-warning/15 text-warning' },
  CONFIRMED: { label: 'ยืนยันแล้ว', cls: 'bg-success/15 text-success' },
  CANCELLED: { label: 'ยกเลิกแล้ว', cls: 'bg-default-200 text-default-600' },
}

function baht(v: string): string {
  return Number(v).toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

export default function BookingDetail({
  booking,
  housekeepers,
}: {
  booking: BookingDetailData
  housekeepers: HousekeeperOption[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [showSlip, setShowSlip] = useState(false)
  const [hkId, setHkId] = useState(booking.housekeeperId ?? '')
  const [hkStatus, setHkStatus] = useState(booking.housekeepingStatus)

  async function assignHk(id: string) {
    setBusy(true)
    try {
      const r = await fetch(`/api/shops/current/bookings/${booking.token}/housekeeping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ housekeeperId: id || null }),
        cache: 'no-store',
      })
      if (!r.ok) { pacesToast.error('มอบหมายไม่สำเร็จ ลองอีกครั้ง'); return }
      const d = (await r.json()) as { housekeeperId: string | null; housekeepingStatus: string | null }
      setHkId(d.housekeeperId ?? '')
      setHkStatus(d.housekeepingStatus)
      pacesToast.success(id ? 'มอบหมายแม่บ้านแล้ว' : 'ยกเลิกการมอบหมายแล้ว')
    } catch { pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง') } finally { setBusy(false) }
  }

  async function toggleHkStatus() {
    const next = hkStatus === 'DONE' ? 'PENDING' : 'DONE'
    setBusy(true)
    try {
      const r = await fetch(`/api/shops/current/bookings/${booking.token}/housekeeping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
        cache: 'no-store',
      })
      if (!r.ok) { pacesToast.error('อัปเดตไม่สำเร็จ ลองอีกครั้ง'); return }
      const d = (await r.json()) as { housekeepingStatus: string | null }
      setHkStatus(d.housekeepingStatus)
    } catch { pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง') } finally { setBusy(false) }
  }

  const deposit = Number(booking.depositAmount ?? 0)
  const remaining = Number(booking.totalAmount) - deposit
  const isPending = booking.status === 'PENDING'
  const needsSlip = deposit > 0

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(booking.publicUrl)
      pacesToast.success('คัดลอกลิงก์แล้ว ส่งให้ผู้จองได้เลย')
    } catch {
      pacesToast.error('คัดลอกไม่ได้ กดค้างที่ลิงก์เพื่อคัดลอกแทน')
    }
  }

  async function confirm() {
    const { default: Swal } = await import('sweetalert2')
    const res = await Swal.fire({
      title: 'ยืนยันการจองนี้?',
      // เตือนให้ตรวจยอดในบัญชีจริงก่อน — ระบบไม่รับประกันความถูกต้องของสลิป (BR-LODG-20)
      text: needsSlip
        ? 'ตรวจยอดเงินในบัญชีของคุณให้ตรงกับสลิปก่อนยืนยัน ระบบไม่ได้ตรวจสอบสลิปให้'
        : 'การจองนี้ไม่มีมัดจำ ยืนยันได้เลย',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ยืนยันการจอง',
      cancelButtonText: 'ยังไม่ยืนยัน',
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn bg-success text-white hover:bg-success-hover',
        cancelButton: 'btn bg-default-200 text-default-800 ms-2',
      },
    })
    if (!res.isConfirmed) return

    setBusy(true)
    try {
      const r = await fetch(`/api/shops/current/bookings/${booking.token}/confirm`, {
        method: 'POST',
        cache: 'no-store',
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        const map: Record<string, string> = {
          SLIP_REQUIRED: 'ยังไม่มีสลิปการโอน ตรวจยอดเงินในบัญชีก่อนยืนยัน',
          INVALID_TRANSITION: 'รายการนี้อยู่ในสถานะที่ทำรายการนั้นไม่ได้แล้ว',
          NOT_FOUND: 'ไม่พบรายการนี้',
        }
        pacesToast.error(map[d?.error as string] ?? 'ยืนยันไม่สำเร็จ ลองอีกครั้ง')
        return
      }
      pacesToast.success('ยืนยันการจองแล้ว ผู้จองเห็นใบจองได้ทันที')
      router.refresh()
    } catch {
      pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    const { default: Swal } = await import('sweetalert2')
    // เจ้าของยกเลิกได้ทั้งกรณีผู้จองผิดและร้านผิดเอง — ต้องถามเหตุผททุกครั้ง
    // ไม่งั้นผู้จองอาจติดประวัติทั้งที่ไม่ได้ทำอะไรผิด (BR-LODG-36/37)
    const options = Object.fromEntries(
      CANCEL_REASON_KEYS.map((k) => [k, CANCEL_REASONS[k].label]),
    )
    const res = await Swal.fire({
      title: 'ยกเลิกการจองนี้?',
      text: 'เลือกเหตุผล — คิวจะถูกปล่อยคืนทันที',
      icon: 'warning',
      input: 'select',
      inputOptions: options,
      inputPlaceholder: 'เลือกเหตุผล',
      inputValidator: (v) => (v ? undefined : 'เลือกเหตุผลก่อนยกเลิกการจอง'),
      showCancelButton: true,
      confirmButtonText: 'ยกเลิกการจอง',
      cancelButtonText: 'ไม่ยกเลิก',
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn bg-danger text-white hover:bg-danger-hover',
        cancelButton: 'btn bg-default-200 text-default-800 ms-2',
      },
    })
    if (!res.isConfirmed || !res.value) return

    setBusy(true)
    try {
      const r = await fetch(`/api/orders/${booking.token}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: res.value }),
        cache: 'no-store',
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        pacesToast.error(d?.error ?? 'ยกเลิกไม่สำเร็จ ลองอีกครั้ง')
        return
      }
      pacesToast.success('ยกเลิกการจองแล้ว คิวถูกปล่อยคืนแล้ว')
      router.refresh()
    } catch {
      pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="card">
        <div className="card-header flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="card-title">{booking.guestName ?? 'ไม่ระบุชื่อ'}</h4>
            <p className="text-default-500 mt-0.5 text-sm">
              {booking.roomName}
              {booking.shortCode ? ` · รหัส ${booking.shortCode}` : ''}
            </p>
          </div>
          <span className={`badge ${STATUS[booking.status]?.cls ?? ''}`}>
            {STATUS[booking.status]?.label ?? booking.status}
          </span>
        </div>

        <div className="card-body">
          <dl className="gap-base grid grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-default-500 text-sm">เข้าพัก</dt>
              <dd className="text-default-800">
                {booking.checkIn ? formatDateTH(new Date(booking.checkIn)) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-default-500 text-sm">เช็คเอาท์</dt>
              <dd className="text-default-800">
                {booking.checkOut ? formatDateTH(new Date(booking.checkOut)) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-default-500 text-sm">จำนวนคืน</dt>
              <dd className="text-default-800">{booking.nights ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-default-500 text-sm">เบอร์ผู้จอง</dt>
              <dd className="text-default-800">{booking.guestContact ?? '—'}</dd>
            </div>
          </dl>

          {booking.internalNote && (
            <div className="bg-default-50 border-default-200 mt-4 rounded-lg border p-3">
              <p className="text-default-500 text-sm">บันทึกภายใน (ผู้จองไม่เห็น)</p>
              <p className="text-default-800 mt-1 text-sm whitespace-pre-wrap">{booking.internalNote}</p>
            </div>
          )}

          {booking.status === 'CANCELLED' && booking.cancelReason && (
            <div className="bg-default-100 mt-4 rounded-lg p-3">
              <p className="text-default-700 text-sm">
                ยกเลิกเพราะ:{' '}
                {CANCEL_REASONS[booking.cancelReason as keyof typeof CANCEL_REASONS]?.label ??
                  booking.cancelReason}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h4 className="card-title">ยอดเงิน</h4>
        </div>
        <div className="card-body">
          <dl className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <dt className="text-default-600">ยอดรวม</dt>
              <dd className="text-default-800">฿{baht(booking.totalAmount)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-default-600">มัดจำ</dt>
              <dd className="text-default-800">
                {booking.depositAmount ? `฿${baht(booking.depositAmount)}` : 'ไม่เก็บมัดจำ'}
              </dd>
            </div>
            {deposit > 0 && (
              <div className="border-default-200 flex items-center justify-between border-t pt-2">
                <dt className="text-default-600">คงเหลือชำระวันเข้าพัก</dt>
                <dd className="text-default-800 font-medium">฿{baht(String(remaining))}</dd>
              </div>
            )}
          </dl>

          {needsSlip && (
            <div className="mt-4">
              <p className="text-default-500 mb-2 text-sm">สลิปการโอน</p>
              {booking.slipFileId ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowSlip((s) => !s)}
                    className="btn bg-default-100 text-default-700 hover:bg-default-200 min-h-11"
                  >
                    <Icon icon="tabler:receipt" className="me-1 size-4" />
                    {showSlip ? 'ซ่อนสลิป' : 'ดูสลิป'}
                  </button>
                  {showSlip && (
                    <div className="border-default-200 mt-3 overflow-hidden rounded-lg border">
                      <Image
                        src={`/api/files/${booking.slipFileId}`}
                        alt="สลิปการโอนของผู้จอง"
                        width={600}
                        height={800}
                        className="h-auto w-full object-contain"
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="text-default-500 text-sm">ผู้จองยังไม่ได้แนบสลิป</p>
              )}
            </div>
          )}
        </div>
      </div>

      {booking.status !== 'CANCELLED' && (
        <div className="card">
          <div className="card-header">
            <h4 className="card-title">งานแม่บ้าน</h4>
          </div>
          <div className="card-body">
            <div className="gap-base grid grid-cols-1 lg:grid-cols-2">
              <div>
                <label className="form-label">มอบหมายแม่บ้าน</label>
                {/* HR6: field ที่ bind state ใช้ form-select native */}
                <select
                  className="form-select"
                  value={hkId}
                  disabled={busy}
                  onChange={(e) => assignHk(e.target.value)}
                >
                  <option value="">ยังไม่มอบหมาย</option>
                  {housekeepers.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>

              {hkId && (
                <div>
                  <label className="form-label">สถานะงาน</label>
                  <div className="flex items-center gap-2">
                    <span
                      className={`badge ${
                        hkStatus === 'DONE'
                          ? 'bg-success/15 text-success'
                          : 'bg-warning/15 text-warning'
                      }`}
                    >
                      {hkStatus === 'DONE' ? 'เสร็จแล้ว' : 'รอทำ'}
                    </span>
                    <button
                      type="button"
                      onClick={toggleHkStatus}
                      disabled={busy}
                      className="btn bg-default-100 text-default-700 hover:bg-default-200 min-h-11 px-3 text-sm"
                    >
                      {hkStatus === 'DONE' ? 'ทำเครื่องหมายว่ายังไม่เสร็จ' : 'ทำเครื่องหมายว่าเสร็จแล้ว'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h4 className="card-title">ลิงก์สำหรับผู้จอง</h4>
        </div>
        <div className="card-body">
          <p className="text-default-500 mb-2 text-sm">
            ส่งลิงก์นี้ให้ผู้จอง เปิดดูรายละเอียด แนบสลิป และดูใบจองได้จากที่เดียว
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="bg-default-100 text-default-700 min-w-0 flex-1 truncate rounded px-3 py-2 text-sm">
              {booking.publicUrl}
            </code>
            <button
              type="button"
              onClick={copyLink}
              className="btn bg-default-100 text-default-700 hover:bg-default-200 min-h-11"
            >
              <Icon icon="tabler:copy" className="me-1 size-4" />
              คัดลอก
            </button>
          </div>
        </div>
      </div>

      {isPending && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="btn bg-default-200 text-default-800 min-h-11"
          >
            ยกเลิกการจอง
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="btn bg-success min-h-11 text-white hover:bg-success-hover"
          >
            {busy && <Icon icon="tabler:loader-2" className="me-1 size-4 animate-spin" />}
            ยืนยันการจอง
          </button>
        </div>
      )}
    </div>
  )
}
