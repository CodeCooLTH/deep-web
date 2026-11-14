'use client'

/**
 * GapBadge — ป้ายของแถวเทียบแชท (Meta)/(Deep) (FR-004 · มติ O4) — ส่วนต่างสูง = warning · Deep เห็นมากกว่า = โทนกลาง ไม่ใช่ข้อผิดพลาด
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (`.badge` + `bg-{x}/15 text-{x}-ink`)
 * 🛑 ไม่ใช้เขียว/แดง (Verified-Means-Green · ส่วนต่างต่ำไม่ใช่ "ยืนยันแล้ว")
 */
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import type { GapBadge as Kind } from '@/lib/ad-quality-formulas'

export default function GapBadge({ kind }: { kind: Kind }) {
  const t = useT().adQuality
  if (kind === 'HIGH' || kind === 'NO_DEEP') {
    return (
      <span className="badge bg-warning/15 text-warning-ink">
        <Icon icon="alert-triangle" className="text-sm" aria-hidden="true" />
        {kind === 'HIGH' ? t.gBadgeHigh : t.gBadgeNoDeep}
      </span>
    )
  }
  if (kind === 'LOW_SAMPLE') return <span className="text-default-500 text-2xs">{t.gBadgeLow}</span>
  return null
}
