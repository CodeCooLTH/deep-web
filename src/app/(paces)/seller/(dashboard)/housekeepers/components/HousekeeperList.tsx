'use client'

/**
 * HousekeeperList — จัดการรายชื่อแม่บ้าน (feature 00017 P3, FR-LODG-19)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/components/RoomList.tsx
 *   (โครง .card + การ์ด/แถว + pacesToast + Sweet Alerts เดียวกัน)
 */

import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'

export type HousekeeperRow = { id: string; name: string; phone: string; isActive: boolean }

export default function HousekeeperList({ initial }: { initial: HousekeeperRow[] }) {
  const [items, setItems] = useState(initial)
  const [busy, setBusy] = useState(false)

  async function addOne() {
    const { default: Swal } = await import('sweetalert2')
    const res = await Swal.fire({
      title: 'เพิ่มแม่บ้าน',
      html:
        '<input id="hk-name" class="swal2-input" placeholder="ชื่อ">' +
        '<input id="hk-phone" class="swal2-input" placeholder="เบอร์โทร" inputmode="numeric">',
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'เพิ่ม',
      cancelButtonText: 'ยกเลิก',
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover',
        cancelButton: 'btn bg-default-200 text-default-800 ms-2',
      },
      preConfirm: () => {
        const name = (document.getElementById('hk-name') as HTMLInputElement)?.value.trim()
        const phone = (document.getElementById('hk-phone') as HTMLInputElement)?.value.trim()
        if (!name) return Swal.showValidationMessage('กรอกชื่อแม่บ้าน')
        if (!/^0\d{8,9}$/.test(phone)) return Swal.showValidationMessage('เบอร์โทรไม่ถูกต้อง')
        return { name, phone }
      },
    })
    if (!res.isConfirmed || !res.value) return

    setBusy(true)
    try {
      const r = await fetch('/api/shops/current/housekeepers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(res.value),
        cache: 'no-store',
      })
      if (!r.ok) {
        pacesToast.error('เพิ่มไม่สำเร็จ ลองอีกครั้ง')
        return
      }
      const created: HousekeeperRow = await r.json()
      setItems((prev) => [...prev, created])
      pacesToast.success('เพิ่มแม่บ้านแล้ว')
    } catch {
      pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(hk: HousekeeperRow) {
    setBusy(true)
    try {
      const r = await fetch(`/api/shops/current/housekeepers/${hk.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !hk.isActive }),
        cache: 'no-store',
      })
      if (!r.ok) {
        pacesToast.error('บันทึกไม่สำเร็จ ลองอีกครั้ง')
        return
      }
      const updated: HousekeeperRow = await r.json()
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
    } catch {
      pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h4 className="card-title">รายชื่อแม่บ้าน</h4>
        <button
          type="button"
          onClick={addOne}
          disabled={busy}
          className="btn bg-primary min-h-11 text-white hover:bg-primary-hover"
        >
          <Icon icon="tabler:plus" className="me-1 size-4" />
          เพิ่มแม่บ้าน
        </button>
      </div>

      {items.length === 0 ? (
        <div className="card-body flex flex-col items-center gap-3 py-12 text-center">
          <div className="bg-default-100 flex size-14 items-center justify-center rounded-full">
            <Icon icon="tabler:users" className="text-default-400 size-7" />
          </div>
          <div>
            <h5 className="text-default-800 font-medium">ยังไม่มีรายชื่อแม่บ้าน</h5>
            <p className="text-default-500 mt-1 text-sm">
              เพิ่มรายชื่อไว้เพื่อมอบหมายงานทำความสะอาดให้แต่ละการจอง
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-default-200 divide-y">
          {items.map((hk) => (
            <div key={hk.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-default-800 font-medium">{hk.name}</p>
                <p className="text-default-500 text-sm">{hk.phone}</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`badge ${
                    hk.isActive ? 'bg-success/15 text-success' : 'bg-default-200 text-default-600'
                  }`}
                >
                  {hk.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                </span>
                <button
                  type="button"
                  onClick={() => toggleActive(hk)}
                  disabled={busy}
                  className="btn bg-default-100 text-default-700 hover:bg-default-200 min-h-11 px-3 text-sm"
                >
                  {hk.isActive ? 'ปิด' : 'เปิด'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
