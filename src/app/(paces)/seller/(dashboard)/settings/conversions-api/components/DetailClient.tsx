'use client'

/**
 * หน้ารายละเอียดเพจ Conversions API — หัวเพจ + สวิตช์หลัก + banner + แถวสถิติ (StatsRow) + จังหวะ Purchase + ประกอบการ์ดย่อย (feature 00089 หน้า 2)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card + flex) + .../form/elements/components/ChecksRadioSwitches.tsx (form-switch)
 *   + theme: .../ui/alerts/page.tsx (banner `rounded p-3` พื้น /15) · การ์ดสถิติ: ดู StatsRow.tsx (Base Stat.tsx)
 *   + theme: .../form/elements/components/InputTextfieldType.tsx (<select class="form-select"> จังหวะ Purchase)
 *   + src/app/(paces)/seller/(dashboard)/settings/tags/components/TagEditor.tsx (grid xl:grid-cols-3 + คอลัมน์ขวา sticky)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-notify/components/AutoNotifyClient.tsx (banner markup · optimistic + revert + pacesToast)
 *
 * ลำดับ DOM = ลำดับภาพบน xl (ซ้ายก่อนขวา → tab order ตรงกับสายตา) · มือถือ/แท็บเล็ตสลับลำดับด้วย order-*
 */
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { capiPageStatus } from '@/lib/meta-capi/ui'
import type { RuleSaved } from '@/lib/meta-capi/ui'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import DatasetsCard from './DatasetsCard'
import EventsCard from './EventsCard'
import RulesCard from './RulesCard'
import StatsRow from './StatsRow'
import { PageAvatar, ReconnectLink, StatusBadge, capiApi } from './shared'
import { datasetName, type DatasetView, type DetailData, type EventOpt, type EventOpts } from './types'

type PutBody = { enabled?: boolean; purchaseAt?: string; countPromotedDraft?: boolean; eventOptions?: EventOpts }

