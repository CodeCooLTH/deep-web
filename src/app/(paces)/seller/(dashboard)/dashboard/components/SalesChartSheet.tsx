'use client'

/**
 * SalesChartSheet — full-screen sheet รายงานยอดขาย (จาก SalesChartCard บน command center)
 *
 * Shell: copy pattern จาก orders/new/components/AddressSearchSheet.tsx
 *   (fixed inset-0 z-80 flex flex-col bg-card, header back+title, ESC ปิด, role="dialog")
 * Chart: Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/FinancialOverview.tsx
 *   (plotOptions.bar + multi-series colors array pattern) ผ่าน @/components/wrappers/ApexChart (HR10)
 *   — ห้าม import react-apexcharts ตรง; อ้าง in-app precedent SalesReport.tsx (ApexChart + getColor + build-options fn)
 *   Stacked bar (ยืนยันแล้ว=น้ำเงิน / ยังไม่ยืนยัน=เหลือง): ใช้ ApexCharts `stacked: true` มาตรฐาน
 *   บนโครง plotOptions.bar เดิมจาก FinancialOverview.tsx + สี token getColor('chart-primary')/getColor('warning')
 */
import { useState, useEffect, useRef } from 'react'
import Icon from '@/components/wrappers/Icon'
import ApexChart from '@/components/wrappers/ApexChart'
import { getColor } from '@/utils/helpers'
import { formatMonthYearTH } from '@/lib/format-date'
import type { ApexOptions } from 'apexcharts'
import type { SalesSeries } from '../_constants/command-center'
import SellerEmptyState from '../../_shared/SellerEmptyState'

type Mode = 'daily' | 'monthly'

type Props = {
  initialSeries: SalesSeries
  onClose: () => void
}

// เดือนไทยแบบย่อ — local ใช้แค่ subLabel ช่วงวันของโหมดรายวัน (ห้ามแตะ src/lib/format-date.ts)
const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

/**
 * สร้าง ApexOptions จาก SalesSeries จริง — bar chart แท่ง stacked 2 สี:
 * ยืนยันแล้ว (buyer confirm) = น้ำเงิน (chart-primary), ยังไม่ยืนยัน (PENDING/SHIPPED) = เหลือง (warning)
 */
export const buildSalesChartOptions = (series: SalesSeries, mode: Mode): ApexOptions => {
  const { labels, confirmedValues, unconfirmedValues, expenseValues } = series
  const isDaily = mode === 'daily'
  // undefined = ไม่มีสิทธิ์ดูข้อมูลการเงิน (feature 00016) → ไม่มีแท่งค่าใช้จ่ายเลย
  const showExpense = expenseValues != null

  return {
    /**
     * ยอดขาย (ยืนยันแล้ว+ยังไม่ยืนยัน) stack กันได้เพราะเป็นเงินก้อนเดียวกันคนละสถานะ
     * แต่ค่าใช้จ่ายอยู่คนละ `group` — ApexCharts จะวางเป็นแท่งแยกข้างกัน ไม่ต่อยอดขึ้นไป
     * ถ้า stack รวมกัน ความสูงรวมจะถูกอ่านว่า "ยอดขาย" ทั้งที่ครึ่งหนึ่งเป็นเงินที่จ่ายออก
     */
    series: [
      { name: 'ยืนยันแล้ว', group: 'sales', data: confirmedValues },
      { name: 'ยังไม่ยืนยัน', group: 'sales', data: unconfirmedValues },
      ...(showExpense ? [{ name: 'ค่าใช้จ่าย', group: 'expense', data: expenseValues }] : []),
    ],
    chart: { type: 'bar', height: 220, stacked: true, toolbar: { show: false } },
    plotOptions: { bar: { columnWidth: '55%', borderRadius: 3 } },
    legend: { show: true, position: 'top', fontSize: '11px' },
    dataLabels: { enabled: false },
    // น้ำเงิน = ยืนยันแล้ว, เหลือง = ยังไม่ยืนยัน, แดง = ค่าใช้จ่าย — token ทั้งหมด (ห้าม hardcode hex)
    // หมายเหตุ: ไม่มี token 'chart-warning' โดยเฉพาะ ใช้ 'warning' (--color-warning เหลือง/amber) แทน
    colors: showExpense
      ? [getColor('chart-primary'), getColor('warning'), getColor('chart-beta')]
      : [getColor('chart-primary'), getColor('warning')],
    xaxis: {
      categories: labels,
      axisBorder: { show: false },
      axisTicks: { show: false },
      // รายวัน: ~7 label กระจาย (ApexCharts thin เอง — formatter รับ index ไม่ได้ในแกน category);
      // รายเดือน: 12 เดือนพอดี โชว์ครบ. hideOverlappingLabels กันชนกันบนจอแคบ
      tickAmount: isDaily ? 7 : undefined,
      labels: { hideOverlappingLabels: true, style: { fontSize: '10px' } },
    },
    yaxis: { show: false },
    grid: { show: false },
    // custom tooltip: โชว์ ยืนยันแล้ว / ยังไม่ยืนยัน แยกกัน + รวม (พร้อมจุดสี token — ไม่ hardcode hex)
    tooltip: {
      shared: true,
      intersect: false,
      custom: ({ series, dataPointIndex, w }: { series: number[][]; dataPointIndex: number; w: { globals: { labels: string[] } } }) => {
        const conf = Number(series?.[0]?.[dataPointIndex] ?? 0)
        const unconf = Number(series?.[1]?.[dataPointIndex] ?? 0)
        const fmt = (n: number) => '฿' + n.toLocaleString('th-TH')
        const label = w?.globals?.labels?.[dataPointIndex] ?? ''
        const dot = (c: string) =>
          `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${c};margin-right:6px"></span>`
        return (
          `<div style="padding:6px 10px;font-size:12px;line-height:1.6">` +
          `<div style="font-weight:600;margin-bottom:2px">${label}</div>` +
          `<div>${dot(getColor('chart-primary'))}ยืนยันแล้ว ${fmt(conf)}</div>` +
          `<div>${dot(getColor('warning'))}ยังไม่ยืนยัน ${fmt(unconf)}</div>` +
          `<div style="font-weight:600;margin-top:4px">รวม ${fmt(conf + unconf)}</div>` +
          `</div>`
        )
      },
    },
  }
}

