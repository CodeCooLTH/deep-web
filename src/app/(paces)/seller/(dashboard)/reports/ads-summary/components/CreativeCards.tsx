'use client'

/**
 * CreativeCards — อันดับครีเอทีฟ (7/12) + จุดกระจาย ค่าโฆษณา × ออเดอร์ (5/12) (00094 FR-009)
 *
 * Base (อันดับ: ตารางไม่มีหัว · รูป + ชื่อ + บรรทัดรอง · คอลัมน์ตัวเลข ป้ายเล็กบน ค่าล่าง · badge rounded-full):
 *   theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/TopSellingProducts.tsx
 * Base (จุดกระจาย): theme/paces/Admin/TS/src/app/(admin)/charts/apex/bubble/components/data.ts (bubble 2 series)
 *
 * 🛑 จุดกระจาย 2 สี (ถูกกว่า/แพงกว่าค่าเฉลี่ยร้าน) + บรรทัดค่าเฉลี่ย แทนเส้นอ้างอิง — Apex ผสม bubble+เส้นไม่ได้ (มติ O2)
 *    แอดข้อมูลน้อยไม่วาด · แอดข้อมูลน้อยในอันดับแสดงจาง ไม่ติดป้ายเชิงลบ · สี chart-primary/chart-zeta (ห้ามม่วง)
 * ชื่อโฆษณาเป็นข้อมูลผู้ใช้ → escape ก่อนใส่ tooltip HTML ของ Apex (กัน XSS)
 */
import type { ApexOptions } from 'apexcharts'
import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { escapeHtml } from '@/lib/html-escape'
import { isThin } from '@/lib/ad-summary/classify'
import { roasOfRow } from '@/lib/ad-summary/formulas'
import { FLAG_KEYS, bubbleSplit, creativePool, formatValue, rankCreatives, type CreativeSort } from '@/lib/ad-summary/view'
import type { AdSummaryReport } from '@/lib/ad-summary/types'
import { formatBaht, formatBahtCompact, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn, getColor } from '@/utils/helpers'
import AdImage from './AdImage'
import { FilterSelect, NoValue } from './Bits'


function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <td className="px-3 py-3">
      <span className="text-default-600 block text-xs">{label}</span>
      <span className="text-default-900 text-sm font-medium tabular-nums">{children}</span>
    </td>
  )
}

