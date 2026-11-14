'use client'

/**
 * TopAdsCard — ③ แอดที่ทำยอดสูงสุด 5 อันดับ + กล่อง "แอดที่ปิดการขายดีที่สุด" (feature 00091 FR-009)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalSubscriber.tsx
 *   (แถวชื่อ + ค่า + แถบ `h-1.25 bg-default-100` · กล่อง `p-2.5 border border-dashed border-default-300 rounded` ท้ายการ์ด)
 * ตัด: CountUp · select วันที่ · uppercase · ไอคอนวงกลมทึบ · medal/"Congratulations" — แถวเปลี่ยนเป็น <button> เปิดชีตคำสั่งซื้อของแอด
 * กล่องไฮไลต์: กฎเลือกอยู่ที่ src/lib/ad-report-view.ts (bestCloseRateRow · มติ O1 + bestRoasRow FR-010) — แถวไหนไม่เข้าเกณฑ์ซ่อน · ไม่มีเลย = ไม่วาดกล่อง
 */
import AdThumb from '@/components/safepay/AdThumb'
import { adDisplayName } from '@/lib/ad-attribution'
import { bestCloseRateRow, bestRoasRow, roas, BEST_RATE_MIN_ORDERS } from '@/lib/ad-report-view'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import ShareBar from './ShareBar'
import { fmtPct, fmtRoas, shareOf, type AdReportView, type AdViewRow } from './data'

type Props = { rows: AdViewRow[]; adSales: number; noun: string; ads: AdReportView['ads']; pageFiltered: boolean; onOpen: (r: AdViewRow) => void }

export default function TopAdsCard({ rows, adSales, noun, ads, pageFiltered, onOpen }: Props) {
  const t = useT()
  const idFallback = t.inbox.contextBar.adIdFallback
  const top = rows.filter((r) => r.sales > 0).slice(0, 5)
  // แถวผี (noChats) ไม่เข้า ③ · ROAS ซ่อนเมื่อ state ≠ OK หรือกรองเพจ (spend ไม่ครบทั้งบัญชี)
  const real = rows.filter((r) => !r.noChats)
  const best = bestCloseRateRow(real)
  const bestRoas = ads.state === 'OK' && !pageFiltered ? bestRoasRow(real) : null
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

        {(best || bestRoas) && (
          <div className="border-default-300 mt-auto rounded border border-dashed p-2.5">
            {[
              best && { key: 'rate', row: best, title: t.adReport.bestTitle, value: fmt(t.adReport.bestRate, { p: fmtPct(best.closeRatePct) }) },
              bestRoas && { key: 'roas', row: bestRoas, title: t.adReport.bestRoasTitle, value: fmt(t.adReport.bestRoasValue, { v: fmtRoas(roas(bestRoas.sales, bestRoas.spend)) }) },
            ]
              .filter((x): x is { key: string; row: AdViewRow; title: string; value: string } => Boolean(x))
              .map((x, i) => (
                <div key={x.key} className={i > 0 ? 'border-default-300 mt-2.5 border-t border-dashed pt-2.5' : undefined}>
                  <p className="text-default-700 mb-2 text-xs font-semibold">{x.title}</p>
                  <button type="button" onClick={() => onOpen(x.row)} className="flex min-h-11 w-full items-center gap-2.5 text-start">
                    <AdThumb photoFileId={x.row.adPhotoFileId} className="size-10 rounded-md" iconClass="text-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="text-default-900 line-clamp-2 text-sm font-semibold break-words" title={name(x.row)}>{name(x.row)}</span>
                      <span className="text-default-700 block text-xs tabular-nums">{x.value}</span>
                    </span>
                  </button>
                </div>
              ))}
            <p className="text-default-500 mt-1.5 mb-0 text-2xs">{fmt(t.adReport.bestNote, { noun, n: BEST_RATE_MIN_ORDERS })}</p>
          </div>
        )}
      </div>
    </div>
  )
}
