'use client'

/**
 * SpendStrip — แถบตัวชี้วัดการแสดงผลและต้นทุน 7 ช่อง (F-03/F-04/F-11/F-12) · ตัวเลขใหญ่ ไม่มีไอคอน · แท็บเล็ต 4+3 · xl 7 ช่อง คั่นเส้นประ
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/SessionOverview.tsx (แถบตัวชี้วัดคั่นเส้นประ)
 *   แบบเดียวกับแถบรองของ reports/ads-profit/components/AdsProfitKpis.tsx
 * 🛑 ค่าโฆษณา = getAdSpend ตัวเดียวกับ /reports/ads · เข้าถึง/ความถี่ = Q2 (ประมาณการ) · Q2 ล้ม → ช่องนั้น "—" (ไม่ล่มทั้งแถบ)
 */
import { useT } from '@/i18n/LocaleProvider'
import { formatBaht } from '@/lib/format-money'
import { cn } from '@/utils/helpers'
import { fmtDec2, fmtInt, fmtPct1, type CardStatus } from './data'
import EstimateBadge from './EstimateBadge'
import NoDataCell from './NoDataCell'

type Props = {
  impressions: number | null
  reach: number | null
  frequency: number | null
  ctr: number | null
  cpc: number | null
  costPerChatMeta: number | null
  costPerChatDeep: number | null
  reachStatus: CardStatus
}

export default function SpendStrip(p: Props) {
  const t = useT().adQuality
  const baht = (v: number | null) => (v === null ? <NoDataCell /> : formatBaht(v))
  const q2 = p.reachStatus === 'OK'
  const cells: { label: string; value: React.ReactNode }[] = [
    { label: t.mImpr, value: fmtInt(p.impressions) },
    { label: t.mReach, value: q2 ? fmtInt(p.reach) : <NoDataCell /> },
    { label: t.mFreq, value: q2 ? fmtDec2(p.frequency) : <NoDataCell /> },
    { label: t.mCtr, value: fmtPct1(p.ctr) },
    { label: t.mCpc, value: baht(p.cpc) },
    { label: t.colCostChatMeta, value: baht(p.costPerChatMeta) },
    { label: t.mCostDeep, value: baht(p.costPerChatDeep) },
  ]
  return (
    <div className="card min-w-0">
      <div className="card-header flex-wrap gap-2">
        <h4 className="card-title">{t.stripTitle}</h4>
        <EstimateBadge />
      </div>
      <ul className="m-0 grid list-none grid-cols-4 p-0 xl:grid-cols-7">
        {cells.map((c, i) => (
          // เส้นขวา: ทุกช่องยกเว้นท้ายแถว (แท็บเล็ต = ช่อง 4 และ 7 · xl = ช่อง 7) · แถวแรกของแท็บเล็ตมีเส้นล่างคั่นแถวที่สอง
          <li key={c.label} className={cn('border-default-300 min-w-0 border-dashed px-4 py-3.5', i !== 3 && i !== 6 && 'border-e', i === 3 && 'xl:border-e', i < 4 && 'max-xl:border-b')}>
            <p className="text-default-700 mb-0.5 text-xs">{c.label}</p>
            <p className="text-default-900 mb-0 text-lg font-bold tabular-nums">{c.value}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
