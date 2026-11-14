'use client'

/**
 * AdShareCard — ② สัดส่วนยอดขาย: % ที่มาจากโฆษณา + แถบ 2 ส่วน + ตารางเทียบช่วงก่อน (feature 00091 FR-009)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalVisitors.tsx
 *   (หัวเลข `text-lg font-semibold` + แถบ `h-3 bg-default-200 rounded` 2 ส่วนกว้างตามสัดส่วน + ตาราง `table table-sm thead-sm text-2xs`)
 * ตัด: select วันที่ · uppercase · CountUp · ไอคอนวงกลมทึบ · คอลัมน์ Goal/Target/Progress → ตัวชี้วัด/ช่วงนี้/เทียบช่วงก่อน
 * 🛑 One Voice: bg-primary เฉพาะส่วน "จากโฆษณา" (เหมือน FR-008) · ส่วนที่เหลือ bg-default-300 · ตารางอยู่ท้ายการ์ด (mt-auto)
 */
import { formatBaht, formatNumberNoSymbol, pctChangeVsPrev } from '@/lib/format-money'
import { pointsDelta } from '@/lib/ad-report-view'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import DeltaText from './DeltaText'
import { fmtPct, type AdReportView } from './data'

export default function AdShareCard({ report, noun }: { report: AdReportView; noun: string }) {
  const t = useT().adReport
  const { summary, previous } = report
  const has = summary.adSharePct !== null
  const ad = summary.adSharePct ?? 0
  const non = has ? Math.round((100 - ad) * 100) / 100 : 0

  const rows: { label: string; cur: string; prev: string; delta: React.ReactNode }[] = [
    {
      label: t.colChats,
      cur: formatNumberNoSymbol(summary.chats),
      prev: formatNumberNoSymbol(previous.chats),
      delta: <DeltaText value={pctChangeVsPrev(summary.chats, previous.chats)} />,
    },
    {
      label: noun,
      cur: formatNumberNoSymbol(summary.adOrders),
      prev: formatNumberNoSymbol(previous.adOrders),
      delta: <DeltaText value={pctChangeVsPrev(summary.adOrders, previous.adOrders)} />,
    },
    {
      label: t.sortRate,
      cur: fmtPct(summary.closeRatePct),
      prev: fmtPct(previous.closeRatePct),
      delta: <DeltaText value={pointsDelta(summary.closeRatePct, previous.closeRatePct)} unit="pt" />,
    },
  ]

  return (
    <div className="card h-full min-w-0">
      <div className="card-header">
        <h4 className="card-title">{t.shareTitle}</h4>
      </div>
      <div className="card-body flex flex-col">
        <p className="text-default-900 mb-3 text-lg font-semibold tabular-nums">
          {has ? `${formatNumberNoSymbol(ad)}%` : '—'} <span className="text-default-700 text-sm font-normal">{t.shareOf}</span>
        </p>
        {/* ความกว้างเป็นค่าไดนามิกตามสัดส่วน — ธีม Paces ทำแบบเดียวกัน (style width) ไม่ใช่ arbitrary Tailwind */}
        <div
          className="bg-default-200 flex h-3 w-full overflow-hidden rounded"
          role="img"
          aria-label={fmt(t.shareBarAria, { a: formatNumberNoSymbol(ad), b: formatNumberNoSymbol(non) })}>
          <div className="bg-primary h-full" style={{ width: `${ad}%` }} />
          <div className="bg-default-300 h-full" style={{ width: `${non}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-base">
          <div className="min-w-0">
            <p className="text-default-700 mb-0.5 flex items-center gap-1.5 text-xs">
              <span className="bg-primary size-2.5 shrink-0 rounded-full" aria-hidden="true" />
              {t.legendFromAd}
            </p>
            <p className="text-default-900 mb-0 text-sm font-semibold tabular-nums">{formatBaht(summary.adSales)}</p>
            <p className="text-default-700 mb-0 text-xs tabular-nums">{formatNumberNoSymbol(summary.adOrders)} {t.countUnit}</p>
          </div>
          <div className="min-w-0">
            <p className="text-default-700 mb-0.5 flex items-center gap-1.5 text-xs">
              <span className="bg-default-300 size-2.5 shrink-0 rounded-full" aria-hidden="true" />
              {t.legendNotFromAd}
            </p>
            <p className="text-default-900 mb-0 text-sm font-semibold tabular-nums">{formatBaht(summary.nonAdSales)}</p>
            <p className="text-default-700 mb-0 text-xs tabular-nums">{formatNumberNoSymbol(summary.nonAdOrders)} {t.countUnit}</p>
          </div>
        </div>
        <p className="text-default-500 mt-3 mb-0 text-2xs">{fmt(t.basisNote, { noun })}</p>

        <div className="mt-auto overflow-x-auto pt-5">
          <table className="table table-sm table-borderless w-full">
            <thead className="bg-default-100 text-2xs thead-sm">
              <tr>
                <th className="p-2 text-start">{t.metricCol}</th>
                <th className="p-2 text-end">{t.thisPeriod}</th>
                <th className="p-2 text-end">{t.vsPrevCol}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="p-2 text-sm">{r.label}</td>
                  <td className="p-2 text-end text-sm font-semibold tabular-nums">{r.cur}</td>
                  <td className="p-2 text-end text-sm">
                    <span className="block">{r.delta}</span>
                    <span className="text-default-500 text-2xs block tabular-nums">{fmt(t.fromPrev, { v: r.prev })}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
