'use client'

/**
 * ResourceList — รายการประเภทงานที่รับได้ (feature 00024, FR-RSV-01)
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

import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useAnchoredDropdown } from '@/hooks/useAnchoredDropdown'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
// HR16: คำเรียกระยะเวลาต้องมาจาก SSOT เดียวกับจอเลือกเวลา — ห้ามประกอบ `${นาที} นาที` เอง
import { formatDurationTH } from '@/lib/appointments'
import type { SerializedServiceResource } from '@/services/service-resource.service'

type Props = {
  resources: SerializedServiceResource[]
  /**
   * บล็อกที่ควบเข้ามาเป็น "ท้ายการ์ดเดียวกัน" (2026-08-11) — ตอนนี้คือการตั้งค่าการรับนัด
   *
   * ทำไมไม่ปล่อยเป็นการ์ดของตัวเองเหมือนเดิม: มือถือเคยมีการ์ดน้ำหนักเท่ากัน 3 ใบเรียงกัน
   * (ปฏิทิน / คิวงาน / การรับนัด) ทั้งที่ใบแรกเป็นงานประจำวัน ส่วนสองใบหลังตั้งครั้งเดียว
   * ตอนเริ่มใช้ — ไม่มีลำดับชั้น คือสิ่งที่ผู้ใช้อ่านว่า "padding เยอะ" (user 2026-08-11)
   *
   * 🛑 ไม่ถูก render เมื่อยังไม่มีคิวงานสักอัน — จอนั้นเป็น empty CTA ล้วน และการตั้งค่า
   * ที่ไม่มีอะไรให้ apply กติกาด้วยคือของที่กินที่โดยไม่ทำงาน
   */
  footer?: ReactNode
}

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
    // -ink = เฉดเขียวเดิม เข้มขึ้นให้ผ่านคอนทราสต์บนพื้น /15 (หนี้ 00024 ข้อ 4)
    <span className="badge bg-success/15 text-success-ink">ใช้งานอยู่</span>
  ) : (
    <span className="badge bg-default-200 text-default-600">ปิดใช้งาน</span>
  )
}

/**
 * ResourceRowMenu — เมนู `⋯` ต่อคิวงานบนมือถือ (2026-08-11)
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/new/components/ProductCombobox.tsx
 *   (useAnchoredDropdown + createPortal ไป body — โครง/คลาสของแผงยกมาตรง ๆ)
 *
 * แยกเป็น component เพราะ hook เรียกในลูป `.map()` ไม่ได้ · และต้อง portal เพราะแถวอยู่ใน
 * การ์ดที่มีขอบเขต แผงที่เป็น absolute จะโดนตัดตรงขอบล่าง
 * (docs/conventions/scroll-container-clips-popovers.md)
 *
 * มี 2 รายการไม่ใช่รายการเดียว — "แก้ไข" ย้ายเข้ามาด้วย เพราะทางเข้าเดิมบนมือถือคือตัวชื่อ
 * คิวงานซึ่งเป็นลิงก์ข้อความสูง 21px ขณะที่เดสก์ท็อปมีปุ่ม "แก้ไข" จริง 44px (sibling parity)
 * เมนูที่มีรายการเดียวคือปุ่มที่ปลอมตัวเป็นเมนู สองรายการทำให้มันเป็นเมนูจริง
 */
