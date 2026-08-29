'use client'

/**
 * ProductSalesChart — กราฟเส้นยอดขายรายวันของสินค้าที่เลือก (feature 00063)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx
 *   (chart type 'line' + `stroke.curve: 'smooth'` + `grid.strokeDashArray: 7` +
 *    `colors: [getColor('chart-*')]` + โครง legend/tooltip ชุดเดียวกัน)
 *   ผ่าน `@/components/wrappers/ApexChart` ตาม Hard Rule 10 — ห้าม import react-apexcharts ตรง
 * Base (annotation แถบเทาของวันที่ยังไม่ถึง):
 *   theme/paces/Admin/TS/src/app/(admin)/charts/apex/line/components/data.ts
 *
 * ต่างจาก AgentTrendChart: ที่นั่นทุกเส้นคนละหน่วยจึงต้องมี 4 แกน — **ที่นี่ทุกเส้นหน่วยเดียวกัน**
 * (จำนวนชิ้น หรือ บาท อย่างใดอย่างหนึ่งทั้งกราฟ) จึงเหลือแกนเดียว
 */
import type { ApexOptions } from 'apexcharts'

import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { CHART_COLOR_TOKENS } from '@/lib/product-sales-month'
import { getColor } from '@/utils/helpers'
import type { SalesUnit } from './data'

export type ChartSeries = { key: string; name: string; data: number[] }

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

  const getOptions = (): ApexOptions => ({
    chart: { type: 'line', height, toolbar: { show: false }, offsetX: 0 },
    /**
      * 🛑 `curve: 'straight'` ไม่ใช่ `'smooth'` — ข้อมูลคือยอดรายวันที่กระจัดกระจายและเป็นศูนย์
      * เป็นส่วนใหญ่ เส้นโค้งของ Apex จะเลยจุดควบคุม ⇒ สินค้าที่ขายวันที่ 5 กับวันที่ 20
      * จะถูกวาดเป็นเนินต่อเนื่องคร่อมวันที่ 6–19 ทั้งที่วันเหล่านั้นขายไม่ได้เลยสักชิ้น
      * = กราฟประดิษฐ์ยอดขายขึ้นมาเอง บนหน้าที่ทั้งหน้าถูกสร้างมาเพื่อตอบว่า "ขายวันไหน"
      * (ไฟล์ต้นแบบใช้ smooth เพราะข้อมูลของมันเป็นรายได้ต่อเนื่อง — เส้นโค้งถูกสืบทอดมา
      *  แต่ชนิดของข้อมูลไม่ได้ถูกสืบทอดมาด้วย)
      * `dashArray` แยกเส้นด้วย *รูปแบบ* ไม่ใช่สีอย่างเดียว — 6 สีของธีมยุบเหลือ ~3 คู่
      * เมื่อมองด้วยตาที่แยกแดง-เขียวไม่ได้ (WCAG 1.4.1)
      */
    stroke: { width: 2, curve: 'straight', dashArray: [0, 0, 4, 4, 8, 8] },
    colors: CHART_COLOR_TOKENS.map((t) => getColor(t)),
    grid: { strokeDashArray: 7 },
    dataLabels: { enabled: false },
    // จุดบนเส้น = วันที่มีการขายจริง ถ้าไม่มีจุด ผู้อ่านแยกไม่ออกว่าค่าไหนคือข้อมูลจริง
    markers: { size: 3, strokeWidth: 0 },
    xaxis: {
      categories: labels,
      axisBorder: { show: false },
      labels: {
        offsetY: 2,
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
    yaxis: {
      min: 0,
      tickAmount: 4,
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
    tooltip: {
      shared: true,
      intersect: false,
      x: { formatter: (v: number) => `วันที่ ${v}` },
      y: {
        formatter: (v: number) => (v === null || v === undefined ? '—' : fmt(v)),
      },
    },
    /**
      * 🛑 วันที่ยังมาไม่ถึง = `null` ไม่ใช่ `0` — Apex จะไม่ลากเส้นไปถึงเลย เส้นจบที่วันนี้พอดี
      *
      * ฉบับแรกใช้ annotation แถบเทาคลุมวันอนาคตแทน ซึ่ง **พังบน prod**: annotation อ้างอิง
      * category ด้วยสตริง (`labels[futureFrom]`) แต่ `xaxis.labels.formatter` คืนค่าว่างให้
      * วันส่วนใหญ่ ⇒ Apex หา category นั้นไม่เจอ เลยตกไปที่ตำแหน่ง 0 **แถบจึงคลุมทั้งกราฟ**
      * และป้ายไปเกาะมุมซ้ายบนทับตัวเลขแกน Y (user เจอเองจากภาพหน้าจอ 2026-08-29)
      *
      * การส่ง `null` แก้ปัญหาเดิม (หางแบนติดพื้นถึงสิ้นเดือนอ่านเป็น "ยอดร่วง") ได้ตรงกว่า
      * โดยไม่ต้องพึ่ง annotation เลย — และเป็นท่าเดียวกับที่ `AgentTrendChart` ใช้อยู่แล้ว
      * ("null ต้องเป็นช่องว่างบนกราฟ ไม่ใช่ 0")
      */
    series: series.map((s) => ({
      name: s.name,
      type: 'line',
      data:
        futureFrom === null
          ? s.data
          : s.data.map((v, i) => (i >= futureFrom ? null : v)),
    })),
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
