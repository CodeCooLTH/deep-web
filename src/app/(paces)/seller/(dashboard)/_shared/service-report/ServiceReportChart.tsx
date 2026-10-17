'use client'

/**
 * กราฟรายงานร้านบริการ (feature 00078) — ApexChart wrapper (HR10) + options จาก lib/service-report/chart-options
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/ (ผ่าน precedent SalesChartSheet.tsx)
 */
import { useCallback } from 'react'

import ApexChart from '@/components/wrappers/ApexChart'
import { FINANCE_COLORS } from '@/lib/finance-colors'
import type { ServiceReportChart as ChartKind } from '@/lib/report-settings'
import { buildServiceChartOptions } from '@/lib/service-report/chart-options'
import type { ServiceReportModel } from '@/lib/service-report/view-model'
import { SERVICE_REPORT_WORDS as W } from '@/lib/service-report/words'
import { getColor } from '@/utils/helpers'

type Props = {
  chart: ServiceReportModel['chart']
  kind: ChartKind
  height: number
  /** แตะแท่ง/จุดของวันไหน (เฉพาะถึงวันนี้) — ไม่ส่ง = แตะแล้วเห็นแค่ป้ายยอด */
  onPick?: (index: number) => void
  /** false = ป้ายแกน x ครบทุกช่อง (กราฟ 14 วัน) */
  anchors?: boolean
}

export default function ServiceReportChart({ chart, kind, height, onPick, anchors }: Props) {
  const getOptions = useCallback(
    () =>
      buildServiceChartOptions(
        chart,
        kind,
        {
          counted: getColor(FINANCE_COLORS.counted.token),
          notCounted: getColor(FINANCE_COLORS.notCounted.token),
          outflow: getColor(FINANCE_COLORS.outflow.token),
          axis: getColor('default-700'),
          grid: getColor('default-300'),
          marker: getColor('default-500'),
        },
        { height, onPick, anchors },
      ),
    [chart, kind, height, onPick, anchors],
  )
  return (
    <div role="img" aria-label={W.chartAria}>
      <ApexChart key={`${kind}-${chart.series.length}`} getOptions={getOptions} type={kind === 'bar' ? 'bar' : 'line'} height={height} />
    </div>
  )
}
