'use client'

/**
 * AdProductHeatmap — แอด × สินค้า (top 10 × top 10 ตามยอด) สีเดียวไล่ความเข้ม (00091 เฟส 3 FR-014)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/charts/apex/heatmap/components/data.ts → colorScale.ranges ผ่าน ApexChart wrapper
 * ต่างจากธีม: chart-primary 4 ระดับ + chart-gray ช่องไม่มียอด (heatmap-scale.ts) · ชื่อบนแกนตัด ~14 ตัวอักษร · tooltip ขึ้นชื่อเต็ม (escape แล้ว — ชื่อแอดมาจาก Meta)
 * 🛑 ไม่มี interaction นอก tooltip · ห้ามคีย์ undefined ใน options
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import { adDisplayName } from '@/lib/ad-attribution'
import { formatBaht, formatBahtCompact } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import InfoTip from './InfoTip'
import { escapeHtml, heatmapRanges, uniqueLabels } from './heatmap-scale'
import type { AdLite, AdRevenueReport } from './data'

const LABEL = 18

export default function AdProductHeatmap({ matrix, products, ads }: { matrix: AdRevenueReport['matrix']; products: AdRevenueReport['products']; ads: AdLite[] }) {
  const tt = useT()
  const t = tt.adRevenue
  const adById = new Map(ads.map((a) => [a.adId, a]))
  const prodByKey = new Map(products.map((p) => [p.key, p]))
  const adNames = matrix.adIds.map((id) => { const a = adById.get(id); return adDisplayName(a?.adTitle, id, tt.inbox.contextBar.adIdFallback) ?? id })
  const prodNames = matrix.productKeys.map((k) => prodByKey.get(k)?.name ?? k)
  const max = matrix.cells.reduce((m, r) => Math.max(m, ...r), 0)
  const height = 80 + matrix.adIds.length * 34

  const getOptions = useCallback((): ApexOptions => {
    const xs = uniqueLabels(prodNames, LABEL)
    const ys = uniqueLabels(adNames, LABEL)
    return {
      chart: { type: 'heatmap', height, toolbar: { show: false } },
      dataLabels: { enabled: false },
      // แถว = แอด (เรียงบนลงล่างตามยอด) → ส่งกลับด้านเพราะ Apex วาดซีรีส์แรกไว้ล่างสุด
      series: matrix.adIds.map((_, i) => ({ name: ys[i], data: matrix.cells[i].map((v, j) => ({ x: xs[j], y: v })) })).reverse(),
      plotOptions: { heatmap: { radius: 2, enableShades: false, colorScale: { ranges: heatmapRanges(max, { none: t.heatNone, l1: t.heatL1, l2: t.heatL2, l3: t.heatL3, l4: t.heatL4 }, formatBahtCompact) } } },
      stroke: { width: 2 },
      legend: { position: 'top', horizontalAlign: 'right' },
      xaxis: { labels: { rotate: -45, trim: false }, axisBorder: { show: false } },
      tooltip: {
        y: { formatter: (v: number) => formatBaht(v), title: { formatter: (_n: string, o?: { seriesIndex: number }) => escapeHtml(adNames[adNames.length - 1 - (o?.seriesIndex ?? 0)] ?? '') } },
      },
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, products, ads, height, max, t])

  return (
    <div className="card min-w-0">
      <div className="card-header"><h4 className="card-title">{t.adProductTitle}</h4>
        {matrix.adIds.length > 0 && <InfoTip text={fmt(t.matrixNote, { a: matrix.adIds.length, p: matrix.productKeys.length })} />}</div>
      <div className="card-body">
        {matrix.adIds.length === 0 || matrix.productKeys.length === 0 ? (
          <p className="text-default-500 mb-0 py-6 text-center text-sm">{t.emptyProducts}</p>
        ) : (
          <>
            <div role="img" aria-label={t.adProductTitle} style={{ minHeight: height }}>
              <ApexChart getOptions={getOptions} type="heatmap" height={height} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
