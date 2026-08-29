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

  // soft-selected: bg-primary/15 text-primary (ชุดเดียวกับ FilterDropdown active state, ตาม UX spec)
  // ไม่ได้เลือก: bg-light text-dark hover:text-primary — ตรง Theme Source Mapping ของ UX spec เป๊ะ
  const base = 'btn min-h-11 flex-1 items-center justify-center gap-1.5'
  const selectedCls = 'bg-primary/15 text-primary'
  const unselectedCls = 'bg-light text-dark hover:text-primary'

  return (
    <div className="inline-flex w-full">
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
