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
import { formatBaht, profitDisplay, NET_PROFIT_FORMULA } from '@/lib/format-money'
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
      { name: 'ลูกค้ายืนยันแล้ว', group: 'sales', data: confirmedValues },
      { name: 'รอลูกค้ายืนยัน', group: 'sales', data: unconfirmedValues },
      ...(showExpense ? [{ name: 'ค่าใช้จ่าย', group: 'expense', data: expenseValues }] : []),
    ],
    chart: { type: 'bar', height: 220, stacked: true, toolbar: { show: false } },
    plotOptions: { bar: { columnWidth: '55%', borderRadius: 3 } },
    // legend ของ Apex ถูกแทนด้วยแถบสรุปเหนือกราฟ (จุดสี = ซีรีส์ 1:1 พร้อมยอดรวม) — ของเดิม
    // 3 label ไทยตัดเป็น 2 บรรทัดบนจอ 390 และบอกได้แค่ "สีนี้ชื่ออะไร" ทั้งที่แถบบอกตัวเลขด้วย
    legend: { show: false },
    dataLabels: { enabled: false },
    // น้ำเงิน = ลูกค้ายืนยันแล้ว, เหลือง = รอลูกค้ายืนยัน, แดง = ค่าใช้จ่าย — token ทั้งหมด (ห้าม hardcode hex)
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
    // custom tooltip: แยก ยืนยันแล้ว / รอยืนยัน / ค่าใช้จ่าย + รวม (จุดสีจาก token — ไม่ hardcode hex)
    // ค่าใช้จ่ายต้องอยู่ในนี้ เพราะบรรทัดย่อยรายวันใต้กราฟถูกตัดออกแล้ว tooltip จึงรับหน้าที่แทน
    tooltip: {
      shared: true,
      intersect: false,
      custom: ({ series, dataPointIndex, w }: { series: number[][]; dataPointIndex: number; w: { globals: { labels: string[] } } }) => {
        const conf = Number(series?.[0]?.[dataPointIndex] ?? 0)
        const unconf = Number(series?.[1]?.[dataPointIndex] ?? 0)
        const exp = showExpense ? Number(series?.[2]?.[dataPointIndex] ?? 0) : null
        const label = w?.globals?.labels?.[dataPointIndex] ?? ''
        const dot = (c: string) =>
          `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${c};margin-right:6px"></span>`
        return (
          `<div style="padding:6px 10px;font-size:12px;line-height:1.6">` +
          `<div style="font-weight:600;margin-bottom:2px">${label}</div>` +
          `<div>${dot(getColor('chart-primary'))}ลูกค้ายืนยันแล้ว ${formatBaht(conf)}</div>` +
          `<div>${dot(getColor('warning'))}รอลูกค้ายืนยัน ${formatBaht(unconf)}</div>` +
          (exp != null ? `<div>${dot(getColor('chart-beta'))}ค่าใช้จ่าย ${formatBaht(exp)}</div>` : '') +
          `<div style="font-weight:600;margin-top:4px">ยอดขายทั้งหมด ${formatBaht(conf + unconf)}</div>` +
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
  const confirmedTotal = series.confirmedValues.reduce((s, v) => s + v, 0)
  const unconfirmedTotal = series.total - confirmedTotal
  // ไม่ผ่าน gate สิทธิ์ → ไม่มีค่าใช้จ่าย/กำไรเลย: hero กลับไปเป็นยอดขายเหมือนเดิม ไม่ใช่โชว์ ฿0
  const hasFinance = series.totalExpense != null
  const profit = hasFinance ? profitDisplay(series.netProfit ?? 0) : null

  const periodLabel =
    mode === 'daily'
      ? formatMonthYearTH(new Date(Date.UTC(year, month - 1, 15)))
      : `ปี ${year + 543}`

  const periodWord = mode === 'daily' ? 'เดือน' : 'ปี'
  const compareWord = mode === 'daily' ? 'เดือนก่อน' : 'ปีก่อน'

  const isEmpty = !loading && !error && series.total === 0

  // แสดงเฉพาะ bucket ที่มีความเคลื่อนไหวจริง — เดือนที่ขายจริง 3 วันไม่ควรต้องเลื่อนผ่าน "฿0" อีก 28 แถว
  const monthAbbr = THAI_MONTHS_SHORT[month - 1]
  const detailRows = series.labels
    .map((label, i) => ({
      label: mode === 'daily' ? `${label} ${monthAbbr}` : label,
      value: series.values[i] ?? 0,
      expense: series.expenseValues?.[i] ?? 0,
    }))
    .filter((r) => r.value > 0 || r.expense > 0)

  return (
    // HR7: fixed inset-0 z-80 = full-screen viewport-lock (Paces ไม่มี token) — pattern เดียวกับ AddressSearchSheet
    <div className="fixed inset-0 z-80 flex flex-col bg-card" role="dialog" aria-label="รายงานยอดขายและกำไร">
      <div className="flex shrink-0 items-center gap-3 border-b border-default-200 px-4 py-3">
        <button type="button" onClick={onClose} aria-label="ปิด" className="shrink-0 text-default-700">
          <Icon icon="chevron-left" className="size-6" />
        </button>
        <h3 className="flex-1 text-base font-semibold text-dark">ยอดขายและกำไร</h3>

        {/* segmented [รายวัน|รายเดือน] — ไม่มี named component ใน theme (Preline) — utility ล้วน ไม่ arbitrary */}
        <div className="flex items-center gap-0.5 rounded-lg bg-default-100 p-0.5">
          <button
            type="button"
            onClick={() => switchMode('daily')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'daily' ? 'bg-card text-primary shadow' : 'text-default-700'
            }`}
          >
            รายวัน
          </button>
          <button
            type="button"
            onClick={() => switchMode('monthly')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'monthly' ? 'bg-card text-primary shadow' : 'text-default-700'
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
            {/* ตัด "1 – 31 ส.ค." ออก — ซ้ำกับชื่อเดือนที่อยู่บรรทัดเดียวกัน และแกน x ก็บอกช่วงวันอยู่แล้ว */}
            <div className="text-center">
              <p className="text-lg font-bold text-dark">{periodLabel}</p>
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

          {/* HERO = คำตอบของหน้านี้ (กำไร/ขาดทุน) ส่วนยอดขายลดชั้นเป็น "ที่มา" ไม่ใช่ "คำตอบ"
              เดิม hero เป็นยอดขายรวม ซึ่งไม่หักค่าใช้จ่าย ผู้ใช้จึงไม่รู้กำไรจริง (feedback prod 2026-08-02)
              %เทียบช่วงก่อนย้ายมาติดยอดขาย เพราะ prevTotal คือ *ยอดขาย* ช่วงก่อน ไม่ใช่กำไรช่วงก่อน
              (SalesSeries ไม่มี prevNetProfit) — ปล่อยไว้ข้างตัวเลขกำไรเมื่อไหร่ = ตัวเลขโกหกทันที */}
          <div className="mb-3 text-center">
            <p className="text-xs text-default-700">{profit ? profit.label : 'ยอดขาย'} · ทั้ง{periodWord}</p>
            <p className={`text-3xl font-bold ${profit ? profit.toneClass : 'text-dark'}`}>
              {profit ? profit.text : formatBaht(series.total)}
            </p>
            {(profit || chg != null) && (
              <p className="mt-0.5 flex items-center justify-center gap-2 text-sm text-default-700">
                {profit && <span>ยอดขายทั้งหมด {formatBaht(series.total)}</span>}
                {chg != null && (
                  <span
                    className={`inline-flex items-center gap-0.5 font-semibold ${
                      chg > 0 ? 'text-success-ink' : chg < 0 ? 'text-danger-ink' : 'text-default-700'
                    }`}
                  >
                    {chg !== 0 && (
                      <Icon icon={chg > 0 ? 'arrow-up' : 'arrow-down'} className="size-4" aria-hidden="true" />
                    )}
                    {Math.abs(chg)}% จาก{compareWord}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* แถบนี้ทำสองหน้าที่: legend ของกราฟ (จุดสี = ซีรีส์ 1:1) + ยอดรวมของแต่ละซีรีส์
              เดิมแยกเป็นสองก้อนที่โชว์คนละสามตัว (legend = ยังไม่ยืนยัน/ยืนยันแล้ว/ค่าใช้จ่าย,
              แถบ = ยืนยันแล้ว/ค่าใช้จ่าย/กำไรสุทธิ) ผู้ใช้จึงจับคู่สีกับตัวเลขไม่ได้เลย
              สีตรง token กราฟเป๊ะ: bg-primary=chart-primary, bg-warning=warning, bg-danger=chart-beta */}
          {/* ชีตเป็น surface เดียวที่ hero (กำไร คิดจากยอดยืนยันแล้ว) กับบรรทัดรอง (ยอดขายทั้งหมด)
              ใช้ฐานคนละตัว — ถ้าไม่เขียนนิยามไว้ ผู้ใช้ลบเลขสองบรรทัดนี้เองแล้วจะได้ไม่ตรง */}
          {hasFinance && <p className="mb-3 text-center text-xs text-default-700">{NET_PROFIT_FORMULA}</p>}

          <div className="mb-4 flex border-y border-dashed border-default-300">
            <LegendCell color="bg-primary" label="ลูกค้ายืนยันแล้ว" value={confirmedTotal} />
            <LegendCell color="bg-warning" label="รอลูกค้ายืนยัน" value={unconfirmedTotal} />
            {hasFinance && <LegendCell color="bg-danger" label="ค่าใช้จ่าย" value={series.totalExpense ?? 0} />}
          </div>

          {error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <p className="text-sm text-default-700">โหลดข้อมูลไม่สำเร็จ</p>
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

          {/* หัวคอลัมน์ครั้งเดียว แทนการพิมพ์คำว่า "ค่าใช้จ่าย"/"สุทธิ" ซ้ำในทุกแถว (เดือนละสูงสุด 62 คำ)
              "สุทธิรายวัน" ถูกตัด — อนุมานได้จากสองคอลัมน์ที่อยู่ข้างกัน และยอดรวมอยู่ที่ hero แล้ว */}
          {!loading && !error && !isEmpty && detailRows.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center gap-3 border-b border-default-200 py-2 text-xs text-default-700">
                <span className="flex-1">{mode === 'daily' ? 'วันที่' : 'เดือน'}</span>
                <span className="w-24 text-end">ยอดขาย</span>
                {hasFinance && <span className="w-24 text-end">ค่าใช้จ่าย</span>}
              </div>
              <div className="divide-y divide-default-100">
                {detailRows.map((r) => (
                  <div key={r.label} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="flex-1 text-default-800">{r.label}</span>
                    <span className="w-24 text-end font-semibold text-dark">{formatBaht(r.value)}</span>
                    {hasFinance && (
                      <span
                        className={`w-24 text-end font-semibold ${r.expense > 0 ? 'text-danger-ink' : 'text-default-700'}`}
                      >
                        {r.expense > 0 ? formatBaht(r.expense) : '—'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * ช่องหนึ่งของแถบ legend+ยอดรวม — จุดสีต้องตรงกับสีซีรีส์ในกราฟเสมอ
 *
 * ป้าย "ลูกค้ายืนยันแล้ว"/"รอลูกค้ายืนยัน" ระบุตัวผู้กระทำโดยตั้งใจ — คำสั้น ๆ ว่า "รอยืนยัน"
 * ไปชนกับหน้าจองที่ *ร้าน* เป็นคนกดยืนยัน ร้านที่ใช้ทั้งสองเมนูจะนึกว่าตัวเองต้องไปกด
 * แลกกับป้ายที่ยาวขึ้น จึงยอมให้ตัดเป็น 2 บรรทัดด้วย leading-tight แทนที่จะบีบตัวอักษรให้เล็กลง
 * (ลดขนาดตัวอักษรผิดกับกลุ่มผู้ใช้ที่ PRODUCT.md ผูกไว้)
 */
function LegendCell({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex-1 border-e border-dashed border-default-300 px-1 py-2.5 text-center last:border-e-0">
      <p className="flex items-start justify-center gap-1 text-xs leading-tight text-default-700">
        <span className={`mt-1 size-2 shrink-0 rounded-full ${color}`} aria-hidden="true" />
        <span className="text-balance">{label}</span>
      </p>
      <p className="mt-0.5 font-bold text-default-800">{formatBaht(value)}</p>
    </div>
  )
}
