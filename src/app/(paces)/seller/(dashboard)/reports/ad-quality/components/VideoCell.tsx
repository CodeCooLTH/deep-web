'use client'

/**
 * VideoCell — คอลัมน์ดูวิดีโอ (BR-AIQ-08 · F-13): แอดวิดีโอ = ThruPlay % + แถบ 4 ขั้น p25/p50/p75/p100 · ไม่ใช่วิดีโอ = ข้อความ (ไม่ใช่ 0)
 * Base: ท่าแถบ `h-1.25 bg-default-100` + แถบสีซ้อนของ theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalSubscriber.tsx
 */
import { useT } from '@/i18n/LocaleProvider'
import { fmtPct1, type QualityRow } from './data'

export default function VideoCell({ line }: { line: Pick<QualityRow, 'isVideo' | 'thruplayPct' | 'videoSteps'> }) {
  const t = useT().adQuality
  if (!line.isVideo) return <span className="text-default-500 block text-center text-xs">{t.notVideo}</span>
  const steps = [line.videoSteps.p25, line.videoSteps.p50, line.videoSteps.p75, line.videoSteps.p100]
  return (
    <span className="block text-center tabular-nums">
      <span className="text-default-900 block text-sm" title={t.thruplay}>{fmtPct1(line.thruplayPct)}</span>
      <span className="mx-auto mt-1 flex w-20 gap-0.5" aria-hidden="true">
        {steps.map((v, i) => (
          <span key={i} className="bg-default-100 block h-1.25 flex-1 rounded">
            <span className="bg-info block h-full rounded" style={{ width: `${Math.min(v ?? 0, 100)}%` }} />
          </span>
        ))}
      </span>
      <span className="text-default-500 text-2xs block">{steps.map((v) => (v === null ? '—' : Math.round(v))).join(' / ')}%</span>
    </span>
  )
}
