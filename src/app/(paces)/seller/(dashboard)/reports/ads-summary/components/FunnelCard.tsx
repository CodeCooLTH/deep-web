'use client'

/**
 * FunnelCard — เส้นทางลูกค้า 5 ขั้น แสดงผล → คลิก → แชท (Meta) → แชทเข้าร้าน → คำสั่งซื้อ (00094 FR-006)
 *
 * Base (โครงการ์ด card-header + card-body): theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalSubscriber.tsx
 * Base (ชนิดกราฟ funnel): theme/paces/Admin/TS/src/app/(admin)/charts/echart/ — ใช้ wrapper src/components/wrappers/EChart.tsx (series 'funnel')
 *
 * 🛑 ข้อยกเว้น HR10 เฉพาะกราฟนี้ (BR-AIR-19): ใช้ ECharts ไม่ใช่ ApexChart — user ขอหน้าตาตาม Highcharts funnel demo (กรวยบน + คอตรง
 *    ป้ายนอกกรวยมีเส้นชี้) ที่ Apex ทำไม่ได้ · Highcharts ต้องซื้อ license เชิงพาณิชย์ จึงไม่ใช้
 * ความสูงชั้นคงที่ (value 100/40/40/40/40 — สเกลจริง 1.6 ล้านเทียบ 249 อ่านไม่ออก) ตัวเลขจริงอยู่ในป้าย
 * สี: ขั้นของ Meta = info · ของร้าน = primary · ป้ายอัตราผ่านดีขึ้น success / แย่ลง warning (ไม่ใช้ danger)
 * ขั้นที่ไม่มีค่า = "—" และอัตราที่ต้องใช้ขั้นนั้นไม่คำนวณ (ไม่ข้ามไปขั้นถัดไป)
 */
import { FunnelChart } from 'echarts/charts' // BR-AIR-19: ข้อยกเว้น HR10 เฉพาะกราฟ funnel (ลงทะเบียนส่วนขยายเอง)
import { TooltipComponent } from 'echarts/components' // BR-AIR-19
import * as echarts from 'echarts/core' // BR-AIR-19
import { SVGRenderer } from 'echarts/renderers' // BR-AIR-19
import Link from 'next/link'
import { useCallback, useMemo } from 'react'

