'use client'

/**
 * BreakdownCard — ④ ตำแหน่งแสดงแอดและกลุ่มผู้ชม: การ์ดแท็บเดียว (ตำแหน่ง ↔ อายุ/เพศ) + ตัวเลือกแอดที่หัวการ์ด (FR-006/007 · มติ O2)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/SessionOverview.tsx
 *   (card-header + `nav role=tablist grid` ช่องแท็บ: วงกลมไอคอน `bg-info/15 text-info` + หัวข้อ + ค่า · `border-b-2 border-primary` ที่ช่อง active)
 *   ตัวเลือกแอด: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx (`input-icon-group` + native `form-select`)
 *   a11y ของ tablist (aria-selected/controls · roving tabindex · ←/→/Home/End): src/app/(paces)/seller/(dashboard)/reports/ads/components/DailyOverviewCard.tsx
 * ตัด: ปุ่ม Export/Import · CountUp · ลูกศร ▲▼ ที่ไม่มีช่วงเทียบรองรับ · random data
 * 🛑 ?ad= กระทบเฉพาะการ์ดนี้ (Q3/Q4) · ค่าในช่องแท็บเป็น insight ของแท็บนั้น ไม่ซ้ำตัวเลขรวมใน ①–③ · ทุกตัวเลขเป็นค่าประมาณมีป้าย (BR-AIQ-03)
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useId, useMemo, useRef, useState, useTransition } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { buildAgeSummary, buildPlacements } from '@/lib/ad-quality-view'
import { formatBaht } from '@/lib/format-money'
import { cn } from '@/utils/helpers'
import type { AgeGenderRow, PlacementRow } from '@/lib/meta-ads-quality'
import type { CardStatus } from './data'
import { fmtPct1 } from './data'
import AgeGenderPanel from './AgeGenderPanel'
import CardState from './CardState'
import EstimateBadge from './EstimateBadge'
import NoDataCell from './NoDataCell'
import PlacementPanel from './PlacementPanel'

type TabId = 'placement' | 'age'
const TABS: TabId[] = ['placement', 'age']

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
  const uid = useId()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, start] = useTransition()
  const [tab, setTab] = useState<TabId>('placement')
  const refs = useRef<Record<TabId, HTMLButtonElement | null>>({ placement: null, age: null })

  const placement = useMemo(() => buildPlacements(placementRows), [placementRows])
  const age = useMemo(() => buildAgeSummary(ageRows), [ageRows])

  const onAd = (v: string) => {
    const next = new URLSearchParams(params.toString())
    if (v) next.set('ad', v)
    else next.delete('ad')
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }))
  }
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const to = e.key === 'ArrowRight' ? (i + 1) % 2 : e.key === 'ArrowLeft' ? (i + 1) % 2 : e.key === 'Home' ? 0 : e.key === 'End' ? 1 : null
    if (to === null) return
    e.preventDefault()
    setTab(TABS[to])
    refs.current[TABS[to]]?.focus()
  }

  const tabs: { id: TabId; title: string; icon: string; value: React.ReactNode; chip: React.ReactNode }[] = [
    {
      id: 'placement', title: t.tabPlacement, icon: 'speakerphone',
      value: placementStatus === 'OK' && placement.cheapest?.costPerChat != null ? `≈${formatBaht(placement.cheapest.costPerChat)}` : <NoDataCell />,
      chip: placementStatus === 'OK' ? placement.cheapest?.label ?? null : null,
    },
    {
      id: 'age', title: t.tabAge, icon: 'users',
      value: ageStatus === 'OK' && age.top ? (age.top.age === 'unknown' ? t.genderUnknown : `${age.top.age}`) : <NoDataCell />,
      chip: ageStatus === 'OK' && age.top?.sharePct != null ? fmt(t.ageShare, { p: fmtPct1(age.top.sharePct).replace('%', '') }) : null,
    },
  ]
  const status = tab === 'placement' ? placementStatus : ageStatus

  return (
    <div className={cn('card h-full min-w-0', pending && 'opacity-60')} aria-busy={pending}>
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
      <div className="card-body p-0">
        <div className="border-default-300 border-b">
          <nav className="grid grid-cols-2" aria-label={t.tabsLabel} role="tablist" aria-orientation="horizontal">
            {tabs.map((x, i) => (
              <button
                key={x.id} ref={(el) => { refs.current[x.id] = el }} type="button" role="tab" id={`${uid}-${x.id}-tab`}
                aria-selected={tab === x.id} aria-controls={`${uid}-${x.id}-panel`} tabIndex={tab === x.id ? 0 : -1}
                onClick={() => setTab(x.id)} onKeyDown={(e) => onKey(e, i)}
                className={cn('flex min-h-11 items-center justify-center gap-x-2 border-b-2 border-transparent px-4 py-5 text-start', tab === x.id && 'border-primary')}>
                <span className="bg-info/15 text-info flex size-9 shrink-0 items-center justify-center rounded-full">
                  <Icon icon={x.icon} className="text-xl" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-default-700 text-sm font-medium">{x.title}</span>
                  <span className="text-default-900 flex flex-wrap items-center gap-x-2 text-lg font-semibold">
                    {x.value}
                    {x.chip && <span className="badge bg-default-100 text-default-800 text-xs">{x.chip}</span>}
                  </span>
                </span>
              </button>
            ))}
          </nav>
        </div>
        <div className="p-5" role="tabpanel" id={`${uid}-${tab}-panel`} aria-labelledby={`${uid}-${tab}-tab`}>
          {status !== 'OK' ? (
            <CardState status={status as 'EMPTY' | 'UNAVAILABLE' | 'ERROR' | 'AUTH'} adSelected={Boolean(selectedAd)} />
          ) : tab === 'placement' ? (
            <PlacementPanel view={placement} />
          ) : (
            <AgeGenderPanel rows={ageRows} />
          )}
        </div>
      </div>
    </div>
  )
}
