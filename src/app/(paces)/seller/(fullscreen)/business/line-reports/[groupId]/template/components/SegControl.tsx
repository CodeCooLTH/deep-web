'use client'

/**
 * SegControl — ปุ่มเลือก 1 ใน N (radiogroup) ที่หน้าจัดข้อความใช้ร่วมกัน: ชนิดพรีวิว · วัดจาก · ขนาด · สี · แท็บมือถือ
 *
 * Base: src/app/(paces)/seller/(dashboard)/business/line-reports/_components/detail/PreviewCard.tsx (SEG + `role="radiogroup"` — ไม่ใช้ .btn-group)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (ปุ่มกลุ่ม)
 * ประกาศระดับ module — ห้ามประกาศใน render (พิมพ์แล้ว remount ทำ focus/IME หลุด)
 */
import type { ReactNode } from 'react'
import { cn } from '@/utils/helpers'

const SEG = 'min-h-11 rounded-md px-3 py-1 text-xs font-medium transition-colors lg:min-h-8'

export type SegOption<T extends string> = { value: T; label: ReactNode; disabled?: boolean; title?: string }

export default function SegControl<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  className,
  fill,
  title,
}: {
  label: string
  options: readonly SegOption<T>[]
  value: T
  onChange: (v: T) => void
  disabled?: boolean
  className?: string
  /** ปุ่มแบ่งความกว้างเท่ากันเต็มแถว (มือถือ) */
  fill?: boolean
  title?: string
}) {
  return (
    <div className={cn('bg-light rounded-lg p-0.5', fill ? 'flex' : 'inline-flex flex-none', className)} role="radiogroup" aria-label={label} title={title}>
      {options.map((o) => {
        const off = disabled || o.disabled
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={off}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(SEG, 'inline-flex items-center justify-center gap-1.5', fill && 'flex-1', value === o.value ? 'bg-card text-default-900 shadow-sm' : 'text-default-700 hover:text-default-900', off && 'opacity-50')}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
