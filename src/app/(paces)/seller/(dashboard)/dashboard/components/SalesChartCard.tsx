'use client'

/**
 * SalesChartCard — การ์ด mini ยอดขาย (command center) จิ้ม → เปิด SalesChartSheet เต็มจอ
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 *   (.card/.card-body shell + chg indicator: arrow-up/arrow-down + text-success/text-danger)
 *
 * Sparkline ใช้ ApexChart wrapper แล้ว (v2 2026-08-02) — ของเดิมเป็น div bars ที่ประกอบเอง
 * โดยอ้างว่า "ไม่ใช่กราฟจริงเลยไม่เข้า HR10" แต่ safepay-ux ชี้ว่าธีมมี sparkline pattern อยู่จริง
 * (charts/apex/sparklines/) จึงต้องใช้ของธีม ไม่ใช่ประกอบเอง
 */
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import ApexChart from '@/components/wrappers/ApexChart'
import { getColor } from '@/utils/helpers'
import type { ApexOptions } from 'apexcharts'
import { formatBaht, profitDisplay } from '@/lib/format-money'
import type { SalesSeries } from '../_constants/command-center'
import SalesChartSheet from './SalesChartSheet'

type Props = {
  /** null/undefined = fetch เดือนนี้ล้มตอน SSR → ซ่อนการ์ดทั้งหมด (honest-hide) */
  initialSeries: SalesSeries | null | undefined
}

export default function SalesChartCard({ initialSeries }: Props) {
  const [open, setOpen] = useState(false)

  if (!initialSeries) return null

  const {
    confirmedValues, unconfirmedValues, expenseValues,
    total, prevTotal, futureFromIndex, totalExpense, netProfit,
  } = initialSeries
  // prevTotal===0 → คำนวณ % ไม่ได้ (หาร 0) → ซ่อน chg indicator
  const chg = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null
  // ไม่ผ่าน gate สิทธิ์ค่าใช้จ่าย → ไม่มีกำไรให้แสดง: hero กลับไปเป็นยอดขายเหมือนเดิม
  const profit = totalExpense != null ? profitDisplay(netProfit ?? 0) : null

  /** ไม่ผ่าน gate สิทธิ์ = ไม่มีแท่งค่าใช้จ่าย สไปรค์ไลน์เหลือทิศเดียวเหมือนเดิมทุกประการ */
  const expValues = expenseValues ?? null

  /** ตัดวันในอนาคตออกจากทุก series พร้อมกัน — ให้ความยาวเท่ากันเสมอ ไม่งั้น ApexCharts จัดแกนเพี้ยน */
  const upTo = <T,>(arr: T[]) => arr.slice(0, futureFromIndex)
  const sparkSeries = [
    { name: 'ลูกค้ายืนยันแล้ว', data: upTo(confirmedValues) },
    { name: 'รอลูกค้ายืนยัน', data: upTo(unconfirmedValues) },
    // ติดลบ = ApexCharts วางใต้เส้นศูนย์ให้เอง (สเกลร่วมกับด้านบนอัตโนมัติ)
    ...(expValues ? [{ name: 'ค่าใช้จ่าย', data: upTo(expValues).map((v) => -v) }] : []),
  ]

  const getSparkOptions = (): ApexOptions => ({
    chart: { type: 'bar', height: 56, stacked: true, sparkline: { enabled: true } },
    plotOptions: { bar: { columnWidth: '70%' } },
    // สีตรงกับซีรีส์ในชีตยอดขายเป๊ะ — token เท่านั้น ห้าม hardcode hex (Hard Rule 10)
    colors: expValues
      ? [getColor('chart-primary'), getColor('warning'), getColor('chart-beta')]
      : [getColor('chart-primary'), getColor('warning')],
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: { enabled: false },
  })

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card w-full text-start"
        aria-label="ดูรายงานยอดขายและกำไร"
      >
        <div className="card-body">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Icon icon="chart-bar" className="size-4 text-primary" />
              <span className="text-sm font-bold text-dark">ยอดขายและกำไร</span>
              <span className="text-sm text-default-700">· เดือนนี้</span>
            </div>
            <Icon icon="chevron-right" className="size-4 text-default-700" />
          </div>

          {/* ตัวเลขพระเอก = กำไรสุทธิ (ร้านที่มีสิทธิ์ดู) ส่วนยอดขายลงมาเป็นบรรทัดรอง
              เดิม hero เป็นยอดขายซึ่งไม่หักค่าใช้จ่าย ผู้ใช้จึงไม่รู้กำไรจริง (feedback prod 2026-08-02)
              %เทียบเดือนก่อนต้องอยู่ข้าง "ขายได้" เพราะ prevTotal คือยอดขายเดือนก่อน ไม่ใช่กำไรเดือนก่อน */}
          {/* ต้อง render label เสมอ — `profit.text` ไม่มีคำนำหน้าแล้ว ทิศทางสื่อผ่าน label + สี
              ถ้าไม่มี label ตัวเลขจะลอยจนอ่านไม่ออกว่าเป็นกำไรหรือยอดขาย */}
          <p className="text-default-700 text-xs">{profit ? profit.label : 'ยอดขาย'}</p>
          <p className={`text-xl font-bold ${profit ? profit.toneClass : 'text-dark'}`}>
            {profit ? profit.text : formatBaht(total)}
          </p>
          {(profit || chg != null) && (
            <p className="mb-3 flex items-center gap-2 text-sm text-default-700">
              {profit && <span>ยอดขายทั้งหมด {formatBaht(total)}</span>}
              {chg != null && (
                <span
                  className={`inline-flex items-center gap-0.5 font-semibold ${
                    chg > 0 ? 'text-success-ink' : chg < 0 ? 'text-danger-ink' : 'text-default-700'
                  }`}
                >
                  {chg !== 0 && <Icon icon={chg > 0 ? 'arrow-up' : 'arrow-down'} className="size-3.5" aria-hidden="true" />}
                  {Math.abs(chg)}%
                </span>
              )}
            </p>
          )}

          {/* สไปรค์ไลน์ — ApexChart สองทิศ: ยอดขาย stack ขึ้น (ยืนยันแล้ว/รอยืนยัน), ค่าใช้จ่ายลงล่าง
              Base: theme/paces/Admin/TS/src/app/(admin)/charts/apex/sparklines/components/data.ts
                    (`chart: { sparkline: { enabled: true } }` ผ่าน ApexChart wrapper)
              ของเดิมเป็น div bars ที่ประกอบเอง — safepay-ux ชี้ว่าธีมมี pattern จริงรออยู่ (2026-08-02)

              ค่าใช้จ่ายส่งเป็น "ค่าติดลบ" ให้ ApexCharts วางใต้เส้นศูนย์เอง ไม่ต้องประกอบสองบล็อก
              และได้สเกลร่วมอัตโนมัติ (1px บน = 1px ล่าง = จำนวนบาทเท่ากัน) ตรงตามเจตนาเดิม

              แท่งเทาของ "วันในอนาคต" ถูกตัดทิ้ง — มันเป็น placeholder ยุค div ที่ไม่ใช่ข้อมูล
              กราฟที่ไม่มีแท่งในวันที่ยังไม่ถึงคือการบอกความจริงตรง ๆ อยู่แล้ว

              tooltip ปิด — การ์ดทั้งใบเป็นปุ่มเปิดชีต การมี tooltip แย่งการแตะบนมือถือ */}
          <ApexChart getOptions={getSparkOptions} series={sparkSeries} type="bar" height={56} />
        </div>
      </button>

      {open && <SalesChartSheet initialSeries={initialSeries} onClose={() => setOpen(false)} />}
    </>
  )
}