export default function CreativeCards({ report, rangeQuery }: { report: AdSummaryReport; rangeQuery: string }) {
  const t = useT().adSummary
  const [sort, setSort] = useState<CreativeSort>('orders')
  const pool = useMemo(() => creativePool(report), [report])
  const ranked = useMemo(() => rankCreatives(pool, sort), [pool, sort])
  const metaOk = report.meta.state === 'OK'
  const avgCpa = report.kpi.cpa.cur
  const campaignOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of report.campaigns) for (const s of c.adsets) for (const a of s.ads) m.set(a.adId, c.name ?? c.campaignId)
    return m
  }, [report.campaigns])
  const { low, high } = useMemo(() => bubbleSplit(pool, avgCpa), [pool, avgCpa])
  const sortOpts = [
    { value: 'orders', label: t.crSortOrders },
    { value: 'roas', label: t.crSortRoas },
    { value: 'spend', label: t.crSortSpend },
  ]

  const getOptions = useCallback((): ApexOptions => {
    const toPt = (a: (typeof low)[number]) => ({ x: a.spend ?? 0, y: a.orders, z: a.chats })
    const groups = [low, high]
    return {
      chart: { type: 'bubble', height: 260, toolbar: { show: false }, animations: { enabled: false } },
      series: [
        { name: t.bubLow, data: low.map(toPt) },
        { name: t.bubHigh, data: high.map(toPt) },
      ],
      colors: [getColor('chart-primary'), getColor('chart-zeta')],
      fill: { opacity: 0.7 },
      dataLabels: { enabled: false },
      legend: { show: true, position: 'bottom', markers: { size: 6 } },
      grid: { strokeDashArray: 4 },
      plotOptions: { bubble: { minBubbleRadius: 5, maxBubbleRadius: 22 } },
      xaxis: { type: 'numeric', tickAmount: 5, labels: { formatter: (v: string) => formatBahtCompact(Number(v)) }, title: { text: t.bubAxisSpend, style: { fontWeight: 400 } } },
      yaxis: { min: 0, tickAmount: 4, labels: { formatter: (v: number) => String(Math.round(v)) }, title: { text: t.bubAxisOrders, style: { fontWeight: 400 } } },
      tooltip: {
        custom: ({ seriesIndex, dataPointIndex }: { seriesIndex: number; dataPointIndex: number }) => {
          const a = groups[seriesIndex]?.[dataPointIndex]
          if (!a) return ''
          const per = a.spend !== null && a.orders > 0 ? ` <br>${fmt(t.bubPer, { v: formatBaht(a.spend / a.orders) })}` : ''
          return `<div class="px-3 py-2 text-xs"><b>${escapeHtml(a.name ?? a.adId)}</b><br>${fmt(t.bubTip, { spend: formatBaht(a.spend ?? 0), orders: a.orders, chats: a.chats })}${per}</div>`
        },
      },
    }
  }, [low, high, t])

  return (
    <div className="gap-base grid grid-cols-1 xl:grid-cols-12">
      <div className="min-w-0 xl:col-span-7">
        <div className="card h-full">
          <div className="card-header">
            <h4 className="card-title">{t.crTitle}</h4>
            <FilterSelect width="w-40" label={t.crSortAria} value={sort} options={sortOpts} onChange={(v) => setSort(v as CreativeSort)} />
          </div>
          <div className="card-body p-0">
            {ranked.length === 0 ? (
              <p className="text-default-700 px-5 py-8 text-center text-sm">{t.crEmpty}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap">
                  <tbody>
                    {ranked.map((a) => (
                      <tr key={a.adId} className={cn('border-default-200 border-t first:border-t-0', isThin(a) && 'opacity-70')}>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <AdImage ad={a} />
                            <div className="min-w-0">
                              <h5 className="text-default-900 mb-0 max-w-56 truncate text-sm font-medium" title={a.name ?? a.adId}>
                                {a.name ?? a.adId}
                              </h5>
                              <span className="text-default-600 block max-w-56 truncate text-xs">{campaignOf.get(a.adId) ?? t.unknownCampaign}</span>
                              {a.creativeFlags.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {a.creativeFlags.map((f) => (
                                    <span key={f} className="badge bg-warning/15 text-warning-ink rounded-full px-2.5 text-xs">
                                      {(t as Record<string, string>)[FLAG_KEYS[f]]}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <Stat label={t.cSpend}>{a.spend === null ? <NoValue /> : formatBaht(a.spend)}</Stat>
                        <Stat label={t.cOrders}>{formatNumberNoSymbol(a.orders)}</Stat>
                        <Stat label={t.cRoas}>{roasOfRow(a) === null ? <NoValue /> : formatValue('x2', roasOfRow(a))}</Stat>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card-footer flex justify-end">
            <Link href={`/reports/ads?${rangeQuery}`} className="text-primary-ink inline-flex min-h-11 items-center gap-1 text-sm font-medium lg:min-h-0">
              {t.crViewAll}
              <Icon icon="arrow-right" className="text-sm" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
      <div className="min-w-0 xl:col-span-5">
        <div className="card h-full">
          <div className="card-header">
            <h4 className="card-title">
              {t.bubTitle}
              {avgCpa !== null && <span className="text-default-600 ms-1 text-sm font-normal">({fmt(t.bubAvg, { v: formatBaht(avgCpa) })})</span>}
            </h4>
          </div>
          <div className="card-body">
            {!metaOk ? (
              <div className="text-default-700 flex items-center gap-2 py-10 text-sm">
                <Icon icon="plug-connected-x" className="text-lg" aria-hidden="true" />
                {t.audNeedConnect}
              </div>
            ) : low.length + high.length === 0 ? (
              <p className="text-default-700 py-10 text-center text-sm">{t.bubEmpty}</p>
            ) : (
              <div role="img" aria-label={t.bubAria}>
                <ApexChart getOptions={getOptions} type="bubble" height={260} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
