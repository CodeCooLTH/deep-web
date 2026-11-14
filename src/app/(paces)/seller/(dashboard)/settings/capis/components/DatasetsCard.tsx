'use client'

/**
 * การ์ดชุดข้อมูล (Dataset) ≤3 ต่อเพจ — แท็บต่อชุดข้อมูล (+ แท็บเพิ่ม) · แท็บที่เลือก = รายละเอียด + ทดสอบ + เปลี่ยน token + ลบ + รายการเหตุการณ์ (EventsList) (feature 00089 หน้า 2 · ส่วน C+D)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/tabs/page.tsx (nav-tabs ขับด้วย React state ไม่ใช้ Preline hs-tab)
 *   + ของเดิมด้านล่าง
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/list-group/page.tsx (ul divide-y — ไม่ซ้อนการ์ด)
 *   + theme: .../form/elements/components/InputGroup.tsx (input-group + ปุ่ม) · ChecksRadioSwitches.tsx (form-radio fieldset)
 *   + theme: .../apps/users/account-settings/page.tsx (form-label/form-input)
 *   + src/app/(paces)/seller/(dashboard)/settings/tags/components/TagEditor.tsx (RHF + Yup + draft)
 *
 * Test Event Code อยู่ใน state ของแถวเท่านั้น ไม่บันทึก (Design-Spec D6)
 */
import { yupResolver } from '@hookform/resolvers/yup'
import { useId, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import * as yup from 'yup'

import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { cn } from '@/utils/helpers'
import EventsList from './EventsList'
import type { EventSettingsResult } from './EventSettingsModal'
import { ReconnectLink, capiApi } from './shared'
import { MAX_DATASETS, datasetName, type DatasetView, type EventOpts } from './types'

type TestState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; text: string } | { kind: 'fail'; text: string }

function TestResult({ s, loadingText }: { s: TestState; loadingText: string }) {
  if (s.kind === 'idle') return null
  const tone = s.kind === 'ok' ? 'bg-success/15 text-success-ink' : s.kind === 'fail' ? 'bg-danger/15 text-danger-ink' : 'bg-default-100 text-default-800'
  const icon = s.kind === 'ok' ? 'circle-check' : s.kind === 'fail' ? 'circle-x' : 'loader-2'
  return (
    <div role="status" aria-live="polite" className={cn('mt-2 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm', tone)}>
      <Icon icon={icon} className={cn('mt-0.5 size-4.5 shrink-0', s.kind === 'loading' && 'animate-spin')} aria-hidden="true" />
      <span>{s.kind === 'loading' ? loadingText : s.text}</span>
    </div>
  )
}

type RowProps = {
  channelId: string
  d: DatasetView
  pageDefault: string
  onDelete: (d: DatasetView) => void
  onChanged: (d: DatasetView) => void
}

