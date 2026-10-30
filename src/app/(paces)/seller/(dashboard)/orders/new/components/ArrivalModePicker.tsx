'use client'

/**
 * ArrivalModePicker — "ลูกค้ามาแบบไหน" ปุ่มคู่ จองล่วงหน้า | หน้าร้าน (feature 00086 P2-T4 · prototype v13)
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (Button Group — inline-flex + `rounded-*-none`)
 * Sibling: ./DeliveryModeToggle.tsx — ภาษาเดียวกันทุกคลาส (ปุ่มคู่ในฟอร์มเดียวกัน ต้องหน้าตาเดียวกัน)
 *   ต่างแค่ปุ่มละ 2 บรรทัด (ชื่อ + คำอธิบายสั้น) เพราะสองค่านี้ผู้ขายแยกไม่ออกจากชื่ออย่างเดียว
 *
 * ผูก field `arrivalMode` ของ FormValues ผ่าน control ตัวเดียวกับ AppointmentBlock/submit (RHF shared)
 * แสดง/ไม่แสดงเป็นหน้าที่ของ caller (SSOT: sendsArrivalMode ใน lib/order-form-arrival)
 */

import { useController } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import { ARRIVAL_CHOICE_COPY, DEFAULT_ARRIVAL_CHOICE, type OrderArrivalChoice } from '@/lib/order-form-arrival'
import type { FormValues } from './OrderCreateForm'

interface Props {
  control: Control<FormValues>
}

const CHOICES: OrderArrivalChoice[] = ['BOOKED', 'WALK_IN']

export default function ArrivalModePicker({ control }: Props) {
  const { field } = useController({ control, name: 'arrivalMode', defaultValue: DEFAULT_ARRIVAL_CHOICE })
  const current = (field.value ?? DEFAULT_ARRIVAL_CHOICE) as OrderArrivalChoice

  // คลาสชุดเดียวกับ DeliveryModeToggle — `text-primary-ink` ไม่ใช่ `text-primary` (คอนทราสต์ AA บน /15)
  const base = 'btn min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-2.5'
  const selectedCls = 'bg-primary/15 text-primary-ink'
  const unselectedCls = 'bg-light text-dark hover:text-primary'

  return (
    <div className="inline-flex w-full" role="group" aria-label="ลูกค้ามาแบบไหน">
      {CHOICES.map((c, i) => {
        const copy = ARRIVAL_CHOICE_COPY[c]
        const active = current === c
        return (
          <button
            key={c}
            type="button"
            aria-pressed={active}
            onClick={() => field.onChange(c)}
            className={`${base} ${i === 0 ? 'rounded-e-none' : 'rounded-s-none'} ${active ? selectedCls : unselectedCls}`}
          >
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Icon icon={copy.icon} className="size-4" />
              {copy.title}
            </span>
            {/* คำอธิบายสีเดียวกับปุ่ม (ไม่ย้อมจาง) — ข้อความบน /15 ต้องผ่าน 4.5:1 เหมือนชื่อ */}
            <span className="text-xs">{copy.hint}</span>
          </button>
        )
      })}
    </div>
  )
}