export default function DetailClient({ data }: { data: DetailData }) {
  const t = useT().conversionsApi
  const router = useRouter()
  const [setting, setSetting] = useState(data.setting)
  const [opts, setOpts] = useState<EventOpts>(data.eventOptions)
  const [datasets, setDatasets] = useState<DatasetView[]>(data.datasets)
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const mark = (k: string, on: boolean) =>
    setBusy((s) => {
      const n = new Set(s)
      if (on) n.add(k)
      else n.delete(k)
      return n
    })

  /** PUT ตั้งค่าเพจ — ผู้เรียกทำ optimistic เอง · คืน server eventOptions (ล้างแล้ว) เมื่อสำเร็จ */
  const put = async (key: string, body: PutBody) => {
    mark(key, true)
    const r = await capiApi<{ setting: { eventOptions?: EventOpts } }>(`/${data.channelId}`, 'PUT', body)
    mark(key, false)
    if (!r.ok && r.status === 404) router.refresh()
    return r
  }

  const status = capiPageStatus({ enabled: setting.enabled, datasets })
  const stopped = datasets.filter((d) => d.status === 'STOPPED')
  const pageStopped = stopped.filter((d) => d.source === 'PAGE')
  const manualStopped = stopped.filter((d) => d.source === 'MANUAL')

  const toggleMain = async (next: boolean) => {
    if (busy.has('main')) return
    if (next && !setting.everEnabled) {
      const ok = await pacesConfirm.question(fmt(t.swalFirstTitle, { name: data.name }), t.swalFirstText, { confirmButtonText: t.swalFirstOk, cancelButtonText: t.swalFirstCancel, confirmSemantic: 'primary' })
      if (!ok) return
    }
    const prev = setting
    setSetting({ ...setting, enabled: next })
    const r = await put('main', { enabled: next })
    if (!r.ok) {
      setSetting(prev)
      return pacesToast.error(t.toastSwitchFailed)
    }
    setSetting((s) => ({ ...s, enabled: next, everEnabled: s.everEnabled || next }))
    pacesToast.success(fmt(next ? t.toastOn : t.toastOff, { name: data.name }))
  }

  const changeTiming = async (purchaseAt: string) => {
    const prev = setting
    setSetting({ ...setting, purchaseAt })
    const r = await put('timing', { purchaseAt })
    if (!r.ok) {
      setSetting(prev)
      return pacesToast.error(t.saveFailed)
    }
    pacesToast.success(t.timingSaved)
  }
  const changeDraft = async (countPromotedDraft: boolean) => {
    const prev = setting
    setSetting({ ...setting, countPromotedDraft })
    const r = await put('draft', { countPromotedDraft })
    if (!r.ok) {
      setSetting(prev)
      return pacesToast.error(t.saveFailed)
    }
    pacesToast.success(t.timingSaved)
  }

  // ตัวเลือกยอด/แนบสินค้า = ระดับเพจ · PUT ส่ง eventOptions ทั้งก้อน (server แทนที่ทั้งก้อน) จึงต้องรวมค่าล่าสุดเสมอ
  const changeOption = async (key: string, patch: Partial<EventOpt>) => {
    const prev = opts
    const next: EventOpts = { ...opts, [key]: { ...opts[key], ...patch } }
    setOpts(next)
    const r = await put(`opt:${key}`, { eventOptions: next })
    if (!r.ok) {
      setOpts(prev)
      return pacesToast.error(t.saveFailed)
    }
    pacesToast.success(t.evAmountSaved)
  }

  const saveRules = async (rules: Record<'LEAD_SUBMITTED' | 'QUALIFIED_LEAD', RuleSaved[]>) => {
    const next: EventOpts = {
      ...opts,
      LEAD_SUBMITTED: { ...opts.LEAD_SUBMITTED, rules: rules.LEAD_SUBMITTED },
      QUALIFIED_LEAD: { ...opts.QUALIFIED_LEAD, rules: rules.QUALIFIED_LEAD },
    }
    const r = await put('rules', { eventOptions: next })
    if (!r.ok) {
      pacesToast.error(t.saveFailed)
      return false
    }
    setOpts(r.data.setting.eventOptions ?? next)
    pacesToast.success(t.rulesSaved)
    return true
  }

  /** PATCH รายการเหตุการณ์ทั้งก้อนของชุดข้อมูล (server แทนที่ทั้งอาร์เรย์) · optimistic + ย้อนกลับเมื่อพลาด */
  const saveEvents = async (d: DatasetView, events: string[]) => {
    const bk = `${d.id}:events`
    if (busy.has(bk)) return false
    const patch = (evs: string[]) => setDatasets((ds) => ds.map((x) => (x.id === d.id ? { ...x, events: evs } : x)))
    const before = d.events
    patch(events)
    mark(bk, true)
    const r = await capiApi<{ dataset: DatasetView }>(`/${data.channelId}/datasets/${d.id}`, 'PATCH', { events })
    mark(bk, false)
    if (!r.ok) {
      patch(before)
      pacesToast.error(t.saveFailed)
    }
    return r.ok
  }
  const addEvents = async (d: DatasetView, keys: string[]) => {
    const ok = await saveEvents(d, [...d.events, ...keys.filter((k) => !d.events.includes(k))])
    if (ok) pacesToast.success(fmt(t.evAdded, { n: keys.length }))
    return ok
  }
  // เอาออกไม่ถาม Swal — ทำทันทีแล้วให้ "เลิกทำ" บน toast (ค่าตั้งยอด/กฎเก็บแยกอยู่แล้ว จึงไม่หาย)
  const removeEvent = async (d: DatasetView, key: string) => {
    const before = d.events
    const ok = await saveEvents(d, before.filter((e) => e !== key))
    if (ok) pacesToast.success(fmt(t.evRemoved, { name: t.events[key as keyof typeof t.events].label }), { action: { label: t.evUndo, onClick: () => void saveEvents({ ...d, events: before.filter((e) => e !== key) }, before) } })
  }

  const logHref = `/settings/conversions-api/${data.channelId}/log`

  return (
    <div className="flex flex-col gap-base">
      <div className="card">
        <div className="card-body flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <PageAvatar src={data.avatarUrl} name={data.name} className="size-12" />
            <div className="min-w-0">
              <p className="text-default-900 truncate text-base font-semibold" title={data.name}>
                {data.name}
              </p>
              <p className="text-default-700 mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                {t.messenger} · <StatusBadge status={status} />
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-4 max-sm:border-default-200 max-sm:border-t max-sm:pt-3">
            <label htmlFor="capi-main" className="text-default-900 text-sm font-medium">
              {t.mainSwitchLabel}
            </label>
            <input id="capi-main" type="checkbox" className="form-switch" checked={setting.enabled} disabled={datasets.length === 0 || busy.has('main')} title={datasets.length === 0 ? t.switchNeedsDataset : undefined} aria-busy={busy.has('main') || undefined} onChange={(e) => void toggleMain(e.target.checked)} />
          </div>
        </div>
        {!setting.enabled && (
          <p className="bg-default-100 text-default-800 mx-5 mb-5 rounded px-3 py-2 text-xs max-sm:mx-4 max-sm:mb-4">{t.offNote}</p>
        )}
      </div>

      {pageStopped.length > 0 && (
        <div role="alert" className="bg-danger/15 text-danger-ink flex flex-wrap items-start gap-2.5 rounded-lg p-3 text-sm">
          <Icon icon="alert-triangle" className="mt-0.5 size-4.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t.bannerAutoTitle}</p>
            <p className="mt-0.5">{t.bannerAutoBody}</p>
          </div>
          <ReconnectLink className="max-sm:w-full sm:self-center" />
        </div>
      )}
      {manualStopped.map((d) => (
        <div key={d.id} role="alert" className="bg-danger/15 text-danger-ink flex items-start gap-2.5 rounded-lg p-3 text-sm">
          <Icon icon="alert-triangle" className="mt-0.5 size-4.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{fmt(t.bannerManualTitle, { name: datasetName(d, t.dsPageDefaultName) })}</p>
            <p className="mt-0.5">{t.bannerManualBody}</p>
          </div>
        </div>
      ))}

      <StatsRow stats={data.stats} logHref={logHref} />

      <div className="flex flex-col gap-base xl:grid xl:grid-cols-3 xl:items-start">
        <DatasetsCard channelId={data.channelId} datasets={datasets} onChange={setDatasets} />
        <EventsCard datasets={datasets} eventOptions={opts} purchaseAt={setting.purchaseAt} busyKeys={busy} onAdd={addEvents} onRemove={removeEvent} onOption={changeOption} />
        <RulesCard eventOptions={opts} tags={data.tags} saving={busy.has('rules')} onSave={saveRules} />

        {/* คอลัมน์ขวา: มือถือ/แท็บเล็ต `contents` ให้ลูกสลับลำดับแทรกกับการ์ดซ้ายด้วย order-* · xl = กล่อง sticky ตามจอ */}
        <div className="contents xl:sticky xl:top-20 xl:col-start-3 xl:row-span-3 xl:row-start-1 xl:block xl:space-y-base xl:self-start">
          <div id="capi-timing" className="card order-3 xl:order-none">
            <div className="card-header">
              <h4 className="card-title">{t.timingTitle}</h4>
            </div>
            <div className="card-body space-y-3">
              <div>
                <label htmlFor="capi-timing-select" className="form-label">
                  {t.timingLabel}
                </label>
                <select id="capi-timing-select" value={setting.purchaseAt} disabled={busy.has('timing')} onChange={(e) => void changeTiming(e.target.value)} className="form-select min-h-11 lg:min-h-0">
                  <option value="CREATE">{t.purchaseAt.CREATE}</option>
                  <option value="CONFIRM">{t.purchaseAt.CONFIRM}</option>
                  <option value="PAYMENT">{t.purchaseAt.PAYMENT}</option>
                </select>
                <p className="text-default-800 mt-1 text-xs">{{ CREATE: t.timingHintCREATE, CONFIRM: t.timingHintCONFIRM, PAYMENT: t.timingHintPAYMENT }[setting.purchaseAt as 'CREATE' | 'CONFIRM' | 'PAYMENT'] ?? ''}</p>
                <p className="text-default-700 mt-1 text-xs">{t.timingScope}</p>
              </div>
              <div className="border-default-200 flex items-start justify-between gap-3 border-t pt-3">
                <label htmlFor="capi-draft">
                  <span className="text-default-900 block text-sm font-medium">{t.draftLabel}</span>
                  <span className="text-default-700 mt-0.5 block text-xs">{t.draftHint}</span>
                </label>
                <input id="capi-draft" type="checkbox" className="form-switch mt-1 shrink-0" checked={setting.countPromotedDraft} disabled={busy.has('draft')} onChange={(e) => void changeDraft(e.target.checked)} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
