'use client'

/**
 * PlacementPanel — ตำแหน่งแสดงแอด (FR-006): donut แชท (Meta) ตามแพลตฟอร์ม + แท่งต้นทุนต่อแชท (Meta) ตามตำแหน่ง (ต่ำสุดเป็นสีเด่น)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AudienceInsight.tsx (donut h160 size 75% stroke 0 · รายการท้ายการ์ด)
 *   + src/app/(paces)/seller/(dashboard)/reports/ads/components/AdDonutCard.tsx (ท่า ApexChart wrapper + role="img" aria-label + จุดสี style)
 *   แท่งแนวนอน: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/WeeklyPerformanceInsights.tsx (`horizontal: true`)
 * ตัด: ตารางตำแหน่ง 8 แถว (ข้อมูลเดียวกันอยู่ในกราฟ + tooltip) · ตัวนับ realtime · ข้อความอธิบายใต้แผง
 * สี (HR10/HR7): chart-primary|chart-zeta|chart-delta|default-400 — ไม่ม่วง/เขียว/แดง
 * 🛑 BR-AIQ-02: ไม่มียอดขาย/คำสั่งซื้อ/ROAS ต่อตำแหน่ง · ทุกตัวเลขนำหน้า "≈"
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback, useMemo } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { formatBaht } from '@/lib/format-money'
import { colorVar, getColor } from '@/utils/helpers'
import { fmtInt, fmtPct1, type PlacementView } from './data'
import NoDataCell from './NoDataCell'

/** แพลตฟอร์ม → ชื่อโทเคนสี (ไม่ม่วง/เขียว/แดง) — ที่เหลือเทา */
const PLATFORM_COLOR: Record<string, string> = { facebook: 'chart-primary', instagram: 'chart-zeta', messenger: 'chart-delta' }
const tokenOf = (platform: string) => PLATFORM_COLOR[platform] ?? 'default-400'

export default function PlacementPanel({ view }: { view: PlacementView }) {
  const t = useT().adQuality
  const costLines = useMemo(
    () => view.lines.filter((l) => l.costPerChat !== null).sort((a, b) => (a.costPerChat as number) - (b.costPerChat as number)),
    [view],
  )
  const donutOptions = useCallback(
    (): ApexOptions => ({
      chart: { type: 'donut', height: 160 },
      legend: { show: false },
      stroke: { width: 0 },
      plotOptions: {
        pie: {
          donut: {
            size: '75%',
            labels: { show: true, name: { show: true }, value: { show: true, formatter: (v: string) => `≈${fmtInt(Number(v))}` }, total: { show: true, showAlways: true, label: t.donutPlatform, formatter: () => `≈${fmtInt(view.totalChats)}` } },
          },
        },
      },
      series: view.platforms.map((p) => p.chats),
      labels: view.platforms.map((p) => p.label),
      colors: view.platforms.map((p) => getColor(tokenOf(p.platform))),
      dataLabels: { enabled: false },
      tooltip: { y: { formatter: (v: number) => `≈${fmtInt(v)}` } },
    }),
    [view, t.donutPlatform],
  )
  const costOptions = useCallback(
    (): ApexOptions => ({
      chart: { type: 'bar', height: Math.max(120, costLines.length * 34 + 30), toolbar: { show: false } },
      plotOptions: { bar: { horizontal: true, barHeight: '60%', borderRadius: 2, distributed: true } },
      series: [{ name: t.colCostChatMeta, data: costLines.map((l) => l.costPerChat as number) }],
      colors: costLines.map((l) => getColor(l.key === view.cheapest?.key ? 'chart-primary' : 'default-400')),
      legend: { show: false },
      dataLabels: { enabled: true, formatter: (v: number) => `≈${formatBaht(v)}`, offsetX: 4, style: { fontSize: '11px', colors: [getColor('default-800')] } },
      grid: { borderColor: getColor('chart-border-color'), strokeDashArray: 4 },
      xaxis: { categories: costLines.map((l) => l.label), labels: { formatter: (v: string) => formatBaht(Number(v)) } },
      yaxis: { labels: { maxWidth: 150, style: { fontSize: '12px' } } },
      tooltip: { y: { formatter: (v: number) => `≈${formatBaht(v)}` } },
    }),
    [costLines, view.cheapest, t.colCostChatMeta],
  )
  const total = view.totalChats ?? 0
  const donutAria = fmt(t.chartAria, { label: t.donutPlatform, items: view.platforms.map((p) => `${p.label} ${fmtPct1(total > 0 ? Math.round((p.chats / total) * 1000) / 10 : null)}`).join(', ') })
  const costAria = fmt(t.chartAria, { label: t.colCostChatMeta, items: costLines.map((l) => `${l.label} ≈${formatBaht(l.costPerChat as number)}`).join(', ') })

  return (
    <div className="grid grid-cols-1 gap-base sm:grid-cols-2">
      <div className="min-w-0">
        {view.platforms.length > 0 ? (
          <div className="min-h-40" role="img" aria-label={donutAria}>
            <ApexChart getOptions={donutOptions} type="donut" height={160} />
          </div>
        ) : (
          <p className="text-default-700 text-sm"><NoDataCell /></p>
        )}
        <ul className="m-0 mt-2 list-none space-y-1 p-0">
          {view.platforms.map((p) => (
            <li key={p.platform} className="flex items-center gap-2 text-sm">
              {/* สีจุดตรงกับชิ้นวงกลม (โทเคนเดียวกัน) — ค่าไดนามิก ไม่ใช่ arbitrary Tailwind */}
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorVar(tokenOf(p.platform)) }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{p.label}</span>
              <span className="tabular-nums">≈{fmtInt(p.chats)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0">
        <p className="text-default-700 mb-1 text-xs">{t.colCostChatMeta}</p>
        {costLines.length > 0 ? (
          <div role="img" aria-label={costAria}><ApexChart getOptions={costOptions} type="bar" height={Math.max(120, costLines.length * 34 + 30)} /></div>
        ) : (
          <p className="text-default-700 text-sm"><NoDataCell /></p>
        )}
      </div>
    </div>
  )
}