function DatasetRow({ channelId, d, pageDefault, onDelete, onChanged }: RowProps) {
  const t = useT().conversionsApi
  const uid = useId()
  const name = datasetName(d, pageDefault)
  const [code, setCode] = useState('')
  const [test, setTest] = useState<TestState>({ kind: 'idle' })
  const [tokenOpen, setTokenOpen] = useState(false)
  const [token, setToken] = useState('')
  const [tokenBusy, setTokenBusy] = useState(false)
  const [tokenErr, setTokenErr] = useState('')

  const runTest = async () => {
    if (test.kind === 'loading') return
    const c = code.trim()
    setTest({ kind: 'loading' })
    const r = await capiApi<{ ok: boolean; unverified?: boolean; message: string }>(`/${channelId}/datasets/${d.id}/test`, 'POST', c ? { testEventCode: c } : {})
    if (!r.ok) return setTest({ kind: 'fail', text: r.code === 'NO_CONVERSATION' ? t.testNoChat : t.testFail })
    const j = r.data
    if (j.ok) return setTest({ kind: 'ok', text: j.unverified ? t.testUnverified : c ? t.testOkSent : t.testOkToken })
    setTest({ kind: 'fail', text: c ? t.testFail : t.testFailToken })
  }

  const saveToken = async () => {
    if (!token.trim()) return setTokenErr(t.dsErrToken)
    setTokenBusy(true)
    setTokenErr('')
    const r = await capiApi<{ dataset: DatasetView }>(`/${channelId}/datasets/${d.id}`, 'PATCH', { token: token.trim() })
    setTokenBusy(false)
    if (!r.ok) return setTokenErr(r.code === 'TOKEN_REQUIRED' ? t.dsErrToken : t.saveFailed)
    setToken('')
    setTokenOpen(false)
    onChanged(r.data.dataset)
    pacesToast.success(t.tokenSaved)
  }

  const stopped = d.status === 'STOPPED'
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {stopped && (
          <span className="badge bg-danger/15 text-danger-ink gap-1">
            <Icon icon="alert-triangle" className="size-3" aria-hidden="true" />
            {t.dsStopped}
          </span>
        )}
        <button type="button" aria-label={fmt(t.dsDeleteAria, { name })} onClick={() => onDelete(d)} className="btn btn-icon border-default-300 text-default-700 ms-auto size-11 border lg:size-9.25">
          <Icon icon="trash" className="size-4" aria-hidden="true" />
        </button>
      </div>
      <p className="text-default-700 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span className="tabular-nums whitespace-nowrap">{fmt(t.dsId, { id: d.datasetId })}</span>
        <span className="hidden sm:inline" aria-hidden="true">
          ·
        </span>
        <span className="inline-flex basis-full items-center gap-1 sm:basis-auto">
          <Icon icon="lock" className="text-default-500 size-3.5" aria-hidden="true" />
          {d.source === 'PAGE' ? t.dsTokenPage : t.dsTokenSet}
          {d.source === 'MANUAL' && (
            <button type="button" aria-expanded={tokenOpen} onClick={() => setTokenOpen((v) => !v)} className="text-primary-ink ms-1 min-h-11 font-medium underline underline-offset-2 lg:min-h-0">
              {t.dsChangeToken}
            </button>
          )}
        </span>
      </p>

      {tokenOpen && (
        <div className="bg-default-100 mt-3 rounded-lg p-3">
          <label htmlFor={`${uid}-tok`} className="form-label">
            {fmt(t.tokenTitle, { name })}
          </label>
          <input id={`${uid}-tok`} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className="form-input min-h-11 lg:min-h-0" aria-invalid={!!tokenErr} />
          <p className={cn('mt-1 text-xs', tokenErr ? 'text-danger-ink' : 'text-default-700')}>{tokenErr || t.dsTokenHelp}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={tokenBusy} onClick={saveToken} className="btn bg-primary hover:bg-primary-hover min-h-11 flex-1 text-white disabled:opacity-50 sm:flex-none lg:min-h-0">
              {t.tokenSave}
            </button>
            <button type="button" onClick={() => setTokenOpen(false)} className="btn text-default-700 min-h-11 lg:min-h-0">
              {t.dsCancel}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3">
        <label htmlFor={`${uid}-code`} className="form-label">
          {t.testCode}
        </label>
        <div className="flex flex-col gap-2 sm:max-w-md sm:flex-row sm:gap-0">
          <div className="input-group">
            <input id={`${uid}-code`} value={code} onChange={(e) => setCode(e.target.value)} placeholder={t.testCodePh} autoComplete="off" className="form-input min-h-11 lg:min-h-0" />
            <button type="button" onClick={runTest} disabled={test.kind === 'loading'} className="btn border-default-300 text-default-800 hidden border sm:inline-flex">
              <Icon icon="send" className="size-4" aria-hidden="true" />
              {t.testBtn}
            </button>
          </div>
          <button type="button" onClick={runTest} disabled={test.kind === 'loading'} className="btn border-default-300 text-default-800 min-h-11 w-full border sm:hidden">
            <Icon icon="send" className="size-4" aria-hidden="true" />
            {t.testBtn}
          </button>
        </div>
        <p className="text-default-700 mt-1 text-xs">{code.trim() ? t.testHelpCode : t.testHelpEmpty}</p>
        <TestResult s={test} loadingText={t.testLoading} />
      </div>
    </div>
  )
}

type AddForm = { label?: string; datasetId: string; token: string }

function AddPanel({ channelId, onAdded, onClose }: { channelId: string; onAdded: (d: DatasetView) => void; onClose: () => void }) {
  const t = useT().conversionsApi
  const [mode, setMode] = useState<'PAGE' | 'MANUAL'>('PAGE')
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState<{ text: string; reconnect?: boolean } | null>(null)
  const schema = useMemo(
    () =>
      yup.object({
        label: yup.string().max(60).optional(),
        datasetId: yup.string().required(t.dsErrId).matches(/^\d+$/, t.dsErrId),
        token: yup.string().trim().required(t.dsErrToken),
      }),
    [t],
  )
  const { register, handleSubmit, formState } = useForm<AddForm>({ resolver: yupResolver(schema) as never, defaultValues: { label: '', datasetId: '', token: '' } })
  const radioName = useId()

  const submit = async (body: Record<string, unknown>) => {
    setBusy(true)
    setFormErr(null)
    const r = await capiApi<{ dataset: DatasetView }>(`/${channelId}/datasets`, 'POST', body)
    setBusy(false)
    if (r.ok) {
      onAdded(r.data.dataset)
      pacesToast.success(t.dsAdded)
      return
    }
    const map: Record<string, { text: string; reconnect?: boolean }> = {
      DATASET_LIMIT: { text: t.dsErrLimit },
      DATASET_DUPLICATE: { text: t.dsErrDuplicate },
      PAGE_EVENTS_PERMISSION: { text: t.dsErrPagePermission, reconnect: true },
      TOKEN_REQUIRED: { text: t.dsErrToken },
      INVALID_INPUT: { text: t.dsErrId },
      META_ERROR: { text: t.dsErrMeta },
    }
    setFormErr(map[r.code ?? ''] ?? { text: t.saveFailed })
  }

  const radio = (value: 'PAGE' | 'MANUAL', title: string, hint: string) => (
    <label className={cn('flex min-h-11 cursor-pointer items-start gap-2.5 rounded p-2', mode === value && 'bg-card')}>
      <input type="radio" name={radioName} className="form-radio mt-0.5 rounded-full!" checked={mode === value} onChange={() => setMode(value)} />
      <span>
        <span className="text-default-900 block text-sm font-medium">{title}</span>
        <span className="text-default-700 block text-xs">{hint}</span>
      </span>
    </label>
  )

  return (
    <div className="bg-default-100 mb-4 rounded-lg p-3">
      <fieldset>
        <legend className="text-default-900 mb-1 text-sm font-semibold">{t.dsAddLegend}</legend>
        <div className="grid gap-1 md:grid-cols-2">
          {radio('PAGE', t.dsOptPage, t.dsOptPageHint)}
          {radio('MANUAL', t.dsOptManual, t.dsOptManualHint)}
        </div>
      </fieldset>

      {mode === 'MANUAL' && (
        <form onSubmit={handleSubmit((v) => submit({ source: 'MANUAL', datasetId: v.datasetId.trim(), token: v.token.trim(), label: v.label?.trim() || null }))} noValidate>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label htmlFor={`${radioName}-l`} className="form-label">
                {t.dsFieldLabel}
              </label>
              <input id={`${radioName}-l`} className="form-input min-h-11 lg:min-h-0" placeholder={t.dsFieldLabelPh} {...register('label')} />
            </div>
            <div>
              <label htmlFor={`${radioName}-i`} className="form-label">
                {t.dsFieldId}
              </label>
              <input id={`${radioName}-i`} inputMode="numeric" className="form-input min-h-11 lg:min-h-0" aria-invalid={!!formState.errors.datasetId} {...register('datasetId')} />
              {formState.errors.datasetId && <p className="text-danger-ink mt-1 text-xs">{formState.errors.datasetId.message}</p>}
            </div>
            <div>
              <label htmlFor={`${radioName}-t`} className="form-label">
                {t.dsFieldToken}
              </label>
              <input id={`${radioName}-t`} type="password" autoComplete="off" className="form-input min-h-11 lg:min-h-0" aria-invalid={!!formState.errors.token} {...register('token')} />
              <p className={cn('mt-1 text-xs', formState.errors.token ? 'text-danger-ink' : 'text-default-700')}>{formState.errors.token?.message ?? t.dsTokenHelp}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy} className="btn bg-primary hover:bg-primary-hover min-h-11 flex-1 text-white disabled:opacity-50 sm:flex-none lg:min-h-0">
              {t.dsSaveManual}
            </button>
            <button type="button" onClick={onClose} className="btn text-default-700 min-h-11 lg:min-h-0">
              {t.dsCancel}
            </button>
          </div>
        </form>
      )}
      {mode === 'PAGE' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => submit({ source: 'PAGE' })} className="btn bg-primary hover:bg-primary-hover min-h-11 flex-1 text-white disabled:opacity-50 sm:flex-none lg:min-h-0">
            {busy && <span className="border-white/60 size-4 animate-spin rounded-full border-2 border-t-transparent" aria-hidden="true" />}
            {t.dsUsePage}
          </button>
          <button type="button" onClick={onClose} className="btn text-default-700 min-h-11 lg:min-h-0">
            {t.dsCancel}
          </button>
        </div>
      )}
      {formErr && (
        <div role="alert" className="bg-danger/15 text-danger-ink mt-3 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2.5 text-sm">
          <Icon icon="circle-x" className="size-4.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{formErr.text}</span>
          {formErr.reconnect && <ReconnectLink />}
        </div>
      )}
    </div>
  )
}

