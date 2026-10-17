/**
 * ตัวสร้าง options ของกราฟรายงานร้านบริการ (feature 00078) — ผ่าน ApexChart wrapper (HR10)
 * ทรงเดียวกับกราฟของร้านขายของ (SalesChartSheet.buildSalesChartOptions: แท่งซ้อน 92% มุม 1 ·
 * ไม่มี legend/แกน y · ป้ายวันเฉพาะหมุด · bucket อนาคตเป็น null) แต่ซีรีส์/คำเป็นของร้านบริการ
 *
 * ฟังก์ชันล้วน — สีรับเป็นค่าที่ resolve แล้ว (ผู้เรียกส่ง getColor(FINANCE_COLORS.x.token)) จึงเทสได้ใน node
 */
import type { ApexOptions } from 'apexcharts'

import { axisAnchorDays } from '@/app/(paces)/seller/(dashboard)/dashboard/components/sales-chart-axis'
import type { ServiceReportChart } from '@/lib/report-settings'

import type { ServiceReportModel } from './view-model'
import { SERVICE_REPORT_WORDS as W } from './words'

export interface ServiceChartColors {
  counted: string
  notCounted: string
  outflow: string
  axis: string
  grid: string
  marker: string
}

const fmtNum = (n: number) => Math.round(n).toLocaleString('en-US')

/**
 * หมุดป้ายแกน x (รายวัน) เป็น index 0-based — ใช้กติกาเดียวกับกราฟร้านขายของ (`axisAnchorDays`:
 * หัว/ท้ายเดือน + ทุก 5 วัน + วันนี้ · ห่างกัน ≥3 ช่อง ⇒ "30" กับ "31" ไม่ติดกันบนจอมือถือ)
 */
export function anchorIndexes(count: number, futureFromIndex: number = count): Set<number> {
  const today = futureFromIndex < count ? futureFromIndex : count
  return new Set([...axisAnchorDays(count, today)].map((d) => d - 1))
}

export function buildServiceChartOptions(
  chart: ServiceReportModel['chart'],
  kind: ServiceReportChart,
  colors: ServiceChartColors,
  opts: { height: number; onPick?: (index: number) => void; anchors?: boolean },
): ApexOptions {
  const { categories, series, futureFromIndex } = chart
  const mask = (arr: number[]) => arr.map((v, i) => (i < futureFromIndex ? v : null))
  const isProfit = series.length === 1 && series[0].key === 'profit'
  const colorOf = (key: string) => (key === 'closed' ? colors.counted : key === 'unclosed' ? colors.notCounted : colors.counted)
  const anchors = opts.anchors === false ? null : anchorIndexes(categories.length, futureFromIndex)
  const todayLabel = futureFromIndex < categories.length ? categories[futureFromIndex - 1] : null
  const isBar = kind === 'bar'

  const pick = (_e: unknown, _ctx?: unknown, cfg?: { dataPointIndex?: number }) => {
    const i = cfg?.dataPointIndex ?? -1
    if (i >= 0 && i < futureFromIndex) opts.onPick?.(i)
  }

  return {
    series: series.map((s) => ({ name: s.name, type: isBar ? 'column' : 'line', data: mask(s.data) })),
    chart: {
      type: isBar ? 'bar' : 'line',
      height: opts.height,
      stacked: isBar && !isProfit,
      toolbar: { show: false },
      zoom: { enabled: false },
      selection: { enabled: false },
      parentHeightOffset: 0,
      // 🛑 ห้ามส่ง `events: undefined` — ApexCharts merge ทับค่าตั้งต้นทั้งก้อนแล้วอ่าน events.beforeMount พัง
      //    (การ์ดหน้าแรกไม่ส่ง onPick ⇒ หน้าแรกล้มทั้งหน้า) ⇒ ไม่มี onPick = ไม่ใส่คีย์เลย
      ...(opts.onPick ? { events: { dataPointSelection: pick, markerClick: pick } } : {}),
    },
    plotOptions: {
      bar: {
        columnWidth: '92%',
        borderRadius: 1,
        // กำไรติดลบ = แท่งแดง (สีเดียวกับค่าใช้จ่าย)
        ...(isProfit ? { colors: { ranges: [{ from: -1e12, to: -0.000001, color: colors.outflow }] } } : {}),
      },
    },
    legend: { show: false },
    dataLabels: { enabled: false },
    colors: series.map((s) => colorOf(s.key)),
    stroke: isBar ? { show: false, width: 0 } : { show: true, width: 2.5, curve: 'straight' },
    markers: isBar ? { size: 0 } : { size: 3, strokeWidth: 0 },
    states: { active: { filter: { type: 'none' } } },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { fontSize: '10px', colors: colors.axis },
        rotate: 0,
        hideOverlappingLabels: false,
        trim: false,
        formatter: (v: string) => {
          if (!anchors) return v
          const i = categories.indexOf(v)
          return i >= 0 && anchors.has(i) ? v : ''
        },
      },
      tooltip: { enabled: false },
    },
    yaxis: { show: false },
    // เส้น: เว้นขอบ 8 — จุด/ป้ายวันแรกกับวันสุดท้ายอยู่ชิดขอบพอดี ถูกตัดครึ่ง ("1" เหลือ "l")
    grid: { borderColor: colors.grid, strokeDashArray: 3, padding: { left: isBar ? 0 : 8, right: isBar ? 0 : 8, top: 0 }, yaxis: { lines: { show: true } } },
    ...(todayLabel
      ? { annotations: { xaxis: [{ x: todayLabel, borderColor: colors.marker, strokeDashArray: 3, label: { text: W.today, position: 'top', orientation: 'horizontal', offsetY: -4, borderWidth: 0, style: { background: 'transparent', color: colors.marker, fontSize: '10px' } } }] } }
      : {}),
    tooltip: {
      shared: true,
      intersect: false,
      followCursor: false,
      custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
        const i = dataPointIndex
        if (i < 0 || i >= futureFromIndex) return ''
        const label = categories[i]
        const line = (c: string, t: string) =>
          `<div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:6px"></span>${t}</div>`
        const body = isProfit
          ? `<div style="font-weight:600">${label} · ${W.profit} ${fmtNum(series[0].data[i])}</div>`
          : (() => {
              const c = series[0].data[i]
              const u = series[1]?.data[i] ?? 0
              return (
                `<div style="font-weight:600;margin-bottom:2px">${label} · ${W.sales} ${fmtNum(c + u)}</div>` +
                line(colors.counted, `${W.closed} ${fmtNum(c)}`) +
                line(colors.notCounted, `${W.unclosed} ${fmtNum(u)}`)
              )
            })()
        return `<div style="padding:6px 10px;font-size:13px;line-height:1.6">${body}</div>`
      },
    },
  }
}
