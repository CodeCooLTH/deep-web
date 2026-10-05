'use client'

/**
 * SizeGauge — เกจ "ความยาวข้อความ" (feature 00070 EXT · spec §3.6) · สถานะทั้งหมดมาจาก `gaugeState` (pure)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/progress/page.tsx + src/app/(paces)/seller/(dashboard)/business/components/QuotaUsageCard.tsx (บรรทัด 78–89: role + style width)
 * ปกติเป็นเทากลาง (ไม่ใช่เขียว/primary) · เตือน = warning · เกิน = danger
 */
import type { GaugeState } from '../lib/gauge-state'

export default function SizeGauge({ gauge, extra }: { gauge: GaugeState; extra: string[] }) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <span id="template-gauge-label" className="text-default-700 shrink-0 text-xs">
          ความยาวข้อความ
        </span>
        <div
          role="meter"
          aria-labelledby="template-gauge-label"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(gauge.percent, 100)}
          aria-valuetext={`${gauge.percent}%`}
          className="bg-default-100 h-1.5 w-full overflow-hidden rounded"
        >
          {/* style: ความกว้างไส้ตามค่าที่วัดได้จริง ไม่ใช่ design token (precedent QuotaUsageCard.tsx) */}
          <div className={`h-full rounded ${gauge.fillClass}`} style={{ width: `${gauge.fill}%` }} />
        </div>
        <span className="text-default-700 shrink-0 text-xs tabular-nums">{gauge.percent}%</span>
      </div>
      {gauge.message && <p className={`mt-1.5 mb-0 text-xs ${gauge.level === 'over' ? 'text-danger-ink' : 'text-warning-ink'}`}>{gauge.message}</p>}
      {extra.map((m) => (
        <p key={m} className="text-danger-ink mt-1.5 mb-0 text-xs">
          {m}
        </p>
      ))}
    </div>
  )
}
