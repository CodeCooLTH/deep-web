'use client'

/**
 * ResourceList — รายการคิวงานที่รับได้ (feature 00024, FR-RSV-01)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/components/RoomList.tsx
 *   — โครงเดียวกัน: .card > .card-header (title + action) > การ์ด mobile / ตาราง desktop
 *     ซึ่ง chase ต่อไปที่ theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/components/CustomerTable.tsx
 *   ตัดออกจากต้นแบบ: RoomThumb (คิวงานไม่มีรูป), FacilityIcons (ไม่มีสิ่งอำนวยความสะดวก)
 *   เพิ่ม: คอลัมน์ระยะเวลา/คิว/มัดจำ + ปุ่มลบ (ห้องพักลบไม่ได้จาก list)
 *
 * Design Spec: safepay-ux ส่วน A. client component เพราะมี Sweet Alerts + toggle state
 *
 * IMPORTANT: หน้านี้แสดงได้แค่ "รับพร้อมกัน N คิว" (ค่าที่ตั้งไว้) — ห้ามแสดง
 * "จองแล้ว X จาก Y" เพราะ API ของหน้านี้ไม่ได้คืนจำนวนนัดที่จองจริงมาด้วย
 * ตัวเลขแบบนั้นเป็นของหน้าปฏิทินคิว (FR-RSV-04)
 */

import { useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import type { SerializedServiceResource } from '@/services/service-resource.service'

type Props = { resources: SerializedServiceResource[] }

/** ยอดเงินไทยแบบมีคั่นหลักพัน — ตัด .00 ทิ้งเพราะมัดจำเป็นจำนวนเต็มแทบทุกกรณี */
function formatAmount(value: string): string {
  const n = Number(value)
  return n.toLocaleString('th-TH', { maximumFractionDigits: n % 1 === 0 ? 0 : 2 })
}

/** ข้อความมัดจำแบบสั้นสำหรับ list — 0 = ไม่เก็บ (BR-RSV-44) */
function depositLabel(resource: SerializedServiceResource): string {
  if (Number(resource.depositValue) === 0) return 'ไม่เก็บมัดจำ'
  return resource.depositMode === 'PERCENT'
    ? `มัดจำ ${formatAmount(resource.depositValue)}%`
    : `มัดจำ ฿${formatAmount(resource.depositValue)}`
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  // Verified-Means-Green: เขียว = "พร้อมรับนัดจริง"
  // ปิดใช้งานใช้สีกลาง ไม่ใช่ danger — เป็นการตัดสินใจปกติของเจ้าของ ไม่ใช่ error
  return isActive ? (
    <span className="badge bg-success/15 text-success">ใช้งานอยู่</span>
  ) : (
    <span className="badge bg-default-200 text-default-600">ปิดใช้งาน</span>
  )
}

export default function ResourceList({ resources }: Props) {
  const [items, setItems] = useState(resources)
  const [busyId, setBusyId] = useState<string | null>(null)
  const activeCount = items.filter((r) => r.isActive).length

  async function patchResource(
    id: string,
    body: Record<string, unknown>,
  ): Promise<SerializedServiceResource | null> {
    const res = await fetch(`/api/shops/current/service-resources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (!res.ok) return null
    return res.json()
  }

  /**
   * สลับเปิด/ปิดใช้งาน — ตั้งใจ "ไม่" confirm ต่างจากห้องพักของ 00017
   *
   * ห้องพักต้อง confirm เพราะปิดแล้วหายจากโปรไฟล์สาธารณะที่ผู้ซื้อเห็น (กระทบคนนอก)
   * คิวงานไม่มีหน้าสาธารณะแสดงรายการนี้เลย — ปิดแล้วแค่เลือกสำหรับนัดใหม่ไม่ได้
   * นัดเดิมไม่กระทบ (BR-RSV-07) เป็น setting ภายในล้วน จึงสลับได้ทันที
   */
  async function toggleActive(resource: SerializedServiceResource) {
    setBusyId(resource.id)
    try {
      const updated = await patchResource(resource.id, { isActive: !resource.isActive })
      if (!updated) {
        pacesToast.error('บันทึกไม่สำเร็จ ลองกดอีกครั้ง')
        return
      }
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      pacesToast.success(updated.isActive ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว')
    } catch {
      pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
    } finally {
      setBusyId(null)
    }
  }

  /**
   * ลบคิวงาน — blocking confirm ผ่าน Sweet Alerts ตาม convention ของโปรเจกต์
   *
   * ถ้า 409 RESOURCE_HAS_APPOINTMENTS → เปิด Swal ที่สองที่ "แก้ให้ได้เลย" ด้วยปุ่ม
   * ปิดการใช้งานแทน แทนที่จะบอกแค่ว่าทำไม่ได้แล้วปล่อยให้ผู้ใช้ไปหาทางเอง
   */
  async function removeResource(resource: SerializedServiceResource) {
    const { default: Swal } = await import('sweetalert2')
    const confirm = await Swal.fire({
      title: `ลบ${resource.name}?`,
      text: 'ลบออกจากรายการคิวงานที่รับได้ ถ้าต้องการใช้อีกภายหลังต้องเพิ่มใหม่',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn bg-danger text-white hover:bg-danger-hover',
        cancelButton: 'btn bg-default-200 text-default-800 ms-2',
      },
    })
    if (!confirm.isConfirmed) return

    setBusyId(resource.id)
    try {
      const res = await fetch(`/api/shops/current/service-resources/${resource.id}`, {
        method: 'DELETE',
        cache: 'no-store',
      })
      if (res.ok) {
        setItems((prev) => prev.filter((x) => x.id !== resource.id))
        pacesToast.success(`ลบ${resource.name}แล้ว`)
        return
      }

      const data = await res.json().catch(() => ({}))
      if (data?.error === 'RESOURCE_HAS_APPOINTMENTS') {
        const fallback = await Swal.fire({
          title: 'ลบไม่ได้',
          text: 'ลบไม่ได้เพราะยังมีนัดผูกอยู่ — ปิดการใช้งานแทนได้ คิวงานจะไม่ถูกเลือกสำหรับนัดใหม่ แต่นัดเดิมยังอยู่ครบ',
          icon: 'error',
          showCancelButton: true,
          confirmButtonText: 'ปิดการใช้งานแทน',
          cancelButtonText: 'ปิด',
          buttonsStyling: false,
          customClass: {
            confirmButton: 'btn bg-primary text-white hover:bg-primary-hover',
            cancelButton: 'btn bg-default-200 text-default-800 ms-2',
          },
        })
        if (fallback.isConfirmed && resource.isActive) {
          const updated = await patchResource(resource.id, { isActive: false })
          if (updated) {
            setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
            pacesToast.success('ปิดใช้งานแล้ว')
          } else {
            pacesToast.error('บันทึกไม่สำเร็จ ลองกดอีกครั้ง')
          }
        }
        return
      }
      pacesToast.error('ลบไม่สำเร็จ ลองกดอีกครั้ง')
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
            <Icon icon="tabler:armchair" className="text-default-400 size-7" />
          </div>
          <div>
            <h5 className="text-default-800 font-medium">ยังไม่มีคิวงานที่รับได้</h5>
            <p className="text-default-500 mt-1 text-sm">
              เพิ่มรายการแรกเพื่อเริ่มรับนัด เช่น ชื่อช่าง เตียง ห้อง หรือคลาส
            </p>
          </div>
          <Link
            href="/service-resources/new"
            className="btn bg-primary min-h-11 text-white hover:bg-primary-hover"
          >
            <Icon icon="tabler:plus" className="me-1 size-4" />
            เพิ่มคิวงาน
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <div>
          <h4 className="card-title">คิวงานที่รับได้</h4>
          <p className="text-default-500 mt-0.5 text-sm">
            {items.length} รายการ · ใช้งานอยู่ {activeCount}
          </p>
        </div>
        <Link
          href="/service-resources/new"
          className="btn bg-primary min-h-11 text-white hover:bg-primary-hover"
        >
          <Icon icon="tabler:plus" className="me-1 size-4" />
          เพิ่มคิวงาน
        </Link>
      </div>

      {/* mobile: การ์ดต่อคิวงาน */}
      <div className="divide-default-200 divide-y lg:hidden">
        {items.map((resource) => (
          <div key={resource.id} className="p-4">
            <Link
              href={`/service-resources/${resource.id}`}
              className="text-default-800 block truncate font-medium"
            >
              {resource.name}
            </Link>
            {resource.description && (
              <p className="text-default-500 mt-0.5 truncate text-sm">{resource.description}</p>
            )}
            <p className="text-default-600 mt-0.5 text-sm">
              {resource.durationMinutes ? `${resource.durationMinutes} นาที · ` : ''}
              รับพร้อมกัน {resource.capacity} คิว · {depositLabel(resource)}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <StatusBadge isActive={resource.isActive} />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleActive(resource)}
                  disabled={busyId === resource.id}
                  className="btn bg-default-100 text-default-700 hover:bg-default-200 min-h-11 px-3 text-sm"
                >
                  {resource.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                </button>
                <button
                  type="button"
                  onClick={() => removeResource(resource)}
                  disabled={busyId === resource.id}
                  aria-label={`ลบ${resource.name}`}
                  className="btn bg-default-100 text-danger hover:bg-default-200 min-h-11 min-w-11 px-3"
                >
                  <Icon icon="tabler:trash" className="size-4" />
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
              <th className="text-default-500 px-4 py-3 text-start text-sm font-medium">ชื่อ</th>
              <th className="text-default-500 px-4 py-3 text-start text-sm font-medium">
                ระยะเวลามาตรฐาน
              </th>
              <th className="text-default-500 px-4 py-3 text-start text-sm font-medium">
                รับพร้อมกัน
              </th>
              <th className="text-default-500 px-4 py-3 text-start text-sm font-medium">มัดจำ</th>
              <th className="text-default-500 px-4 py-3 text-start text-sm font-medium">สถานะ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-default-200 divide-y">
            {items.map((resource) => (
              <tr key={resource.id}>
                <td className="px-4 py-3">
                  <Link
                    href={`/service-resources/${resource.id}`}
                    className="text-default-800 font-medium"
                  >
                    {resource.name}
                  </Link>
                  {resource.description && (
                    <p className="text-default-500 mt-0.5 max-w-xs truncate text-sm">
                      {resource.description}
                    </p>
                  )}
                </td>
                <td className="text-default-700 px-4 py-3">
                  {resource.durationMinutes ? `${resource.durationMinutes} นาที` : '—'}
                </td>
                <td className="text-default-700 px-4 py-3">{resource.capacity} คิว</td>
                <td className="text-default-700 px-4 py-3">{depositLabel(resource)}</td>
                <td className="px-4 py-3">
                  <StatusBadge isActive={resource.isActive} />
                </td>
                <td className="px-4 py-3 text-end">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/service-resources/${resource.id}`}
                      className="btn bg-default-100 text-default-700 hover:bg-default-200 min-h-11 px-3 text-sm"
                    >
                      แก้ไข
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleActive(resource)}
                      disabled={busyId === resource.id}
                      className="btn bg-default-100 text-default-700 hover:bg-default-200 min-h-11 px-3 text-sm"
                    >
                      {resource.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeResource(resource)}
                      disabled={busyId === resource.id}
                      aria-label={`ลบ${resource.name}`}
                      className="btn bg-default-100 text-danger hover:bg-default-200 min-h-11 min-w-11 px-3"
                    >
                      <Icon icon="tabler:trash" className="size-4" />
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
