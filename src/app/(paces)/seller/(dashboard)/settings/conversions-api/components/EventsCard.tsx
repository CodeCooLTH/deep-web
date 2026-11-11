'use client'

/**
 * การ์ด "เหตุการณ์ที่ส่ง" — 12 เหตุการณ์ 3 กลุ่ม + สวิตช์ต่อ dataset + ตัวตั้งยอดขยายใต้แถว (feature 00089 หน้า 2 · ส่วน D)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/list-group/page.tsx (ul divide-y) + .../form/elements/components/ChecksRadioSwitches.tsx (form-switch/form-radio)
 *   + theme: .../ui/tabs/page.tsx (nav-tabs แท็บเลือก dataset — ขับด้วย React state ไม่ใช้ Preline hs-tab)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-notify/components/AutoNotifyRow.tsx (โครงแถว + fieldset radio)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-notify/components/AutoNotifyClient.tsx (closeEditor คืนโฟกัสปุ่ม)
 *
 * ค่ายอด/แนบสินค้าเป็นระดับเพจ (ใช้กับทุก dataset) · สวิตช์เปิด/ปิดเหตุการณ์เป็นระดับ dataset
 */
import { useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { CAPI_EVENTS } from '@/lib/meta-capi/events'
import { AMOUNT_EVENT_KEYS, CAPI_EVENT_GROUPS, RULE_EVENT_KEYS, purchaseTimingOf } from '@/lib/meta-capi/ui'
import { cn } from '@/utils/helpers'
import { datasetName, type DatasetView, type EventOpt, type EventOpts } from './types'

const META = new Map(CAPI_EVENTS.map((e) => [e.key as string, e.metaName]))

type Props = {
  datasets: DatasetView[]
  eventOptions: EventOpts
  purchaseAt: string
  busyKeys: ReadonlySet<string>
  onToggle: (d: DatasetView, key: string, on: boolean) => void
  onOption: (key: string, patch: Partial<EventOpt>) => void
}

export default function EventsCard({ datasets, eventOptions, purchaseAt, busyKeys, onToggle, onOption }: Props) {
  const t = useT().conversionsApi
  const [selected, setSelected] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const ds = datasets.find((d) => d.id === selected) ?? datasets[0]
  const when = purchaseTimingOf({ purchaseAt, datasets: [{ events: ['PURCHASE'] }] }) ?? 'CREATE'
  const closeEditor = (key: string) => {
    setOpenKey(null)
    // ปิดแผง = ปุ่ม "ตั้งยอด" ของแถวกลับมา — คืนโฟกัสให้ปุ่มนั้น ไม่งั้นโฟกัสหลุดไป body
    requestAnimationFrame(() => document.getElementById(`capi-amt-${key}`)?.focus())
  }

  return (
    <div className="card xl:col-span-2 xl:col-start-1 order-4 xl:order-none">
      <div className={cn('card-header', datasets.length > 1 && 'pb-0 sm:pb-3.75')}>
        <h4 className="card-title">{t.evTitle}</h4>
        {datasets.length > 1 && (
          <div role="tablist" aria-label={t.evTabsAria} className="flex w-full gap-4 overflow-x-auto border-b border-default-200 sm:w-auto sm:border-b-0">
            {datasets.map((d) => {
              const active = d.id === ds?.id
              const nm = datasetName(d, t.dsPageDefaultName)
              return (
                <button
                  key={d.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelected(d.id)}
                  className={cn('-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-1 text-sm whitespace-nowrap lg:min-h-9', active ? 'border-primary text-primary-ink font-medium' : 'text-default-700 border-transparent')}
                >
                  {nm}
                  {d.status === 'STOPPED' && <span className="badge bg-danger/15 text-danger-ink">{t.dsStopped}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="card-body pt-1">
        {!ds ? (
          <div className="flex flex-col items-center py-8 text-center">
            <span className="bg-default-100 text-default-500 mb-2 flex size-12 items-center justify-center rounded-full">
              <Icon icon="database" className="size-6" aria-hidden="true" />
            </span>
            <p className="text-default-800 text-sm">{t.evEmpty}</p>
          </div>
        ) : (
          <>
            {ds.events.length === 0 && <p className="bg-default-100 text-default-800 mt-3 rounded px-3 py-2 text-xs">{t.evAllOff}</p>}
            {CAPI_EVENT_GROUPS.map((g) => (
              <section key={g.id}>
                <h5 className="text-default-700 pt-4 text-xs font-semibold">{{ before: t.evGroupBefore, buy: t.evGroupBuy, after: t.evGroupAfter }[g.id]}</h5>
                <ul className="divide-default-200 divide-y">
                  {g.keys.map((key) => {
                    const on = ds.events.includes(key)
                    const o = eventOptions[key] ?? {}
                    const hero = key === 'PURCHASE'
                    const label = t.events[key as keyof typeof t.events]
                    const isRule = (RULE_EVENT_KEYS as readonly string[]).includes(key)
                    const rules = o.rules?.length ?? 0
                    const hasAmount = AMOUNT_EVENT_KEYS.has(key)
                    const open = openKey === key
                    const sid = `capi-ev-${ds.id}-${key}`
                    const sum = `${o.valueMode === 'NO_VAT' ? t.evAmountNoVat : t.evAmountNet}${o.sendContents ? t.evWithItems : ''}`
                    return (
                      <li key={key} className="py-3">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <label htmlFor={sid} className={cn('text-default-900 text-sm', hero ? 'font-semibold' : 'font-medium')}>
                              {label.label} <span className="text-default-700 text-xs font-normal">({META.get(key)})</span>
                            </label>
                            <p className="text-default-700 mt-0.5 text-xs">
                              {hero ? (
                                <>
                                  {fmt(label.desc, { when: t.purchaseAt[when] })} ·{' '}
                                  <button type="button" onClick={() => document.getElementById('capi-timing-select')?.focus()} className="text-primary-ink min-h-11 font-medium underline underline-offset-2 lg:min-h-0">
                                    {t.evChange}
                                  </button>
                                </>
                              ) : (
                                label.desc
                              )}
                            </p>
                            {hasAmount && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                <span className="text-default-800 text-xs">{sum}</span>
                                <button
                                  id={`capi-amt-${key}`}
                                  type="button"
                                  aria-expanded={open}
                                  aria-label={fmt(t.evSetAmountAria, { name: label.label })}
                                  onClick={() => (open ? closeEditor(key) : setOpenKey(key))}
                                  className={cn('btn btn-sm min-h-11 border lg:min-h-0', open ? 'border-primary text-primary-ink' : 'border-default-300 text-default-800')}
                                >
                                  <Icon icon="adjustments-horizontal" className="size-3.5" aria-hidden="true" />
                                  {t.evSetAmount}
                                </button>
                              </div>
                            )}
                            {key === 'VIEW_CONTENT' && <p className="text-default-800 mt-1 text-xs">{t.evViewContentNote}</p>}
                            {isRule && <p className="text-default-800 mt-1 text-xs">{fmt(t.evRulesNote, { n: rules })}</p>}
                            {isRule && on && rules === 0 && (
                              <p className="bg-warning/15 text-warning-ink mt-1.5 flex items-start gap-1.5 rounded px-2.5 py-1.5 text-xs">
                                <Icon icon="alert-triangle" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                                {t.evRulesWarn}
                              </p>
                            )}
                          </div>
                          <input id={sid} type="checkbox" className="form-switch mt-0.5 shrink-0" checked={on} disabled={busyKeys.has(`${ds.id}:${key}`)} onChange={(e) => onToggle(ds, key, e.target.checked)} />
                        </div>
                        {open && (
                          <div className="bg-default-100 mt-2 rounded-lg p-3">
                            <fieldset>
                              <legend className="text-default-800 mb-1.5 text-xs font-semibold">{t.evAmountLegend}</legend>
                              <div className="space-y-2">
                                {(
                                  [
                                    ['NET', t.evAmountNet, t.evAmountNetHint],
                                    ['NO_VAT', t.evAmountNoVat, t.evAmountNoVatHint],
                                  ] as const
                                ).map(([v, title, hint]) => (
                                  <label key={v} className="flex min-h-11 items-start gap-2.5">
                                    <input type="radio" name={`capi-vm-${key}`} className="form-radio mt-0.5 rounded-full!" checked={(o.valueMode ?? 'NET') === v} onChange={() => onOption(key, { valueMode: v })} />
                                    <span>
                                      <span className="text-default-900 block text-sm">{title}</span>
                                      <span className="text-default-700 block text-xs">{hint}</span>
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                            <div className="border-default-300 mt-3 flex items-start justify-between gap-3 border-t pt-3">
                              <label htmlFor={`capi-items-${key}`}>
                                <span className="text-default-900 block text-sm">{t.evItems}</span>
                                <span className="text-default-700 block text-xs">{t.evItemsHint}</span>
                              </label>
                              <input id={`capi-items-${key}`} type="checkbox" className="form-switch mt-1 shrink-0" checked={!!o.sendContents} onChange={(e) => onOption(key, { sendContents: e.target.checked })} />
                            </div>
                            {datasets.length > 1 && (
                              <p className="text-default-700 mt-2 flex items-center gap-1.5 text-xs">
                                <Icon icon="info-circle" className="text-default-500 size-3.5" aria-hidden="true" />
                                {t.evAllDatasets}
                              </p>
                            )}
                            <button type="button" onClick={() => closeEditor(key)} className="btn btn-sm border-default-300 bg-card text-default-800 mt-3 min-h-11 w-full border sm:w-auto lg:min-h-0">
                              {t.evDone}
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
