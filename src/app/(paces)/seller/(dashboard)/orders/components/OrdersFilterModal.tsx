/**
 * OrdersFilterModal — โมดัลตัวกรองตัวเดียวของหน้า /orders ทุกขนาดจอ (user เคาะ 2026-11-15)
 *
 * เลือกเป็น "ร่าง" ก่อน แล้วกด `ใช้ตัวกรอง` ค่อยมีผล · ปิดด้วย ×/Esc/แตะฉากหลัง = ทิ้งร่าง
 * v2 (user 2026-11-16 "ใช้ยาก"): หมวดซ้าย · ตัวเลือกขวาทีละหมวดเต็มความสูง · ตัวเลือกเป็นแถว (เลขชิดขวา) · ซ่อนตัวที่นับได้ 0
 *   มือถือ = bottom sheet: รายชื่อหมวด (บอกค่าที่เลือก) → แตะเข้าไปเลือก · ปุ่มกลับ
 *   mockup: docs/superpowers/specs/2026-11-16-orders-filter-modal-v2-mockup.html
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx (Large + Scrollable modal — หัว/ท้ายตรึง เนื้อเลื่อน)
 * Base (sheet มือถือ + scroll lock): src/app/(paces)/seller/(dashboard)/orders/new/components/ProductPickerSheet.tsx
 *   — React state + useLockBodyScroll ไม่ใช่ hs-overlay (หน้านี้ re-render หนัก เหตุผลเดียวกับไฟล์นั้น)
 * เนื้อปุ่มเลือก: โมดัลตัวกรองเดิมใน OrdersList.tsx · แถวโฆษณา: reports/ads/components/AdTableCard.tsx + AdThumb
 *
 * ส่วนนี้ mount เฉพาะตอนเปิด (ผู้เรียก `{open && <… />}`) ⇒ ร่างเริ่มจากค่าที่ใช้อยู่ทุกครั้งโดยไม่ต้องมี effect รีเซ็ต
 */
'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import BeDateHint from '@/components/safepay/BeDateHint'
import AdThumb from '@/components/safepay/AdThumb'
import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { adDisplayName } from '@/lib/ad-attribution'
import { ORDER_DATE_PRESETS, isSpecificDay } from '@/lib/order-date-filter'
import {
  AD_NONE,
  EMPTY_ORDERS_FILTERS,
  type AdFilterOption,
  type OrdersFilters,
} from '@/lib/orders-filter'
import { cn } from '@/utils/helpers'

export type FilterChoice = { value: string | null; label: string; count?: number }

type Props = {
  applied: OrdersFilters
  onApply: (f: OrdersFilters) => void
  onClose: () => void
  orderNoun: string
  /** จำนวนผลลัพธ์ถ้าใช้ร่างนี้ — ผู้เรียกคิดจากข้อมูลฝั่ง client (รวมคำค้นที่ใช้อยู่) */
  countFor: (f: OrdersFilters) => number
  /** แกนค่าเดียว — undefined = ร้านนี้ไม่มีแกนนั้น ไม่แสดง section (ห้ามมีปุ่มที่กดแล้วไม่เกิดอะไร) */
  status: FilterChoice[]
  stage?: FilterChoice[]
  appt?: FilterChoice[]
  fulfillment?: FilterChoice[]
  courier?: FilterChoice[]
  type: FilterChoice[]
  ads: { ads: AdFilterOption[]; noneCount: number }
}

const AD_SEARCH_MIN = 5

/** แถวเลือกค่าเดียว — ซ่อนตัวที่นับได้ 0 (เว้นตัวที่เลือกค้างอยู่ ไม่งั้นเอาออกไม่ได้) */
function OptionRows({
  name,
  choices,
  value,
  onPick,
  allLabel,
  cols,
}: {
  name: string
  choices: FilterChoice[]
  value: string | null
  onPick: (v: string | null) => void
  allLabel: string
  cols?: boolean
}) {
  const all: FilterChoice[] = [
    { value: null, label: allLabel },
    ...choices.filter((c) => c.value !== null && (c.count !== 0 || c.value === value)),
  ]
  return (
    <ul className={cn('m-0 list-none gap-x-4 space-y-0.5 p-0', cols && 'lg:grid lg:grid-cols-2 lg:space-y-0')}>
      {all.map((c) => (
        <li key={c.value ?? 'all'}>
          <label className="hover:bg-default-100 has-checked:bg-primary/10 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2">
            <input type="radio" name={name} className="form-radio shrink-0" checked={value === c.value} onChange={() => onPick(c.value)} />
            <span className="text-default-900 min-w-0 flex-1 truncate text-sm">{c.label}</span>
            {c.count !== undefined && <span className="text-default-500 shrink-0 text-xs tabular-nums">{c.count.toLocaleString('th-TH')}</span>}
          </label>
        </li>
      ))}
    </ul>
  )
}

