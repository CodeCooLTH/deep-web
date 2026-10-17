'use client'

/**
 * ฟอร์มตั้งค่ารายงานของร้านบริการ — 2 ข้อ (feature 00078 · BRD FR-012 · ต้นแบบที่ user เลือก 2026-10-17)
 *   1. ตัวเลขที่อยากเห็นก่อน — ยอดขาย / กำไร (กล่องโชว์ตัวเลขจริงของร้านเดือนนี้)
 *   2. รูปแบบกราฟ — แท่ง / เส้น
 * + ตัวอย่างบนหน้าแรก เปลี่ยนตามทันที · บันทึกทันทีที่เลือก (optimistic + ย้อนค่าเมื่อ PATCH ล้ม + pacesToast HR9)
 *
 * Base: src/app/(paces)/seller/(dashboard)/public-profile/components/PriceVisibilityToggleClient.tsx
 *   (การ์ด Paces + optimistic + revert + pacesToast) · ตัวเลือกแบบกล่องคู่ = radio card (role="radio")
 */
import { useMemo, useState } from 'react'

import { formatNumberNoSymbol } from '@/lib/format-money'
import { pacesToast } from '@/lib/paces-toast'
import {
  serviceReportChart,
  serviceReportPatch,
  serviceReportView,
  type ReportSettings,
  type ServiceReportChart as ChartKind,
  type ServiceReportView,
} from '@/lib/report-settings'
import { buildServiceReport, type ServiceReportData } from '@/lib/service-report/view-model'
import { SERVICE_REPORT_WORDS as W } from '@/lib/service-report/words'

import ServiceReportChart from '../../../_shared/service-report/ServiceReportChart'

type Props = { initialView: ServiceReportView; initialChart: ChartKind; preview: ServiceReportData }

const tileClass = (on: boolean) =>
  `relative flex min-h-24 w-full flex-col gap-1 rounded-xl border-2 p-3.5 text-start transition-colors ${
    on ? 'border-primary bg-primary/5' : 'border-default-200 bg-card hover:border-primary/40'
  }`

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute end-2.5 top-2.5 inline-flex size-5 items-center justify-center rounded-full border-2 ${on ? 'border-primary bg-primary text-white' : 'border-default-300'}`}
    >
      {on && (
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.2l2.3 2.3 4.7-5" />
        </svg>
      )}
    </span>
  )
}

export default function ReportSettingsForm({ initialView, initialChart, preview }: Props) {
  const [view, setView] = useState<ServiceReportView>(initialView)
  const [chart, setChart] = useState<ChartKind>(initialChart)
  const [busy, setBusy] = useState(false)

  const sales = useMemo(() => buildServiceReport(preview, 'sales'), [preview])
  const profit = useMemo(() => buildServiceReport(preview, 'profit'), [preview])
  const shown = view === 'profit' ? profit : sales

  const save = async (next: { view?: ServiceReportView; chart?: ChartKind }) => {
    const prev = { view, chart }
    if (next.view) setView(next.view)
    if (next.chart) setChart(next.chart)
    setBusy(true)
    try {
      const res = await fetch('/api/shops/current/report-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceReportPatch(next)),
      })
      if (!res.ok) throw new Error(String(res.status))
      const saved = (await res.json()) as ReportSettings
      setView(serviceReportView(saved))
      setChart(serviceReportChart(saved))
      pacesToast.success(W.saved)
    } catch {
      setView(prev.view)
      setChart(prev.chart)
      pacesToast.error(W.saveFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-base lg:grid-cols-3" aria-busy={busy}>
      <div className="card lg:col-span-2">
        <div className="card-body">
          <section role="radiogroup" aria-labelledby="rs-view" className="border-default-200 border-b pb-5">
            <h4 id="rs-view" className="mb-0.5 text-base font-semibold text-dark">{W.setViewTitle}</h4>
            <p className="mb-3 text-sm text-default-700">{W.setViewHelp}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  { key: 'sales', title: W.sales, help: W.setViewSalesHelp, value: sales.totals.sales },
                  { key: 'profit', title: W.profit, help: W.setViewProfitHelp, value: profit.totals.profit },
                ] as const
              ).map((o) => (
                <button key={o.key} type="button" role="radio" aria-checked={view === o.key} disabled={busy} onClick={() => view !== o.key && save({ view: o.key })} className={tileClass(view === o.key)}>
                  <Tick on={view === o.key} />
                  <span className="pe-7 text-base font-semibold text-dark">{o.title}</span>
                  <span className="text-xs text-default-700">{o.help}</span>
                  <span className={`mt-auto text-xl font-bold tabular-nums ${o.value < 0 ? 'text-danger-ink' : 'text-dark'}`}>{formatNumberNoSymbol(o.value)}</span>
                </button>
              ))}
            </div>
          </section>

          <section role="radiogroup" aria-labelledby="rs-chart" className="pt-5">
            <h4 id="rs-chart" className="mb-0.5 text-base font-semibold text-dark">{W.setChartTitle}</h4>
            <p className="mb-3 text-sm text-default-700">{W.setChartHelp}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  { key: 'bar', title: W.setChartBar },
                  { key: 'line', title: W.setChartLine },
                ] as const
              ).map((o) => (
                <button key={o.key} type="button" role="radio" aria-checked={chart === o.key} disabled={busy} onClick={() => chart !== o.key && save({ chart: o.key })} className={tileClass(chart === o.key)}>
                  <Tick on={chart === o.key} />
                  <span className="pe-7 text-base font-semibold text-dark">{o.title}</span>
                  {/* ภาพย่อรูปแบบกราฟ — SVG ตกแต่ง (aria-hidden) สีจาก token ธีม */}
                  {o.key === 'bar' ? (
                    <svg viewBox="0 0 120 44" className="mt-auto h-11 w-full" preserveAspectRatio="none" aria-hidden="true">
                      <g className="fill-success">
                        <rect x="6" y="22" width="13" height="22" rx="2" /><rect x="29" y="12" width="13" height="32" rx="2" /><rect x="52" y="26" width="13" height="18" rx="2" /><rect x="75" y="6" width="13" height="38" rx="2" /><rect x="98" y="18" width="13" height="26" rx="2" />
                      </g>
                      <g className="fill-warning">
                        <rect x="6" y="14" width="13" height="8" rx="2" /><rect x="52" y="18" width="13" height="8" rx="2" /><rect x="98" y="10" width="13" height="8" rx="2" />
                      </g>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 120 44" className="mt-auto h-11 w-full" preserveAspectRatio="none" aria-hidden="true" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline className="stroke-success" points="4,32 28,20 52,28 76,8 100,18 116,14" />
                      <polyline className="stroke-warning" points="4,40 28,34 52,37 76,26 100,30 116,24" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      <aside className="card self-start" aria-label={W.setPreview}>
        <div className="card-body">
          <p className="mb-1.5 text-xs font-semibold text-default-700">{W.setPreview}</p>
          <p className="mb-0 text-xs text-default-700">{shown.hero.label}</p>
          <p className={`text-3xl font-bold tracking-tight tabular-nums ${shown.hero.tone === 'loss' ? 'text-danger-ink' : 'text-dark'}`}>{formatNumberNoSymbol(shown.hero.value)}</p>
          <ServiceReportChart chart={shown.chart} kind={chart} height={140} />
        </div>
      </aside>
    </div>
  )
}
