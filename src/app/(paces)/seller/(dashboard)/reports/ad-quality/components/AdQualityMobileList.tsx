'use client'

/**
 * AdQualityMobileRow — แถวรายการมือถือของ ⑥ (FR-005): 2×2 ตัวเลขหลัก (แชท (Meta) · คุยต่อ ≥3 · บล็อก · ปิดการขาย (Deep)) · แตะ = ขยายดูอัตราที่เหลือ/วิดีโอในที่เดิม
 * Base: ท่ารายการมือถือ (`<button>` min-h-11 · divide-y) ของ src/app/(paces)/seller/(dashboard)/reports/ads/components/AdTableCard.tsx
 *   ซึ่ง Base เป็น theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AnalyticsOverview.tsx
 * ทุกตัวเลขมีป้ายเต็ม ("แชท (Meta)" ฯลฯ) — ไม่ย่อจนกำกวม
 */
import { useState } from 'react'

import AdThumb from '@/components/safepay/AdThumb'
import Icon from '@/components/wrappers/Icon'
import { adDisplayName } from '@/lib/ad-attribution'
import type { QualityLine } from '@/lib/ad-quality-view'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { fmtInt, fmtPct1 } from './data'
import NoDataCell from './NoDataCell'
import RateCell from './RateCell'
import VideoCell from './VideoCell'

export default function AdQualityMobileRow({ line, depth = 0, expandable, expanded, onToggleGroup }: { line: QualityLine; depth?: number; expandable?: boolean; expanded?: boolean; onToggleGroup?: () => void }) {
  const t = useT()
  const a = t.adQuality
  const [open, setOpen] = useState(false)
  const name = line.kind === 'campaign' ? line.title ?? a.noCampaign : adDisplayName(line.title, line.adId ?? '', t.inbox.contextBar.adIdFallback) ?? line.adId ?? ''
  const pct = (v: number | null) => (v === null ? <NoDataCell /> : fmtPct1(v))
  const cell = (label: string, value: React.ReactNode) => (
    <div className="min-w-0">
      <p className="text-default-500 text-2xs mb-0">{label}</p>
      <p className="text-default-900 mb-0 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
  return (
    <div className={depth ? 'bg-default-100/40 ps-4' : undefined}>
      <button type="button" className="flex min-h-11 w-full items-start gap-3 px-4 py-3 text-start" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {line.kind === 'ad' ? <AdThumb photoFileId={line.photoFileId} className="size-10 rounded-md" iconClass="text-lg" /> : null}
        <span className="min-w-0 flex-1">
          <span className="text-default-900 mb-2 line-clamp-2 block break-words text-sm font-medium">{name}</span>
          <span className="grid grid-cols-2 gap-x-3 gap-y-2">
            {cell(a.chatMeta, line.chatsMeta === null ? <NoDataCell /> : fmtInt(line.chatsMeta))}
            {cell(a.colDepth3, pct(line.rates.depth3.pct))}
            {cell(a.colBlock, pct(line.rates.block.pct))}
            {cell(a.colClose, pct(line.closeRate))}
          </span>
        </span>
        <Icon icon={open ? 'chevron-up' : 'chevron-down'} className="text-default-500 mt-1 shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-3 px-4 pb-3">
          <div><p className="text-default-500 text-2xs mb-0.5">{a.colImprCtr}</p><p className="mb-0 text-sm tabular-nums">{fmtInt(line.impressions)} · {pct(line.ctr)}</p></div>
          <div><p className="text-default-500 text-2xs mb-0.5">{a.colDepth2}</p><RateCell {...line.rates.depth2} /></div>
          <div><p className="text-default-500 text-2xs mb-0.5">{a.colReplied}</p><RateCell {...line.rates.replied} /></div>
          <div><p className="text-default-500 text-2xs mb-0.5">{a.colVideo}</p><VideoCell line={line} /></div>
          {line.kind === 'campaign' && <p className="text-default-700 col-span-2 mb-0 text-xs">{fmt(a.adsIn, { n: line.adCount })}</p>}
        </div>
      )}
      {expandable && onToggleGroup && (
        <button type="button" className="text-primary min-h-11 px-4 pb-2 text-sm underline" aria-expanded={expanded} onClick={onToggleGroup}>
          {expanded ? a.collapseRow : fmt(a.adsIn, { n: line.adCount })}
        </button>
      )}
    </div>
  )
}
