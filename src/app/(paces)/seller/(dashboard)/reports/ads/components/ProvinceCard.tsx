'use client'

/**
 * ProvinceCard — ⑥ ยอดขายจากโฆษณาตามจังหวัดที่อยู่จัดส่ง (ฝั่งรายการ ไม่มีแผนที่) (feature 00091 FR-009)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/UserGeography.tsx
 *   (เฉพาะฝั่งรายการ: แถวชื่อ + ค่า, แถบ `h-1.25 rounded-full bg-default-100`, % ท้ายแถว · ตัดแผนที่ BaseVectorMap/ธง/เมนู dropdown)
 * ชื่อจังหวัดผ่าน canonicalProvince ที่ service (กรุงเทพ/กทม. รวมชื่อเดียว) · แถวพิเศษท้ายสุด: "จังหวัดอื่น ๆ" + "ไม่ระบุจังหวัด" (แถบเทา)
 * รวมเปอร์เซ็นต์ = 100 เสมอ (ทุกแถวหารด้วยยอดจากโฆษณารวมตัวเดียวกัน) · ทุกใบไม่มีที่อยู่ = แถวเดียว "ไม่ระบุจังหวัด 100%" (ห้ามซ่อน)
 */
import Icon from '@/components/wrappers/Icon'
import { provinceLines } from '@/lib/ad-report-view'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import ShareBar from './ShareBar'
import { shareOf, type AdReportView } from './data'

const TOP_N = 8

export default function ProvinceCard({ report }: { report: AdReportView }) {
  const t = useT().adReport
  const lines = provinceLines(report.provinces, TOP_N)
  const total = report.summary.adSales

  return (
    <div className="card h-full min-w-0">
      <div className="card-header">
        <h4 className="card-title">{t.provinceTitle}</h4>
      </div>
      <div className="card-body pt-0">
        <p className="text-default-700 mb-4 text-xs">{t.provinceDesc}</p>
        <ol className="m-0 grid list-none gap-x-8 gap-y-4 p-0 xl:grid-cols-2">
          {lines.map((l, i) => {
            const label = l.kind === 'province' ? l.name : l.kind === 'other' ? fmt(t.provinceOther, { n: l.count }) : t.provinceUnknown
            const pct = shareOf(l.sales, total)
            return (
              <li key={`${l.kind}-${l.name ?? i}`} className="min-w-0">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm">
                    {l.kind === 'province' ? (
                      <span className="text-default-500 w-5 shrink-0 tabular-nums">{i + 1}</span>
                    ) : (
                      <Icon icon={l.kind === 'other' ? 'dots' : 'map-pin-off'} className="text-default-500 w-5 shrink-0 text-base" aria-hidden="true" />
                    )}
                    <span className="text-default-900 min-w-0 truncate" title={label ?? undefined}>{label}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatBaht(l.sales)}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="flex-1">
                    <ShareBar pct={pct} tone={l.kind === 'province' ? 'primary' : 'muted'} />
                  </div>
                  <span className="text-default-700 w-12 shrink-0 text-end text-xs tabular-nums">{formatNumberNoSymbol(Math.round(pct * 10) / 10)}%</span>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