import EChart from '@/components/wrappers/EChart'
import Icon from '@/components/wrappers/Icon'
import { funnelRows } from '@/lib/ad-summary/view'
import type { AdSummaryReport } from '@/lib/ad-summary/types'
import { formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { getColor } from '@/utils/helpers'

// ทำไมลงทะเบียนเองด้วย: wrapper ลงทะเบียน extensions ครั้งเดียวต่อ session — ถ้ากราฟอื่นเข้ามาก่อนด้วยชุดอื่น ชุดของหน้านี้จะไม่ถูกลงเลย
const EXTENSIONS = [FunnelChart, TooltipComponent, SVGRenderer]
echarts.use(EXTENSIONS)

// ชนิด option ของ wrapper — ไม่ import 'echarts' ตรง (HR10)
type EChartsOption = ReturnType<React.ComponentProps<typeof EChart>['getOptions']>
const SHAPE = [100, 40, 40, 40, 40]
const pctText = (v: number | null) => (v === null ? '—' : `${v < 10 ? v.toFixed(2) : v.toFixed(1)}%`)

export default function FunnelCard({ report, rangeQuery }: { report: AdSummaryReport; rangeQuery: string }) {
  const t = useT().adSummary
  const rows = useMemo(() => funnelRows(report.funnel), [report.funnel])
  const names = useMemo(() => [t.fImpr, t.fClicks, t.fChatsMeta, t.fChats, t.fOrders], [t])
  const hops = [t.fR0, t.fR1, t.fR2, t.fR3]
  const worst = report.funnel.worst
  const aria = `${t.fAria}: ${rows.map((r, i) => `${names[i]} ${r.value === null ? t.noData : formatNumberNoSymbol(r.value)}`).join(' · ')}`

  const getOptions = useCallback((): EChartsOption => {
    const ink = getColor('default-900')
    const sub = getColor('default-600')
    const rich = (c: string, bg: string) => ({ fontSize: 11, fontWeight: 600, color: c, backgroundColor: bg, padding: [2, 6], borderRadius: 4 })
    return {
      textStyle: { fontFamily: 'Anuphan, sans-serif' },
      tooltip: {
        trigger: 'item',
        backgroundColor: getColor('card'),
        borderColor: getColor('default-300'),
        textStyle: { color: ink },
        formatter: (pr: unknown) => {
          const i = (pr as { dataIndex: number }).dataIndex
          const r = rows[i]
          return `<b>${names[i]}</b><br>${r.value === null ? '—' : formatNumberNoSymbol(r.value)}${i ? `<br>${fmt(t.fPass, { v: pctText(r.pass) })}` : ''}`
        },
      },
      series: [
        {
          type: 'funnel', sort: 'none', left: '4%', width: '58%', top: 8, bottom: 8, gap: 2, min: 40, max: 100, minSize: '38%', maxSize: '100%',
          data: rows.map((r, i) => ({ name: names[i], value: SHAPE[i], itemStyle: { color: r.meta ? getColor('info') : getColor('chart-primary'), borderColor: getColor('card'), borderWidth: 1 } })),
          emphasis: { itemStyle: { opacity: 0.85 } },
          labelLine: { length: 28, lineStyle: { width: 1, color: getColor('default-400') } },
          label: {
            show: true, position: 'right', lineHeight: 18,
            formatter: (pr: unknown) => {
              const r = rows[(pr as { dataIndex: number }).dataIndex]
              const head = `{n|${names[r.index]}} {v|(${r.value === null ? '—' : formatNumberNoSymbol(r.value)})}`
              if (r.index === 0 || r.pass === null) return head
              const chg = r.change === null ? '' : ` {${r.change >= 0 ? 'g' : 'b'}|${r.change >= 0 ? '↑' : '↓'} ${Math.abs(r.change).toFixed(1)}%}`
              return `${head}\n{s|${fmt(t.fPass, { v: pctText(r.pass) })}}${chg}${r.crossSource ? ` {i|${t.fCross}}` : ''}`
            },
            rich: {
              n: { fontSize: 14, fontWeight: 600, color: ink },
              v: { fontSize: 14, fontWeight: 600, color: ink },
              s: { fontSize: 12, color: sub },
              g: rich(getColor('success-ink'), getColor('success', 0.15)),
              b: rich(getColor('warning-ink'), getColor('warning', 0.15)),
              i: rich(getColor('info-ink'), getColor('info', 0.15)),
            },
          },
        },
      ],
    }
  }, [rows, names, t])

  return (
    <div className="card h-full">
      <div className="card-header">
        <h4 className="card-title">{t.funnelTitle}</h4>
        {worst !== null && (
          <span className="text-warning-ink inline-flex items-center gap-1 text-sm font-medium">
            <Icon icon="alert-triangle" className="text-sm" aria-hidden="true" />
            {fmt(t.fWorst, { name: hops[worst] })}
          </span>
        )}
      </div>
      <div className="card-body flex flex-1 flex-col justify-center">
        <div role="img" aria-label={aria}>
          <EChart getOptions={getOptions} extensions={EXTENSIONS} opts={{ renderer: 'svg' }} style={{ height: 380 }} />
        </div>
        <div className="text-default-700 mt-2 flex flex-wrap items-center justify-end gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-info size-2.5 rounded-sm" />
            {t.fLegendMeta}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="bg-primary size-2.5 rounded-sm" />
            {t.fLegendShop}
          </span>
          <Link href={`/reports/ad-quality?${rangeQuery}`} className="text-primary-ink inline-flex min-h-11 items-center gap-1 font-medium lg:min-h-0">
            {t.fGap}
            <Icon icon="chevron-right" className="text-xs" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  )
}
