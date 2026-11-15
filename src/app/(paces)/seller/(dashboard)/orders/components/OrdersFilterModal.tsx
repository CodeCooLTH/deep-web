/**
 * OrdersFilterModal — โมดัลตัวกรองตัวเดียวของหน้า /orders ทุกขนาดจอ (user เคาะ 2026-11-15)
 *
 * เลือกเป็น "ร่าง" ก่อน แล้วกด `ใช้ตัวกรอง` ค่อยมีผล · ปิดด้วย ×/Esc/แตะฉากหลัง = ทิ้งร่าง
 * จอใหญ่ 2 คอลัมน์ (ซ้าย = แกนค่าเดียว · ขวา = โฆษณาเลือกหลายตัว) · แท็บเล็ต 1 คอลัมน์ · มือถือ bottom sheet
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

function PillGroup({
  label,
  choices,
  value,
  onPick,
  allLabel,
}: {
  label: string
  choices: FilterChoice[]
  value: string | null
  onPick: (v: string | null) => void
  allLabel: string
}) {
  const all: FilterChoice[] = [{ value: null, label: allLabel }, ...choices.filter((c) => c.value !== null)]
  return (
    <section>
      <h4 className="text-default-900 mb-2 text-sm font-semibold">{label}</h4>
      <div className="flex flex-wrap gap-2">
        {all.map((c) => {
          const active = value === c.value
          return (
            <button
              key={c.value ?? 'all'}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(c.value)}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors sm:min-h-9',
                'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
                active ? 'border-primary bg-primary/10 text-primary-ink font-medium' : 'border-default-200 text-default-700 hover:bg-default-100',
              )}
            >
              {c.label}
              {c.count !== undefined && <span className="text-default-500 tabular-nums">{c.count}</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}

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
      <label className="hover:bg-default-100 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5">
        <input type="checkbox" className="form-checkbox size-4.5 shrink-0" checked={checked} onChange={() => toggleAd(key)} />
        {thumb}
        <span className="text-default-900 min-w-0 flex-1 truncate text-sm" title={name}>{name}</span>
        <span className="text-default-500 shrink-0 text-xs tabular-nums">{count}</span>
      </label>
    </li>
  )

  return (
    <div className="fixed inset-0 z-70 flex items-end justify-center sm:items-center sm:p-6">
      <div className="bg-dark/40 absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={'bg-card relative flex h-[90dvh] outline-none w-full flex-col rounded-t-2xl sm:h-auto sm:max-h-[85dvh] sm:max-w-lg sm:rounded-2xl lg:max-w-4xl' /* HR7: dvh = viewport-lock มือถือ/แท็บเล็ต Paces ไม่มี token */}
      >
        {/* หัวตรึง */}
        <div className="border-default-200 flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-6">
          <h3 id={titleId} className="text-default-900 mb-0 text-base font-semibold">{f.title}</h3>
          <button type="button" onClick={onClose} aria-label={f.close} className="text-default-700 inline-flex size-11 items-center justify-center rounded-lg sm:size-9">
            <Icon icon="x" className="text-xl" />
          </button>
        </div>

        {/* เนื้อเลื่อน */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          <div className={cn('grid gap-6', hasAds && 'lg:grid-cols-3')}>
            <div className={cn('space-y-5', hasAds && 'lg:col-span-2')}>
              <section>
                <h4 className="text-default-900 mb-2 text-sm font-semibold">{f.secDate}</h4>
                <div className="flex flex-wrap gap-2">
                  {[{ value: 'All', label: f.all }, ...datePills].map((c) => {
                    const active = draft.date === c.value
                    return (
                      <button
                        key={c.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          set({ date: c.value as string })
                          setDateOpen(false)
                        }}
                        className={cn(
                          'inline-flex min-h-11 items-center rounded-full border px-3.5 py-1.5 text-sm transition-colors sm:min-h-9',
                          'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
                          active ? 'border-primary bg-primary/10 text-primary-ink font-medium' : 'border-default-200 text-default-700 hover:bg-default-100',
                        )}
                      >
                        {c.label}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    aria-pressed={showDateInput}
                    onClick={() => setDateOpen((v) => !v)}
                    className={cn(
                      'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors sm:min-h-9',
                      'focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none',
                      specificDay ? 'border-primary bg-primary/10 text-primary-ink font-medium' : 'border-default-200 text-default-700 hover:bg-default-100',
                    )}
                  >
                    <Icon icon="calendar-search" className="text-base" aria-hidden="true" />
                    {f.pickDate}
                  </button>
                </div>
                {showDateInput && (
                  <div className="input-icon-group mt-2 max-w-xs">
                    <Icon icon="calendar-search" className="input-icon" aria-hidden="true" />
                    <input
                      id={dateId}
                      type="date"
                      aria-label={f.pickDate}
                      aria-describedby={`${dateId}-be`}
                      className="form-input"
                      value={specificDay ? draft.date : ''}
                      // ว่าง = กดล้างในตัว picker → กลับ "ทั้งหมด" ไม่ใช่ค้างสถานะกำกวม
                      onChange={(e) => set({ date: e.target.value || 'All' })}
                    />
                  </div>
                )}
                {specificDay && <BeDateHint value={draft.date} id={`${dateId}-be`} />}
              </section>

              <PillGroup label={f.secStatus} choices={status} value={draft.status} onPick={(v) => set({ status: v })} allLabel={f.all} />
              {stage && <PillGroup label={f.secStage} choices={stage} value={draft.stage} onPick={(v) => set({ stage: v })} allLabel={f.all} />}
              {appt && <PillGroup label={f.secAppt} choices={appt} value={draft.appt} onPick={(v) => set({ appt: v })} allLabel={f.all} />}
              {(fulfillment || courier) && (
                <div className="grid gap-5 sm:grid-cols-2">
                  {fulfillment && (
                    <PillGroup label={f.secFulfillment} choices={fulfillment} value={draft.fulfillment} onPick={(v) => set({ fulfillment: v as OrdersFilters['fulfillment'] })} allLabel={f.all} />
                  )}
                  {courier && <PillGroup label={f.secCourier} choices={courier} value={draft.courier} onPick={(v) => set({ courier: v })} allLabel={f.all} />}
                </div>
              )}
              <PillGroup label={f.secType} choices={type} value={draft.type} onPick={(v) => set({ type: v as OrdersFilters['type'] })} allLabel={f.all} />
            </div>

            {hasAds && (
              <section className="lg:border-default-200 min-w-0 lg:border-s lg:ps-6">
                <h4 className="text-default-900 mb-2 text-sm font-semibold">{f.secAds}</h4>
                {ads.ads.length > AD_SEARCH_MIN && (
                  <div className="input-icon-group mb-2">
                    <Icon icon="search" className="input-icon" aria-hidden="true" />
                    <input
                      type="search"
                      className="form-input"
                      placeholder={f.adSearch}
                      aria-label={f.adSearch}
                      value={adQuery}
                      onChange={(e) => setAdQuery(e.target.value)}
                    />
                  </div>
                )}
                <ul className="m-0 max-h-72 list-none space-y-0.5 overflow-y-auto overscroll-contain p-0">
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
              </section>
            )}
          </div>
        </div>

        {/* ท้ายตรึง */}
        <div className="border-default-200 flex shrink-0 items-center gap-2 border-t px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => {
              setDraft(EMPTY_ORDERS_FILTERS)
              setDateOpen(false)
            }}
            className="btn border-default-300 text-default-700 min-h-11 border"
          >
            {f.clear}
          </button>
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
