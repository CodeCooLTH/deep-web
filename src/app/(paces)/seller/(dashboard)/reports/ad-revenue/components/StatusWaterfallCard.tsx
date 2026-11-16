'use client'

/**
 * StatusWaterfallCard — "จากยอดสั่งถึงเงินที่ได้รับ": ยอดสั่ง → หักยกเลิก → หักตีกลับ/คืน → ยังไม่รับเงิน → รับเงินแล้ว (00091 เฟส 3 FR-013)
 *
 * user 2026-11-16 "อยากได้ chart ที่ดู modern กว่านี้" — เดิม rangeBar แนวตั้ง (แท่งยกเลิก/ตีกลับเหลือเส้นบาง · แกน y รก · ครึ่งล่างการ์ดว่าง)
 * ใหม่: waterfall แนวนอนไหลบน→ล่าง — แต่ละแถว: ชื่อ · แท่งลอยวางตำแหน่ง from→to บนรางเดียวกัน (มุมโค้ง) · ยอด ฿ ตัวหนา + % ของยอดสั่ง
 *   หัวการ์ด: เงินที่ได้รับ (ตัวใหญ่) + % ของยอดสั่ง — คำตอบของการ์ดอ่านได้ก่อนดูแท่ง
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TopTrafficSources.tsx (แถว relative h-10 · แท่ง absolute width%)
 *   ตำแหน่ง/ความกว้างแท่งเป็น style (ค่ารายแถว) ตามท่าธีม ไม่ใช่ arbitrary class (HR7) · ไม่ใช่กราฟ Apex จึงไม่ผ่าน wrapper (เป็นแถบเหมือน SegBar)
 * 🛑 แท่งที่เล็กกว่า 1% ของยอดสั่งวาดกว้างขั้นต่ำ 1% (ให้มองเห็น) — ตัวเลขข้างแท่งเป็นค่าจริงเสมอ
 * สี: ยอดสั่ง primary · ยกเลิก danger จาง · ตีกลับ danger · ยังไม่รับเงิน warning · รับเงินแล้ว success (เขียว = เงินเข้าแล้วเท่านั้น)
 */
import type { Waterfall } from '@/lib/ad-revenue-view'
import { formatBaht } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'
import InfoTip from './InfoTip'

const MIN_PCT = 1

export default function StatusWaterfallCard({ waterfall: w }: { waterfall: Waterfall }) {
  const t = useT().adRevenue
  const pct = (v: number) => (w.gross > 0 ? (v / w.gross) * 100 : 0)
  const rows = [
    { key: 'gross', label: t.dash.funnelGross, from: 0, amount: w.gross, bar: 'bg-primary', sign: '' },
    { key: 'cancelled', label: t.wfCancelled, from: w.gross - w.cancelled, amount: w.cancelled, bar: 'bg-danger/50', sign: '−' },
    { key: 'returned', label: t.wfReturned, from: w.open, amount: w.returned, bar: 'bg-danger', sign: '−' },
    { key: 'pending', label: t.notCollected, from: w.collected, amount: w.unrecorded, bar: 'bg-warning', sign: '' },
    { key: 'collected', label: t.collected, from: 0, amount: w.collected, bar: 'bg-success', sign: '' },
  ]

  return (
    <div className="card h-full min-w-0">
      <div className="card-header"><h4 className="card-title">{t.waterfallTitle}</h4><InfoTip text={t.includesLostNote} /></div>
      <div className="card-body flex flex-col gap-6">
        <div>
          <p className="text-default-700 mb-1 text-sm">{t.collected}</p>
          <p className="mb-0 flex flex-wrap items-baseline gap-x-2 tabular-nums">
            <span className="text-default-900 text-2xl font-bold">{formatBaht(Math.round(w.collected))}</span>
            <span className="text-default-700 text-sm">{fmt(t.dash.wfOfGross, { p: pct(w.collected).toFixed(1), v: formatBaht(Math.round(w.gross)) })}</span>
          </p>
        </div>
        <div className="flex flex-col gap-3" role="img" aria-label={fmt(t.waterfallAria, { gross: formatBaht(w.gross), collected: formatBaht(w.collected) })}>
          {rows.map((r) => {
            const width = r.amount > 0 ? Math.max(MIN_PCT, pct(r.amount)) : 0
            const left = Math.min(pct(r.from), 100 - width)
            return (
              <div key={r.key} className="grid grid-cols-12 items-center gap-3" aria-hidden="true">
                <span className={cn('col-span-3 truncate text-sm', r.key === 'gross' || r.key === 'collected' ? 'text-default-900 font-semibold' : 'text-default-700')} title={r.label}>{r.label}</span>
                <span className="bg-default-100 relative col-span-6 h-8 rounded-md">
                  {width > 0 && <span className={cn('absolute inset-y-0 rounded-md', r.bar)} style={{ insetInlineStart: `${left}%`, width: `${width}%` }} />}
                </span>
                <span className="col-span-3 text-end text-sm whitespace-nowrap tabular-nums">
                  <b className="text-default-900 font-bold">{r.sign}{formatBaht(Math.round(r.amount))}</b>
                  <span className="text-default-500 text-xs"> · {pct(r.amount).toFixed(1)}%</span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
