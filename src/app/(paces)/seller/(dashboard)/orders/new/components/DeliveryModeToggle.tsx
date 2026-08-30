'use client'

/**
 * DeliveryModeToggle — ปุ่มคู่ "จัดส่ง | นัดรับ" (feature 00062 U15, UX-Design-Spec §A1)
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (Button Group — inline-flex + `rounded-*-none`,
 *   ไม่มี `.btn-group` ใน Paces Tailwind — ดู docs/system/ui-guideline/paces-component-reference.md §2)
 *
 * ผูกกับ field เดียวใน FormValues (`fulfillmentMode`) ผ่าน control ตัวเดียวกันที่ QuickForm/
 * CustomerQuickBlock/CartPanel/OrderCreateForm (submit) ใช้ร่วมกัน (RHF shared instance) — ไม่มี
 * state แยกที่ต้อง sync เอง ทุกจออ่านค่าล่าสุดจาก control ตรง ๆ
 *
 * ค่า 'PICKUP' = ร้านเลือกนัดรับเอง, undefined = "จัดส่ง" (ค่าเริ่มต้น พฤติกรรมเดิม — ไม่ส่งคีย์นี้
 * เข้า payload ตอน submit, ดู OrderCreateForm.onSubmit)
 *
 * แสดง/ไม่แสดงทั้งแถวเป็นหน้าที่ของ caller (`showDeliveryToggle` เฉพาะร้าน ONLINE_SALES ที่เดียว
 * — SSOT: OrderCreateForm `shopVertical === 'ONLINE_SALES'`) component นี้ไม่รู้จัก vertical เลย
 */

import { useController } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import type { FormValues } from './OrderCreateForm'

interface Props {
  control: Control<FormValues>
}

export default function DeliveryModeToggle({ control }: Props) {
  const { field } = useController({ control, name: 'fulfillmentMode', defaultValue: undefined })
  const isPickup = field.value === 'PICKUP'

  /**
   * 🛑 `text-primary-ink` ไม่ใช่ `text-primary` — UX spec เขียนว่า `bg-primary/15 text-primary`
   * แต่คู่นั้น **ตกคอนทราสต์ AA**: `order-display.ts` วัดไว้เองแล้วว่า `text-{semantic}` บนพื้น
   * `bg-{semantic}/15` ได้ primary 4.17:1 (ต่ำกว่าเกณฑ์ข้อความปกติ 4.5:1) ส่วน token "หมึก"
   * `text-primary-ink` ได้ 8.44:1 — และ `_root.css` ก็เขียนกำกับตัวเลขนี้ไว้เอง
   *
   * ปุ่มนี้เป็นตัวหนังสือขนาดปกติ ⇒ ใช้เกณฑ์ 4.5:1 ไม่ใช่ 3:1 ของ large text
   * (PRODUCT.md ประกาศ WCAG 2.1 AA + "เข้าถึงพิเศษ" สำหรับผู้สูงวัยไว้เป็นข้อผูกพัน)
   */
  const base = 'btn min-h-11 flex-1 items-center justify-center gap-1.5'
  const selectedCls = 'bg-primary/15 text-primary-ink'
  const unselectedCls = 'bg-light text-dark hover:text-primary'

  return (
    <div className="inline-flex w-full" role="group" aria-label="วิธีส่งมอบ">
      <button
        type="button"
        aria-pressed={!isPickup}
        onClick={() => field.onChange(undefined)}
        className={`${base} rounded-e-none ${!isPickup ? selectedCls : unselectedCls}`}
      >
        <Icon icon="truck-delivery" className="size-4" />
        จัดส่ง
      </button>
      <button
        type="button"
        aria-pressed={isPickup}
        onClick={() => field.onChange('PICKUP')}
        className={`${base} rounded-s-none ${isPickup ? selectedCls : unselectedCls}`}
      >
        <Icon icon="building-store" className="size-4" />
        นัดรับ
      </button>
    </div>
  )
}

/**
 * บรรทัดอธิบายใต้ปุ่มคู่ตอนเลือก "นัดรับ" (UX-Design-Spec §A1 Content outline)
 *
 * 🛑 อยู่ที่นี่ไม่ใช่เขียนซ้ำที่ผู้เรียก เพราะรอบแรกมันถูกเขียน inline ไว้ใน `CustomerQuickBlock`
 * ที่เดียว ⇒ **เดสก์ท็อป (`CartPanel`) ไม่มีบรรทัดนี้เลย** บล็อก "ที่อยู่จัดส่ง [จำเป็น]" จึงหาย
 * ไปเฉย ๆ โดยไม่มีอะไรบอกว่าทำไม (เจอตอนเปิดหน้าจริง 2026-08-29 — `tsc`/build/เทสผ่านหมด
 * เพราะทั้งสองฝั่ง "ถูก" ในตัวเอง มันแค่ไม่เหมือนกัน · คลาสเดียวกับ sibling-surface-parity.md)
 *
 * text-default-400 บรรทัดเดียว ไม่ใช่ callout — เตือนเชิงข้อมูล ไม่ใช่คำเตือนที่ต้องแย่งความสนใจ
 */
export function PickupHint({ control }: Props) {
  const { field } = useController({ control, name: 'fulfillmentMode', defaultValue: undefined })
  if (field.value !== 'PICKUP') return null

  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-default-400">
      <Icon icon="info-circle" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      ลูกค้ามารับเองที่ร้าน — ไม่ต้องกรอกที่อยู่จัดส่ง
    </p>
  )
}
