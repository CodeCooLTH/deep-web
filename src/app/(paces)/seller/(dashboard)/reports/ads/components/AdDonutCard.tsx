'use client'

/**
 * AdDonutCard — ⑤ สัดส่วนยอดขายตามแอด: donut 5 อันดับ + "อื่น ๆ" + ตารางสัดส่วน (feature 00091 FR-009)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/StorePerformance.tsx (donut h-204 size 75% stroke 0 · total ตรงกลาง · ตารางเล็ก text-2xs thead bg-default-100)
 *   + theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AudienceInsight.tsx (โครงการ์ด donut + รายการท้ายการ์ด)
 * ตัด: ตัวนับ realtime/dots/ปุ่ม bg-secondary · ป้าย "GOOD SALES" · คอลัมน์ Views/B.Rate → สัดส่วนอย่างเดียว (ไม่มีคอลัมน์ ฿ — ฿ อยู่ตรงกลางวงและในตาราง ⑨)
 * สี HR10: getColor('chart-primary', a) ไล่ความเข้ม a = 1/.8/.6/.45/.3 + "อื่น ๆ" = default-400 · จุดสีในตารางใช้ bg-primary + opacity ชุดเดียวกัน
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback, useMemo } from 'react'

import AdThumb from '@/components/safepay/AdThumb'
import ApexChart from '@/components/wrappers/ApexChart'
import { adDisplayName } from '@/lib/ad-attribution'
import { topWithRest } from '@/lib/ad-report-view'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { getColor } from '@/utils/helpers'
import { shareOf, type AdViewRow } from './data'

const ALPHAS = [1, 0.8, 0.6, 0.45, 0.3]

export default function AdDonutCard({ rows, adSales, noun }: { rows: AdViewRow[]; adSales: number; noun: string }) {
  const t = useT()
  const idFallback = t.inbox.contextBar.adIdFallback
  const withSales = useMemo(() => rows.filter((r) => r.sales > 0), [rows])
  const { top, rest } = useMemo(() => topWithRest(withSales, 5), [withSales])
  const items = useMemo(
    () => [
      ...top.map((r, i) => ({ key: r.adId, label: adDisplayName(r.adTitle, r.adId, idFallback) ?? r.adId, sales: r.sales, photo: r.adPhotoFileId, alpha: ALPHAS[i] })),
      ...(rest ? [{ key: '__rest', label: t.adReport.donutOther, sales: rest.sales, photo: null, alpha: 0 }] : []),
    ],
    [top, rest, idFallback, t.adReport.donutOther],
  )

  const getOptions = useCallback(
    (): ApexOptions => ({
      chart: { type: 'donut', height: 180 },
      legend: { show: false },
      stroke: { width: 0 },
      plotOptions: {
        pie: {
          donut: {
            size: '75%',
            labels: {
              show: true,
              name: { show: true },
              value: { show: true, formatter: (v: string) => formatBaht(Number(v)) },
              total: { show: true, showAlways: true, label: t.adReport.donutCenter, formatter: () => formatBaht(adSales) },
            },
          },
        },
      },
      series: items.map((i) => i.sales),
      labels: items.map((i) => i.label),
      colors: items.map((i) => (i.alpha ? getColor('chart-primary', i.alpha) : getColor('default-400'))),
      dataLabels: { enabled: false },
      tooltip: { y: { formatter: (v: number) => formatBaht(v) } },
    }),
    [items, adSales, t.adReport.donutCenter],
  )

  return (
    <div className="card h-full min-w-0">
      <div className="card-header">
        <h4 className="card-title">{t.adReport.donutTitle}</h4>
      </div>
      <div className="card-body flex flex-col">
        {items.length === 0 ? (
          <p className="text-default-500 text-sm">{fmt(t.adReport.noAdOrdersChart, { noun })}</p>
        ) : (
          <>
            <div className="min-h-44" role="img" aria-label={`${t.adReport.donutTitle}: ${items.map((i) => `${i.label} ${formatNumberNoSymbol(Math.round(shareOf(i.sales, adSales) * 10) / 10)}%`).join(', ')}`}>
              <ApexChart getOptions={getOptions} type="donut" height={180} />
            </div>
            <p className="text-default-700 mt-2 mb-0 text-center text-xs">{fmt(t.adReport.donutCount, { n: withSales.length })}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="table table-sm table-borderless w-full">
                <thead className="bg-default-100 text-2xs thead-sm">
                  <tr>
                    <th className="p-2 text-start">{t.adReport.colAd}</th>
                    <th className="p-2 text-end">{t.adReport.shareCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.key}>
                      <td className="p-2">
                        <span className="flex min-w-0 items-center gap-2">
                          {i.alpha ? (
                            // ความเข้มจุดตรงกับสีชิ้นวงกลม (alpha ชุดเดียวกัน) — ค่าไดนามิก ไม่ใช่ arbitrary Tailwind
                            <span className="bg-primary size-2.5 shrink-0 rounded-full" style={{ opacity: i.alpha }} aria-hidden="true" />
                          ) : (
                            <span className="bg-default-400 size-2.5 shrink-0 rounded-full" aria-hidden="true" />
                          )}
                          {i.key !== '__rest' && <AdThumb photoFileId={i.photo} className="size-6 rounded" iconClass="text-xs" />}
                          <span className="text-default-900 min-w-0 truncate text-sm" title={i.label}>{i.label}</span>
                        </span>
                      </td>
                      <td className="p-2 text-end text-sm tabular-nums">{formatNumberNoSymbol(Math.round(shareOf(i.sales, adSales) * 10) / 10)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <a href="#ad-table" className="btn btn-sm border-default-300 text-default-700 hover:bg-default-100 mt-auto self-start border">
              {t.adReport.viewAllAds}
            </a>
          </>
        )}
      </div>
    </div>
  )
}
