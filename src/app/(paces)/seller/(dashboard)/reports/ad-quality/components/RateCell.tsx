'use client'

/**
 * RateCell — ช่องอัตรา % (1 ตำแหน่ง) + จำนวนดิบ "k จาก n" เป็นบรรทัดรอง (FR-005 · F-05…F-09)
 * Base: ท่า 2 บรรทัด (ค่าหลัก + `text-default-500 text-2xs block`) ของ src/app/(paces)/seller/(dashboard)/reports/ads/components/AdTableCard.tsx
 * ไม่ทราบค่า (null) = "—" + sr-only · ค่า 0 จริง = 0.0% · เกิน 100% แสดงตามจริง
 */
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { fmtInt, fmtPct1 } from './data'
import NoDataCell from './NoDataCell'

export default function RateCell({ pct, num, den }: { pct: number | null; num: number | null; den: number | null }) {
  const t = useT().adQuality
  if (pct === null) return <span className="block text-center"><NoDataCell /></span>
  return (
    <span className="block text-center tabular-nums">
      <span className="text-default-900 block text-sm">{fmtPct1(pct)}</span>
      <span className="text-default-500 text-2xs block">{fmt(t.ofCount, { k: fmtInt(num), n: fmtInt(den) })}</span>
    </span>
  )
}
