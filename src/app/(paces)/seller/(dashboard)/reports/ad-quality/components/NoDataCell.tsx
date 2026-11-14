'use client'

/**
 * NoDataCell — "—" พร้อมข้อความสำหรับโปรแกรมอ่านจอ (ไม่ทราบค่า ≠ 0 · BR-AIQ-07)
 * Base: ท่า "—" + sr-only ของ src/app/(paces)/seller/(dashboard)/reports/ads/components/AdTableCard.tsx (noSpend)
 */
import { useT } from '@/i18n/LocaleProvider'

export default function NoDataCell() {
  const t = useT().adQuality
  return (
    <>
      —<span className="sr-only">{t.unknownSr}</span>
    </>
  )
}
