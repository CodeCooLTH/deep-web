'use client'

/**
 * RateCell — ช่องอัตรา % (1 ตำแหน่ง) + แถบแบ่งช่อง · จำนวนดิบ "k จาก n" ใน title/sr-only (FR-005 · F-05…F-09)
 * Base: แถบ theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalSubscriber.tsx ผ่าน ad-revenue/components/DashBits.tsx SegBar
 * ไม่ทราบค่า (null) = "—" + sr-only · ค่า 0 จริง = 0.0% · เกิน 100% แสดงตามจริง
 */
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { fmtInt, fmtPct1 } from './data'
import NoDataCell from './NoDataCell'
import { SegBar } from '../../ad-revenue/components/DashBits'

/** bar = แสดงแถบแบ่งช่อง (ใช้กับปิดการขาย — ตัวชี้วัดหลัก) · คอลัมน์อัตราของ Meta 4 ช่องไม่มีแถบ ไม่งั้นตารางล้นจอ */
export default function RateCell({ pct, num, den, bar = false }: { pct: number | null; num: number | null; den: number | null; bar?: boolean }) {
  const t = useT().adQuality
  if (pct === null) return <span className="block text-end"><NoDataCell /></span>
  const sub = fmt(t.ofCount, { k: fmtInt(num), n: fmtInt(den) })
  // บรรทัดเดียว: แถบแบ่งช่อง + % ตัวหนา · "k จาก n" อยู่ใน title + sr-only (user 2026-11-16: แถวอ่านแวบเดียว · ความคืบหน้าเป็นแถบทึบ)
  return (
    <span className="flex items-center justify-end gap-2 tabular-nums whitespace-nowrap" title={sub}>
      {bar && <SegBar pct={Math.min(100, pct)} segments={10} className="w-16" />}
      <b className="text-default-900 w-12 text-end text-sm font-bold">{fmtPct1(pct)}</b>
      <span className="sr-only">{sub}</span>
    </span>
  )
}
