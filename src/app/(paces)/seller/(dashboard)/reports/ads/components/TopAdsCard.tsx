'use client'

/**
 * TopAdsCard — ③ แอดที่ทำยอดสูงสุด 5 อันดับ + กล่อง "แอดที่ปิดการขายดีที่สุด" (feature 00091 FR-009)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalSubscriber.tsx
 *   (แถวชื่อ + ค่า + แถบ `h-1.25 bg-default-100` · กล่อง `p-2.5 border border-dashed border-default-300 rounded` ท้ายการ์ด)
 * ตัด: CountUp · select วันที่ · uppercase · ไอคอนวงกลมทึบ · medal/"Congratulations" — แถวเปลี่ยนเป็น <button> เปิดชีตคำสั่งซื้อของแอด
 * กล่องไฮไลต์: กฎเลือกอยู่ที่ src/lib/ad-report-view.ts (bestCloseRateRow · มติ O1) — ไม่มีแอดเข้าเกณฑ์ = ไม่วาดกล่อง
 */
import AdThumb from '@/components/safepay/AdThumb'
import { adDisplayName } from '@/lib/ad-attribution'
import { bestCloseRateRow, BEST_RATE_MIN_ORDERS } from '@/lib/ad-report-view'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import ShareBar from './ShareBar'
import { fmtPct, shareOf, type AdViewRow } from './data'

export default function TopAdsCard({ rows, adSales, noun, onOpen }: { rows: AdViewRow[]; adSales: number; noun: string; onOpen: (r: AdViewRow) => void }) {
  const t = useT()
  const idFallback = t.inbox.contextBar.adIdFallback
  const top = rows.filter((r) => r.sales > 0).slice(0, 5)
  const best = bestCloseRateRow(rows)
  const name = (r: AdViewRow) => adDisplayName(r.adTitle, r.adId, idFallback) ?? r.adId

  return (
    <div className="card h-full min-w-0">
      <div className="card-header">
        <h4 className="card-title">{t.adReport.topAdsTitle}</h4>
      </div>
      <div className="card-body flex flex-col">
        {top.length === 0 ? (
          <p className="text-default-500 text-sm">{fmt(t.adReport.noAdOrdersChart, { noun })}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {top.map((r, i) => (
              <li key={r.adId}>
                <button type="button" onClick={() => onOpen(r)} className="block min-h-11 w-full text-start lg:min-h-0">
                  <span className="flex items-center gap-2.5">
                    <span className="text-default-500 w-4 shrink-0 text-sm tabular-nums">{i + 1}</span>
                    <AdThumb photoFileId={r.adPhotoFileId} className="size-8 rounded-md" iconClass="text-base" />
                    <span className="text-default-900 hover:text-primary min-w-0 flex-1 truncate text-sm font-medium" title={name(r)}>{name(r)}</span>
                    <span className="shrink-0 text-end text-sm tabular-nums">
                      <span className="text-default-900 font-semibold">{formatBaht(r.sales)}</span>
                      <span className="text-default-500 ms-2">{formatNumberNoSymbol(Math.round(shareOf(r.sales, adSales) * 10) / 10)}%</span>
                    </span>
                  </span>
                  <span className="mt-1.5 block"><ShareBar pct={shareOf(r.sales, adSales)} /></span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {best && (
          <div className="border-default-300 mt-auto rounded border border-dashed p-2.5">
            <p className="text-default-700 mb-2 text-xs font-semibold">{t.adReport.bestTitle}</p>
            <button type="button" onClick={() => onOpen(best)} className="flex min-h-11 w-full items-center gap-2.5 text-start">
              <AdThumb photoFileId={best.adPhotoFileId} className="size-12 rounded-md" iconClass="text-xl" />
              <span className="min-w-0 flex-1">
                <span className="text-default-900 line-clamp-2 text-sm font-semibold break-words" title={name(best)}>{name(best)}</span>
                <span className="text-default-700 block text-xs tabular-nums">{fmt(t.adReport.bestRate, { p: fmtPct(best.closeRatePct) })}</span>
              </span>
            </button>
            <p className="text-default-500 mt-1.5 mb-0 text-2xs">{fmt(t.adReport.bestNote, { noun, n: BEST_RATE_MIN_ORDERS })}</p>
          </div>
        )}
      </div>
    </div>
  )
}
