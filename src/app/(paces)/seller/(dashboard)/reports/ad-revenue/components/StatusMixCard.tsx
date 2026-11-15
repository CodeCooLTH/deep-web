'use client'

/**
 * StatusMixCard — "สถานะออเดอร์รายแอด": แท่งแนวนอน 100% ซ้อน 5 สถานะ · top 10 แอดตามจำนวนใบ (00091 เฟส 3 FR-013)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/charts/apex/bar/components/data.ts → getFullStackedBarChart (horizontal · stackType '100%') ผ่าน ApexChart wrapper
 * 🛑 กราฟไม่ซ้ำตัวเลขอัตรา (ตารางเป็นเจ้าของ) · สีตามตารางสถานะของหน้า: รอ=gamma · จัดส่ง=delta · สำเร็จ=alpha · ยกเลิก=beta จาง · ตีกลับ=beta
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import { adDisplayName } from '@/lib/ad-attribution'
import { placedOf, STATUS_KEYS } from '@/lib/ad-revenue-view'
import { formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { getColor } from '@/utils/helpers'
import { uniqueLabels } from './heatmap-scale'
import type { AdMetrics, StatusLabels } from './data'

const TOP = 10
const LABEL_MAX = 26

export default function StatusMixCard({ ads, noun, labels }: { ads: Pick<AdMetrics, 'adId' | 'adTitle' | 'status'>[]; noun: string; labels: StatusLabels }) {
  const tt = useT()
  const t = tt.adRevenue
  const top = [...ads].filter((a) => placedOf(a.status) > 0).sort((x, y) => placedOf(y.status) - placedOf(x.status)).slice(0, TOP)
  // ตัดท้ายโดยขยายความยาวของชื่อที่ขึ้นต้นเหมือนกันจนแยกออก (ไม่เติมเลข) — วิธีเดียวกับ heatmap
  const names = uniqueLabels(top.map((a) => adDisplayName(a.adTitle, a.adId, tt.inbox.contextBar.adIdFallback) ?? a.adId), LABEL_MAX)
  const height = 60 + Math.max(1, top.length) * 36

  const getOptions = useCallback((): ApexOptions => ({
    chart: { type: 'bar', height, stacked: true, stackType: '100%', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true } },
    stroke: { width: 1, colors: ['transparent'] },
    series: STATUS_KEYS.map((k) => ({ name: labels[k], data: top.map((a) => a.status[k]) })),
    xaxis: { categories: names, axisBorder: { show: false }, labels: { formatter: (v: string) => `${v}%` } },
    yaxis: { labels: { maxWidth: 260 } },
    colors: [getColor('chart-gamma'), getColor('chart-delta'), getColor('chart-alpha'), getColor('chart-beta', 0.55), getColor('chart-beta')],
    dataLabels: { enabled: false },
    legend: { position: 'top', horizontalAlign: 'left' },
    grid: { strokeDashArray: 7 },
    tooltip: { y: { formatter: (v: number) => fmt(t.ordersCount, { n: formatNumberNoSymbol(v) }) } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [ads, height, t, labels])

  return (
    <div className="card h-full min-w-0">
      <div className="card-header"><h4 className="card-title">{fmt(t.statusMixTitle, { noun })}</h4></div>
      <div className="card-body">
        <div role="img" aria-label={fmt(t.statusMixTitle, { noun })} style={{ minHeight: height }}>
          <ApexChart getOptions={getOptions} type="bar" height={height} />
        </div>
      </div>
    </div>
  )
}
