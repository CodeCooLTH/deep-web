'use client'

/**
 * รายการเหตุการณ์ของชุดข้อมูลที่เลือก (อยู่ในการ์ดชุดข้อมูล) — เอาออก · "เพิ่มเหตุการณ์" เปิดโมดัลเลือกหลายตัว · "ตั้งค่า" เปิดโมดัลตั้งค่าต่อเหตุการณ์ (feature 00089)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/list-group/page.tsx (ul divide-y)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-notify/components/AutoNotifyRow.tsx (โครงแถว)
 * โมดัล: AddEventModal.tsx / EventSettingsModal.tsx (Base modals/page.tsx)
 *
 * ค่าตั้งของเหตุการณ์เป็นระดับเพจ · รายการเหตุการณ์ที่ส่งเป็นระดับ dataset (MetaCapiDataset.events)
 */
import { useRef, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { CAPI_EVENTS } from '@/lib/meta-capi/events'
import { CAPI_EVENT_GROUPS, RULE_EVENT_KEYS, eventHasSettings, purchaseTimingOf } from '@/lib/meta-capi/ui'
import { cn } from '@/utils/helpers'
import AddEventModal from './AddEventModal'
import EventSettingsModal, { type EventSettingsResult } from './EventSettingsModal'
import { datasetName, type DatasetView, type EventOpts } from './types'

const META = new Map(CAPI_EVENTS.map((e) => [e.key as string, e.metaName]))
const ALL = CAPI_EVENT_GROUPS.flatMap((g) => g.keys as readonly string[])

type Props = {
  ds: DatasetView
  eventOptions: EventOpts
  purchaseAt: string
  countPromotedDraft: boolean
  tags: { id: string; name: string }[]
  busyKeys: ReadonlySet<string>
  onAdd: (d: DatasetView, keys: string[]) => Promise<boolean>
  onRemove: (d: DatasetView, key: string) => void
  onSaveSettings: (key: string, r: EventSettingsResult) => Promise<boolean>
}

export default function EventsList({ ds, eventOptions, purchaseAt, countPromotedDraft, tags, busyKeys, onAdd, onRemove, onSaveSettings }: Props) {
  const t = useT().conversionsApi
  const [settingsKey, setSettingsKey] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)
  const when = purchaseTimingOf({ purchaseAt, datasets: [{ events: ['PURCHASE'] }] }) ?? 'CREATE'

  const addBtn = (cls: string) => (
    <button ref={addRef} type="button" aria-haspopup="dialog" onClick={() => setAdding(true)} className={cls}>
      <Icon icon="plus" className="size-4" aria-hidden="true" />
      {t.evAdd}
    </button>
  )

  return (
    <div className="border-default-200 mt-4 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-default-900 text-sm font-semibold">{t.evTitle}</h5>
        {ds.events.length > 0 && addBtn('btn btn-sm border-default-300 text-default-800 min-h-11 border lg:min-h-0')}
      </div>
      {ds.events.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <span className="bg-default-100 text-default-500 mb-3 flex size-14 items-center justify-center rounded-full">
            <Icon icon="bolt" className="size-7" aria-hidden="true" />
          </span>
          <p className="text-default-900 text-base font-semibold">{t.evEmptyTitle}</p>
          <p className="text-default-700 mt-1 max-w-sm text-sm">{t.evEmptyHint}</p>
          {addBtn('btn bg-primary hover:bg-primary-hover mt-4 min-h-11 text-white max-sm:w-full lg:min-h-0')}
        </div>
      ) : (
        <>
          <ul className="divide-default-200 divide-y">
            {ALL.filter((k) => ds.events.includes(k)).map((key) => {
              const label = t.events[key as keyof typeof t.events]
              const isRule = (RULE_EVENT_KEYS as readonly string[]).includes(key)
              const rules = eventOptions[key]?.rules?.length ?? 0
              return (
                <li key={key} className="py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-default-900 text-sm', key === 'PURCHASE' ? 'font-semibold' : 'font-medium')}>
                        {label.label} <span className="text-default-700 text-xs font-normal">({META.get(key)})</span>
                      </p>
                      <p className="text-default-700 mt-0.5 text-xs">{key === 'PURCHASE' ? fmt(label.desc, { when: t.purchaseAt[when] }) : label.desc}</p>
                      {key === 'VIEW_CONTENT' && <p className="text-default-800 mt-1 text-xs">{t.evViewContentNote}</p>}
                      {isRule && <p className="text-default-800 mt-1 text-xs">{fmt(t.evRulesNote, { n: rules })}</p>}
                      {isRule && rules === 0 && (
                        <p className="bg-warning/15 text-warning-ink mt-1.5 flex items-start gap-1.5 rounded px-2.5 py-1.5 text-xs">
                          <Icon icon="alert-triangle" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          {t.evRulesWarn}
                        </p>
                      )}
                    </div>
                    {eventHasSettings(key) && (
                      <button
                        id={`capi-set-${key}`}
                        type="button"
                        aria-haspopup="dialog"
                        aria-label={fmt(t.evSettingsAria, { name: label.label })}
                        onClick={() => setSettingsKey(key)}
                        className="btn btn-sm border-default-300 text-default-800 min-h-11 shrink-0 border lg:min-h-0"
                      >
                        <Icon icon="settings" className="size-3.5" aria-hidden="true" />
                        {t.evSettings}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={fmt(t.evRemoveAria, { name: `${label.label} (${META.get(key)})` })}
                      title={t.evRemoveTitle}
                      disabled={busyKeys.has(`${ds.id}:events`)}
                      onClick={() => onRemove(ds, key)}
                      className="text-default-600 hover:text-danger-ink -me-2 inline-flex size-11 shrink-0 items-center justify-center rounded disabled:opacity-40 lg:me-0 lg:size-8"
                    >
                      <Icon icon="x" className="size-4.5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="text-default-700 flex items-start gap-1.5 pt-3 text-xs">
            <Icon icon="info-circle" className="text-default-500 mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {t.evRemoveNote}
          </p>
        </>
      )}
      {settingsKey && (
        <EventSettingsModal
          eventKey={settingsKey}
          opt={eventOptions[settingsKey] ?? {}}
          purchaseAt={purchaseAt}
          countPromotedDraft={countPromotedDraft}
          tags={tags}
          onSave={(r) => onSaveSettings(settingsKey, r)}
          onClose={() => {
            const k = settingsKey
            setSettingsKey(null)
            // คืนโฟกัสปุ่ม "ตั้งค่า" ของแถวที่เปิด
            requestAnimationFrame(() => document.getElementById(`capi-set-${k}`)?.focus())
          }}
        />
      )}
      {adding && (
        <AddEventModal
          datasetName={datasetName(ds, t.dsPageDefaultName)}
          purchaseWhen={t.purchaseAt[when]}
          available={ALL.filter((k) => !ds.events.includes(k))}
          onClose={() => {
            setAdding(false)
            requestAnimationFrame(() => addRef.current?.focus())
          }}
          onConfirm={(keys) => onAdd(ds, keys)}
        />
      )}
    </div>
  )
}
