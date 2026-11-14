'use client'

/**
 * EstimateBadge — ป้าย "ประมาณการ" ของค่าที่ Meta ระบุว่าเป็นค่าประมาณ (BR-AIQ-03)
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (`.badge` + `bg-{x}/15 text-{x}-ink` — ใช้ -ink ตามหมึกของโปรเจกต์)
 */
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'

export default function EstimateBadge() {
  const t = useT().adQuality
  return (
    <span className="badge bg-info/15 text-info-ink">
      <Icon icon="info-circle" className="text-sm" aria-hidden="true" />
      {t.estimate}
    </span>
  )
}
