'use client'

/**
 * StaffRolePicker — เลือกบทบาทพนักงาน (checkbox การ์ด) ใช้ร่วมโมดัลลิงก์เชิญ + โมดัลแก้บทบาท (00071 P2 · T5)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx (form-checkbox + label)
 * โครงการ์ด label ขอบ 1px เดียวกับตัวเลือกอายุลิงก์ใน InviteLinkModal (มาจาก AuctionTimeCard)
 * ตรรกะตัดสินใจทั้งหมดอยู่ใน @/lib/shop-role-picker (เทสได้) — ไฟล์นี้เป็นแค่การแสดงผล
 */

import { useId } from 'react'
import Icon from '@/components/wrappers/Icon'
import {
  BILLING_DRIFT_TEXT,
  COVERS_HINT,
  FINANCE_NOTE,
  emptyRolesText,
  managerCoversOthers,
  staffRoleOptions,
  toggleStaffRole,
  type RoleAction,
  type StaffRole,
} from '@/lib/shop-role-picker'

interface Props {
  legend: string
  selected: StaffRole[]
  onChange: (next: StaffRole[]) => void
  /** บังคับส่ง — ไม่มีค่าตั้งต้น: ลืมส่ง = เปิดบทบาทที่ร้านใช้ไม่ได้ */
  billingAvailable: boolean
  action: RoleAction
  disabled?: boolean
}

export default function StaffRolePicker({ legend, selected, onChange, billingAvailable, action, disabled }: Props) {
  const uid = useId()
  const options = staffRoleOptions(billingAvailable, selected)
  const empty = selected.length === 0

  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="form-label mb-0">{legend}</legend>
      <p className="text-xs text-default-500 mb-2">เลือกได้มากกว่า 1 · {FINANCE_NOTE}</p>

      <div className="flex flex-col gap-2">
        {options.map((o) => {
          const checked = selected.includes(o.role)
          const id = `${uid}-${o.role}`
          return (
            <label
              key={o.role}
              htmlFor={id}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 min-h-11 ${
                checked ? 'border-primary bg-primary/5' : 'border-default-300'
              }`}
            >
              <input
                type="checkbox"
                id={id}
                className="form-checkbox mt-0.5 shrink-0"
                checked={checked}
                aria-describedby={`${id}-d`}
                onChange={() => onChange(toggleStaffRole(selected, o.role))}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-default-900">{o.label}</span>
                <span id={`${id}-d`} className={`block text-xs ${o.blocked ? 'text-warning-ink' : 'text-default-500'}`}>
                  {o.blocked ? BILLING_DRIFT_TEXT : o.description}
                </span>
              </span>
            </label>
          )
        })}
      </div>

      <div className="mt-3 space-y-2">
        {managerCoversOthers(selected) && (
          <p className="flex items-start gap-1.5 text-xs text-default-600 mb-0">
            <Icon icon="info-circle" className="shrink-0 text-base" aria-hidden="true" />
            <span>{COVERS_HINT}</span>
          </p>
        )}
        {/* เตือนเบา ๆ ไม่ใช่ error — ปุ่มบันทึก/สร้างปิดอยู่แล้ว · region ต้องอยู่ใน DOM ก่อนข้อความเปลี่ยนถึงจะถูกประกาศ */}
        <p aria-live="polite" className="text-xs text-default-500 mb-0">
          {empty ? emptyRolesText(action) : null}
        </p>
      </div>
    </fieldset>
  )
}
