/**
 * Rows — แถว checkbox / switch ที่การ์ดตั้งค่าของกลุ่ม LINE ใช้ร่วมกัน (ประกาศระดับ module — ห้ามประกาศใน render)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx (`form-checkbox` / `form-switch`)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-reply/order-agent/OrderAgentClient.tsx (label ครอบทั้งแถว)
 *
 * label ครอบทั้งแถว + `min-h-11` = พื้นที่นิ้ว ≥44px บนมือถือ · คำอธิบายรอง `text-default-700` (4.5:1) ไม่ใช้ `text-default-400`
 */
import type { ReactNode } from 'react'
import { cn } from '@/utils/helpers'

export function CheckRow({
  checked,
  disabled,
  onChange,
  label,
  sub,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  sub?: ReactNode
}) {
  return (
    <label className={cn('flex min-h-11 items-start gap-2.5 py-2', disabled ? 'cursor-default' : 'cursor-pointer')}>
      <input type="checkbox" className="form-checkbox mt-0.5 shrink-0" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0 flex-1">
        <span className="text-default-800 block text-sm break-words">{label}</span>
        {sub && <span className="text-default-700 mt-0.5 block text-xs">{sub}</span>}
      </span>
    </label>
  )
}

export function SwitchRow({
  checked,
  disabled,
  onChange,
  label,
  sub,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  sub?: ReactNode
}) {
  return (
    <label className={cn('flex min-h-11 items-center justify-between gap-3', disabled ? 'cursor-default' : 'cursor-pointer')}>
      <span className="min-w-0">
        <span className="text-default-800 block text-sm font-semibold">{label}</span>
        {sub && <span className="text-default-700 block text-xs">{sub}</span>}
      </span>
      <input type="checkbox" role="switch" className="form-switch shrink-0" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}
