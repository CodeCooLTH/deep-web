'use client'

/**
 * โมดัล "เพิ่มเหตุการณ์" — เลือกหลายตัวจากที่ชุดข้อมูลยังไม่ส่ง แล้วเพิ่มทีเดียว (feature 00089 stat-cards)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx — "Scrollable Modal" (#scrollable-modal: หัว / เนื้อหา scroll / ท้าย · sm:max-w-lg)
 *   และ "Full Screen Below sm" (#exampleModalFullscreenSm: เต็มจอบนมือถือ)
 *   แปลงเป็น controlled open/onClose ตาม precedent src/app/(paces)/seller/(dashboard)/admins/components/InviteLinkModal.tsx
 *   (Preline hs-overlay พังเมื่อ React re-render) — mount = เปิดอยู่ จึงเรียก useLockBodyScroll(true)
 * Mockup: docs/superpowers/specs/2026-11-14-00089-capi-stat-cards-mockup.html (แท็บ 4 · modal)
 */
import { useEffect, useRef, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { CAPI_EVENTS } from '@/lib/meta-capi/events'
import { CAPI_EVENT_GROUPS } from '@/lib/meta-capi/ui'
import { cn } from '@/utils/helpers'

const META = new Map(CAPI_EVENTS.map((e) => [e.key as string, e.metaName]))

type Props = {
  datasetName: string
  /** ข้อความจังหวะส่ง Purchase ที่ตั้งไว้ (เติมใน desc ของ Purchase) */
  purchaseWhen: string
  /** key ที่เพิ่มได้ (ชุดข้อมูลยังไม่ส่ง) */
  available: string[]
  onClose: () => void
  /** คืน true เมื่อบันทึกสำเร็จ → โมดัลปิดเอง · false = คงไว้ให้ลองใหม่ (ผู้เรียก toast error แล้ว) */
  onConfirm: (keys: string[]) => Promise<boolean>
}

export default function AddEventModal({ datasetName, purchaseWhen, available, onClose, onConfirm }: Props) {
  const t = useT().conversionsApi
  useLockBodyScroll(true)
  const [picked, setPicked] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const needle = q.trim().toLowerCase()
  const match = (key: string) => {
    const label = t.events[key as keyof typeof t.events]
    return !needle || `${label.label} ${META.get(key) ?? ''}`.toLowerCase().includes(needle)
  }
  const groups = CAPI_EVENT_GROUPS.map((g) => ({ id: g.id, keys: g.keys.filter((k) => available.includes(k) && match(k)) })).filter((g) => g.keys.length > 0)
  const toggle = (key: string, on: boolean) => setPicked((p) => (on ? [...p, key] : p.filter((k) => k !== key)))

  const confirm = async () => {
    if (!picked.length || saving) return
    setSaving(true)
    const ok = await onConfirm(picked)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-80 flex bg-black/50 sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="capi-add-event-label"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="card flex h-full w-full flex-col max-sm:rounded-none sm:h-auto sm:max-w-lg">
        <div className="card-header p-5 max-sm:py-3 max-sm:pe-2 max-sm:ps-4">
          <h3 id="capi-add-event-label" className="text-base font-semibold">
            {t.evAdd} <span className="text-default-700 text-xs font-normal">· {datasetName}</span>
          </h3>
          <button type="button" aria-label={t.evModalClose} onClick={onClose} className="text-default-700 inline-flex size-11 shrink-0 items-center justify-center">
            <Icon icon="x" className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 max-sm:p-4 sm:max-h-96">
          {available.length === 0 ? (
            <p className="text-default-700 py-6 text-center text-sm">{t.evModalAllAdded}</p>
          ) : (
            <>
              <div className="relative mb-3">
                <Icon icon="search" className="text-default-500 pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden="true" />
                <label htmlFor="capi-add-event-search" className="sr-only">
                  {t.evModalSearch}
                </label>
                <input ref={searchRef} id="capi-add-event-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.evModalSearchPh} className="form-input min-h-11 ps-9 lg:min-h-0" />
              </div>
              {groups.length === 0 && <p className="text-default-700 py-6 text-center text-sm">{t.evModalNone}</p>}
              {groups.map((g) => (
                <fieldset key={g.id} className="mb-3">
                  <legend className="text-default-700 pb-1 text-xs font-semibold">{{ before: t.evGroupBefore, buy: t.evGroupBuy, after: t.evGroupAfter }[g.id]}</legend>
                  <ul className="divide-default-200 divide-y">
                    {g.keys.map((key) => {
                      const label = t.events[key as keyof typeof t.events]
                      const on = picked.includes(key)
                      return (
                        <li key={key}>
                          <label htmlFor={`capi-add-${key}`} className={cn('flex min-h-11 cursor-pointer items-start gap-3 rounded px-2 py-2.5', on && 'bg-primary/10')}>
                            <input id={`capi-add-${key}`} type="checkbox" className="form-checkbox mt-0.5 shrink-0" checked={on} onChange={(e) => toggle(key, e.target.checked)} />
                            <span className="min-w-0">
                              <span className="text-default-900 block text-sm font-medium">
                                {label.label} <span className="text-default-700 text-xs font-normal">({META.get(key)})</span>
                              </span>
                              <span className="text-default-700 block text-xs">{key === 'PURCHASE' ? fmt(label.desc, { when: purchaseWhen }) : label.desc}</span>
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </fieldset>
              ))}
            </>
          )}
        </div>

        <div className="border-default-300 flex items-center justify-end gap-2 border-t p-4">
          <button type="button" onClick={onClose} className="btn bg-light text-default-800 min-h-11 max-sm:flex-1 lg:min-h-0">
            {t.evModalCancel}
          </button>
          <button type="button" disabled={picked.length === 0 || saving} onClick={() => void confirm()} className="btn bg-primary hover:bg-primary-hover min-h-11 text-white max-sm:flex-2 lg:min-h-0">
            {picked.length ? fmt(t.evModalConfirm, { n: picked.length }) : t.evModalPick}
          </button>
        </div>
      </div>
    </div>
  )
}