export default function SalesChartSheet({ initialSeries, onClose }: Props) {
  const now = new Date()
  const nowYear = now.getFullYear()
  const nowMonth = now.getMonth() + 1

  const [mode, setMode] = useState<Mode>('daily')
  const [year, setYear] = useState(nowYear)
  const [month, setMonth] = useState(nowMonth)
  const [series, setSeries] = useState<SalesSeries>(initialSeries)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  // เปิดครั้งแรกใช้ initialSeries ที่มีอยู่แล้ว — ข้าม fetch รอบแรก
  const isFirstRun = useRef(true)

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    let cancelled = false
    setLoading(true)
    setError(false)
    const qs = new URLSearchParams({ mode, year: String(year) })
    if (mode === 'daily') qs.set('month', String(month))
    fetch(`/api/seller/sales-series?${qs.toString()}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json() as Promise<SalesSeries>
      })
      .then((data) => {
        if (!cancelled) setSeries(data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, year, month])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  const isCurrentPeriod = mode === 'daily' ? year === nowYear && month === nowMonth : year === nowYear

  const goPrev = () => {
    if (mode === 'daily') {
      if (month === 1) {
        setYear((y) => y - 1)
        setMonth(12)
      } else {
        setMonth((m) => m - 1)
      }
    } else {
      setYear((y) => y - 1)
    }
  }

  const goNext = () => {
    if (isCurrentPeriod) return
    if (mode === 'daily') {
      if (month === 12) {
        setYear((y) => y + 1)
        setMonth(1)
      } else {
        setMonth((m) => m + 1)
      }
    } else {
      setYear((y) => y + 1)
    }
  }

  const switchMode = (m: Mode) => {
    if (m === mode) return
    setMode(m)
    setYear(nowYear)
    if (m === 'daily') setMonth(nowMonth)
  }

  const retry = () => {
    // trigger re-fetch โดยไม่เปลี่ยน period — ใช้ trick set state เดิมไม่ได้ (ไม่ trigger effect)
    // → เรียก fetch ตรง ๆ ซ้ำ logic เดิม (สั้นกว่าแยกฟังก์ชัน fetch ออกมา ณ ตอนนี้)
    setLoading(true)
    setError(false)
    const qs = new URLSearchParams({ mode, year: String(year) })
    if (mode === 'daily') qs.set('month', String(month))
    fetch(`/api/seller/sales-series?${qs.toString()}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.json() as Promise<SalesSeries>
      })
      .then((data) => setSeries(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  const chg = series.prevTotal > 0 ? Math.round(((series.total - series.prevTotal) / series.prevTotal) * 100) : null
  // ยอดที่ buyer ยืนยันแล้ว = ฐานของ "กำไรสุทธิ" — ต้องโชว์คู่กันไม่งั้นสามตัวเลขดูบวกลบไม่ลงตัว
  const confirmedTotal = series.confirmedValues.reduce((s, v) => s + v, 0)

  const periodLabel =
    mode === 'daily'
      ? formatMonthYearTH(new Date(Date.UTC(year, month - 1, 15)))
      : `ปี ${year + 543}`
  const subLabel = mode === 'daily' ? `1 – ${series.labels.length} ${THAI_MONTHS_SHORT[month - 1]}` : 'ม.ค. – ธ.ค.'

  const periodWord = mode === 'daily' ? 'เดือน' : 'ปี'
  const compareWord = mode === 'daily' ? 'เดือนก่อน' : 'ปีก่อน'
  const subtitle =
    chg != null
      ? `รวมทั้ง${periodWord} · เทียบ${compareWord} ${chg > 0 ? '+' : ''}${chg}% · order ที่ไม่ยกเลิก`
      : `รวมทั้ง${periodWord} · order ที่ไม่ยกเลิก`

  const isEmpty = !loading && !error && series.total === 0

  // รายการยอดขายแต่ละ bar — โชว์ทุกวัน/เดือน (รวมที่ยอด 0 → แสดง ฿0) ใต้กราฟ, ใช้พื้นที่ว่างมือถือแนวตั้ง
  const monthAbbr = THAI_MONTHS_SHORT[month - 1]
  const detailRows = series.labels.map((label, i) => ({
    label: mode === 'daily' ? `${label} ${monthAbbr}` : label,
    value: series.values[i] ?? 0,
    // undefined = ไม่มีสิทธิ์ดูข้อมูลการเงิน → ไม่ render บรรทัดย่อยเลย
    expense: series.expenseValues?.[i],
    netProfit: series.netProfitValues?.[i],
  }))

  return (
    // HR7: fixed inset-0 z-80 = full-screen viewport-lock (Paces ไม่มี token) — pattern เดียวกับ AddressSearchSheet
    <div className="fixed inset-0 z-80 flex flex-col bg-card" role="dialog" aria-label="รายงานยอดขาย">
      <div className="flex shrink-0 items-center gap-3 border-b border-default-200 px-4 py-3">
        <button type="button" onClick={onClose} aria-label="ปิด" className="shrink-0 text-default-500">
          <Icon icon="chevron-left" className="size-6" />
        </button>
        <h3 className="flex-1 text-base font-semibold text-dark">ยอดขาย</h3>

        {/* segmented [รายวัน|รายเดือน] — ไม่มี named component ใน theme (Preline) — utility ล้วน ไม่ arbitrary */}
        <div className="flex items-center gap-0.5 rounded-lg bg-default-100 p-0.5">
          <button
            type="button"
            onClick={() => switchMode('daily')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'daily' ? 'bg-card text-primary shadow' : 'text-default-500'
            }`}
          >
            รายวัน
          </button>
          <button
            type="button"
            onClick={() => switchMode('monthly')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'monthly' ? 'bg-card text-primary shadow' : 'text-default-500'
            }`}
          >
            รายเดือน
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[env(safe-area-inset-bottom)]">
        {/* tablet: content จำกัดความกว้าง max-w-lg (mobile เต็มจอ) */}
        <div className="mx-auto w-full max-w-lg py-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={goPrev}
              aria-label="ช่วงก่อนหน้า"
              className="btn btn-icon min-h-11 min-w-11 border-default-300"
            >
              <Icon icon="chevron-left" className="size-5" />
            </button>
            <div className="text-center">
              <p className="text-lg font-bold text-dark">{periodLabel}</p>
              <p className="text-xs text-default-400">{subLabel}</p>
            </div>
            <button
              type="button"
              onClick={goNext}
              disabled={isCurrentPeriod}
              aria-label="ช่วงถัดไป"
              className={`btn btn-icon min-h-11 min-w-11 border-default-300 ${
                isCurrentPeriod ? 'pointer-events-none opacity-40' : ''
              }`}
            >
              <Icon icon="chevron-right" className="size-5" />
            </button>
          </div>

          <div className="mb-4 text-center">
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-lg text-default-400">฿</span>
              <span className="text-3xl font-bold text-dark">{series.total.toLocaleString('th-TH')}</span>
              {chg != null && (
                <span
                  className={`ms-1 flex items-center gap-0.5 text-sm font-semibold ${
                    chg > 0 ? 'text-success' : chg < 0 ? 'text-danger' : 'text-default-400'
                  }`}
                >
                  {chg > 0 ? (
                    <Icon icon="arrow-up" className="size-4" />
                  ) : chg < 0 ? (
                    <Icon icon="arrow-down" className="size-4" />
                  ) : null}
                  {Math.abs(chg)}%
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-default-400">{subtitle}</p>
          </div>

          {/* ยืนยันแล้ว / ค่าใช้จ่าย / กำไรสุทธิ (feature 00016) — เฉพาะร้านที่ผ่าน gate สิทธิ์
              ยอดใหญ่ด้านบนรวมออเดอร์ที่ยังไม่ยืนยันด้วย ส่วนกำไรคิดจากยอดที่ยืนยันแล้วเท่านั้น
              จึงต้องโชว์ "ยืนยันแล้ว" คู่กันไป ไม่งั้นตัวเลขสามตัวนี้ดูเหมือนบวกลบกันไม่ลงตัว */}
          {series.totalExpense != null && (
            <div className="mb-4 flex border-y border-dashed border-default-300">
              <div className="flex-1 border-e border-dashed border-default-300 px-1 py-2.5 text-center">
                <p className="text-2xs text-default-400">ยืนยันแล้ว</p>
                <p className="font-bold text-default-800">฿{confirmedTotal.toLocaleString('th-TH')}</p>
              </div>
              <div className="flex-1 border-e border-dashed border-default-300 px-1 py-2.5 text-center">
                <p className="text-2xs text-default-400">ค่าใช้จ่าย</p>
                <p className="font-bold text-danger-ink">฿{series.totalExpense.toLocaleString('th-TH')}</p>
              </div>
              <div className="flex-1 px-1 py-2.5 text-center">
                <p className="text-2xs text-default-400">กำไรสุทธิ</p>
                <p className={`font-bold ${(series.netProfit ?? 0) >= 0 ? 'text-success-ink' : 'text-danger-ink'}`}>
                  ฿{(series.netProfit ?? 0).toLocaleString('th-TH')}
                </p>
              </div>
            </div>
          )}

          {error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <p className="text-sm text-default-500">โหลดข้อมูลไม่สำเร็จ</p>
              <button type="button" onClick={retry} className="btn btn-sm border-default-300">
                ลองใหม่
              </button>
            </div>
          ) : loading ? (
            // skeleton บน chart area เท่านั้น — ไม่กระพริบทั้ง sheet (total/subtitle ด้านบนยังโชว์ค่าเดิมค้างไว้)
            <div className="animate-pulse rounded-lg bg-default-100" style={{ height: 220 }} />
          ) : isEmpty ? (
            <SellerEmptyState compact icon="chart-bar-off" title="ยังไม่มียอดขายในช่วงนี้" />
          ) : (
            <ApexChart
              getOptions={() => buildSalesChartOptions(series, mode)}
              series={buildSalesChartOptions(series, mode).series}
              type="bar"
              height={220}
            />
          )}

          {/* รายการยอดขายแต่ละวัน/เดือน — ใต้กราฟ (ใช้พื้นที่ว่างมือถือแนวตั้ง) */}
          {!loading && !error && !isEmpty && detailRows.length > 0 && (
            <div className="mt-5">
              <p className="mb-1 text-xs font-semibold text-default-400">ยอดขายแต่ละ{periodWord}</p>
              <div className="divide-y divide-default-100">
                {detailRows.map((r) => {
                  // บรรทัดย่อยโผล่เฉพาะวันที่มีค่าใช้จ่ายจริง — ทุกวันจะรกและอ่านไม่ออกว่าวันไหนสำคัญ
                  const showSub = r.expense != null && r.expense > 0
                  return (
                    <div key={r.label} className="flex items-center justify-between py-2.5">
                      {/* วันที่ยอด 0 = จางลง (text-default-400) ให้วันที่มียอดเด่นกว่า */}
                      <div>
                        <span className={`text-sm ${r.value > 0 ? 'text-default-700' : 'text-default-400'}`}>
                          {r.label}
                        </span>
                        {showSub && (
                          <span className="block text-2xs text-danger-ink">
                            ค่าใช้จ่าย ฿{(r.expense ?? 0).toLocaleString('th-TH')}
                          </span>
                        )}
                      </div>
                      <div className="text-end">
                        <span className={`text-sm font-semibold ${r.value > 0 ? 'text-dark' : 'text-default-400'}`}>
                          ฿{r.value.toLocaleString('th-TH')}
                        </span>
                        {showSub && (
                          <span
                            className={`block text-2xs ${(r.netProfit ?? 0) >= 0 ? 'text-success-ink' : 'text-danger-ink'}`}
                          >
                            สุทธิ ฿{(r.netProfit ?? 0).toLocaleString('th-TH')}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
