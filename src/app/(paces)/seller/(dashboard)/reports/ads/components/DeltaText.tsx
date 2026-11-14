'use client'

/**
 * DeltaText — ▲/▼ เปลี่ยนจากช่วงก่อนหน้า (SSOT ของทุกการ์ดในรายงานนี้ · feature 00091 FR-009)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalOrder.tsx (badge ลูกศร ▲▼ + % — ตัดเป็นข้อความล้วน)
 *   + theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/SessionByBrowser.tsx (arrow-up/arrow-down + ค่า)
 *
 * 🛑 ขึ้น = text-success-ink · ลง = text-warning-ink (มติ O5: ยอดลดไม่ใช่ความล้มเหลว ไม่ใช้แดง) · ทิศบอกด้วยไอคอน + sr-only ไม่พึ่งสีอย่างเดียว
 * value = null → "—" (ไม่มีฐานเทียบ ห้ามแสดง 0%/+100% จากฐานศูนย์)
 */
import Icon from '@/components/wrappers/Icon'
import { formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { cn } from '@/utils/helpers'

export default function DeltaText({ value, unit = '%', className }: { value: number | null; unit?: '%' | 'pt'; className?: string }) {
  const t = useT().adReport
  if (value === null) return <span className={cn('text-default-500', className)}>—</span>
  const abs = formatNumberNoSymbol(Math.abs(value))
  const text = unit === '%' ? `${abs}%` : `${abs} ${t.pointsUnit}`
  if (value === 0) return <span className={cn('text-default-700 tabular-nums', className)}>{text}</span>
  const up = value > 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 tabular-nums', up ? 'text-success-ink' : 'text-warning-ink', className)}>
      <Icon icon={up ? 'arrow-up' : 'arrow-down'} className="text-sm" aria-hidden="true" />
      <span className="sr-only">{up ? t.deltaUp : t.deltaDown}</span>
      {text}
    </span>
  )
}
