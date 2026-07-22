'use client'

/**
 * RoomList — รายการห้องพัก (feature 00017 Phase 1)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/components/CustomerTable.tsx
 *   — chase ผ่าน src/app/(paces)/seller/(dashboard)/customers/components/CustomerTable.tsx
 *   โครง: .card > .card-header (title + action) > ตาราง desktop / การ์ด mobile
 *
 * Design Spec §3. client component เพราะมี action menu + Sweet Alerts confirm
 */

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { ROOM_FACILITIES, type RoomFacilityKey } from '@/lib/lodging'
import type { SerializedRoom } from '@/services/room.service'

type Props = { rooms: SerializedRoom[] }

/** ราคาไทยแบบมีคั่นหลักพัน — ตัดทศนิยม .00 ทิ้งเพราะราคาห้องเป็นจำนวนเต็มแทบทุกกรณี */
function formatPrice(value: string): string {
  const n = Number(value)
  return n.toLocaleString('th-TH', { maximumFractionDigits: n % 1 === 0 ? 0 : 2 })
}

function RoomThumb({ room }: { room: SerializedRoom }) {
  const first = room.images[0]
  if (!first) {
    // ไม่มีรูป → placeholder ที่มี icon ไม่ใช่กล่องขาวเปล่า (Design Spec §6)
    return (
      <div className="bg-default-100 flex size-16 shrink-0 items-center justify-center rounded-lg">
        <Icon icon="tabler:photo" className="text-default-400 size-6" />
      </div>
    )
  }
  return (
    <Image
      src={`/api/files/${first}`}
      alt={room.name}
      width={64}
      height={64}
      className="size-16 shrink-0 rounded-lg object-cover"
    />
  )
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  // Verified-Means-Green: เขียว = "เปิดรับจอง" (ยืนยันแล้วว่าใช้งานได้จริง)
  // ปิดรับจองใช้สีกลาง ไม่ใช่ danger — เป็นการตัดสินใจปกติของเจ้าของ ไม่ใช่ error
  return isActive ? (
    <span className="badge bg-success/15 text-success">เปิดรับจอง</span>
  ) : (
    <span className="badge bg-default-200 text-default-600">ปิดรับจอง</span>
  )
}

function FacilityIcons({ facilities }: { facilities: string[] }) {
  const known = facilities.filter((f): f is RoomFacilityKey => f in ROOM_FACILITIES)
  if (known.length === 0) return <span className="text-default-400 text-sm">—</span>
  const shown = known.slice(0, 5)
  return (
    <div className="flex items-center gap-1.5">
      {/* Icon wrapper ไม่รับ prop title — ห่อ span เพื่อให้ได้ tooltip + ชื่อสำหรับ screen reader */}
      {shown.map((key) => (
        <span key={key} title={ROOM_FACILITIES[key].label} aria-label={ROOM_FACILITIES[key].label}>
          <Icon icon={ROOM_FACILITIES[key].icon} className="text-default-500 size-4" />
        </span>
      ))}
      {known.length > shown.length && (
        <span className="text-default-500 text-sm">+{known.length - shown.length}</span>
      )}
    </div>
  )
}

