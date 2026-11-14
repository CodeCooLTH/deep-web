'use client'

/**
 * การ์ด "กลุ่มเป้าหมายลูกค้าที่ซื้อแล้ว" ใต้ตารางเพจ (feature 00092 FR-002/003/008) · สถานะ S0–S8 ตาม Design-Spec
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (card-header/body ท่าเดียวกับ DatasetsCard)
 *   + theme: .../form/elements/components/ChecksRadioSwitches.tsx (form-switch) · InputTextfieldType.tsx (form-select native)
 *   + theme: .../apps/users/account-settings/page.tsx (form-label/form-input) · ui/badges/page.tsx · ui/alerts/page.tsx
 *   + theme: .../plugins/sweet-alerts/components/SweetAlerts.tsx (ผ่าน pacesConfirm)
 *   + src/.../components/PagesClient.tsx (toggle optimistic + revert) · DatasetsCard.tsx (AddPanel RHF+Yup · alert ท่า TestResult)
 *
 * ตัดสินสถานะผ่าน src/lib/meta-audience/ui.ts (เทสได้) · token ไม่แสดงกลับทุกกรณี
 */
import { yupResolver } from '@hookform/resolvers/yup'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import * as yup from 'yup'

import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { formatDateTime } from '@/lib/format-date'
import { audienceState, connectErrorKey, expiringDays, parseOauthReturn, type AudienceState, type OauthReturn } from '@/lib/meta-audience/ui'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { cn } from '@/utils/helpers'
import { audienceApi } from './shared'

export type AudienceConnection = {
  adAccountId: string
  adAccountName: string
  tokenSource: string
  tokenExpiresAt: string | null
  audienceId: string | null
  audienceName: string | null
  enabled: boolean
  enabledAt: string | null
  backfilledAt: string | null
  status: string
  stoppedReason: string | null
  lastSyncedAt: string | null
  counts: { synced: number; pending: number }
  adsManagerUrl: string | null
  termsUrl: string | null
}
type Status = { connection: AudienceConnection | null }
type Account = { adAccountId: string; name: string; accountStatus: number | null }

const num = new Intl.NumberFormat('en-US')
const BTN_PRIMARY = 'btn bg-primary hover:bg-primary-hover min-h-11 w-full text-white disabled:opacity-50 sm:w-auto lg:min-h-0'
const BTN_PLAIN = 'btn border-default-300 text-default-800 min-h-11 w-full border sm:w-auto lg:min-h-0'

const BADGE: Record<AudienceState, string> = {
  none: '',
  off: 'bg-default-100 text-default-800',
  filling: 'bg-primary/15 text-primary-ink',
  normal: 'bg-primary/15 text-primary-ink',
  terms: 'bg-warning/15 text-warning-ink',
  token: 'bg-danger/15 text-danger-ink',
}

function Alert({ tone, title, children }: { tone: 'warning' | 'danger' | 'info'; title?: string; children?: React.ReactNode }) {
  const cls = { warning: 'bg-warning/15 text-warning-ink', danger: 'bg-danger/15 text-danger-ink', info: 'bg-default-100 text-default-800' }[tone]
  const icon = { warning: 'alert-triangle', danger: 'circle-x', info: 'info-circle' }[tone]
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={cn('flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm', cls)}>
      <Icon icon={icon} className="mt-0.5 size-4.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 md:flex-row md:items-center md:gap-4">
      <dt className="text-default-700 shrink-0 text-sm md:w-40">{label}</dt>
      <dd className="text-default-900 flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm">{children}</dd>
    </div>
  )
}

/** ปุ่มเชื่อม Facebook — endpoint ตอบ 302 → anchor ธรรมดา ไม่ใช่ next/link (ท่า ReconnectLink) */
function FacebookLink({ label }: { label: string }) {
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- endpoint ตอบ 302 ไป OAuth ของ Meta ไม่ใช่หน้าในแอป
    <a href="/api/meta-audience/connect" className={BTN_PRIMARY}>
      <Icon icon="brand-facebook" className="size-4" aria-hidden="true" />
      {label}
    </a>
  )
}

type ManualForm = { adAccountId: string; token: string }

