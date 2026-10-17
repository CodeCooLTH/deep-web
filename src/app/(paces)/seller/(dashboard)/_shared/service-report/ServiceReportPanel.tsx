'use client'

/**
 * เนื้อหน้า "ยอดขายและกำไร" ของร้านบริการ (feature 00078 · BRD FR-011) — ชีตมือถือและหน้า /sales ใช้ตัวนี้ตัวเดียว
 *
 * โครงเดียวกับหน้าของร้านขายของ (SalesChartSheet ทางร้านขายของ): รายวัน/รายเดือน + เลื่อนช่วง → ตัวเลขใหญ่ + %
 * → แถบสมการ → กราฟ → ตาราง (ใหม่สุดก่อน) · แตะแถว/แท่ง = กางบิลของวันนั้น (โหลดเมื่อแตะ · FR-004)
 * ตัวเลขทั้งหมดจาก buildServiceReport (ตัวคำนวณกลาง) · คำทั้งหมดจาก SERVICE_REPORT_WORDS
 *
 * Base: SalesChartSheet.tsx (segmented/period navigator/hero/equation strip/table — in-app precedent)
 */
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { todayThaiIsoDate } from '@/lib/date-range'
import { FINANCE_COLORS } from '@/lib/finance-colors'
import { formatMonthYearTH, toBuddhistYear } from '@/lib/format-date'
import { formatNumberNoSymbol } from '@/lib/format-money'
import type { ServiceReportChart as ChartKind, ServiceReportView } from '@/lib/report-settings'
import { buildServiceReport, type ServiceReportData, type ServiceReportMode } from '@/lib/service-report/view-model'
import { SERVICE_REPORT_WORDS as W, deltaSentence } from '@/lib/service-report/words'

import SellerEmptyState from '../SellerEmptyState'
import ServiceReportChart from './ServiceReportChart'
import ServiceReportStrip from './ServiceReportStrip'

type Bill = { token: string; orderNo: string | null; buyerName: string | null; amount: number; closed: boolean }

const pill = (on: boolean) =>
  `min-h-11 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors ${on ? 'bg-card text-primary shadow' : 'text-default-700'}`

const pad2 = (n: number) => String(n).padStart(2, '0')

type Props = {
  initial: ServiceReportData
  view: ServiceReportView
  chart: ChartKind
  /** sheet = ชีตเต็มจอบนมือถือ · page = หน้า /sales (คอม + มือถือ) */
  layout: 'sheet' | 'page'
}