export default function RoomList({ rooms }: Props) {
  const [items, setItems] = useState(rooms)
  const [busyId, setBusyId] = useState<string | null>(null)
  const activeCount = items.filter((r) => r.isActive).length

  async function toggleActive(room: SerializedRoom) {
    const turningOff = room.isActive
    if (turningOff) {
      // blocking confirm → Sweet Alerts (ไม่ใช่ toast) ตาม convention ของโปรเจกต์
      const { default: Swal } = await import('sweetalert2')
      const res = await Swal.fire({
        title: 'ปิดรับจองห้องนี้?',
        text: `${room.name} จะไม่ปรากฏบนโปรไฟล์ร้านและสร้างการจองใหม่ไม่ได้ การจองเดิมยังอยู่ครบ`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ปิดรับจอง',
        cancelButtonText: 'ยกเลิก',
        buttonsStyling: false,
        customClass: {
          confirmButton: 'btn bg-danger text-white hover:bg-danger-hover',
          cancelButton: 'btn bg-default-200 text-default-800 ms-2',
        },
      })
      if (!res.isConfirmed) return
    }

    setBusyId(room.id)
    try {
      const r = await fetch(`/api/shops/current/rooms/${room.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !room.isActive }),
        cache: 'no-store',
      })
      if (!r.ok) {
        pacesToast.error('บันทึกไม่สำเร็จ ลองอีกครั้ง')
        return
      }
      const updated: SerializedRoom = await r.json()
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      pacesToast.success(updated.isActive ? 'เปิดรับจองแล้ว' : 'ปิดรับจองแล้ว')
    } catch {
      pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
    } finally {
      setBusyId(null)
    }
  }

  if (items.length === 0) {
    return (
      <div className="card">
        <div className="card-body flex flex-col items-center justify-center gap-3 py-12 text-center">
          <div className="bg-default-100 flex size-14 items-center justify-center rounded-full">
            <Icon icon="tabler:building-cottage" className="text-default-400 size-7" />
          </div>
          <div>
            <h5 className="text-default-800 font-medium">ยังไม่มีห้องพัก</h5>
            <p className="text-default-500 mt-1 text-sm">เพิ่มห้องแรกเพื่อเริ่มรับจอง</p>
          </div>
          <Link href="/rooms/new" className="btn bg-primary text-white hover:bg-primary-hover">
            <Icon icon="tabler:plus" className="me-1 size-4" />
            เพิ่มห้องพัก
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <div>
          <h4 className="card-title">ห้องพัก</h4>
          <p className="text-default-500 mt-0.5 text-sm">
            {items.length} ห้อง · เปิดรับจอง {activeCount}
          </p>
        </div>
        <Link href="/rooms/new" className="btn bg-primary text-white hover:bg-primary-hover">
          <Icon icon="tabler:plus" className="me-1 size-4" />
          เพิ่มห้องพัก
        </Link>
      </div>

      {/* mobile: การ์ดต่อห้อง */}
      <div className="divide-default-200 divide-y lg:hidden">
        {items.map((room) => (
          <div key={room.id} className="flex items-start gap-3 p-4">
            <RoomThumb room={room} />
            <div className="min-w-0 flex-1">
              <Link href={`/rooms/${room.id}`} className="text-default-800 block font-medium">
                {room.name}
              </Link>
              <p className="text-default-600 mt-0.5 text-sm">
                ฿{formatPrice(room.pricePerNight)}/คืน
                {room.maxGuests ? ` · ${room.maxGuests} คน` : ''}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <StatusBadge isActive={room.isActive} />
                <button
                  type="button"
                  onClick={() => toggleActive(room)}
                  disabled={busyId === room.id}
                  className="btn bg-default-100 text-default-700 hover:bg-default-200 min-h-11 px-3 text-sm"
                >
                  {room.isActive ? 'ปิดรับจอง' : 'เปิดรับจอง'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* desktop: ตาราง */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="table w-full">
          <thead>
            <tr>
              <th className="text-default-500 px-4 py-3 text-start text-sm font-medium">ห้องพัก</th>
              <th className="text-default-500 px-4 py-3 text-start text-sm font-medium">ราคา/คืน</th>
              <th className="text-default-500 px-4 py-3 text-start text-sm font-medium">ผู้เข้าพัก</th>
              <th className="text-default-500 px-4 py-3 text-start text-sm font-medium">สิ่งอำนวยความสะดวก</th>
              <th className="text-default-500 px-4 py-3 text-start text-sm font-medium">สถานะ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-default-200 divide-y">
            {items.map((room) => (
              <tr key={room.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <RoomThumb room={room} />
                    <Link href={`/rooms/${room.id}`} className="text-default-800 font-medium">
                      {room.name}
                    </Link>
                  </div>
                </td>
                <td className="text-default-700 px-4 py-3">฿{formatPrice(room.pricePerNight)}</td>
                <td className="text-default-700 px-4 py-3">{room.maxGuests ?? '—'}</td>
                <td className="px-4 py-3">
                  <FacilityIcons facilities={room.facilities} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge isActive={room.isActive} />
                </td>
                <td className="px-4 py-3 text-end">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/rooms/${room.id}`}
                      className="btn bg-default-100 text-default-700 hover:bg-default-200 px-3 text-sm"
                    >
                      แก้ไข
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleActive(room)}
                      disabled={busyId === room.id}
                      className="btn bg-default-100 text-default-700 hover:bg-default-200 px-3 text-sm"
                    >
                      {room.isActive ? 'ปิดรับจอง' : 'เปิดรับจอง'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