type SecKey = 'date' | 'status' | 'stage' | 'appt' | 'fulfillment' | 'courier' | 'type' | 'ads'

export default function OrdersFilterModal({
  applied,
  onApply,
  onClose,
  orderNoun,
  countFor,
  status,
  stage,
  appt,
  fulfillment,
  courier,
  type,
  ads,
}: Props) {
  const t = useT()
  const f = t.ordersFilter
  const titleId = useId()
  const dateId = useId()
  const [draft, setDraft] = useState<OrdersFilters>(applied)
  const [dateOpen, setDateOpen] = useState(false)
  const [adQuery, setAdQuery] = useState('')
  const set = useCallback((patch: Partial<OrdersFilters>) => setDraft((d) => ({ ...d, ...patch })), [])

  // overlay ประกอบเอง ⇒ ต้องตรึง scroll เอง (docs/conventions/overlay-scroll-lock.md)
  useLockBodyScroll(true)

  // โฟกัสเข้าโมดัลตอนเปิด · คืนโฟกัสให้ปุ่มที่เปิด (ปุ่ม "ตัวกรอง") ตอนปิด · Tab วนอยู่ในโมดัล
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    return () => opener?.focus?.()
  }, [])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab' || !dialogRef.current) return
      const items = dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select, a[href], [tabindex]:not([tabindex="-1"])')
      if (items.length === 0) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  const resultCount = useMemo(() => countFor(draft), [countFor, draft])

  const idFallback = t.inbox.contextBar.adIdFallback
  const nameOf = useCallback(
    (a: AdFilterOption) => adDisplayName(a.adTitle, a.adId, idFallback) ?? a.adId,
    [idFallback],
  )
  const visibleAds = useMemo(() => {
    const q = adQuery.trim().toLowerCase()
    if (!q) return ads.ads
    return ads.ads.filter((a) => nameOf(a).toLowerCase().includes(q) || a.adId.includes(q))
  }, [ads.ads, adQuery, nameOf])
  const hasAds = ads.ads.length > 0

  const toggleAd = (id: string) =>
    set({ ads: draft.ads.includes(id) ? draft.ads.filter((x) => x !== id) : [...draft.ads, id] })

  const datePills: FilterChoice[] = Object.entries(ORDER_DATE_PRESETS)
    .filter(([k]) => k !== 'All')
    .map(([k, label]) => ({ value: k, label }))
  const specificDay = isSpecificDay(draft.date)
  const showDateInput = dateOpen || specificDay

  const adRow = (key: string, checked: boolean, thumb: ReactNode, name: string, count: number) => (
    <li key={key}>
      <label className="hover:bg-default-100 has-checked:bg-primary/10 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5">
        <input type="checkbox" className="form-checkbox size-4.5 shrink-0" checked={checked} onChange={() => toggleAd(key)} />
        {thumb}
        <span className="text-default-900 min-w-0 flex-1 truncate text-sm" title={name}>{name}</span>
        <span className="text-default-500 shrink-0 text-xs tabular-nums">{count}</span>
      </label>
    </li>
  )

  const labelOf = (choices: FilterChoice[] | undefined, v: string | null) => choices?.find((c) => c.value === v)?.label ?? v ?? ''
  const dateLabel = specificDay ? draft.date : datePills.find((c) => c.value === draft.date)?.label ?? ''
  // หมวดที่ร้านนี้มีเท่านั้น (undefined = ไม่มีแกนนั้น) · value = ค่าที่เลือกอยู่ (null = ทั้งหมด)
  const sections: { key: SecKey; label: string; icon: string; value: string | null }[] = [
    { key: 'date', label: f.secDate, icon: 'calendar', value: draft.date === 'All' ? null : dateLabel },
    { key: 'status', label: f.secStatus, icon: 'progress-check', value: draft.status === null ? null : labelOf(status, draft.status) },
    ...(stage ? [{ key: 'stage' as const, label: f.secStage, icon: 'package', value: draft.stage === null ? null : labelOf(stage, draft.stage) }] : []),
    ...(appt ? [{ key: 'appt' as const, label: f.secAppt, icon: 'calendar-time', value: draft.appt === null ? null : labelOf(appt, draft.appt) }] : []),
    ...(fulfillment ? [{ key: 'fulfillment' as const, label: f.secFulfillment, icon: 'truck-delivery', value: draft.fulfillment === null ? null : labelOf(fulfillment, draft.fulfillment) }] : []),
    ...(courier ? [{ key: 'courier' as const, label: f.secCourier, icon: 'truck', value: draft.courier === null ? null : labelOf(courier, draft.courier) }] : []),
    { key: 'type', label: f.secType, icon: 'category', value: draft.type === null ? null : labelOf(type, draft.type) },
    ...(hasAds ? [{ key: 'ads' as const, label: f.secAds, icon: 'speakerphone', value: draft.ads.length ? fmt(f.adsN, { n: draft.ads.length }) : null }] : []),
  ]
  const [sec, setSec] = useState<SecKey>(sections[0].key)
  // มือถือ: false = เห็นรายชื่อหมวด · true = อยู่ในหมวด (จอ sm+ เห็นทั้งสองฝั่งเสมอ)
  const [drill, setDrill] = useState(false)
  const current = sections.find((x) => x.key === sec) ?? sections[0]
  const activeSummary = sections.filter((x) => x.value !== null).map((x) => `${x.label}: ${x.value}`).join(' · ')

  const pane = (() => {
    switch (current.key) {
      case 'date':
        return (
          <>
            <OptionRows name="date" choices={datePills} value={specificDay ? null : draft.date === 'All' ? null : draft.date} allLabel={f.all}
              onPick={(v) => { set({ date: v ?? 'All' }); setDateOpen(false) }} />
            <button type="button" aria-pressed={showDateInput} onClick={() => setDateOpen((v) => !v)}
              className={cn('hover:bg-default-100 mt-0.5 flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-sm', specificDay ? 'bg-primary/10 text-primary-ink font-medium' : 'text-default-900')}>
              <Icon icon="calendar-search" className="text-base" aria-hidden="true" />
              {f.pickDate}
            </button>
            {showDateInput && (
              <div className="input-icon-group mt-2 max-w-xs">
                <Icon icon="calendar-search" className="input-icon" aria-hidden="true" />
                <input id={dateId} type="date" aria-label={f.pickDate} aria-describedby={`${dateId}-be`} className="form-input"
                  value={specificDay ? draft.date : ''}
                  // ว่าง = กดล้างในตัว picker → กลับ "ทั้งหมด" ไม่ใช่ค้างสถานะกำกวม
                  onChange={(e) => set({ date: e.target.value || 'All' })} />
              </div>
            )}
            {specificDay && <BeDateHint value={draft.date} id={`${dateId}-be`} />}
          </>
        )
      case 'status':
        return <OptionRows name="status" choices={status} value={draft.status} onPick={(v) => set({ status: v })} allLabel={f.all} />
      case 'stage':
        return <OptionRows name="stage" choices={stage ?? []} value={draft.stage} onPick={(v) => set({ stage: v })} allLabel={f.all} />
      case 'appt':
        return <OptionRows name="appt" choices={appt ?? []} value={draft.appt} onPick={(v) => set({ appt: v })} allLabel={f.all} />
      case 'fulfillment':
        return <OptionRows name="fulfillment" choices={fulfillment ?? []} value={draft.fulfillment} onPick={(v) => set({ fulfillment: v as OrdersFilters['fulfillment'] })} allLabel={f.all} />
      case 'courier':
        return <OptionRows name="courier" cols choices={courier ?? []} value={draft.courier} onPick={(v) => set({ courier: v })} allLabel={f.all} />
      case 'type':
        return <OptionRows name="type" choices={type} value={draft.type} onPick={(v) => set({ type: v as OrdersFilters['type'] })} allLabel={f.all} />
      case 'ads':
        return (
          <>
            <div className="mb-2 flex items-center gap-3">
              {ads.ads.length > AD_SEARCH_MIN && (
                <div className="input-icon-group flex-1">
                  <Icon icon="search" className="input-icon" aria-hidden="true" />
                  <input type="search" className="form-input" placeholder={f.adSearch} aria-label={f.adSearch} value={adQuery} onChange={(e) => setAdQuery(e.target.value)} />
                </div>
              )}
              {draft.ads.length > 0 && (
                <button type="button" onClick={() => set({ ads: [] })} className="text-primary ms-auto inline-flex min-h-11 shrink-0 items-center text-sm">{f.clearSection}</button>
              )}
            </div>
            <ul className="m-0 list-none space-y-0.5 p-0">
              {ads.noneCount > 0 &&
                adRow(
                  AD_NONE,
                  draft.ads.includes(AD_NONE),
                  <span className="bg-default-100 text-default-700 flex size-7 shrink-0 items-center justify-center rounded">
                    <Icon icon="ad-off" className="text-base" aria-hidden="true" />
                  </span>,
                  t.adReport.legendNotFromAd,
                  ads.noneCount,
                )}
              {visibleAds.map((a) =>
                adRow(a.adId, draft.ads.includes(a.adId), <AdThumb photoFileId={a.adPhotoFileId} className="size-7 rounded" />, nameOf(a), a.count),
              )}
            </ul>
          </>
        )
    }
  })()

  return (
    <div className="fixed inset-0 z-70 flex items-end justify-center sm:items-center sm:p-6">
      <div className="bg-dark/40 absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={'bg-card relative flex h-[90dvh] w-full flex-col rounded-t-2xl outline-none sm:h-[85dvh] sm:max-h-160 sm:max-w-2xl sm:rounded-2xl lg:max-w-4xl' /* HR7: dvh = viewport-lock มือถือ/แท็บเล็ต Paces ไม่มี token */}
      >
        {/* หัวตรึง — มือถือในหมวด: ปุ่มกลับ + ชื่อหมวด */}
        <div className="border-default-200 flex shrink-0 items-center gap-1 border-b px-2 py-2 sm:px-6 sm:py-3">
          {drill && (
            <button type="button" onClick={() => setDrill(false)} aria-label={f.back} className="text-default-700 inline-flex size-11 items-center justify-center rounded-lg sm:hidden">
              <Icon icon="chevron-left" className="text-xl" />
            </button>
          )}
          <h3 id={titleId} className="text-default-900 mb-0 ps-2 text-base font-semibold sm:ps-0">
            <span className={cn(drill && 'max-sm:hidden')}>{f.title}</span>
            {drill && <span className="sm:hidden">{current.label}</span>}
          </h3>
          <button type="button" onClick={onClose} aria-label={f.close} className="text-default-700 ms-auto inline-flex size-11 items-center justify-center rounded-lg sm:size-9">
            <Icon icon="x" className="text-xl" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* รายชื่อหมวด — sm+ = แถบซ้าย · มือถือ = หน้าแรกของแผ่น */}
          <nav aria-label={f.title} className={cn('border-default-200 w-full shrink-0 space-y-0.5 overflow-y-auto p-2 sm:w-44 sm:border-e lg:w-56 lg:p-3', drill && 'max-sm:hidden')}>
            {sections.map((x) => {
              const on = x.key === current.key
              const n = x.key === 'ads' ? draft.ads.length : x.value !== null ? 1 : 0
              return (
                <button
                  key={x.key}
                  type="button"
                  aria-current={on ? 'true' : undefined}
                  onClick={() => { setSec(x.key); setDrill(true) }}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-start text-sm',
                    'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
                    on ? 'sm:bg-primary/10 sm:text-primary-ink text-default-900 sm:font-semibold' : 'text-default-700 hover:bg-default-100',
                  )}
                >
                  <Icon icon={x.icon} className="shrink-0 text-base" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{x.label}</span>
                  {/* มือถือ: บอกค่าที่เลือก · sm+: เลขฟ้า = เลือกอยู่ */}
                  <span className={cn('max-w-36 truncate text-xs sm:hidden', x.value !== null ? 'text-primary-ink font-medium' : 'text-default-500')}>{x.value ?? f.all}</span>
                  <Icon icon="chevron-right" className="text-default-400 shrink-0 sm:hidden" aria-hidden="true" />
                  {n > 0 && <span className="bg-primary hidden rounded-full px-1.5 text-xs font-semibold text-white tabular-nums sm:inline">{n}</span>}
                </button>
              )
            })}
          </nav>

          {/* หมวดเดียว เต็มความสูง */}
          <section aria-label={current.label} className={cn('min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5', !drill && 'max-sm:hidden')}>
            {pane}
          </section>
        </div>

        {/* ท้ายตรึง */}
        <div className="border-default-200 flex shrink-0 items-center gap-3 border-t px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => {
              setDraft(EMPTY_ORDERS_FILTERS)
              setDateOpen(false)
            }}
            className="btn border-default-300 text-default-700 min-h-11 border"
          >
            {f.clearAll}
          </button>
          {activeSummary && <span className="text-default-700 hidden min-w-0 truncate text-xs lg:inline" title={activeSummary}>{activeSummary}</span>}
          <button
            type="button"
            onClick={() => onApply(draft)}
            className="btn bg-primary hover:bg-primary-hover ms-auto min-h-11 flex-1 text-white sm:flex-none"
          >
            {fmt(f.apply, { n: resultCount.toLocaleString('th-TH'), noun: orderNoun })}
          </button>
        </div>
      </div>
    </div>
  )
}