export default function ServiceReportPanel({ initial, view, chart, layout }: Props) {
  const [nowYear, nowMonth] = todayThaiIsoDate().split('-').map(Number)
  const [mode, setMode] = useState<ServiceReportMode>(initial.mode)
  const [year, setYear] = useState(initial.year)
  const [month, setMonth] = useState(initial.month ?? nowMonth)
  const [data, setData] = useState<ServiceReportData>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [bills, setBills] = useState<Record<string, Bill[] | 'loading' | 'error'>>({})
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    setError(false)
    const qs = new URLSearchParams({ mode, year: String(year), ...(mode === 'daily' ? { month: String(month) } : {}) })
    fetch(`/api/seller/service-report?${qs}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: ServiceReportData) => setData(d))
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setError(true)
      })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [mode, year, month, retry])

  const model = useMemo(() => buildServiceReport(data, view), [data, view])

  const isCurrent = mode === 'daily' ? year === nowYear && month === nowMonth : year === nowYear
  const periodLabel = mode === 'daily' ? formatMonthYearTH(new Date(Date.UTC(year, month - 1, 15))) : `${W.year} ${toBuddhistYear(year)}`

  const shift = (step: -1 | 1) => {
    setOpenIdx(null)
    if (mode === 'monthly') return setYear((y) => y + step)
    const m0 = month - 1 + step
    setYear((y) => y + Math.floor(m0 / 12))
    setMonth(((m0 % 12) + 12) % 12 + 1)
  }
  const switchMode = (m: ServiceReportMode) => {
    if (m === mode) return
    setOpenIdx(null)
    setMode(m)
    if (m === 'daily') {
      setYear(nowYear)
      setMonth(nowMonth)
    }
  }

  const dayIso = (index: number) => `${year}-${pad2(month)}-${pad2(index + 1)}`
  /** โหลดบิลของวันนั้นครั้งเดียว (ซ้ำ = no-op · error = ลองใหม่ได้) — fetch อยู่นอก state updater (StrictMode เรียก updater ซ้ำ) */
  const inflight = useRef(new Set<string>())
  const loadDay = useCallback(
    (index: number) => {
      const key = `${year}-${pad2(month)}-${pad2(index + 1)}`
      const cur = bills[key]
      if ((cur && cur !== 'error') || inflight.current.has(key)) return
      inflight.current.add(key)
      setBills((b) => ({ ...b, [key]: 'loading' }))
      fetch(`/api/seller/service-report/day?date=${key}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { bills: Bill[] }) => setBills((x) => ({ ...x, [key]: j.bills })))
        .catch(() => setBills((x) => ({ ...x, [key]: 'error' })))
        .finally(() => inflight.current.delete(key))
    },
    [bills, year, month],
  )
  /** แตะแถวตาราง = เปิด/ปิด */
  const toggleDay = useCallback(
    (index: number) => {
      if (mode !== 'daily') return
      setOpenIdx((cur) => (cur === index ? null : index))
      loadDay(index)
    },
    [mode, loadDay],
  )
  /**
   * แตะแท่ง/จุดบนกราฟ = เปิดวันนั้นเสมอ (ไม่สลับปิด) — ApexCharts ยิง dataPointSelection 2 ครั้งต่อหนึ่งแตะ
   * (listener บน path + ตัวรับแทนของกลุ่ม) ถ้าใช้ toggle จะเปิดแล้วปิดทันทีจนดูเหมือนแตะไม่ติด (เจอตอน QA 00078)
   */
  const pickFromChart = useCallback(
    (index: number) => {
      if (mode !== 'daily') return
      setOpenIdx(index)
      loadDay(index)
      requestAnimationFrame(() => document.getElementById(`svc-day-${index}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
    },
    [mode, loadDay],
  )
  // ตัวที่ส่งให้กราฟต้องคงตัว — ไม่งั้นโหลดบิลเสร็จทีไร options กราฟถูกสร้างใหม่ (กราฟวาดใหม่ทุกครั้งที่แตะ)
  const pickLatest = useRef(pickFromChart)
  useEffect(() => {
    pickLatest.current = pickFromChart
  })
  const onChartPick = useCallback((index: number) => pickLatest.current(index), [])

  const heroTone =
    model.hero.tone === 'loss' ? 'text-danger-ink' : model.hero.tone === 'profit' ? 'text-success-ink' : 'text-dark'

  return (
    <div className={layout === 'page' ? 'card' : ''}>
      {/* แถบควบคุม — รายวัน/รายเดือน + เลื่อนช่วง (precedent: SalesChartSheet segmented + period navigator) */}
      <div className={`flex items-center justify-between gap-2 ${layout === 'page' ? 'border-default-200 border-b px-4 py-3 sm:px-5' : 'px-4 pt-3'}`}>
        <div role="group" aria-label={W.daily + '/' + W.monthly} className="flex shrink-0 items-center gap-0.5 rounded-lg bg-default-100 p-0.5">
          <button type="button" onClick={() => switchMode('daily')} aria-pressed={mode === 'daily'} className={pill(mode === 'daily')}>
            {W.daily}
          </button>
          <button type="button" onClick={() => switchMode('monthly')} aria-pressed={mode === 'monthly'} className={pill(mode === 'monthly')}>
            {W.monthly}
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label={W.prev} className="btn btn-icon border-default-300 min-h-11 min-w-11 border">
            <Icon icon="chevron-left" className="size-5" />
          </button>
          <span className="min-w-20 whitespace-nowrap text-center text-base font-bold text-dark tabular-nums">{periodLabel}</span>
          <button
            type="button"
            onClick={() => shift(1)}
            disabled={isCurrent}
            aria-label={W.next}
            className="btn btn-icon border-default-300 min-h-11 min-w-11 border disabled:opacity-40"
          >
            <Icon icon="chevron-right" className="size-5" />
          </button>
        </div>
      </div>

      <div className={`${layout === 'page' ? 'p-5' : 'px-4 pb-6'} ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
        {error ? (
          <div className="py-10 text-center">
            <p className="mb-3 text-sm text-default-700">{W.loadFailed}</p>
            <button type="button" onClick={() => setRetry((r) => r + 1)} className="btn border-default-300 min-h-11 border">
              {W.retry}
            </button>
          </div>
        ) : (
          <>
            {/* ตัวเลขใหญ่ตามตั้งค่า + % เทียบ (ยอดขายเสมอ — บอกในประโยค) */}
            <div className="my-3 text-center">
              <p className="mb-0 text-xs text-default-700">{model.hero.label}</p>
              <p className={`text-4xl font-extrabold tracking-tight tabular-nums ${heroTone}`}>{formatNumberNoSymbol(model.hero.value)}</p>
              {model.delta && (
                <p className={`mb-0 inline-flex items-center gap-1 text-sm font-semibold ${model.delta.direction === 'up' ? 'text-success-ink' : 'text-danger-ink'}`}>
                  <Icon icon={model.delta.direction === 'up' ? 'arrow-up' : 'arrow-down'} className="size-3.5" aria-hidden="true" />
                  {view === 'profit' ? W.sales : ''}
                  {deltaSentence(model.delta.direction, model.delta.pct, model.delta.compareLabel)}
                </p>
              )}
            </div>

            {/* แถบสมการ — ยอดขาย: ปิดงานแล้ว + ยังไม่ปิดงาน · กำไร: ปิดงานแล้ว − (ต้นทุนอะไหล่) − ค่าใช้จ่าย */}
            <ServiceReportStrip cells={model.strip} className="mb-2" />

            {model.rows.length === 0 ? (
              <SellerEmptyState compact icon="chart-bar-off" title={W.empty} />
            ) : (
              <>
                <ServiceReportChart
                  chart={model.chart}
                  kind={chart}
                  height={layout === 'page' ? 260 : 200}
                  onPick={mode === 'daily' ? onChartPick : undefined}
                  period={mode}
                  resetKey={`${data.mode}-${data.year}-${data.month ?? ''}-${view}`}
                />

                {/* ตาราง — ใหม่สุดก่อน · เฉพาะช่วงที่มีความเคลื่อนไหว (precedent: ตารางชีตร้านขายของ) */}
                {/* ตารางกว้างกว่าจอได้เมื่อมีคอลัมน์ต้นทุน + ยอดหลักแสน/ล้าน (จอ 390 เหลือ ~318px) ⇒ เลื่อนข้างในกรอบ ไม่ล้นการ์ด */}
                <div className="mt-4 overflow-x-auto overscroll-x-contain text-xs">
                  <div className="w-full min-w-min">
                  <div className="border-default-200 flex items-end gap-1 border-b pb-2 text-default-700">
                    <span className="w-8 shrink-0">{mode === 'daily' ? W.date : W.month}</span>
                    <span className="w-7 shrink-0 text-center">{W.jobUnit}</span>
                    <span className="flex-1 text-end">{W.closed}</span>
                    <span className="flex-1 text-end">{W.unclosed}</span>
                    {model.hasCost && <span className="flex-1 text-end">{W.costShort}</span>}
                    <span className="flex-1 text-end">{W.expense}</span>
                    <span className="flex-1 text-end leading-tight">
                      {W.profitColumn}
                      <br />
                      <span className="text-2xs">{W.profitColumnNote}</span>
                    </span>
                  </div>
                  {model.rows.map((r) => {
                    const open = openIdx === r.index && mode === 'daily'
                    const key = mode === 'daily' ? dayIso(r.index) : ''
                    const list = open ? bills[key] : undefined
                    const rowClass = 'border-default-200 flex min-h-11 w-full items-center gap-1 border-b py-2 tabular-nums'
                    const cells = (
                      <>
                          <span className="w-8 shrink-0">{r.label}</span>
                          <span className="w-7 shrink-0 text-center">{r.jobs || '—'}</span>
                          <span className="flex-1 whitespace-nowrap text-end font-semibold">{formatNumberNoSymbol(r.closed)}</span>
                          <span className={`flex-1 text-end ${r.unclosed ? FINANCE_COLORS.notCounted.ink : 'text-default-500'}`}>
                            {r.unclosed ? formatNumberNoSymbol(r.unclosed) : '—'}
                          </span>
                          {model.hasCost && (
                            <span className={`flex-1 text-end ${r.cost ? 'text-danger-ink' : 'text-default-500'}`}>{r.cost ? formatNumberNoSymbol(r.cost) : '—'}</span>
                          )}
                          <span className={`flex-1 text-end ${r.expense ? 'text-danger-ink' : 'text-default-500'}`}>{r.expense ? formatNumberNoSymbol(r.expense) : '—'}</span>
                          <span className={`flex-1 text-end font-semibold ${r.profit < 0 ? 'text-danger-ink' : ''}`}>{formatNumberNoSymbol(r.profit)}</span>
                      </>
                    )
                    return (
                      <div key={r.index} id={`svc-day-${r.index}`}>
                        {/* รายเดือนแตะไม่ได้ ⇒ แถวธรรมดา (ปุ่ม disabled ถูกธีมจาง opacity-50 ทั้งแถว · โปรแกรมอ่านจออ่านว่า "ปิดใช้งาน") */}
                        {mode === 'daily' ? (
                          <button
                            type="button"
                            onClick={() => toggleDay(r.index)}
                            aria-expanded={open}
                            className={`${rowClass} text-start ${open ? 'text-primary' : ''}`}
                          >
                            {cells}
                          </button>
                        ) : (
                          <div className={rowClass}>{cells}</div>
                        )}
                        {open && (
                          <div className="bg-default-100 my-1.5 rounded-lg px-3">
                            {list === 'loading' || list === undefined ? (
                              <p className="mb-0 py-3 text-default-700">…</p>
                            ) : list === 'error' ? (
                              <button type="button" onClick={() => toggleDay(r.index)} className="min-h-11 py-2 text-primary">
                                {W.loadFailed} · {W.retry}
                              </button>
                            ) : (
                              list.map((b) => (
                                <Link
                                  key={b.token}
                                  href={`/orders/${b.token}`}
                                  className="border-default-200 flex min-h-11 items-center justify-between gap-2 border-b py-2 last:border-b-0"
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span
                                      className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${b.closed ? `${FINANCE_COLORS.counted.soft} ${FINANCE_COLORS.counted.ink}` : `${FINANCE_COLORS.notCounted.soft} ${FINANCE_COLORS.notCounted.ink}`}`}
                                    >
                                      {b.closed ? W.closed : W.unclosed}
                                    </span>
                                    <span className="truncate text-default-800">{b.buyerName || `${W.bill} ${b.orderNo ?? ''}`}</span>
                                  </span>
                                  <span className="shrink-0 font-semibold tabular-nums">{formatNumberNoSymbol(b.amount)} ›</span>
                                </Link>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
