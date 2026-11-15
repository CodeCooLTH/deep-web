'use client'

/**
 * BreakdownCard — ตำแหน่งแสดงแอด + อายุและเพศ วางคู่กันในการ์ดเดียว (FR-006/007 · มติ O2: ตัวเลือกแอดมีที่เดียวที่หัวการ์ด)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AudienceInsight.tsx (card-header + หัวข้อย่อย + กราฟในการ์ดเดียว)
 *   ตัวเลือกแอด: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx (`input-icon-group` + native `form-select`)
 * ตัด: แท็บสลับ (กราฟอายุ/เพศเคยซ่อนหลังแท็บ — audit P2-2) · ช่องสรุปบนแท็บ · ปุ่ม Export/Import
 * 🛑 ?ad= กระทบเฉพาะการ์ดนี้ (Q3/Q4) · ทุกตัวเลขเป็นค่าประมาณ — ป้าย "ประมาณการ" ที่หัวการ์ด (BR-AIQ-03)
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useTransition } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { buildPlacements } from '@/lib/ad-quality-view'
import { formatBaht } from '@/lib/format-money'
import { cn } from '@/utils/helpers'
import type { AgeGenderRow, PlacementRow } from '@/lib/meta-ads-quality'
import type { CardStatus } from './data'
import AgeGenderPanel from './AgeGenderPanel'
import CardState from './CardState'
import EstimateBadge from './EstimateBadge'
import PlacementPanel from './PlacementPanel'

type Props = {
  placementStatus: CardStatus
  placementRows: PlacementRow[]
  ageStatus: CardStatus
  ageRows: AgeGenderRow[]
  adOptions: { adId: string; label: string }[]
  selectedAd: string | null
}

export default function BreakdownCard({ placementStatus, placementRows, ageStatus, ageRows, adOptions, selectedAd }: Props) {
  const t = useT().adQuality
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, start] = useTransition()
  const placement = useMemo(() => buildPlacements(placementRows), [placementRows])
  const cheapest = placementStatus === 'OK' ? placement.cheapest : null

  const onAd = (v: string) => {
    const next = new URLSearchParams(params.toString())
    if (v) next.set('ad', v)
    else next.delete('ad')
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }))
  }

  return (
    <div className={cn('card min-w-0', pending && 'opacity-60')} aria-busy={pending}>
      <div className="card-header flex-wrap gap-2">
        <h4 className="card-title">{t.bTitle}</h4>
        <EstimateBadge />
        <div className="input-icon-group ms-auto">
          <Icon icon="speakerphone" className="input-icon text-default-400" aria-hidden="true" />
          <select className="form-select form-select-sm min-h-11 lg:min-h-0" aria-label={t.adSelect} value={selectedAd ?? ''} onChange={(e) => onAd(e.target.value)}>
            <option value="">{t.allAds}</option>
            {adOptions.map((o) => (
              <option key={o.adId} value={o.adId}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="card-body">
        <div className="grid grid-cols-1 gap-base xl:grid-cols-2">
          <section className="min-w-0" aria-labelledby="aiq-place">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h5 id="aiq-place" className="mb-0 text-sm font-semibold">{t.colPlacement}</h5>
              {cheapest?.costPerChat != null && (
                <span className="badge bg-default-100 text-default-800">{fmt(t.cheapestChip, { v: formatBaht(cheapest.costPerChat), label: cheapest.label })}</span>
              )}
            </div>
            {placementStatus === 'OK' ? <PlacementPanel view={placement} /> : <CardState status={placementStatus as 'EMPTY' | 'UNAVAILABLE' | 'ERROR' | 'AUTH'} />}
          </section>
          <section className="min-w-0" aria-labelledby="aiq-age">
            <h5 id="aiq-age" className="mb-3 text-sm font-semibold">{t.subAge}</h5>
            {ageStatus === 'OK' ? <AgeGenderPanel rows={ageRows} /> : <CardState status={ageStatus as 'EMPTY' | 'UNAVAILABLE' | 'ERROR' | 'AUTH'} />}
          </section>
        </div>
      </div>
    </div>
  )
}
