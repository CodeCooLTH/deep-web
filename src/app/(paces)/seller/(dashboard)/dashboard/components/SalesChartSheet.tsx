'use client'

/**
 * SalesChartSheet — full-screen sheet รายงานยอดขาย (จาก SalesChartCard บน command center)
 *
 * Shell: copy pattern จาก orders/new/components/AddressSearchSheet.tsx
 *   (fixed inset-0 z-80 flex flex-col bg-card, header back+title, ESC ปิด, role="dialog")
 * Chart: Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/FinancialOverview.tsx
 *   (plotOptions.bar + multi-series colors array pattern) ผ่าน @/components/wrappers/ApexChart (HR10)
 *   — ห้าม import react-apexcharts ตรง; อ้าง in-app precedent SalesReport.tsx (ApexChart + getColor + build-options fn)
 *   Stacked bar (ยืนยันแล้ว=เขียว / รอยืนยัน=เหลือง / เงินออก=แดง): ใช้ ApexCharts `stacked: true`
 *   มาตรฐานบนโครง plotOptions.bar เดิมจาก FinancialOverview.tsx + สี token getColor() ทั้งหมด
 *
 * ── v2 2026-08-04 ────────────────────────────────────────────────────────────
 * - เขียวแทนน้ำเงินสำหรับ "ยืนยันแล้ว" ให้ตรงกับ OrderStatusBand (สถานะเดียวกันเคยมีสองสีในแอปเดียว)
 * - เปิดแกน y + เส้นสเกลประ — เดิมปิดทั้งคู่ อ่านไม่ออกว่าแท่งไหนกี่บาท และพื้นที่ของวันที่ยังไม่ถึง
 *   อ่านเป็น "กราฟพัง" แทน "เดือนที่ยังเดินไม่ครบ"
 * - ตัวเลขทุกจุดตัด ฿ ออก + ค่าติดลบแสดงเครื่องหมายลบตรง ๆ (user สั่ง 2026-08-04)
 * - ต้นทุนสินค้า + ค่าใช้จ่าย ยุบเป็น "เงินออก" ก้อนเดียว เพื่อให้ ยืนยันแล้ว − เงินออก = hero ลบตามได้จริง
 *   (สูตรเดิมที่เขียนเป็นประโยคอ้าง "ต้นทุนสินค้า" ซึ่งไม่เคยโผล่บนจอ ผู้ใช้ตรวจตามไม่ได้)
 * - %เทียบใช้ prevTotalToDate ไม่ใช่ prevTotal (เดิมเอาเดือนนี้ 4 วันไปหารกับเดือนก่อน 31 วัน)
 */
import { useState, useEffect, useRef } from 'react'
import Icon from '@/components/wrappers/Icon'
import ApexChart from '@/components/wrappers/ApexChart'
import { getColor } from '@/utils/helpers'
import { formatMonthYearTH } from '@/lib/format-date'
import { formatNumberNoSymbol, pctChangeVsPrev } from '@/lib/format-money'
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

/** ตัวเลขบนแกน y — ย่อหลักพัน/ล้าน ไม่งั้น "1,234,567" กินความกว้างจนแท่งเหลือนิดเดียว
 *  local ของไฟล์นี้เท่านั้น ไม่ใช่นโยบายแสดงเงินทั่วไป (ตัวเลขที่ต้องอ่านเป๊ะอยู่ในตารางข้างล่าง) */
