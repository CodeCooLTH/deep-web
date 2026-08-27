'use client'

/**
 * AgentTrendChart — แนวโน้มรายวันของแอดมินหนึ่งคน (feature 00059)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/SalesReport.tsx
 *   (chart type 'line' + series ผสม area/line + `stroke.dashArray` + `grid.strokeDashArray: 7`
 *    + `colors: [getColor('chart-*')]` + `tooltip`/`legend` ชุดเดียวกัน)
 *   ผ่าน `@/components/wrappers/ApexChart` ตาม Hard Rule 10 — ห้าม import react-apexcharts ตรง
 *
 * ต่างจากธีม: ตัด `yaxis.max: 100` ที่ตายตัวออก (ธีมเป็น demo data ที่รู้เพดานล่วงหน้า
 * ของเรามีทั้งจำนวนแชทและวินาที ซึ่งสเกลต่างกันคนละหลัก) และแยกเป็น 2 แกน
 */
import ApexChart from '@/components/wrappers/ApexChart'
import Icon from '@/components/wrappers/Icon'
import { getColor } from '@/utils/helpers'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { formatResponseDuration } from '@/lib/agent-performance'
import type { ApexOptions } from 'apexcharts'

export type TrendPoint = {
  day: string
  conversations: number
  responseAvgSec: number | null
  orders: number
  conversionRatePct: number | null
  revenue: number
}

/**
 * กราฟผสมตัวเดียว ไม่มีแท็บให้สลับ (user เคาะ 2026-08-27: "ให้เป็น Mixed Chart เลย ไม่ต้อง switch")
 *
 * 🛑 ตัวเลข 5 ชนิดนี้อยู่คนละหน่วยกันหมด (ใบ · บาท · วินาที · เปอร์เซ็นต์) การวางทุกเส้นบนแกน
 * เดียวจะได้เส้นแบนติดพื้น 3 เส้นเสมอ ซึ่งอ่านว่า "ค่าน้อย" ทั้งที่แปลว่า "คนละหน่วย"
 * ⇒ ใช้ 4 แกน: แกนซ้ายเป็น "จำนวน" (แชท+คำสั่งซื้อ ซึ่งหน่วยเดียวกันจริง) · แกนขวาเป็นเงิน ·
 * เวลาตอบกับอัตราปิดการขายซ่อนแกนไว้ (`show: false`) แล้วไปโผล่ใน tooltip แทน
 * — เส้นยังเห็นรูปร่างการขึ้นลงได้ครบ แต่ไม่มีแกนตัวเลข 4 ชุดมาแย่งพื้นที่กัน
 */
export default function AgentTrendChart({
  points,
  canSeeRevenue,
}: {
  points: TrendPoint[]
  canSeeRevenue: boolean
}) {
  /** ป้ายแกน x — "18/8" สั้นพอไม่ทับกันเมื่อช่วงยาว (ปีไม่ต้องมี ทั้งกราฟอยู่ในช่วงเดียว) */
  const labels = points.map((p) => {
    const [, m, d] = p.day.split('-')
    return `${Number(d)}/${Number(m)}`
  })

  const hasAny = points.some(
    (p) => p.conversations > 0 || p.orders > 0 || p.revenue > 0 || p.responseAvgSec !== null,
  )

  const getOptions = (): ApexOptions => ({
    chart: { type: 'line', height: 340, toolbar: { show: false }, offsetX: 0, stacked: false },
    /* คอลัมน์ 2 แท่งแรก แล้วเส้น 3 เส้น — ลำดับต้องตรงกับ `series` ด้านล่างเป๊ะ */
    stroke: { width: [0, 0, 3, 2, 2], curve: 'smooth', dashArray: [0, 0, 0, 6, 3] },
    plotOptions: { bar: { columnWidth: '55%', borderRadius: 3 } },
    colors: [
      getColor('chart-primary'), // แชทที่ดูแล
      getColor('chart-secondary'), // คำสั่งซื้อ
      getColor('chart-alpha'), // ยอดขาย
      getColor('chart-delta'), // เวลาตอบ
      getColor('chart-beta'), // อัตราปิดการขาย
    ],
    grid: { strokeDashArray: 7 },
    dataLabels: { enabled: false },
    markers: { size: 0 },
    xaxis: { categories: labels, axisBorder: { show: false }, labels: { offsetY: 2 } },
    legend: { position: 'top', horizontalAlign: 'right', itemMargin: { horizontal: 8 } },
    series: [
      { name: 'แชทที่ดูแล', type: 'column', data: points.map((p) => p.conversations) },
      { name: 'คำสั่งซื้อ', type: 'column', data: points.map((p) => p.orders) },
      {
        name: 'ยอดขาย',
        type: 'line',
        // ไม่มีสิทธิ์เห็นเงิน = ไม่ส่งข้อมูลลงมาเลย ไม่ใช่ส่ง 0 (0 แปลว่า "ขายไม่ได้")
        data: canSeeRevenue ? points.map((p) => p.revenue) : points.map(() => null),
      },
      {
        name: 'เวลาตอบเฉลี่ย',
        type: 'line',
        // 🛑 null ต้องเป็นช่องว่างบนกราฟ ไม่ใช่ 0 — วันที่ไม่มีใครทักเข้ามาไม่ใช่
        // "วันที่ตอบเร็ว 0 วินาที" (Apex เว้นช่องให้เองเมื่อค่าเป็น null)
        data: points.map((p) => p.responseAvgSec),
      },
      {
        name: 'อัตราปิดการขาย',
        type: 'line',
        data: points.map((p) => p.conversionRatePct),
      },
    ],
    yaxis: [
      { seriesName: 'แชทที่ดูแล', tickAmount: 4, min: 0, axisBorder: { show: false }, labels: { offsetX: -6 } },
      { seriesName: 'แชทที่ดูแล', show: false },
      {
        seriesName: 'ยอดขาย',
        opposite: true,
        show: canSeeRevenue,
        tickAmount: 4,
        min: 0,
        axisBorder: { show: false },
        labels: { formatter: (v: number) => formatNumberNoSymbol(Math.round(v)) },
      },
      { seriesName: 'เวลาตอบเฉลี่ย', show: false },
      { seriesName: 'อัตราปิดการขาย', show: false, min: 0, max: 100 },
    ],
    tooltip: {
      shared: true,
      intersect: false,
      /* หน่วยต่างกันทุกเส้น ⇒ ต้องจัดรูปทีละเส้น ไม่งั้น 27208 จะอ่านว่า "27,208 อะไร" */
      y: {
        formatter: (v: number, opts?: { seriesIndex: number }) => {
          if (v === null || v === undefined) return '—'
          switch (opts?.seriesIndex) {
            case 2:
              return formatBaht(v)
            case 3:
              return formatResponseDuration(v)
            case 4:
              return `${v}%`
            default:
              return formatNumberNoSymbol(v)
          }
        },
      },
    },
  })

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">แนวโน้มรายวัน</h4>
        <span className="text-default-400 text-xs">
          เวลาตอบและอัตราปิดการขายซ่อนแกนไว้ — ดูค่าได้ที่ทูลทิป
        </span>
      </div>
      <div className="card-body">
        {hasAny ? (
          <ApexChart type="line" height={340} getOptions={getOptions} />
        ) : (
          <p className="text-default-500 flex items-center justify-center gap-2 py-16 text-sm">
            <Icon icon="chart-line" className="text-base" aria-hidden="true" />
            ยังไม่มีข้อมูลในช่วงเวลาที่เลือก
          </p>
        )}
      </div>
    </div>
  )
}
