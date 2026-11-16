'use client'

/**
 * Segmented — ตัวเลือกแบบปุ่มแบ่งช่อง (สถานะบอท · วิธีนับแท็ก) เป็น radiogroup จริง (native radio ซ่อนไว้ → คีย์บอร์ด/ตัวอ่านหน้าจอได้ฟรี)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/chatbot/ChatbotTabs.tsx (bg-light rounded-lg p-1 · active = bg-card shadow-sm)
 *   theme: theme/paces/Admin/TS/src/app/(admin)/ui/tabs/page.tsx
 * ต่างจากพี่น้อง: ใช้เป็น radiogroup ไม่ใช่ลิงก์ (UX §2.5)
 */
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'

export interface SegmentedOption<V extends string> {
  value: V
  label: string
  icon?: string
}

export default function Segmented<V extends string>({
  name,
  ariaLabel,
  value,
  options,
  onChange,
  disabled,
  describedBy,
  compact,
}: {
  name: string
  ariaLabel: string
  value: V
  options: readonly SegmentedOption<V>[]
  onChange: (v: V) => void
  disabled?: boolean
  describedBy?: string
  /** แคบ (เลือกทีละน้อย เช่น วิธีนับแท็ก) — กว้างเท่าเนื้อหาตั้งแต่ md */
  compact?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} aria-describedby={describedBy} className={cn('bg-light flex w-full items-center gap-0.5 rounded-lg p-1', compact && 'md:w-fit', disabled && 'opacity-60')}>
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            'text-default-600 has-checked:bg-card has-checked:text-dark has-focus-visible:ring-primary relative flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-2 py-2 text-sm font-medium text-nowrap has-checked:font-semibold has-checked:shadow-sm has-focus-visible:ring-2 lg:min-h-0 lg:py-1.5',
            compact && 'md:flex-none md:px-4',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          )}
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} disabled={disabled} onChange={() => onChange(o.value)} className="sr-only" />
          {o.icon && <Icon icon={o.icon} aria-hidden="true" />}
          {o.label}
        </label>
      ))}
    </div>
  )
}
