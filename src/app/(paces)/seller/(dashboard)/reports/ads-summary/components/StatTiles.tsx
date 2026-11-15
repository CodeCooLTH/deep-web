'use client'

/**
 * StatTiles — ตัวเลขรอง 2 กลุ่ม (ยอดขายและแชท 3 · การส่งโฆษณา Meta 8) แต่ละตัวเป็นการ์ด + กราฟเล็กรายวัน (00094 FR-003)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/Stat.tsx
 *   (card · ชื่อซ้าย · ไอคอนวงกลม bg-light + ตัวเลข · % + ป้ายช่วง · sparkline ApexChart ขวา)
 * ปรับ: สัดส่วนซ้าย 3 / ขวา 2 (ชื่อไทยยาวกว่าอังกฤษ) · ตัด CountUp/uppercase · % เป็นข้อความสีตามธีม (BR-AIR-16 ข้อยกเว้นการ์ด Stat)
 * สีกราฟตามทิศทาง: แย่ลง chart-zeta · กลาง/ไม่มีฐาน default-400 · ดีขึ้น chart-primary — ห้าม chart-secondary (ม่วง = buyer)
 * ซีรีส์ = seriesOf(รายวัน) — อัตราคำนวณ Σ/Σ ต่อวัน ไม่ใช่ค่าเฉลี่ย · Meta ไม่ OK → "—" ไม่วาดกราฟ (ไม่ใช่ 0)
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { groupDaily, seriesOf, type SeriesKey } from '@/lib/ad-summary/buckets'
import { TILES, TONE, chartToken, deltaView, formatValue, metaOk, type ChartToken, type Tile, type ValueUnit } from '@/lib/ad-summary/view'
import type { AdSummaryReport } from '@/lib/ad-summary/types'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { getColor } from '@/utils/helpers'
import { DeltaText, MetaBadge, NoValue } from './Bits'

// ทำไมประกาศระดับ module: component ในตัว render = remount ทุกครั้ง กราฟกระพริบ (convention component-declared-in-render)
function Sparkline({ name, data, labels, kind, token, unit }: { name: string; data: (number | null)[]; labels: string[]; kind: 'bar' | 'area'; token: ChartToken; unit: ValueUnit }) {
  const getOptions = useCallback(
    (): ApexOptions => ({
      chart: { type: kind, height: 50, sparkline: { enabled: true }, toolbar: { show: false }, animations: { enabled: false } },
      series: [{ name, data }],
      colors: [getColor(token)],
      stroke: { width: kind === 'bar' ? 0 : 2, curve: 'smooth' },
      fill: kind === 'bar' ? { opacity: 0.85 } : { type: 'solid', opacity: 0.14 },
      plotOptions: { bar: { columnWidth: '60%', borderRadius: 2 } },
      markers: { size: 0 },
      xaxis: { categories: labels, crosshairs: { width: 1 } },
      tooltip: { fixed: { enabled: false }, x: { show: true }, y: { title: { formatter: () => '' }, formatter: (v: number | null) => (v === null || v === undefined ? '—' : formatValue(unit, v)) } },
    }),
    [name, data, labels, kind, token, unit],
  )
  return <ApexChart getOptions={getOptions} type={kind} height={50} />
}

function TileCard({ tile, report, labels }: { tile: Tile; report: AdSummaryReport; labels: string[] }) {
  const t = useT().adSummary
  const name = (t as Record<string, string>)[tile.label]
  const pair = report.kpi[tile.key]
  const off = tile.meta && !metaOk(report.meta.state)
  const value = off ? null : pair.cur
  const trend = deltaView(pair, TONE[tile.key]).trend
  const data = seriesOf(report.daily, tile.key as SeriesKey)
  return (
    <div className="card h-full min-w-0">
      <div className="card-body">
        <div className="grid grid-cols-5 items-center gap-3">
          <div className="col-span-3 min-w-0">
            <h5 className="text-default-600 truncate text-sm font-semibold" title={name}>
              {name}
            </h5>
            <div className="my-5 flex min-w-0 items-center gap-2.5">
              <span className="bg-light text-default-700 flex size-9 shrink-0 items-center justify-center rounded-full">
                <Icon icon={tile.icon} className="size-5" aria-hidden="true" />
              </span>
              <h3 className="text-default-900 text-lg font-bold tabular-nums">{value === null ? <NoValue /> : formatValue(tile.unit, value)}</h3>
            </div>
            <p className="text-default-600 flex items-center gap-2.5 text-sm">
              {value !== null && <DeltaText pair={pair} tone={TONE[tile.key]} rateUnit={tile.rate ? tile.unit : undefined} />}
              <span className="text-nowrap">{t.vsPrev}</span>
            </p>
          </div>
          <div className="col-span-2 text-end">
            {!off && (
              <div role="img" aria-label={fmt(t.tileChartAria, { name })}>
                <Sparkline name={name} data={data} labels={labels} kind={tile.chart} token={chartToken(trend)} unit={tile.unit} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function StatTiles({ report }: { report: AdSummaryReport }) {
  const t = useT().adSummary
  const labels = groupDaily(report.daily, 'day').map((b) => b.label)
  const groups = [
    { key: 'shop', title: t.grpShop, meta: false, cls: 'md:grid-cols-2 xl:grid-cols-3', tiles: TILES.filter((x) => !x.meta) },
    { key: 'meta', title: t.grpMeta, meta: true, cls: 'md:grid-cols-2 xl:grid-cols-4', tiles: TILES.filter((x) => x.meta) },
  ]
  return (
    <div className="mb-base space-y-5">
      {groups.map((g) => (
        <div key={g.key}>
          <p className="text-default-800 mb-3 flex items-center gap-2 text-sm font-medium">
            {g.title}
            {g.meta && <MetaBadge />}
          </p>
          <div className={`gap-base grid grid-cols-1 ${g.cls}`}>
            {g.tiles.map((tile) => (
              <TileCard key={tile.key} tile={tile} report={report} labels={labels} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