function ResourceRowMenu({
  resource,
  disabled,
  onDelete,
}: {
  resource: SerializedServiceResource
  disabled: boolean
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const { anchorRef, panelRef, style, mounted } = useAnchoredDropdown({
    open,
    onClose: () => setOpen(false),
  })

  return (
    <div ref={anchorRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-label={`ตัวเลือกเพิ่มเติมของ${resource.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        /* min-h-11/min-w-11: `.btn.btn-icon` ของธีม = 37px ต่ำกว่าเกณฑ์ 44px ที่ PRODUCT.md
           ประกาศไว้สำหรับกลุ่มผู้สูงวัย (WCAG 2.5.5) — ท่าเดียวกับปุ่มอื่นในหน้านี้ */
        className="btn bg-default-100 text-default-700 hover:bg-default-200 min-h-11 min-w-11 px-3"
      >
        <Icon icon="tabler:dots-vertical" className="size-4" />
      </button>
      {open &&
        mounted &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={style}
            className="border-default-300 bg-card min-w-40 overflow-hidden rounded border shadow-lg"
          >
            <Link
              href={`/settings/job-types/${resource.id}`}
              role="menuitem"
              className="text-default-800 hover:bg-default-100 flex min-h-11 items-center gap-2 px-4 text-sm"
            >
              <Icon icon="tabler:pencil" className="size-4" />
              แก้ไข
            </Link>
            {/* destructive อยู่ใน ⋯ + confirm เท่านั้น (docs/conventions/seller-action-placement.md) */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onDelete()
              }}
              className="text-danger hover:bg-default-100 flex min-h-11 w-full items-center gap-2 px-4 text-start text-sm"
            >
              <Icon icon="tabler:trash" className="size-4" />
              ลบ
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}

export default function ResourceList({ resources, footer }: Props) {
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
      text: 'ลบออกจากรายการประเภทงานที่รับได้ ถ้าต้องการใช้อีกภายหลังต้องเพิ่มใหม่',
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
          text: 'ลบไม่ได้เพราะยังมีนัดผูกอยู่ — ปิดการใช้งานแทนได้ ประเภทงานจะไม่ถูกเลือกสำหรับนัดใหม่ แต่นัดเดิมยังอยู่ครบ',
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
      /* full-bleed บนมือถือเหมือนการ์ดปฏิทินเหนือมัน (2026-08-11) — ถ้าทำแค่ใบบนจะกลายเป็น
         บนสุดชนขอบจอ ล่างสุดเว้นขอบ ขัดกันเองในหน้าเดียว · md:mx-0 = หยุดหักล้าง padding ของ
         main ตั้งแต่ 768 ขึ้นไป (ไฟล์นี้เรนเดอร์ทั้งมือถือและเดสก์ท็อป ต่างจาก AppointmentMonthBoard)
         Base: src/app/(paces)/seller/(dashboard)/products/components/ProductsListing.tsx:252 */
      <div className="card queues-fullbleed -mx-4 md:mx-0">
        <div className="card-body flex flex-col items-center justify-center gap-3 py-12 text-center">
          <div className="bg-default-100 flex size-14 items-center justify-center rounded-full">
            <Icon icon="tabler:user-cog" className="text-default-400 size-7" />
          </div>
          <div>
            <h5 className="text-default-800 font-medium">เริ่มต้นด้วยการเพิ่มประเภทงาน</h5>
            {/* ตัวอย่างต้องตรงกับกลุ่มลูกค้าจริง — เดิมยกตัวอย่าง "เตียง ห้อง คลาส" ซึ่งเป็น
                ร้านนวด/สปา ทำให้ร้านตกแต่งไฟหน้ารถ (ลูกค้ากลุ่มแรก) อ่านแล้วคิดว่า
                "ไม่ใช่ระบบสำหรับร้านฉัน" (impeccable critique P1 2026-07-31) */}
            <p className="text-default-500 mt-1 text-sm">
              ประเภทงานคือสิ่งที่จำกัดว่ารับลูกค้าได้กี่รายพร้อมกัน
              <br />
              เช่น ช่องบริการ 1 · ช่างสมชาย · ลิฟต์ยกรถ
            </p>
            <p className="text-default-500 mt-1 text-sm">
              เพิ่มอันแรกแล้วปฏิทินนัดจะขึ้นให้อัตโนมัติ
            </p>
          </div>
          <Link
            href="/settings/job-types/new"
            className="btn bg-primary min-h-11 text-white hover:bg-primary-hover"
          >
            <Icon icon="tabler:plus" className="me-1 size-4" />
            เพิ่มประเภทงาน
          </Link>
        </div>
      </div>
    )
  }

  return (
    /* full-bleed มือถือ — เหตุผลเดียวกับ empty state ข้างบน */
    <div className="card queues-fullbleed -mx-4 md:mx-0">
      <div className="card-header flex items-center justify-between">
        <div>
          <h4 className="card-title">ประเภทงานที่รับได้</h4>
          <p className="text-default-500 mt-0.5 text-sm">
            {items.length} รายการ · ใช้งานอยู่ {activeCount}
          </p>
        </div>
        <Link
          href="/settings/job-types/new"
          className="btn bg-primary min-h-11 text-white hover:bg-primary-hover"
        >
          <Icon icon="tabler:plus" className="me-1 size-4" />
          เพิ่มประเภทงาน
        </Link>
      </div>

      {/* mobile: การ์ดต่อประเภทงาน */}
      <div className="divide-default-200 divide-y lg:hidden">
        {items.map((resource) => (
          <div key={resource.id} className="p-4">
            <Link
              href={`/settings/job-types/${resource.id}`}
              className="text-default-800 block truncate font-medium"
            >
              {resource.name}
            </Link>
            {resource.description && (
              <p className="text-default-500 mt-0.5 truncate text-sm">{resource.description}</p>
            )}
            <p className="text-default-600 mt-0.5 text-sm">
              {resource.durationMinutes ? `${formatDurationTH(resource.durationMinutes)} · ` : ''}
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
                <ResourceRowMenu
                  resource={resource}
                  disabled={busyId === resource.id}
                  onDelete={() => removeResource(resource)}
                />
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
                    href={`/settings/job-types/${resource.id}`}
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
                  {resource.durationMinutes ? formatDurationTH(resource.durationMinutes) : '—'}
                </td>
                <td className="text-default-700 px-4 py-3">{resource.capacity} คิว</td>
                <td className="text-default-700 px-4 py-3">{depositLabel(resource)}</td>
                <td className="px-4 py-3">
                  <StatusBadge isActive={resource.isActive} />
                </td>
                <td className="px-4 py-3 text-end">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/settings/job-types/${resource.id}`}
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

      {/* เส้นคั่นใช้ token เดียวกับ .card-header (border-dashed border-default-300) ไม่ใช่ค่าใหม่ */}
      {footer && <div className="border-default-300 border-t border-dashed">{footer}</div>}
    </div>
  )
}
