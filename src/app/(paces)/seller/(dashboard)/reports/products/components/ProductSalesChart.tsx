'use client'

/**
 * ProductSalesChart — แท่งซ้อนรายวัน + เส้นยอดรวมของวัน (feature 00063)
 *
 * Base: src/app/(paces)/seller/(dashboard)/dashboard/components/SalesChartCard.tsx
 *   (mixed chart ของ Command Center: `type:'line'` + `stacked` + `stackOnlyBar` +
 *    `columnWidth 92%` + `borderRadius 1` + เส้น `primary` หนา 2 + `markers.size 2` +
 *    grid `chart-border-color` ประ 4 + ป้ายแกน 10px)
 *   ซึ่ง cite Base ต่อไปที่ theme/paces/.../widgets/charts/components/ ตาม Hard Rule 10
 *   ผ่าน `@/components/wrappers/ApexChart` — ห้าม import react-apexcharts ตรง
 *
 * 🛑 **เลิกใช้กราฟเส้นแล้ว** (user สั่ง 2026-08-29 หลังเปิด prod: "ไม่เอากราฟเส้น เอา bar
 * chart ดีกว่า stacked") — เส้น 3–6 เส้นวิ่งทับกันในแถบค่า 0–6 ที่แคบมาก **ไม่ว่าจะแต่งสี
 * ลดจุด หรือลดจำนวนเส้นอย่างไร เส้นก็ยังตัดกันอยู่ดี** เพราะปัญหาอยู่ที่รูปแบบกราฟเอง
 * ไม่ใช่พารามิเตอร์ของมัน · แท่งซ้อนมี 1 แท่งต่อ 1 วัน ⇒ ไม่มีอะไรตัดกันได้โดยโครงสร้าง
 *
 * 🛑 `stackOnlyBar: true` **ห้ามถอด** — ถ้าไม่มี เส้นยอดรวมจะถูกบวกทับยอดสะสมของแท่ง
 * แล้วไปลอยอยู่ที่ 2 เท่าของค่าจริง (คอมเมนต์ของ SalesChartCard เขียนเตือนเรื่องนี้ไว้เอง)
 *
 * 🛑 สีแท่งใช้ตระกูล `chart-*` **ไม่ใช่ success/warning แบบ Command Center** — ที่นั่นแท่ง
 * คือ *สถานะ* (ยืนยันแล้ว/รอยืนยัน) เขียวจึงแปลว่า "สำเร็จ" ตาม Verified-Means-Green
 * ของเราแท่งคือ *สินค้า* ถ้าใช้เขียว สินค้าตัวแรกจะดูเหมือน "ผ่านแล้ว" ทั้งที่ไม่ได้แปลว่าอะไร
 * ส่วน **เส้นยอดรวมใช้ `primary` เหมือน Command Center เป๊ะ**
 */
import type { ApexOptions } from 'apexcharts'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { CHART_COLOR_TOKENS } from '@/lib/product-sales-month'
import { getColor } from '@/utils/helpers'
import type { SalesUnit } from './data'

export type ChartSeries = {
  key: string
  name: string
  data: number[]
  /** URL รูปสินค้า — null ได้เสมอ (แถว "รายการที่พิมพ์เอง" ไม่มีรูปโดยนิยาม) */
  image: string | null
}

/**
 * ชื่อของเส้นยอดรวม — SSOT ของคำนี้ ใช้ทั้งใน series, legend และ tooltip
 * 🛑 ห้ามพิมพ์ซ้ำที่อื่น (HR16) — legend กับ tooltip ต้องเรียกของสิ่งเดียวกันด้วยคำเดียวกัน
 */
export const SUM_SERIES_NAME = 'ยอดรวมของวัน'

/** หนีอักขระ HTML — ชื่อสินค้าเป็นข้อความที่ผู้ขายพิมพ์เอง และ tooltip ต่อเป็น HTML string ดิบ */
function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type Props = {
  series: ChartSeries[]
  unit: SalesUnit
  /** ดัชนีวันแรกที่ยังมาไม่ถึง (0-based) — null = เดือนนี้จบแล้ว ไม่ต้องเทาอะไร */
  futureFrom: number | null
  days: number
  height?: number
  /** true = โหมดเส้นเดียวในชีตมือถือ (ไม่ต้องมี legend) */
  compact?: boolean
}