function ManualPanel({ onConnected }: { onConnected: (s: Status) => void }) {
  const t = useT().conversionsApi
  const uid = useId()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const schema = useMemo(
    () =>
      yup.object({
        adAccountId: yup.string().trim().required(t.audienceErrInput).matches(/^(act_)?\d+$/i, t.audienceErrInput),
        token: yup.string().trim().required(t.audienceErrNeedToken),
      }),
    [t],
  )
  const { register, handleSubmit, formState } = useForm<ManualForm>({ resolver: yupResolver(schema) as never, defaultValues: { adAccountId: '', token: '' } })

  const submit = async (v: ManualForm) => {
    setBusy(true)
    setErr('')
    const r = await audienceApi<Status>('/connect', 'POST', { mode: 'MANUAL', adAccountId: v.adAccountId.trim(), token: v.token.trim() })
    setBusy(false)
    if (!r.ok) return setErr(t[`audience${connectErrorKey(r.code).replace('err', 'Err')}` as 'audienceErrGeneric'])
    onConnected(r.data)
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="bg-default-100 rounded-lg p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-a`} className="form-label">
            {t.audienceFieldAdAccount}
          </label>
          <input id={`${uid}-a`} inputMode="numeric" autoComplete="off" className="form-input min-h-11 lg:min-h-0" aria-invalid={!!formState.errors.adAccountId} {...register('adAccountId')} />
          {formState.errors.adAccountId && <p className="text-danger-ink mt-1 text-xs">{formState.errors.adAccountId.message}</p>}
        </div>
        <div>
          <label htmlFor={`${uid}-t`} className="form-label">
            {t.audienceFieldToken}
          </label>
          <input id={`${uid}-t`} type="password" autoComplete="off" className="form-input min-h-11 lg:min-h-0" aria-invalid={!!formState.errors.token} {...register('token')} />
          {formState.errors.token && <p className="text-danger-ink mt-1 text-xs">{formState.errors.token.message}</p>}
        </div>
      </div>
      <p className="text-default-700 mt-2 flex items-start gap-1 text-xs">
        <Icon icon="lock" className="text-default-500 mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {t.audienceConnectHint}
      </p>
      {err && (
        <div className="mt-3">
          <Alert tone="danger">{err}</Alert>
        </div>
      )}
      <div className="mt-3">
        <button type="submit" disabled={busy} aria-busy={busy || undefined} className={BTN_PRIMARY}>
          {busy && <span className="size-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" aria-hidden="true" />}
          {t.audienceConnectSave}
        </button>
      </div>
    </form>
  )
}

/** S1 — เลือกบัญชีโฆษณาหลังกลับจาก Facebook */
function ChooseAccount({ onConnected, onFail }: { onConnected: (s: Status) => void; onFail: (text: string) => void }) {
  const t = useT().conversionsApi
  const uid = useId()
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void audienceApi<{ accounts: Account[] }>('/accounts', 'GET').then((r) => {
      if (!live) return
      if (!r.ok) return onFail(t[`audience${connectErrorKey(r.code).replace('err', 'Err')}` as 'audienceErrGeneric'])
      if (r.data.accounts.length === 0) return onFail(t.audienceRetNoAdAccount)
      setAccounts(r.data.accounts)
      setPick((r.data.accounts.find((a) => a.accountStatus === 1 || a.accountStatus === null) ?? r.data.accounts[0]).adAccountId)
    })
    return () => {
      live = false
    }
    // onFail เปลี่ยน identity ทุก render — ยิงครั้งเดียวตอน mount พอ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const use = async () => {
    setBusy(true)
    const r = await audienceApi<Status>('/connect', 'POST', { mode: 'OAUTH', adAccountId: pick })
    setBusy(false)
    if (!r.ok) return onFail(t[`audience${connectErrorKey(r.code).replace('err', 'Err')}` as 'audienceErrGeneric'])
    onConnected(r.data)
  }

  if (!accounts) return <div className="bg-default-100 h-11 animate-pulse rounded-lg" role="status" aria-busy="true" aria-label={t.audienceChooseTitle} />
  return (
    <div className="bg-default-100 rounded-lg p-3">
      <label htmlFor={`${uid}-s`} className="form-label">
        {t.audienceChooseTitle}
      </label>
      <select id={`${uid}-s`} value={pick} onChange={(e) => setPick(e.target.value)} className="form-select min-h-11 lg:min-h-0">
        {accounts.map((a) => {
          const ok = a.accountStatus === 1 || a.accountStatus === null
          return (
            <option key={a.adAccountId} value={a.adAccountId} disabled={!ok}>
              {a.name} · {a.adAccountId}
              {ok ? '' : ` ${t.audienceChooseDisabledSuffix}`}
            </option>
          )
        })}
      </select>
      <div className="mt-3">
        <button type="button" disabled={busy || !pick} aria-busy={busy || undefined} onClick={use} className={BTN_PRIMARY}>
          {t.audienceChooseOk}
        </button>
      </div>
    </div>
  )
}

