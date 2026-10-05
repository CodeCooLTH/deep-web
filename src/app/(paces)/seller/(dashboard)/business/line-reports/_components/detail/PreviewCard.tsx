'use client'

/**
 * PreviewCard — ตัวอย่างข้อความในกลุ่ม LINE (seg รายวัน/รายเดือน + FlexBubbleView จาก `buildSummaryReportFlex` จริง)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card + .card-header)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-reply/order-agent/OrderAgentClient.tsx (radiogroup seg — ไม่ใช้ .btn-group)
 *   + ../FlexBubbleView.tsx (renderer Flex JSON · มติ Controller §10 ข้อ 1)
 *
 * ตัวเลขเป็นตัวอย่างคงที่จากร้านจริงของกลุ่ม (ร้านล็อก/ลบ → "ไม่รวมร้าน…" จริง) · เวลา "ข้อมูล ณ" มาจาก server (`serverNowIso`)
 * ห้าม `new Date()` ตอน render — hydration mismatch · วันนี้ (ไทย) คำนวณจาก serverNowIso ที่ส่งเข้ามา
 * ธงตัวเลขทั้ง 5 (`flags`) ส่งเข้า builder ตัวเดียวกับที่ส่งจริง — พรีวิวตามการติ๊กทุกตัว (กำไรต้องเติม profit ตัวอย่างให้ร้านเอง)
 */
import { useMemo, useState } from 'react'
import { todayThaiIsoDate } from '@/lib/date-range'
import { buildSummaryReportFlex } from '@/lib/line/flex-summary-report'
import { buildSampleSummary, sampleCycleTotals, withSampleProfit } from '@/lib/line-report/preview-sample'
import { previewState, type PreviewKind } from '@/lib/line-report/settings-guards'
import type { GroupDetailDto } from '@/services/line-report-group.service'
import { cn } from '@/utils/helpers'
import FlexBubbleView from '../FlexBubbleView'

const SEG = 'min-h-11 rounded-md px-3 py-1 text-xs font-medium transition-colors lg:min-h-8'

export default function PreviewCard({
  shops,
  settings,
  cycle,
  serverNowIso,
}: {
  shops: GroupDetailDto['shops']
  settings: GroupDetailDto['settings']
  cycle: GroupDetailDto['cycle']
  serverNowIso: string
}) {
  const [view, setView] = useState<PreviewKind>('DAILY')
  const { dailyEnabled, monthlyEnabled, showOrders, showSales, showCancelled, showTopProducts, showProfit, attachCycleToDaily } = settings
  const { kind, dailyDisabled, monthlyDisabled } = previewState(view, { dailyEnabled, monthlyEnabled }, cycle !== null)
  const cycleStart = cycle?.startIso
  const cycleEnd = cycle?.endIso

  const contents = useMemo(() => {
    const today = todayThaiIsoDate(new Date(serverNowIso))
    const window = kind === 'MONTHLY' && cycleStart && cycleEnd ? { startIso: cycleStart, endIso: cycleEnd } : { startIso: today, endIso: today }
    const base = buildSampleSummary({
      shops: shops.map((s) => ({ id: s.shopId, name: s.name, vertical: s.vertical, state: s.state })),
      window,
      computedAtIso: serverNowIso,
    })
    const summary = showProfit ? withSampleProfit(base) : base
    const cycleToDate =
      kind === 'DAILY' && attachCycleToDaily && monthlyEnabled && cycleStart
        ? { startIso: cycleStart, endIso: today, totals: sampleCycleTotals(base) }
        : undefined
    return buildSummaryReportFlex({ summary, kind, flags: { showOrders, showSales, showCancelled, showTopProducts, showProfit }, cycleToDate })[0].contents as Record<string, unknown>
  }, [shops, kind, showOrders, showSales, showCancelled, showTopProducts, showProfit, attachCycleToDaily, monthlyEnabled, cycleStart, cycleEnd, serverNowIso])

  return (
    <section className="card order-4 lg:sticky lg:top-36">
      <div className="card-header flex flex-wrap items-center justify-between gap-2">
        <h5 className="card-title">ตัวอย่างในกลุ่ม LINE</h5>
        <div className="bg-light inline-flex flex-none rounded-lg p-0.5" role="radiogroup" aria-label="ชนิดตัวอย่าง">
          {(['DAILY', 'MONTHLY'] as const).map((k) => {
            const disabled = k === 'DAILY' ? dailyDisabled : monthlyDisabled
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                disabled={disabled}
                onClick={() => setView(k)}
                className={cn(SEG, kind === k ? 'bg-card text-default-900 shadow-sm' : 'text-default-700 hover:text-default-900', disabled && 'opacity-50')}
              >
                {k === 'DAILY' ? 'รายวัน' : 'รายเดือน'}
              </button>
            )
          })}
        </div>
      </div>
      <div className="card-body">
        <FlexBubbleView contents={contents} />
      </div>
    </section>
  )
}
