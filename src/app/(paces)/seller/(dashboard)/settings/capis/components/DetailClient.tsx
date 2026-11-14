'use client'

/**
 * หน้ารายละเอียดเพจ Conversions API — หัวเพจ + สวิตช์หลัก + banner + แถวสถิติ (StatsRow) + ประกอบการ์ดชุดข้อมูล (แท็บ + เหตุการณ์ + โมดัลตั้งค่า) (feature 00089 หน้า 2)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (.card + flex) + .../form/elements/components/ChecksRadioSwitches.tsx (form-switch)
 *   + theme: .../ui/alerts/page.tsx (banner `rounded p-3` พื้น /15) · การ์ดสถิติ: ดู StatsRow.tsx (Base Stat.tsx)
 *   + src/app/(paces)/seller/(dashboard)/settings/auto-notify/components/AutoNotifyClient.tsx (banner markup · optimistic + revert + pacesToast)
 *
 */
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { capiPageStatus } from '@/lib/meta-capi/ui'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import DatasetsCard from './DatasetsCard'
import type { EventSettingsResult } from './EventSettingsModal'
import StatsRow from './StatsRow'
import { PageAvatar, ReconnectLink, StatusBadge, capiApi } from './shared'
import { datasetName, type DatasetView, type DetailData, type EventOpts } from './types'

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

  /** บันทึกจากโมดัลตั้งค่าเหตุการณ์ — PUT ครั้งเดียว: eventOptions ทั้งก้อน (server แทนที่ทั้งก้อน จึงรวมค่าล่าสุดเสมอ) + จังหวะ/นับร่างระดับเพจ · optimistic + ย้อนกลับเมื่อพลาด */
  const saveEventSettings = async (key: string, r: EventSettingsResult) => {
    const prevOpts = opts
    const prevSetting = setting
    const page = { ...(r.purchaseAt !== undefined ? { purchaseAt: r.purchaseAt } : {}), ...(r.countPromotedDraft !== undefined ? { countPromotedDraft: r.countPromotedDraft } : {}) }
    const next: EventOpts = { ...opts, [key]: { ...opts[key], ...r.patch } }
    setOpts(next)
    setSetting({ ...setting, ...page })
    const res = await put(`opt:${key}`, { eventOptions: next, ...page })
    if (!res.ok) {
      setOpts(prevOpts)
      setSetting(prevSetting)
      pacesToast.error(t.saveFailed)
      return false
    }
    setOpts(res.data.setting.eventOptions ?? next)
    pacesToast.success(t.evsSaved)
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

  const logHref = `/settings/capis/${data.channelId}/log`

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
        {/* เปิดส่งอยู่ = เตือนเสมอ: กดสถานะคำสั่งซื้อ/ลีดเองใน Meta Business Suite ซ้ำกับที่ Deep ส่ง อาจทำให้ยอดในแอดเบิ้ล */}
        {setting.enabled && (
          <p className="bg-warning/15 text-warning-ink mx-5 mb-5 flex items-start gap-2 rounded px-3 py-2 text-xs max-sm:mx-4 max-sm:mb-4">
            <Icon icon="info-circle" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{t.metaManualWarn}</span>
          </p>
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

      <DatasetsCard
        channelId={data.channelId}
        datasets={datasets}
        onChange={setDatasets}
        eventOptions={opts}
        purchaseAt={setting.purchaseAt}
        countPromotedDraft={setting.countPromotedDraft}
        tags={data.tags}
        busyKeys={busy}
        onAddEvents={addEvents}
        onRemoveEvent={removeEvent}
        onSaveSettings={saveEventSettings}
      />
    </div>
  )
}
