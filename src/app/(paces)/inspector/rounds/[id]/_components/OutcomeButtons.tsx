'use client'

/**
 * OutcomeButtons — ปุ่มเลือกผลตรวจ 3 ตัวเลือกต่อข้อ (feature 00060 · T13 · UX Design Spec Surface C)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (Button Group section —
 *   `inline-flex` + `rounded-e-none/rounded-none/rounded-s-none`) — **ไม่มีคลาส `.btn-group`
 *   ใน Paces** ตาม paces-component-reference.md §2
 *
 * ปุ่มขนาดใหญ่ (≥44px) แทน dropdown — ผู้ตรวจใช้นิ้วโป้งกดขณะยืนถือมือถือหน้างาน
 */

import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'

export type Outcome = 'PASS' | 'FAIL' | 'NOT_APPLICABLE'

const OPTIONS: { value: Outcome; label: string; icon: string; selectedCls: string; idleCls: string }[] = [
  { value: 'PASS', label: 'ผ่าน', icon: 'check', selectedCls: 'bg-success text-white', idleCls: 'bg-success/15 text-success-ink' },
  { value: 'FAIL', label: 'ไม่ผ่าน', icon: 'x', selectedCls: 'bg-danger text-white', idleCls: 'bg-danger/15 text-danger-ink' },
  { value: 'NOT_APPLICABLE', label: 'ไม่เกี่ยวข้อง', icon: 'minus', selectedCls: 'bg-dark text-white', idleCls: 'bg-light text-dark' },
]

export default function OutcomeButtons({ value, onChange }: { value: Outcome | null; onChange: (v: Outcome) => void }) {
  return (
    <div className="inline-flex w-full" role="radiogroup">
      {OPTIONS.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'btn btn-lg h-11 min-w-0 flex-1 gap-1 text-xs sm:text-sm',
            i === 0 && 'rounded-e-none',
            i === 1 && 'rounded-none',
            i === 2 && 'rounded-s-none',
            value === opt.value ? opt.selectedCls : opt.idleCls,
          )}
        >
          <Icon icon={opt.icon} className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{opt.label}</span>
        </button>
      ))}
    </div>
  )
}