export default function AudienceCard({ initial, oauthAvailable, loadFailed = false }: { initial: AudienceConnection | null; oauthAvailable: boolean; loadFailed?: boolean }) {
  const t = useT().conversionsApi
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const cardRef = useRef<HTMLDivElement>(null)
  const [conn, setConn] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [ret, setRet] = useState<OauthReturn | null>(null)
  const [chooseErr, setChooseErr] = useState('')

  useEffect(() => setConn(initial), [initial])

  // กลับจาก OAuth: จำค่า ?audience= ไว้ใน state แล้วลบออกจาก URL (refresh แล้วไม่ขึ้นซ้ำ) + เลื่อนมาที่การ์ด
  const seen = params.get('audience')
  useEffect(() => {
    const r = parseOauthReturn(seen)
    if (!r) return
    setRet(r)
    router.replace(`${pathname}#audience`, { scroll: false })
    cardRef.current?.scrollIntoView({ block: 'start' })
  }, [seen, pathname, router])

  const state = audienceState(conn)
  const stopped = state === 'terms' || state === 'token'
  const days = conn ? expiringDays(conn) : null
  const fbShown = oauthAvailable && (!conn || conn.tokenSource === 'OAUTH')
  const showManual = !fbShown || manualOpen

  const onConnected = (s: Status) => {
    setConn(s.connection)
    setRet(null)
    setChooseErr('')
    setManualOpen(false)
    pacesToast.success(t.audienceToastConnected)
    router.refresh()
  }

  // optimistic + revert (ท่า PagesClient) — เปิดครั้งแรกถามก่อนเพราะส่งข้อมูลออกและเติมย้อนหลังทั้งร้าน
  const toggle = async (next: boolean) => {
    if (!conn || busy) return
    if (next && conn.enabledAt === null) {
      const ok = await pacesConfirm.question(t.audienceSwalFirstTitle, t.audienceSwalFirstText, {
        confirmButtonText: t.audienceSwalFirstOk,
        cancelButtonText: t.audienceSwalFirstCancel,
        confirmSemantic: 'primary',
      })
      if (!ok) return
    }
    const prev = conn
    setConn({ ...conn, enabled: next })
    setBusy(true)
    const r = await audienceApi<Status>('', 'PUT', { enabled: next })
    setBusy(false)
    if (!r.ok) {
      setConn(prev)
      if (r.status === 404) router.refresh()
      else if (r.status === 409) {
        pacesToast.error(t.audienceToastStateChanged)
        router.refresh()
      } else pacesToast.error(t.audienceToastSwitchFailed)
      return
    }
    setConn(r.data.connection)
    pacesToast.success(next ? t.audienceToastOn : t.audienceToastOff)
  }

  const disconnect = async () => {
    const ok = await pacesConfirm.danger(t.audienceDisTitle, t.audienceDisText, { confirmButtonText: t.audienceDisOk, cancelButtonText: t.audienceDisCancel })
    if (!ok) return
    const r = await audienceApi('', 'DELETE')
    if (!r.ok) return pacesToast.error(t.audienceToastSwitchFailed)
    setConn(null)
    setManualOpen(false)
    pacesToast.success(t.audienceToastDisconnected)
    router.refresh()
  }

  const retText = ret && ret !== 'choose_account' ? { cancelled: t.audienceRetCancelled, state_mismatch: t.audienceRetStateMismatch, no_code: t.audienceRetNoCode, no_ad_account: t.audienceRetNoAdAccount, error: t.audienceRetError }[ret] : ''

  const connectBlock = (label: string) => (
    <div className="flex flex-col gap-2">
      {fbShown && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <FacebookLink label={label} />
          <button type="button" aria-expanded={manualOpen} onClick={() => setManualOpen((v) => !v)} className="text-primary-ink min-h-11 text-sm font-medium underline underline-offset-2 lg:min-h-0">
            {t.audienceConnectManualToggle}
          </button>
        </div>
      )}
      {showManual && <ManualPanel onConnected={onConnected} />}
    </div>
  )

  if (loadFailed) {
    return (
      <div className="card mt-base" id="audience" ref={cardRef}>
        <div className="card-body">
          <Alert tone="danger" title={t.audienceLoadError}>
            <button type="button" onClick={() => router.refresh()} className="text-danger-ink mt-1 min-h-11 text-sm font-medium underline underline-offset-2 lg:min-h-0">
              {t.retry}
            </button>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="card mt-base scroll-mt-20" id="audience" ref={cardRef}>
      <div className="card-header">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h4 className="card-title">{t.audienceTitle}</h4>
          {conn && (
            <span className={cn('badge gap-1', BADGE[state])}>
              {stopped && <Icon icon="alert-triangle" className="size-3" aria-hidden="true" />}
              {{ none: '', off: t.audienceBadgeOff, filling: t.audienceBadgeOn, normal: t.audienceBadgeOn, terms: t.audienceBadgeWarn, token: t.audienceBadgeStop }[state]}
            </span>
          )}
        </div>
        {conn && (
          <input
            type="checkbox"
            className="form-switch shrink-0"
            checked={conn.enabled && !stopped}
            disabled={stopped || busy}
            aria-label={t.audienceSwitchAria}
            aria-busy={busy || undefined}
            onChange={(e) => toggle(e.target.checked)}
          />
        )}
      </div>

      <div className="card-body flex flex-col gap-3">
        <p className="text-default-700 text-sm">{t.audienceDesc}</p>

        {retText && <Alert tone="warning">{retText}</Alert>}
        {chooseErr && <Alert tone="danger">{chooseErr}</Alert>}
        {ret === 'choose_account' && !chooseErr && <ChooseAccount onConnected={onConnected} onFail={(m) => setChooseErr(m)} />}

        {state === 'terms' && conn && (
          <Alert tone="warning" title={t.audienceStopTermsTitle}>
            <p>{t.audienceStopTermsBody}</p>
            {conn.termsUrl && (
              <a href={conn.termsUrl} target="_blank" rel="noopener noreferrer" className="text-warning-ink mt-1 inline-flex min-h-11 items-center gap-1 font-medium underline underline-offset-2 lg:min-h-0">
                {t.audienceTermsLink}
                <Icon icon="external-link" className="size-3.5" aria-hidden="true" />
              </a>
            )}
          </Alert>
        )}
        {state === 'token' && (
          <Alert tone="danger" title={t.audienceStopTokenTitle}>
            <p>{t.audienceStopTokenBody}</p>
          </Alert>
        )}
        {days !== null && (
          <Alert tone="warning" title={fmt(t.audienceExpiringTitle, { n: days })}>
            <p>{t.audienceExpiringBody}</p>
            {oauthAvailable && (
              <div className="mt-2">
                <FacebookLink label={t.audienceReconnect} />
              </div>
            )}
          </Alert>
        )}

        {conn && (
          <dl className="flex flex-col gap-2">
            <Row label={t.audienceRowAccount}>
              <span className="min-w-0 truncate" title={`${conn.adAccountName} · ${conn.adAccountId}`}>
                {conn.adAccountName} · <span className="tabular-nums">{conn.adAccountId}</span>
              </span>
            </Row>
            {conn.audienceName && (
              <Row label={t.audienceRowAudience}>
                <span className="min-w-0 truncate" title={conn.audienceName}>
                  {conn.audienceName}
                </span>
                {conn.adsManagerUrl && (
                  <a href={conn.adsManagerUrl} target="_blank" rel="noopener noreferrer" className="text-primary-ink inline-flex min-h-11 items-center gap-1 font-medium lg:min-h-0">
                    {t.audienceOpenAdsManager}
                    <Icon icon="external-link" className="size-3.5" aria-hidden="true" />
                  </a>
                )}
              </Row>
            )}
          </dl>
        )}

        {(state === 'filling' || state === 'normal') && conn && (
          <>
            <p className="text-default-900 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm tabular-nums">
              <span className="inline-flex items-center gap-1.5">
                <Icon icon="users" className="text-default-600 size-4" aria-hidden="true" />
                {fmt(t.audienceStatSynced, { n: num.format(conn.counts.synced) })}
              </span>
              <span>{fmt(t.audienceStatPending, { n: num.format(conn.counts.pending) })}</span>
              <span>
                {t.audienceStatLast} {conn.lastSyncedAt ? formatDateTime(conn.lastSyncedAt) : t.audienceLastNever}
              </span>
            </p>
            {state === 'filling' ? (
              <p className="text-primary-ink flex items-center gap-2 text-sm">
                <Icon icon="loader-2" className="size-4 animate-spin" aria-hidden="true" />
                {t.audienceBackfilling}
              </p>
            ) : (
              <Alert tone="info">{t.audienceNote100}</Alert>
            )}
          </>
        )}

        {(state === 'none' || stopped) && ret !== 'choose_account' && connectBlock(stopped ? t.audienceReconnect : t.audienceConnectFb)}
        {state === 'none' && !showManual && <p className="text-default-700 text-xs">{t.audienceConnectHint}</p>}
      </div>

      {conn && (
        <div className="card-footer">
          <button type="button" onClick={disconnect} className={BTN_PLAIN}>
            <Icon icon="trash" className="size-4" aria-hidden="true" />
            {t.audienceDisconnect}
          </button>
        </div>
      )}
    </div>
  )
}