export default function ProductSalesChart({
  series,
  unit,
  futureFrom,
  days,
  height = 340,
  compact = false,
}: Props) {
  /** ป้ายแกน x = เลขวันที่ล้วน — ทั้งกราฟอยู่ในเดือนเดียว เดือน/ปีจึงไม่ต้องซ้ำ 31 ครั้ง */
  const labels = Array.from({ length: days }, (_, i) => String(i + 1))

  const fmt = (v: number) => (unit === 'baht' ? formatBaht(v) : formatNumberNoSymbol(v))


  /**
   * ยอดรวมของแต่ละวัน = ความสูงของแท่งซ้อน และเป็นข้อมูลของ "เส้น" ด้วย (user เลือกแบบ ก.
   * 2026-08-29: เส้นวาดยอดรวมของสินค้าที่ติ๊กไว้ ไม่ใช่ของทั้งร้าน)
   */
  const dailyTotal = Array.from({ length: days }, (_, i) =>
    series.reduce((sum, s) => sum + (s.data[i] ?? 0), 0),
  )

  /** เพดานแกน Y คิดจาก "ยอดรวมของวัน" ไม่ใช่ค่าสูงสุดของสินค้าตัวใดตัวหนึ่ง (แท่งซ้อนกัน) */
  const dataMax = dailyTotal.reduce((m, v) => (v > m ? v : m), 0)
  const yTicks = Math.min(4, Math.max(1, Math.ceil(dataMax)))
  const yMax = Math.max(1, Math.ceil(dataMax / yTicks) * yTicks)

  const getOptions = (): ApexOptions => ({
    chart: {
      type: 'line' as const, // mixed — ชนิดจริงกำหนดรายซีรีส์ด้านล่าง
      height,
      stacked: true,
      stackOnlyBar: true, // 🛑 ห้ามถอด — ไม่งั้นเส้นถูกบวกทับยอดสะสมไปอยู่ที่ 2 เท่า
      toolbar: { show: false },
      zoom: { enabled: false },
      selection: { enabled: false }, // จิ้มลากบนมือถือแล้วเกิดกล่อง selection ค้าง (บทเรียนของ SalesChartCard)
    },
    plotOptions: { bar: { columnWidth: '92%', borderRadius: 1 } },
    /** เส้นเฉพาะซีรีส์สุดท้าย (ยอดรวม) — แท่งไม่มีขอบ ตามที่ user เคาะไว้ที่ Command Center */
    stroke: {
      show: true,
      width: [...series.map(() => 0), 2],
      curve: 'straight' as const,
      colors: [...series.map(() => 'transparent'), getColor('primary')],
    },
    colors: [...series.map((_, i) => getColor(CHART_COLOR_TOKENS[i % CHART_COLOR_TOKENS.length])), getColor('primary')],
    grid: {
      show: true,
      borderColor: getColor('chart-border-color'),
      strokeDashArray: 4,
      xaxis: { lines: { show: false } }, // เส้นตั้งรกกับแท่ง 31 อัน
      yaxis: { lines: { show: true } },
    },
    dataLabels: { enabled: false },
    /** marker เล็ก ๆ บนเส้นยอดรวมเท่านั้น — แท่งไม่มี marker อยู่แล้ว */
    markers: { size: 2, strokeWidth: 0, colors: [getColor('primary')] },
    xaxis: {
      categories: labels,
      axisBorder: { show: false },
      labels: {
        offsetY: 2,
        style: { fontSize: '10px', colors: getColor('default-700') },
        /**
         * 31 ป้ายชนกันแน่นอนบนความกว้างจริง — โชว์ทุก 5 วัน + วันสุดท้ายเสมอ
         * (แพตเทิร์นเดียวกับ `sales-chart-axis.ts` ที่หน้า dashboard ใช้ด้วยเหตุผลเดียวกัน)
         */
        formatter: (value: string) => {
          const n = Number(value)
          if (!Number.isFinite(n)) return value
          // เว้นระยะจากวันสุดท้ายอย่างน้อย 3 วัน — ไม่งั้นเดือน 31 วันจะได้ป้าย 30 กับ 31
          // ติดกัน ซึ่งคือการชนที่คอมเมนต์ข้างบนบอกว่ากันอยู่
          return n === 1 || n === days || (n % 5 === 0 && days - n >= 3) ? value : ''
        },
      },
    },
    /**
     * 🛑 โหมด "จำนวนชิ้น" ต้องได้ tick เป็นจำนวนเต็มเสมอ — `tickAmount: 4` ตายตัวกับค่าสูงสุด
     * ระดับ 6 ให้ tick เศษ (1.5 / 3 / 4.5 / 6) ซึ่งอ่านว่า "ขายได้ครึ่งชิ้น"
     * คำนวณเพดานให้หารลงตัวกับจำนวน tick เสมอ · โหมดบาทปล่อยอัตโนมัติ (ตัวเลขใหญ่พอไม่มีปัญหานี้)
     */
    yaxis: {
      min: 0,
      ...(unit === 'qty' ? { tickAmount: yTicks, max: yMax } : { tickAmount: 4 }),
      axisBorder: { show: false },
      labels: {
        offsetX: -6,
        formatter: (v: number) => formatNumberNoSymbol(Math.round(v)),
      },
    },
    legend: compact
      ? { show: false }
      : {
          position: 'bottom',
          horizontalAlign: 'left',
          itemMargin: { horizontal: 8, vertical: 4 },
          // 🛑 ปิด toggle ของ legend — ค่าตั้งต้นของ Apex คือกดชื่อแล้วซ่อนเส้น ซึ่งทำให้มี
          // สวิตช์สองตัวคุมของสิ่งเดียวกัน: เส้นหายแต่ช่องติ๊กยังติดอยู่และยังกินโควตา 6 เส้น
          onItemClick: { toggleDataSeries: false },
          onItemHover: { highlightDataSeries: true },
        },
    /**
     * tooltip เขียน HTML เอง เพื่อใส่ **รูปสินค้า** (user ขอ 2026-08-29)
     * Base: src/app/(paces)/seller/(dashboard)/dashboard/components/SalesChartSheet.tsx:318
     *   (แพตเทิร์น `tooltip.custom` คืน HTML string · inline style เพราะ render นอก React tree
     *    · สีมาจาก `getColor()` ไม่ hardcode hex)
     *
     * 🛑 เรียก `<Icon>` ข้างในไม่ได้ — ตรงนี้อยู่นอก React tree เป็นสตริงล้วน สินค้าที่ไม่มีรูป
     * จึงได้กล่องเทาเปล่า ไม่ใช่ไอคอน (ต่างจากในตารางที่ `ProductThumb` ใส่ไอคอนได้)
     * 🛑 ชื่อสินค้าเป็นข้อความที่ผู้ขายพิมพ์เอง ⇒ ต้อง escape ก่อนต่อเป็น HTML
     * 🛑 ค่า radius ต้องอยู่ในบันไดของ DESIGN.md (4/6/8/10/14) — กล่องนอก 6px (rounded.md)
     *    รูปข้างใน 4px (rounded.sm) · เคยเขียน 5px ซึ่งไม่มีในบันได (impeccable hook จับได้)
     */
    tooltip: {
      shared: true,
      intersect: false,
      custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
        // โทเคนของธีมเสมอ ห้าม hex ดิบ แม้จะอยู่ในสตริง HTML (HR7 — theme-guard จับได้จริง)
        const placeholderBg = getColor('default-100')
        const dividerColor = getColor('default-200')
        const rows = series
          .map((s, i) => {
            const v = s.data[dataPointIndex]
            const ring = getColor(CHART_COLOR_TOKENS[i % CHART_COLOR_TOKENS.length])
            const thumb = s.image
              ? `<img src="${esc(s.image)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:4px" />`
              : ''
            return (
              `<div style="display:flex;align-items:center;gap:8px;padding:3px 0">` +
              `<span style="flex:0 0 auto;width:28px;height:28px;border-radius:6px;overflow:hidden;` +
              `background:${placeholderBg};box-shadow:0 0 0 2px ${ring}">${thumb}</span>` +
              `<span style="flex:1 1 auto;min-width:0;max-width:150px;overflow:hidden;` +
              `text-overflow:ellipsis;white-space:nowrap">${esc(s.name)}</span>` +
              `<span style="flex:0 0 auto;font-weight:600;font-variant-numeric:tabular-nums">` +
              `${v === null || v === undefined ? '—' : esc(fmt(v))}</span>` +
              `</div>`
            )
          })
          .join('')
        // แถวยอดรวม — คั่นเส้นให้เห็นว่าเป็นคนละชั้นกับรายสินค้า และใช้สีเดียวกับเส้นบนกราฟ
        const total = dailyTotal[dataPointIndex] ?? 0
        const sumRow =
          `<div style="display:flex;align-items:center;gap:8px;padding:6px 0 0;margin-top:4px;` +
          `border-top:1px solid ${dividerColor}">` +
          `<span style="flex:0 0 auto;width:28px;display:flex;justify-content:center">` +
          `<span style="width:14px;height:3px;border-radius:9999px;background:${getColor('primary')}"></span></span>` +
          `<span style="flex:1 1 auto;color:${getColor('default-500')}">${SUM_SERIES_NAME}</span>` +
          `<span style="flex:0 0 auto;font-weight:600;font-variant-numeric:tabular-nums">${esc(fmt(total))}</span>` +
          `</div>`
        return (
          `<div style="padding:8px 10px;min-width:220px;font-size:13px">` +
          `<div style="font-weight:600;padding-bottom:6px;margin-bottom:4px;` +
          `border-bottom:1px solid ${dividerColor}">วันที่ ${dataPointIndex + 1}</div>${rows}${sumRow}</div>`
        )
      },
    },
    /**
     * 🛑 วันที่ยังมาไม่ถึง = `null` ไม่ใช่ `0` — Apex จะไม่วาดแท่งและเส้นจบที่วันนี้พอดี
     * ถ้าใช้ 0 จะได้แท่งความสูงศูนย์เรียงเป็นแถวและเส้นดิ่งลงพื้น ซึ่งอ่านเป็น "ยอดร่วง"
     * ทั้งที่แปลว่า "ยังไม่ถึงวันนั้น"
     */
    series: [
      ...series.map((s) => ({
        name: s.name,
        type: 'column' as const,
        data: futureFrom === null ? s.data : s.data.map((v, i) => (i >= futureFrom ? null : v)),
      })),
      {
        name: SUM_SERIES_NAME,
        type: 'line' as const,
        data: futureFrom === null ? dailyTotal : dailyTotal.map((v, i) => (i >= futureFrom ? null : v)),
      },
    ],
  })

  if (series.length === 0) {
    return (
      /**
       * 🛑 ข้อความต้องต่างกันตาม breakpoint — ที่ 768–1023px กราฟแสดงแล้ว แต่ตารางที่มี
       * ช่องติ๊กเป็น `hidden lg:block` สิ่งที่อยู่ด้านล่างคือรายการการ์ดซึ่งไม่มีช่องติ๊กเลย
       * ⇒ ประโยค "เลือกจากตารางด้านล่าง" เป็นคำสั่งที่ทำตามไม่ได้ ผู้ใช้แท็บเล็ตติดตาย
       * (พบโดย /impeccable clarify 2026-08-29)
       */
      <p className="text-default-500 flex items-center justify-center gap-2 py-16 text-center text-sm">
        <Icon icon="chart-line" className="shrink-0 text-base" aria-hidden="true" />
        <span className="lg:hidden">เดือนนี้ยังไม่มีสินค้าที่มียอดขายพอจะลากเส้นแนวโน้มได้</span>
        <span className="hidden lg:inline">ติ๊กสินค้าในตารางด้านล่างเพื่อดูเส้นแนวโน้ม</span>
      </p>
    )
  }

  return (
    <ApexChart
      type="line"
      height={height}
      // 🛑 ส่ง `key` ให้ React ทิ้ง instance เดิมเมื่อชุดเส้นเปลี่ยน — ApexCharts จำ series เดิมไว้
      // แล้ว animation ของเส้นที่ถูกถอดออกจะค้างเป็นเงา
      key={`${unit}-${series.map((s) => s.key).join('|')}`}
      getOptions={getOptions}
    />
  )
}
