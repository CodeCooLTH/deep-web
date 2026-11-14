'use client'

/**
 * กฎแท็ก → Lead (LeadSubmitted / QualifiedLead) — ≤20 กฎต่อเหตุการณ์ · กดบันทึกชัด ๆ แบบ dirty (feature 00089 หน้า 2 · ส่วน G)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputGroup.tsx (input-group ฿ + ช่องมูลค่า)
 *   + theme: .../form/elements/components/InputTextfieldType.tsx (<select class="form-select"> ผูกค่า — ไม่ใช้ hs-dropdown)
 *   + theme: .../ui/tabs/page.tsx (nav-tabs) · .../ui/list-group/page.tsx
 *   + src/app/(paces)/seller/(dashboard)/settings/tags/components/TagEditor.tsx (draft + beforeunload + Swal ทิ้งการแก้)
 *
 * ร่างของ 2 แท็บเก็บคู่กัน สลับแท็บไม่ทำให้ร่างหาย · แท็กหนึ่งตัวมีได้หนึ่งกฎต่อเหตุการณ์ (มติ Controller)
 */
import Link from 'next/link'
import { useEffect, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { MAX_RULES, draftsOf, rulesDirty, rulesValid, toSavedRules, validateRules, type RuleDraft, type RuleSaved } from '@/lib/meta-capi/ui'
import { pacesConfirm } from '@/lib/paces-swal'
import { cn } from '@/utils/helpers'
import type { EventOpts } from './types'

type Key = 'LEAD_SUBMITTED' | 'QUALIFIED_LEAD'
const KEYS: Key[] = ['LEAD_SUBMITTED', 'QUALIFIED_LEAD']

type Props = {
  eventOptions: EventOpts
  tags: { id: string; name: string }[]
  saving: boolean
  /** บันทึกทั้ง 2 เหตุการณ์ในครั้งเดียว — คืน true เมื่อสำเร็จ */
  onSave: (rules: Record<Key, RuleSaved[]>) => Promise<boolean>
}

export default function RulesCard({ eventOptions, tags, saving, onSave }: Props) {
  const t = useT().conversionsApi
  const saved = (k: Key) => eventOptions[k]?.rules
  const [drafts, setDrafts] = useState<Record<Key, RuleDraft[]>>({ LEAD_SUBMITTED: draftsOf(saved('LEAD_SUBMITTED')), QUALIFIED_LEAD: draftsOf(saved('QUALIFIED_LEAD')) })
  const [tab, setTab] = useState<Key>('LEAD_SUBMITTED')
  const [showErr, setShowErr] = useState(false)

  const dirty = KEYS.some((k) => rulesDirty(saved(k), drafts[k]))
  // ปิดแท็บ/รีเฟรชตอนกฎค้าง = เบราว์เซอร์ถามเอง (ท่า TagEditor/AutoNotifyClient)
  // shortcut: ไม่ครอบการกดลิงก์ในแอป (Next Link) — ทำเมื่อมีตัวดัก route change กลางของ (dashboard)
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const rows = drafts[tab]
  const val = validateRules(rows)
  const patchRow = (i: number, p: Partial<RuleDraft>) => setDrafts((d) => ({ ...d, [tab]: d[tab].map((r, j) => (j === i ? { ...r, ...p } : r)) }))
  const used = new Set(rows.map((r) => r.tagId))

  const revert = async () => {
    const ok = await pacesConfirm.warning(t.rulesDiscardTitle, undefined, { confirmButtonText: t.rulesDiscardOk, cancelButtonText: t.rulesKeep })
    if (!ok) return
    setDrafts({ LEAD_SUBMITTED: draftsOf(saved('LEAD_SUBMITTED')), QUALIFIED_LEAD: draftsOf(saved('QUALIFIED_LEAD')) })
    setShowErr(false)
  }
  const save = async () => {
    if (KEYS.some((k) => !rulesValid(validateRules(drafts[k])))) {
      setShowErr(true)
      return
    }
    const ok = await onSave({ LEAD_SUBMITTED: toSavedRules(drafts.LEAD_SUBMITTED), QUALIFIED_LEAD: toSavedRules(drafts.QUALIFIED_LEAD) })
    if (ok) setShowErr(false)
  }

  if (tags.length === 0) {
    return (
      <div className="card xl:col-span-2 xl:col-start-1 order-5 xl:order-none">
        <div className="card-header">
          <h4 className="card-title">{t.rulesTitle}</h4>
        </div>
        <div className="card-body flex flex-col items-center py-8 text-center">
          <span className="bg-default-100 text-default-500 mb-2 flex size-12 items-center justify-center rounded-full">
            <Icon icon="tags" className="size-6" aria-hidden="true" />
          </span>
          <p className="text-default-900 text-sm font-medium">{t.rulesNoTagsTitle}</p>
          <p className="text-default-700 mt-0.5 text-xs">{t.rulesNoTagsBody}</p>
          <Link href="/settings/tags" className="btn border-default-300 text-default-800 mt-3 min-h-11 border lg:min-h-0">
            {t.rulesNoTagsCta}
            <Icon icon="chevron-right" className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    )
  }

  const tabLabel = { LEAD_SUBMITTED: t.rulesTabLead, QUALIFIED_LEAD: t.rulesTabQualified }
  return (
    <div className="card xl:col-span-2 xl:col-start-1 order-5 xl:order-none">
      <div className="card-header pb-0 sm:pb-3.75">
        <h4 className="card-title">{t.rulesTitle}</h4>
        <div role="tablist" className="flex w-full gap-4 border-b border-default-200 sm:w-auto sm:border-b-0">
          {KEYS.map((k) => {
            const active = k === tab
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(k)}
                className={cn('-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-1 text-sm whitespace-nowrap lg:min-h-9', active ? 'border-primary text-primary-ink font-medium' : 'text-default-700 border-transparent')}
              >
                {tabLabel[k]} <span className="text-default-700 text-xs">({k === 'LEAD_SUBMITTED' ? 'LeadSubmitted' : 'QualifiedLead'})</span>
                <span className="badge bg-default-100 text-default-800">{drafts[k].length}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="card-body pb-2">
        <p className="text-default-700 flex items-start gap-1.5 text-xs">
          <Icon icon="info-circle" className="text-default-500 mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t.rulesHelp}
        </p>
        <ul className="divide-default-200 mt-2 divide-y">
          {rows.map((r, i) => {
            const sv = (saved(tab) ?? [])[i]
            const pv = toSavedRules([r])[0]
            const changed = !sv || sv.tagId !== r.tagId || sv.valueBaht !== pv.valueBaht
            const err = showErr ? (val.noTag.includes(i) ? t.rulesErrNoTag : val.duplicate.includes(i) ? t.rulesErrDuplicate : val.badValue.includes(i) ? t.rulesErrValue : '') : ''
            return (
              <li key={i} className={cn('py-3', changed && '-mx-5 bg-primary/10 px-5')}>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <label htmlFor={`capi-rt-${tab}-${i}`} className="form-label sm:mb-0">
                    {t.rulesWhenTag}
                  </label>
                  <select id={`capi-rt-${tab}-${i}`} value={r.tagId} onChange={(e) => patchRow(i, { tagId: e.target.value })} className="form-select min-h-11 sm:w-44 lg:min-h-0" aria-invalid={!!err}>
                    <option value="">{t.rulesPickTag}</option>
                    {tags.map((tg) => (
                      <option key={tg.id} value={tg.id} disabled={used.has(tg.id) && tg.id !== r.tagId}>
                        {tg.name}
                      </option>
                    ))}
                  </select>
                  <label htmlFor={`capi-rv-${tab}-${i}`} className="form-label sm:mb-0">
                    <span className="sm:hidden">{t.rulesValueMobile}</span>
                    <span className="hidden sm:inline">{t.rulesValue}</span>
                  </label>
                  <div className="input-group sm:w-36">
                    <span className="input-group-text">฿</span>
                    <input id={`capi-rv-${tab}-${i}`} inputMode="decimal" value={r.value} onChange={(e) => patchRow(i, { value: e.target.value })} placeholder={t.rulesValuePh} className="form-input min-h-11 tabular-nums lg:min-h-0" aria-invalid={!!err} />
                  </div>
                  <span className="text-default-800 hidden text-sm sm:inline">{t.rulesBaht}</span>
                  <button type="button" aria-label={t.rulesRemove} onClick={() => setDrafts((d) => ({ ...d, [tab]: d[tab].filter((_, j) => j !== i) }))} className="btn btn-icon border-default-300 text-default-700 hidden size-11 border sm:ms-auto sm:inline-flex lg:size-9.25">
                    <Icon icon="trash" className="size-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => setDrafts((d) => ({ ...d, [tab]: d[tab].filter((_, j) => j !== i) }))} className="btn text-danger-ink min-h-11 justify-start px-0 sm:hidden">
                    <Icon icon="trash" className="size-4" aria-hidden="true" />
                    {t.rulesRemoveMobile}
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
        <button
          type="button"
          disabled={rows.length >= MAX_RULES}
          onClick={() => setDrafts((d) => ({ ...d, [tab]: [...d[tab], { tagId: '', value: '' }] }))}
          className="btn text-primary-ink mt-1 min-h-11 px-0 disabled:opacity-50 lg:min-h-0"
        >
          <Icon icon="plus" className="size-4" aria-hidden="true" />
          {t.rulesAdd}
        </button>
        {rows.length >= MAX_RULES && <p className="text-default-700 text-xs">{t.rulesFull}</p>}
      </div>
      <div className="card-footer flex flex-wrap items-center gap-2">
        {dirty && <span className="text-warning-ink me-auto basis-full text-xs sm:basis-auto">{t.rulesDirtyN}</span>}
        <button type="button" disabled={!dirty || saving} onClick={revert} className={cn('btn text-default-700 min-h-11 lg:min-h-0', !dirty && 'ms-auto')}>
          {t.rulesRevert}
        </button>
        <button type="button" disabled={!dirty || saving} onClick={save} className="btn bg-primary hover:bg-primary-hover min-h-11 flex-1 text-white disabled:opacity-50 sm:flex-none lg:min-h-0">
          <Icon icon="device-floppy" className="size-4" aria-hidden="true" />
          {t.rulesSave}
        </button>
      </div>
    </div>
  )
}