type CardProps = {
  channelId: string
  datasets: DatasetView[]
  onChange: (next: DatasetView[]) => void
  eventOptions: EventOpts
  purchaseAt: string
  countPromotedDraft: boolean
  tags: { id: string; name: string }[]
  busyKeys: ReadonlySet<string>
  onAddEvents: (d: DatasetView, keys: string[]) => Promise<boolean>
  onRemoveEvent: (d: DatasetView, key: string) => void
  onSaveSettings: (key: string, r: EventSettingsResult) => Promise<boolean>
}

export default function DatasetsCard({ channelId, datasets, onChange, eventOptions, purchaseAt, countPromotedDraft, tags, busyKeys, onAddEvents, onRemoveEvent, onSaveSettings }: CardProps) {
  const t = useT().conversionsApi
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const full = datasets.length >= MAX_DATASETS
  const ds = datasets.find((d) => d.id === selected) ?? datasets[0]
  // ยังไม่มีชุดข้อมูลเลย = เปิดแผงเพิ่มให้เลย (ไม่มีแท็บให้ดู)
  const showAdd = (adding || !ds) && !full

  const remove = async (d: DatasetView) => {
    const name = datasetName(d, t.dsPageDefaultName)
    const ok = await pacesConfirm.danger(fmt(t.dsDeleteTitle, { name }), t.dsDeleteText, { confirmButtonText: t.dsDeleteOk, cancelButtonText: t.dsDeleteCancel })
    if (!ok) return
    const r = await capiApi(`/${channelId}/datasets/${d.id}`, 'DELETE')
    if (!r.ok) return pacesToast.error(t.saveFailed)
    onChange(datasets.filter((x) => x.id !== d.id))
    pacesToast.success(t.dsDeleted)
  }

  const tabCls = (active: boolean) => cn('-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-1 text-sm whitespace-nowrap lg:min-h-9', active ? 'border-primary text-primary-ink font-medium' : 'text-default-700 border-transparent')

  return (
    <div className="card order-2 xl:order-none">
      <div className="card-header pb-0 sm:pb-3.75">
        <h4 className="card-title">
          {t.dsTitle} <span className="text-default-700 tabular-nums">{datasets.length}/{MAX_DATASETS}</span>
        </h4>
      </div>
      <div className="card-body">
        <div role="tablist" aria-label={t.evTabsAria} className="border-default-200 mb-4 flex gap-4 overflow-x-auto border-b">
          {datasets.map((d) => {
            const active = d.id === ds?.id && !showAdd
            const nm = datasetName(d, t.dsPageDefaultName)
            return (
              <button key={d.id} type="button" role="tab" aria-selected={active} onClick={() => { setSelected(d.id); setAdding(false) }} className={tabCls(active)}>
                {nm}
                <span className="badge bg-default-100 text-default-800">{d.source === 'PAGE' ? t.dsSourcePage : t.dsSourceManual}</span>
                {d.status === 'STOPPED' && <span className="badge bg-danger/15 text-danger-ink">{t.dsStopped}</span>}
              </button>
            )
          })}
          <button type="button" role="tab" aria-selected={showAdd} disabled={full} title={full ? t.dsFull : undefined} onClick={() => setAdding(true)} className={cn(tabCls(showAdd), 'disabled:cursor-not-allowed disabled:opacity-50')}>
            <Icon icon="plus" className="size-4" aria-hidden="true" />
            {t.dsAdd}
          </button>
        </div>
        {full && <p className="text-default-700 mb-3 text-xs">{t.dsFull}</p>}
        {showAdd && (
          <AddPanel
            channelId={channelId}
            onClose={() => setAdding(false)}
            onAdded={(d) => {
              onChange([...datasets, d])
              setSelected(d.id)
              setAdding(false)
            }}
          />
        )}
        {ds && !showAdd && (
          <div role="tabpanel">
            <DatasetRow key={ds.id} channelId={channelId} d={ds} pageDefault={t.dsPageDefaultName} onDelete={remove} onChanged={(nd) => onChange(datasets.map((x) => (x.id === nd.id ? nd : x)))} />
            <EventsList ds={ds} eventOptions={eventOptions} purchaseAt={purchaseAt} countPromotedDraft={countPromotedDraft} tags={tags} busyKeys={busyKeys} onAdd={onAddEvents} onRemove={onRemoveEvent} onSaveSettings={onSaveSettings} />
          </div>
        )}
      </div>
    </div>
  )
}
