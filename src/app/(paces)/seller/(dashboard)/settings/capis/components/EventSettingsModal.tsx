'use client'

/**
 * โมดัล "ตั้งค่า" ของเหตุการณ์เดียว — จังหวะส่ง Purchase / นับออเดอร์ร่าง / ยอด+แนบสินค้า / กฎแท็ก Lead (feature 00089)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx — "Scrollable Modal" + "Full Screen Below sm" (controlled ตามท่า AddEventModal.tsx)
 *   + theme: .../form/elements/components/ChecksRadioSwitches.tsx (form-switch/form-radio) · InputTextfieldType.tsx (form-select) · InputGroup.tsx (input-group ฿)
 *   + กฎแท็ก ย้ายมาจาก RulesCard เดิม (ตัวเลือกแท็ก/ช่องมูลค่า/ตรวจ validate)
 *
 * ตั้งค่าที่นี่เป็นระดับเพจ (ใช้กับทุกชุดข้อมูล) — มีข้อความบอกในโมดัล · mount = เปิดอยู่ จึง useLockBodyScroll(true)
 */
import Link from 'next/link'
import { useEffect, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { useT } from '@/i18n/LocaleProvider'
import { CAPI_EVENTS } from '@/lib/meta-capi/events'
import { MAX_RULES, draftsOf, eventSettingsDirty, eventSettingsKind, rulesValid, toSavedRules, validateRules, type EventSettingsDraft, type RuleDraft } from '@/lib/meta-capi/ui'
import { pacesConfirm } from '@/lib/paces-swal'
import { cn } from '@/utils/helpers'
import type { EventOpt } from './types'

const META = new Map(CAPI_EVENTS.map((e) => [e.key as string, e.metaName]))

export type EventSettingsResult = { patch: Partial<EventOpt>; purchaseAt?: string; countPromotedDraft?: boolean }

type Props = {
  eventKey: string
  opt: EventOpt
  purchaseAt: string
  countPromotedDraft: boolean
  tags: { id: string; name: string }[]
  /** คืน true เมื่อบันทึกสำเร็จ → โมดัลปิดเอง · false = คงไว้ (ผู้เรียก toast error แล้ว) */
  onSave: (r: EventSettingsResult) => Promise<boolean>
  onClose: () => void
}

export default function EventSettingsModal({ eventKey, opt, purchaseAt, countPromotedDraft, tags, onSave, onClose }: Props) {
  const t = useT().conversionsApi
  useLockBodyScroll(true)
  const kind = eventSettingsKind(eventKey)
  const label = t.events[eventKey as keyof typeof t.events]

  const initial: EventSettingsDraft = { valueMode: opt.valueMode ?? 'NET', sendContents: !!opt.sendContents, purchaseAt, countPromotedDraft, rules: draftsOf(opt.rules) }
  const [d, setD] = useState<EventSettingsDraft>(initial)
  const [saving, setSaving] = useState(false)
  const [showErr, setShowErr] = useState(false)
  const set = (p: Partial<EventSettingsDraft>) => setD((x) => ({ ...x, ...p }))
  const dirty = eventSettingsDirty(initial, d, opt.rules)

  const close = async () => {
    if (dirty && !(await pacesConfirm.warning(t.evsDiscardTitle, undefined, { confirmButtonText: t.rulesDiscardOk, cancelButtonText: t.rulesKeep }))) return
    onClose()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.swal2-container') && void close()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const val = validateRules(d.rules)
  const hasAmount = kind === 'purchase' || kind === 'orderCreated' || kind === 'amount'
  const hasDraft = kind === 'purchase' || kind === 'orderCreated'

  const save = async () => {
    if (!dirty || saving) return
    if (kind === 'rules' && !rulesValid(val)) return setShowErr(true)
    const patch: Partial<EventOpt> = kind === 'rules' ? { rules: toSavedRules(d.rules) } : { valueMode: d.valueMode, sendContents: d.sendContents }
    setSaving(true)
    const ok = await onSave({ patch, ...(kind === 'purchase' ? { purchaseAt: d.purchaseAt } : {}), ...(hasDraft ? { countPromotedDraft: d.countPromotedDraft } : {}) })
    setSaving(false)
    if (ok) onClose()
  }

  const patchRule = (i: number, p: Partial<RuleDraft>) => set({ rules: d.rules.map((r, j) => (j === i ? { ...r, ...p } : r)) })
  const used = new Set(d.rules.map((r) => r.tagId))
  const hint = { CREATE: t.timingHintCREATE, CONFIRM: t.timingHintCONFIRM, PAYMENT: t.timingHintPAYMENT }[d.purchaseAt as 'CREATE' | 'CONFIRM' | 'PAYMENT'] ?? ''

  return (
    <div
      className="fixed inset-0 z-80 flex bg-black/50 sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="capi-evs-label"
      onClick={(e) => {
        if (e.target === e.currentTarget) void close()
      }}
    >
      <div className="card flex h-full w-full flex-col max-sm:rounded-none sm:h-auto sm:max-w-lg">
        <div className="card-header p-5 max-sm:py-3 max-sm:pe-2 max-sm:ps-4">
          <h3 id="capi-evs-label" className="text-base font-semibold">
            {t.evSettings} <span className="text-default-700 text-xs font-normal">· {label.label} ({META.get(eventKey)})</span>
          </h3>
          <button type="button" aria-label={t.evModalClose} onClick={() => void close()} className="text-default-700 inline-flex size-11 shrink-0 items-center justify-center">
            <Icon icon="x" className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5 max-sm:p-4 sm:max-h-96">
          <p className="bg-default-100 text-default-800 flex items-start gap-1.5 rounded px-3 py-2 text-xs">
            <Icon icon="info-circle" className="text-default-500 mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {t.evsScope}
          </p>

          {kind === 'purchase' && (
            <div>
              <label htmlFor="capi-timing-select" className="form-label">
                {t.timingLabel}
              </label>
              <select id="capi-timing-select" value={d.purchaseAt} onChange={(e) => set({ purchaseAt: e.target.value })} className="form-select min-h-11 lg:min-h-0">
                <option value="CREATE">{t.purchaseAt.CREATE}</option>
                <option value="CONFIRM">{t.purchaseAt.CONFIRM}</option>
                <option value="PAYMENT">{t.purchaseAt.PAYMENT}</option>
              </select>
              <p className="text-default-800 mt-1 text-xs">{hint}</p>
              <p className="text-default-700 mt-1 text-xs">{t.timingScope}</p>
            </div>
          )}

          {hasDraft && (
            <div className="flex items-start justify-between gap-3">
              <label htmlFor="capi-draft">
                <span className="text-default-900 block text-sm font-medium">{t.draftLabel}</span>
                <span className="text-default-700 mt-0.5 block text-xs">{t.draftHint}</span>
              </label>
              <input id="capi-draft" type="checkbox" className="form-switch mt-1 shrink-0" checked={d.countPromotedDraft} onChange={(e) => set({ countPromotedDraft: e.target.checked })} />
            </div>
          )}

          {hasAmount && (
            <>
              <fieldset className={cn(hasDraft && 'border-default-200 border-t pt-4')}>
                <legend className="text-default-800 mb-1.5 text-xs font-semibold">{t.evAmountLegend}</legend>
                <div className="space-y-2">
                  {(
                    [
                      ['NET', t.evAmountNet, t.evAmountNetHint],
                      ['NO_VAT', t.evAmountNoVat, t.evAmountNoVatHint],
                    ] as const
                  ).map(([v, title, h]) => (
                    <label key={v} className="flex min-h-11 items-start gap-2.5">
                      <input type="radio" name="capi-evs-vm" className="form-radio mt-0.5 rounded-full!" checked={d.valueMode === v} onChange={() => set({ valueMode: v })} />
                      <span>
                        <span className="text-default-900 block text-sm">{title}</span>
                        <span className="text-default-700 block text-xs">{h}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="border-default-200 flex items-start justify-between gap-3 border-t pt-4">
                <label htmlFor="capi-evs-items">
                  <span className="text-default-900 block text-sm">{t.evItems}</span>
                  <span className="text-default-700 block text-xs">{t.evItemsHint}</span>
                </label>
                <input id="capi-evs-items" type="checkbox" className="form-switch mt-1 shrink-0" checked={d.sendContents} onChange={(e) => set({ sendContents: e.target.checked })} />
              </div>
            </>
          )}

          {kind === 'rules' &&
            (tags.length === 0 ? (
              <div className="flex flex-col items-center py-4 text-center">
                <p className="text-default-900 text-sm font-medium">{t.rulesNoTagsTitle}</p>
                <p className="text-default-700 mt-0.5 text-xs">{t.rulesNoTagsBody}</p>
                <Link href="/settings/tags" className="btn border-default-300 text-default-800 mt-3 min-h-11 border lg:min-h-0">
                  {t.rulesNoTagsCta}
                  <Icon icon="chevron-right" className="size-3.5" aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-default-700 flex items-start gap-1.5 text-xs">
                  <Icon icon="info-circle" className="text-default-500 mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {t.rulesHelp}
                </p>
                <ul className="divide-default-200 mt-2 divide-y">
                  {d.rules.map((r, i) => {
                    const err = showErr ? (val.noTag.includes(i) ? t.rulesErrNoTag : val.duplicate.includes(i) ? t.rulesErrDuplicate : val.badValue.includes(i) ? t.rulesErrValue : '') : ''
                    return (
                      <li key={i} className="py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          <label htmlFor={`capi-rt-${i}`} className="form-label sm:mb-0">
                            {t.rulesWhenTag}
                          </label>
                          <select id={`capi-rt-${i}`} value={r.tagId} onChange={(e) => patchRule(i, { tagId: e.target.value })} className="form-select min-h-11 sm:w-40 lg:min-h-0" aria-invalid={!!err}>
                            <option value="">{t.rulesPickTag}</option>
                            {tags.map((tg) => (
                              <option key={tg.id} value={tg.id} disabled={used.has(tg.id) && tg.id !== r.tagId}>
                                {tg.name}
                              </option>
                            ))}
                          </select>
                          <label htmlFor={`capi-rv-${i}`} className="form-label sm:mb-0">
                            {t.rulesValue}
                          </label>
                          <div className="input-group sm:w-32">
                            <span className="input-group-text">฿</span>
                            <input id={`capi-rv-${i}`} inputMode="decimal" value={r.value} onChange={(e) => patchRule(i, { value: e.target.value })} placeholder={t.rulesValuePh} className="form-input min-h-11 tabular-nums lg:min-h-0" aria-invalid={!!err} />
                          </div>
                          <button type="button" aria-label={t.rulesRemove} onClick={() => set({ rules: d.rules.filter((_, j) => j !== i) })} className="btn btn-icon border-default-300 text-default-700 size-11 border sm:ms-auto lg:size-9.25">
                            <Icon icon="trash" className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                        {err && (
                          <p role="alert" className="text-danger-ink mt-1 text-xs">
                            {err}
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <button type="button" disabled={d.rules.length >= MAX_RULES} onClick={() => set({ rules: [...d.rules, { tagId: '', value: '' }] })} className="btn text-primary-ink mt-1 min-h-11 px-0 disabled:opacity-50 lg:min-h-0">
                  <Icon icon="plus" className="size-4" aria-hidden="true" />
                  {t.rulesAdd}
                </button>
                {d.rules.length >= MAX_RULES && <p className="text-default-700 text-xs">{t.rulesFull}</p>}
              </div>
            ))}
        </div>

        <div className="border-default-300 flex items-center justify-end gap-2 border-t p-4">
          {dirty && <span className="text-warning-ink me-auto text-xs">{t.evsDirty}</span>}
          <button type="button" onClick={() => void close()} className="btn bg-light text-default-800 min-h-11 max-sm:flex-1 lg:min-h-0">
            {t.evModalCancel}
          </button>
          <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="btn bg-primary hover:bg-primary-hover min-h-11 text-white disabled:opacity-50 max-sm:flex-2 lg:min-h-0">
            <Icon icon="device-floppy" className="size-4" aria-hidden="true" />
            {t.evsSave}
          </button>
        </div>
      </div>
    </div>
  )
}
