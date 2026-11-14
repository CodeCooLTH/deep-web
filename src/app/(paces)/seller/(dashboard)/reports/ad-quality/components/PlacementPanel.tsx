'use client'

/**
 * PlacementPanel — ④ แผง 1 ตำแหน่งแสดงแอด (FR-006): donut สัดส่วนแชท (Meta) ตามแพลตฟอร์ม + ตารางตำแหน่ง 8 แถว + "อื่น ๆ"
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AudienceInsight.tsx (donut h160 size 75% stroke 0 · ตารางเล็กท้ายการ์ด)
 *   + src/app/(paces)/seller/(dashboard)/reports/ads/components/AdDonutCard.tsx (ท่า ApexChart wrapper + role="img" aria-label + จุดสี style)
 * ตัด: ตัวนับ realtime · dots menu · ปุ่มสีม่วงของธีม · คอลัมน์ Views/B.Rate
 * สี (HR10/HR7): getColor('chart-primary'|'chart-zeta'|'chart-delta'|'default-400') — ไม่ใช้โทเคนม่วงของ chart / chart-alpha (teal=success) / chart-beta (rose=danger)
 * 🛑 BR-AIQ-02: ไม่มีคอลัมน์ยอดขาย/คำสั่งซื้อ/ROAS · ไม่มีแถวรวม (ค่าประมาณ ไม่บังคับให้เท่ายอดรวม) · ทุกตัวเลขนำหน้า "≈"
 */
import type { ApexOptions } from 'apexcharts'
import { useCallback } from 'react'

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

const approx = (v: number | null, f: (n: number) => string) => (v === null ? <NoDataCell /> : `≈${f(v)}`)

export default function PlacementPanel({ view }: { view: PlacementView }) {
  const t = useT().adQuality
  const getOptions = useCallback(
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
  const total = view.totalChats ?? 0
  const aria = fmt(t.chartAria, { label: t.donutPlatform, items: view.platforms.map((p) => `${p.label} ${fmtPct1(total > 0 ? Math.round((p.chats / total) * 1000) / 10 : null)}`).join(', ') })

  return (
    <div className="grid grid-cols-1 gap-base md:grid-cols-4">
      <div className="min-w-0">
        {view.platforms.length > 0 ? (
          <div className="min-h-40" role="img" aria-label={aria}>
            <ApexChart getOptions={getOptions} type="donut" height={160} />
          </div>
        ) : (
          <p className="text-default-700 text-sm"><NoDataCell /></p>
        )}
        <ul className="m-0 mt-2 list-none space-y-1 p-0">
          {view.platforms.map((p) => (
            <li key={p.platform} className="flex items-center gap-2 text-xs">
              {/* สีจุดตรงกับชิ้นวงกลม (โทเคนเดียวกัน) — ค่าไดนามิก ไม่ใช่ arbitrary Tailwind */}
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorVar(tokenOf(p.platform)) }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{p.label}</span>
              <span className="tabular-nums">≈{fmtInt(p.chats)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0 md:col-span-3">
        <div className="overflow-x-auto">
          <table className="table table-sm table-borderless whitespace-nowrap">
            <thead className="bg-default-100 text-2xs thead-sm">
              <tr>
                <th className="p-2 text-start">{t.colPlacement}</th>
                <th className="p-2 text-end">{t.colSpend}</th>
                <th className="p-2 text-end">{t.colImpr}</th>
                <th className="p-2 text-end">{t.colClicks}</th>
                <th className="p-2 text-end">{t.colChatsMeta}</th>
                <th className="p-2 text-end">{t.colCostChatMeta}</th>
                <th className="p-2 text-start">{t.colShare}</th>
              </tr>
            </thead>
            <tbody>
              {view.lines.map((l) => (
                <tr key={l.key}>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorVar(tokenOf(l.platform)) }} aria-hidden="true" />
                      {l.label}
                      {view.cheapest?.key === l.key && <span className="badge bg-info/15 text-info-ink">{t.cheapest}</span>}
                    </span>
                  </td>
                  <td className="text-end tabular-nums">{approx(l.spend, formatBaht)}</td>
                  <td className="text-end tabular-nums">{approx(l.impressions, fmtInt as (n: number) => string)}</td>
                  <td className="text-end tabular-nums">{approx(l.clicks, fmtInt as (n: number) => string)}</td>
                  <td className="text-end tabular-nums">{approx(l.chats, fmtInt as (n: number) => string)}</td>
                  <td className="text-end tabular-nums">{approx(l.costPerChat, formatBaht)}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="bg-default-100 h-1.25 w-16 rounded" aria-hidden="true">
                        <span className="bg-default-400 block h-full rounded" style={{ width: `${Math.min(l.sharePct ?? 0, 100)}%` }} />
                      </span>
                      <span className="tabular-nums">{l.sharePct === null ? <NoDataCell /> : `≈${fmtPct1(l.sharePct)}`}</span>
                    </span>
                  </td>
                </tr>
              ))}
              {view.rest && (
                <tr>
                  <td>{fmt(t.otherPlacements, { n: view.rest.count })}</td>
                  <td className="text-end tabular-nums">{approx(view.rest.spend, formatBaht)}</td>
                  <td className="text-end tabular-nums">{approx(view.rest.impressions, fmtInt as (n: number) => string)}</td>
                  <td className="text-end tabular-nums">{approx(view.rest.clicks, fmtInt as (n: number) => string)}</td>
                  <td className="text-end tabular-nums">{approx(view.rest.chats, fmtInt as (n: number) => string)}</td>
                  <td className="text-end"><NoDataCell /></td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="text-default-700 text-xs md:col-span-4">
        <p className="mb-1">{t.placementNote}</p>
        <p className="mb-0">{t.placementNoSales}</p>
      </div>
    </div>
  )
}
