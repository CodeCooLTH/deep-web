'use client'

/**
 * StaffRolePicker — เลือกบทบาทพนักงาน (checkbox การ์ด) ใช้ร่วมโมดัลลิงก์เชิญ + โมดัลแก้บทบาท (00071 P2 · T5)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx (form-checkbox + label)
 * โครงการ์ด label ขอบ 1px เดียวกับตัวเลือกอายุลิงก์ใน InviteLinkModal (มาจาก AuctionTimeCard)
 * ตรรกะตัดสินใจทั้งหมดอยู่ใน @/lib/shop-role-picker (เทสได้) — ไฟล์นี้เป็นแค่การแสดงผล
 * 00086 (FR-004/006/017): ร้านบริการมีการ์ดที่ 5–6 (ปิดงานได้ · บันทึกค่าใช้จ่ายได้) ต่อท้าย markup เดียวกับการ์ดบทบาท
 */

import { useId, type ReactNode } from 'react'
import Icon from '@/components/wrappers/Icon'
import {
  BILLING_DRIFT_TEXT,
  COVERS_HINT,
  CLOSE_JOB_COPY,
  RECORD_EXPENSE_COPY,
  closeJobCard,
  flagsAfterRoleToggle,
  type StaffFlags,
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
  /** บังคับส่ง — ไม่มีค่าตั้งต้น (fail-closed เหมือน billingAvailable): ร้านบริการเท่านั้นที่เห็นการ์ดปิดงาน/ค่าใช้จ่าย */
  serviceFlagsAvailable: boolean
  flags: StaffFlags
  onFlagsChange: (next: StaffFlags) => void
  action: RoleAction
  disabled?: boolean
}

export default function StaffRolePicker({
  legend, selected, onChange, billingAvailable, serviceFlagsAvailable, flags, onFlagsChange, action, disabled,
}: Props) {
  const uid = useId()
  const options = staffRoleOptions(billingAvailable, selected)
  const empty = selected.length === 0
  const closeJob = closeJobCard(selected, flags)

  // เปลี่ยนบทบาทจนการ์ดปิดงานถูกปิด → ปลดธงใน state ด้วย ไม่งั้นส่ง true ที่ผู้ใช้มองไม่เห็นไป API
  // เพิ่มฝ่ายช่าง → ติ๊ก "ปิดงานได้" ให้ (ติ๊กออกได้) — มติ user 2026-10-30
  const changeRoles = (next: StaffRole[]) => {
    onChange(next)
    if (!serviceFlagsAvailable) return
    const nf = flagsAfterRoleToggle(selected, next, flags)
    if (nf !== flags) onFlagsChange(nf)
  }

  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="form-label mb-0">{legend}</legend>
      <p className="text-xs text-default-500 mb-2">เลือกได้มากกว่า 1 · {FINANCE_NOTE}</p>

      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <PickerCard
            key={o.role}
            id={`${uid}-${o.role}`}
            label={o.label}
            checked={selected.includes(o.role)}
            warn={o.blocked}
            description={o.blocked ? BILLING_DRIFT_TEXT : o.description}
            onToggle={() => changeRoles(toggleStaffRole(selected, o.role))}
          />
        ))}
        {serviceFlagsAvailable && (
          <>
            <PickerCard
              id={`${uid}-closeJob`}
              label={CLOSE_JOB_COPY.label}
              checked={closeJob.checked}
              cardDisabled={closeJob.disabled}
              warn={closeJob.warn}
              description={closeJob.description}
              onToggle={() => onFlagsChange({ ...flags, canCloseJob: !flags.canCloseJob })}
            />
            <PickerCard
              id={`${uid}-recordExpense`}
              label={RECORD_EXPENSE_COPY.label}
              checked={flags.canRecordExpense}
              description={RECORD_EXPENSE_COPY.description}
              onToggle={() => onFlagsChange({ ...flags, canRecordExpense: !flags.canRecordExpense })}
            />
          </>
        )}
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

/** การ์ด checkbox หนึ่งใบ — บทบาทและธงใช้ตัวเดียวกัน markup จึงเหมือนกันทุกใบ (prototype 00086) */
function PickerCard({
  id, label, checked, description, warn = false, cardDisabled = false, onToggle,
}: {
  id: string
  label: string
  checked: boolean
  description: ReactNode
  warn?: boolean
  /** ปิดเฉพาะการ์ดนี้ (ต่างจาก fieldset disabled ที่ปิดทั้งชุดตอนกำลังบันทึก) */
  cardDisabled?: boolean
  onToggle: () => void
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-2.5 rounded-lg border p-3 min-h-11 ${cardDisabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${
        checked ? 'border-primary bg-primary/5' : 'border-default-300'
      }`}
    >
      <input
        type="checkbox"
        id={id}
        className="form-checkbox mt-0.5 shrink-0"
        checked={checked}
        disabled={cardDisabled}
        aria-describedby={`${id}-d`}
        onChange={onToggle}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-default-900">{label}</span>
        <span id={`${id}-d`} className={`block text-xs ${warn ? 'text-warning-ink' : 'text-default-500'}`}>
          {description}
        </span>
      </span>
    </label>
  )
}
