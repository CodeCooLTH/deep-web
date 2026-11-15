'use client'

/**
 * SpendStrip — แถบตัวชี้วัดการแสดงผลและต้นทุน 7 ช่อง (F-03/F-04/F-11/F-12) แทนตาราง ③ เดิม
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AudienceInsight.tsx (รายการช่องไอคอนวงกลม `bg-info/15 text-info` + ป้าย + ค่า)
 *   กริดช่อง: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/SessionOverview.tsx
 * ตัด: คอลัมน์ "ที่มา" (ป้ายกลุ่มบนตารางรายแอด + ป้าย "ประมาณการ" ที่หัวการ์ดบอกแล้ว) · CountUp
 * 🛑 ค่าโฆษณา = getAdSpend ตัวเดียวกับ /reports/ads · เข้าถึง/ความถี่ = Q2 (ประมาณการ) · Q2 ล้ม → ช่องนั้น "—" (ไม่ล่มทั้งแถบ)
 */
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { formatBaht } from '@/lib/format-money'
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
  const cells: { icon: string; label: string; value: React.ReactNode }[] = [
    { icon: 'eye', label: t.mImpr, value: fmtInt(p.impressions) },
    { icon: 'users', label: t.mReach, value: q2 ? fmtInt(p.reach) : <NoDataCell /> },
    { icon: 'repeat', label: t.mFreq, value: q2 ? fmtDec2(p.frequency) : <NoDataCell /> },
    { icon: 'click', label: t.mCtr, value: fmtPct1(p.ctr) },
    { icon: 'hand-click', label: t.mCpc, value: baht(p.cpc) },
    { icon: 'coins', label: t.colCostChatMeta, value: baht(p.costPerChatMeta) },
    { icon: 'coins', label: t.mCostDeep, value: baht(p.costPerChatDeep) },
  ]
  return (
    <div className="card min-w-0">
      <div className="card-header flex-wrap gap-2">
        <h4 className="card-title">{t.stripTitle}</h4>
        <EstimateBadge />
      </div>
      <div className="card-body">
        <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-4 xl:grid-cols-7">
          {cells.map((c) => (
            <li key={c.label} className="flex min-w-0 items-center gap-2.5">
              <span className="bg-info/15 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                <Icon icon={c.icon} className="text-xl" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-default-700 text-xs mb-0.5">{c.label}</p>
                <p className="text-default-900 mb-0 text-sm font-semibold tabular-nums">{c.value}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