const formatAxisTick = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} ล้าน`
  if (n >= 1_000) return `${Math.round(n / 1_000)} พัน`
  return formatNumberNoSymbol(n)
}

/** เงินออกต่อ bucket = ต้นทุนสินค้า + ค่าใช้จ่าย — รวมเป็นก้อนเดียวเพื่อให้สมการบนหน้าจอลบกันได้จริง
 *  (กำไรสุทธิ = ยืนยันแล้ว − ต้นทุนสินค้า − ค่าใช้จ่าย มี 3 พจน์ แต่แถบสรุปมีแค่ 3 ช่องซึ่งช่องที่ 3
 *  เป็นของ "รอยืนยัน" อยู่แล้ว จึงยุบสองพจน์หลังเป็นก้อนเดียว) */
export const moneyOutValues = (series: SalesSeries): number[] | null =>
  series.expenseValues
    ? series.expenseValues.map((e, i) => e + (series.cogsValues?.[i] ?? 0))
    : null

/**
 * สร้าง ApexOptions จาก SalesSeries จริง — bar chart แท่ง stacked:
 * ยืนยันแล้ว = เขียว (success), รอยืนยัน = เหลือง (warning), เงินออก = แดง (chart-beta)
 */
export const buildSalesChartOptions = (series: SalesSeries, mode: Mode): ApexOptions => {
  const { labels, confirmedValues, unconfirmedValues } = series
  const isDaily = mode === 'daily'
  // null = ไม่มีสิทธิ์ดูข้อมูลการเงิน (feature 00016) → ไม่มีแท่งเงินออกเลย
  const outValues = moneyOutValues(series)
  const showExpense = outValues != null

  return {
    /**
     * ยอดขาย (ยืนยันแล้ว+ยังไม่ยืนยัน) stack กันได้เพราะเป็นเงินก้อนเดียวกันคนละสถานะ
     * แต่ค่าใช้จ่ายอยู่คนละ `group` — ApexCharts จะวางเป็นแท่งแยกข้างกัน ไม่ต่อยอดขึ้นไป
     * ถ้า stack รวมกัน ความสูงรวมจะถูกอ่านว่า "ยอดขาย" ทั้งที่ครึ่งหนึ่งเป็นเงินที่จ่ายออก
     */
    series: [
      { name: 'ยืนยันแล้ว', group: 'sales', data: confirmedValues },
      { name: 'รอยืนยัน', group: 'sales', data: unconfirmedValues },
      ...(showExpense ? [{ name: 'เงินออก', group: 'cost', data: outValues }] : []),
    ],
    chart: {
      type: 'bar', height: 220, stacked: true, toolbar: { show: false },
      // กัน ApexCharts เว้น padding ในกรอบ SVG เอง — เป็นที่มาของช่องว่างก้อนใหญ่เหนือกราฟที่
      // หาไม่เจอใน JSX (ไม่มี margin ตัวไหนสร้างมัน)
      parentHeightOffset: 0,
    },
    plotOptions: { bar: { columnWidth: '55%', borderRadius: 3 } },
    // legend ของ Apex ถูกแทนด้วยแถบสรุปเหนือกราฟ (จุดสี = ซีรีส์ 1:1 พร้อมยอดรวม) — ของเดิม
    // 3 label ไทยตัดเป็น 2 บรรทัดบนจอ 390 และบอกได้แค่ "สีนี้ชื่ออะไร" ทั้งที่แถบบอกตัวเลขด้วย
    legend: { show: false },
    dataLabels: { enabled: false },
    /** เขียว = ยืนยันแล้ว (ตรงกับ OrderStatusBand ที่ทา CONFIRMED เป็น text-success — เดิมที่นี่ใช้
     *  น้ำเงิน สถานะเดียวกันจึงมีสองสีในแอปเดียว), เหลือง = รอยืนยัน, แดง = เงินออก — token ทั้งหมด */
    colors: showExpense
      ? [getColor('success'), getColor('warning'), getColor('chart-beta')]
      : [getColor('success'), getColor('warning')],
    /** เหลือง #f9bf59 บนพื้นขาวได้คอนทราสต์ ~1.8:1 ต่ำกว่าเกณฑ์กราฟิก 3:1 — เติมขอบเข้มขึ้น
     *  ในตระกูลสีเดิม (warning-ink) ห้ามสลับเฉด (docs/conventions/contrast-fix-keeps-hue.md) */
    stroke: showExpense
      ? { show: true, width: [0, 1, 0], colors: ['transparent', getColor('warning-ink'), 'transparent'] }
      : { show: true, width: [0, 1], colors: ['transparent', getColor('warning-ink')] },
    xaxis: {
      categories: labels,
      axisBorder: { show: false },
      axisTicks: { show: false },
      // รายวัน: ~7 label กระจาย (ApexCharts thin เอง — formatter รับ index ไม่ได้ในแกน category);
      // รายเดือน: 12 เดือนพอดี โชว์ครบ. hideOverlappingLabels กันชนกันบนจอแคบ
      tickAmount: isDaily ? 7 : undefined,
      labels: { hideOverlappingLabels: true, style: { fontSize: '10px', colors: getColor('default-700') } },
    },
    /** เปิดแกน y + เส้นสเกล — เดิมปิดทั้งคู่ ผู้ใช้จึงอ่านไม่ออกเลยว่าแท่งไหนเท่ากับกี่บาท
     *  (ต้องแตะทีละแท่งที่กว้าง ~7px ถึงจะเห็น tooltip) และพื้นที่ว่างของวันที่ยังไม่ถึงอ่านเป็น
     *  "กราฟพัง" แทนที่จะเป็น "สเกลของเดือนที่ยังเดินไม่ครบ" */
    yaxis: {
      min: 0,
      tickAmount: 3,
      labels: { formatter: formatAxisTick, style: { fontSize: '10px', colors: getColor('default-700') } },
    },
    grid: {
      show: true,
      borderColor: getColor('chart-border-color'),
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 0, right: 4, bottom: 0, left: 4 },
    },
    // custom tooltip: แยก ยืนยันแล้ว / รอยืนยัน / เงินออก (จุดสีจาก token — ไม่ hardcode hex)
    tooltip: {
      shared: true,
      intersect: false,
      custom: ({ series, dataPointIndex, w }: { series: number[][]; dataPointIndex: number; w: { globals: { labels: string[] } } }) => {
        const conf = Number(series?.[0]?.[dataPointIndex] ?? 0)
        const unconf = Number(series?.[1]?.[dataPointIndex] ?? 0)
        const out = showExpense ? Number(series?.[2]?.[dataPointIndex] ?? 0) : null
        const label = w?.globals?.labels?.[dataPointIndex] ?? ''
        const dot = (c: string) =>
          `<span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${c};margin-right:6px"></span>`
        return (
          `<div style="padding:6px 10px;font-size:12px;line-height:1.6">` +
          `<div style="font-weight:600;margin-bottom:2px">${label}</div>` +
          `<div>${dot(getColor('success'))}ยืนยันแล้ว ${formatNumberNoSymbol(conf)}</div>` +
          `<div>${dot(getColor('warning'))}รอยืนยัน ${formatNumberNoSymbol(unconf)}</div>` +
          (out != null ? `<div>${dot(getColor('chart-beta'))}เงินออก ${formatNumberNoSymbol(out)}</div>` : '') +
          `<div style="font-weight:600;margin-top:4px">ยอดขายรวม ${formatNumberNoSymbol(conf + unconf)}</div>` +
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

  /**
   * เทียบกับช่วงก่อนหน้า "ณ วันเดียวกัน" ไม่ใช่ทั้งเดือนก่อน — `prevTotal` คือเดือนก่อนทั้ง 31 วัน
   * แต่ `total` คือเดือนนี้เท่าที่ผ่านมา วันที่ 4 จึงเอา 4 วันไปหารกับ 31 วัน ได้ ▼80%+ ทุกต้นเดือน
   * ทั้งที่อาจขายดีกว่าเดิม (บั๊กที่มีมาตลอด — ซ่อนอยู่เพราะร้านที่เดือนก่อนยอด 0 จะไม่แสดง % อยู่แล้ว)
   */
  const chgRaw = pctChangeVsPrev(series.total, series.prevTotalToDate)
  const chg = chgRaw != null ? Math.round(chgRaw) : null
  const confirmedTotal = series.confirmedValues.reduce((s, v) => s + v, 0)
  const unconfirmedTotal = series.total - confirmedTotal
  // ไม่ผ่าน gate สิทธิ์ → ไม่มีเงินออก/กำไรเลย: hero กลับไปเป็นยอดขายเหมือนเดิม ไม่ใช่โชว์ 0
  const hasFinance = series.totalExpense != null
  // เงินออก = ต้นทุนสินค้า + ค่าใช้จ่าย — ต้องเป็นก้อนเดียวกับที่กราฟวาด ไม่งั้นแถบสรุปกับกราฟขัดกัน
  const moneyOutTotal = (series.totalCogs ?? 0) + (series.totalExpense ?? 0)
  const netProfit = series.netProfit ?? 0
  const heroValue = hasFinance ? netProfit : series.total
  const heroTone = !hasFinance ? 'text-dark' : netProfit >= 0 ? 'text-success-ink' : 'text-danger-ink'

  const periodLabel =
    mode === 'daily'
      ? formatMonthYearTH(new Date(Date.UTC(year, month - 1, 15)))
      : `ปี ${year + 543}`

  const periodWord = mode === 'daily' ? 'เดือน' : 'ปี'
  const compareWord = mode === 'daily' ? 'เดือนก่อน' : 'ปีก่อน'

  const isEmpty = !loading && !error && series.total === 0

  // แสดงเฉพาะ bucket ที่มีความเคลื่อนไหวจริง — เดือนที่ขายจริง 3 วันไม่ควรต้องเลื่อนผ่าน "฿0" อีก 28 แถว
  const monthAbbr = THAI_MONTHS_SHORT[month - 1]
  const outValuesRow = moneyOutValues(series)
  const detailRows = series.labels
    .map((label, i) => ({
      label: mode === 'daily' ? `${label} ${monthAbbr}` : label,
      value: series.values[i] ?? 0,
      // เงินออกรวมต้นทุนสินค้าด้วย ไม่ใช่แค่ค่าใช้จ่าย — ไม่งั้นวันที่ขายได้แต่ยังไม่ได้คีย์ค่าใช้จ่าย
      // จะหายไปจากตารางทั้งที่มีต้นทุนจริงให้แสดง
      out: outValuesRow?.[i] ?? 0,
    }))
    .filter((r) => r.value > 0 || r.out > 0)

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
            className={`min-h-11 rounded-md px-3 text-xs font-medium transition-colors ${
              mode === 'daily' ? 'bg-card text-primary shadow' : 'text-default-700'
            }`}
          >
            รายวัน
          </button>
          <button
            type="button"
            onClick={() => switchMode('monthly')}
            className={`min-h-11 rounded-md px-3 text-xs font-medium transition-colors ${
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

          {/* HERO = กำไร/ขาดทุนของช่วงนี้ (ร้านที่ไม่ผ่าน gate สิทธิ์ = ยอดขายแทน)
              ไม่มี ฿ และไม่มีคำนำหน้าอย่าง "ขาดทุนสุทธิ" — user สั่งตรง ๆ ว่าแค่ตัวเลขพอ
              (2026-08-04) ทิศทางสื่อด้วยเครื่องหมายลบ + สี ส่วน "มันคือตัวเลขอะไร" อธิบายด้วย
              แถบสมการที่วางชิดอยู่ข้างล่างทันที: ยืนยันแล้ว − เงินออก = ตัวเลขนี้เป๊ะ */}
          <div className="mb-3 text-center">
            <p className="text-xs text-default-700">ทั้ง{periodWord}</p>
            <p className={`text-3xl font-bold tabular-nums ${heroTone}`}>{formatNumberNoSymbol(heroValue)}</p>
            {chg != null && (
              <p className="mt-0.5 flex items-center justify-center gap-1 text-sm text-default-700">
                <span
                  className={`inline-flex items-center gap-0.5 font-semibold ${
                    chg > 0 ? 'text-success-ink' : chg < 0 ? 'text-danger-ink' : 'text-default-700'
                  }`}
                >
                  {chg !== 0 && (
                    <Icon icon={chg > 0 ? 'arrow-up' : 'arrow-down'} className="size-4" aria-hidden="true" />
                  )}
                  {Math.abs(chg)}%
                </span>
                <span>ยอดขายจาก{compareWord}</span>
              </p>
            )}
          </div>

          {/* แถบนี้ทำสามหน้าที่: legend ของกราฟ (จุดสี = ซีรีส์ 1:1) + ยอดรวมของแต่ละซีรีส์ +
              **สมการที่ตรวจสอบตามได้** — ยืนยันแล้ว − เงินออก = ตัวเลข hero ด้านบนพอดี
              จึงต้องเรียงให้สองช่องนั้นติดกันแล้วคั่นด้วยเครื่องหมายลบจริง ไม่ใช่คำอธิบาย
              เดิมเขียนสูตรเป็นประโยคยาวใต้ hero แต่สูตรนั้นอ้าง "ต้นทุนสินค้า" ที่ไม่เคยโผล่บนจอเลย
              (service คำนวณแล้วทิ้ง) ผู้ใช้จึงตรวจตามไม่ได้ — ตอนนี้ยุบต้นทุนเข้า "เงินออก" แล้ว
              สีตรง token กราฟเป๊ะ: bg-success=success, bg-warning=warning, bg-danger=chart-beta */}
          <div className="mb-4 flex items-stretch border-y border-dashed border-default-300">
            <LegendCell color="bg-success" label="ยืนยันแล้ว" value={confirmedTotal} />
            {hasFinance && (
              <>
                <span className="flex items-center px-1 text-sm text-default-700" aria-hidden="true">−</span>
                <LegendCell color="bg-danger" label="เงินออก" value={moneyOutTotal} />
              </>
            )}
            <LegendCell color="bg-warning" label="รอยืนยัน" value={unconfirmedTotal} />
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
                {hasFinance && <span className="w-24 text-end">เงินออก</span>}
              </div>
              <div className="divide-y divide-default-100">
                {detailRows.map((r) => (
                  <div key={r.label} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="flex-1 text-default-800">{r.label}</span>
                    <span className="w-24 text-end font-semibold text-dark tabular-nums">
                      {formatNumberNoSymbol(r.value)}
                    </span>
                    {hasFinance && (
                      <span
                        className={`w-24 text-end font-semibold tabular-nums ${r.out > 0 ? 'text-danger-ink' : 'text-default-700'}`}
                      >
                        {r.out > 0 ? formatNumberNoSymbol(r.out) : '—'}
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
 * primitive ที่ใกล้ที่สุดในธีม: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/
 *   components/RevenueByLocation.tsx (จุดสี + ชื่อ + ค่าชิดขวา) — ที่นี่จัดเป็นคอลัมน์แทนแถว
 *
 * ป้ายเดิมเขียนยาวว่า "ลูกค้ายืนยันแล้ว"/"รอลูกค้ายืนยัน" เพื่อระบุตัวผู้กระทำ (กันร้านที่ใช้ระบบจอง
 * นึกว่าตัวเองต้องเป็นคนไปกดยืนยัน) — user เลือกคำสั้น "ยืนยันแล้ว"/"รอยืนยัน" เอง 2026-08-04
 * โดยรับทราบข้อกังวลนั้นแล้ว และการ์ดหน้าแรกใช้คำสั้นชุดเดียวกัน (คำเดียวกัน = ของเดียวกัน)
 */
function LegendCell({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex-1 border-e border-dashed border-default-300 px-1 py-2.5 text-center last:border-e-0">
      <p className="flex items-start justify-center gap-1 text-xs leading-tight text-default-700">
        <span className={`mt-1 size-2 shrink-0 rounded-full ${color}`} aria-hidden="true" />
        <span className="text-balance">{label}</span>
      </p>
      <p className="mt-0.5 font-bold tabular-nums text-default-800">{formatNumberNoSymbol(value)}</p>
    </div>
  )
}
