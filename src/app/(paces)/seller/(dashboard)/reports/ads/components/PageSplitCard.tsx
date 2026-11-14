'use client'

/**
 * PageSplitCard — ⑧ ยอดขายจากโฆษณาตามเพจ/บัญชี (วาดเมื่อร้านมีเพจ ≥2 และไม่ได้กรองเพจ) (feature 00091 FR-009)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/SessionByBrowser.tsx
 *   (แถว `flex justify-between items-center p-2.5` · รูป + ชื่อ `font-semibold` · % + ลูกศร ▲▼ เทียบช่วงก่อน)
 * ตัด: SimpleBar (ความสูงตามรายการ) · เมนู dropdown — เปลี่ยนไอคอนเบราว์เซอร์เป็น avatar เพจ + badge โลโก้แพลตฟอร์มมุมล่างขวา
 * delta = จุดเปอร์เซ็นต์ของ "สัดส่วนของเพจในยอดโฆษณา" ช่วงนี้ − ช่วงก่อน (ฐานช่วงก่อน 0 → "—")
 */
import { SalesChannelLogo } from '@/components/safepay/SalesChannelBadge'
import { pointsDelta } from '@/lib/ad-report-view'
import { formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import DeltaText from './DeltaText'
import { shareOf, type AdReportView } from './data'

export default function PageSplitCard({ report }: { report: AdReportView }) {
  const t = useT().adReport
  const adSales = report.summary.adSales
  const prevAd = report.previous.adSales
  const pages = report.pages.filter((p) => p.sales > 0)

  return (
    <div className="card min-w-0 self-start">
      <div className="card-header">
        <h4 className="card-title">{t.pageSplitTitle}</h4>
      </div>
      <div className="card-body px-2 py-2">
        <ul className="m-0 list-none p-0">
          {pages.map((p) => {
            const share = shareOf(p.sales, adSales)
            const delta = pointsDelta(Math.round(share * 10) / 10, prevAd > 0 ? Math.round(shareOf(p.prevSales, prevAd) * 10) / 10 : null)
            return (
              <li key={p.shopChannelId} className="flex items-center gap-3 p-2.5">
                <span className="relative shrink-0">
                  {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatarUrl} alt="" className="size-10 rounded-full object-cover" />
                  ) : (
                    <span className="bg-default-100 text-default-700 flex size-10 items-center justify-center rounded-full text-sm font-semibold" aria-hidden="true">
                      {p.name.trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="ring-card bg-card absolute -end-1 -bottom-1 flex size-5 items-center justify-center rounded-full ring-2">
                    <SalesChannelLogo channel={p.provider === 'INSTAGRAM' ? 'INSTAGRAM' : 'FACEBOOK'} size={16} />
                  </span>
                </span>
                <span className="text-default-900 line-clamp-2 min-w-0 flex-1 text-sm font-semibold break-words">{p.name}</span>
                <span className="shrink-0 text-end text-sm tabular-nums">
                  <span className="text-default-900 block font-semibold">{formatNumberNoSymbol(Math.round(share * 10) / 10)}%</span>
                  <DeltaText value={delta} unit="pt" className="text-xs" />
                </span>
              </li>
            )
          })}
        </ul>
        <p className="text-default-500 mt-2 mb-0 px-2.5 pb-1 text-2xs">{t.pageSplitNote}</p>
      </div>
    </div>
  )
}
