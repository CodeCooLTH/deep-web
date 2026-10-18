'use client'

/**
 * หน้าตั้งค่าส่งอัตโนมัติ (feature 00078 T17) — การ์ดจังหวะ + การ์ดข้อควรรู้
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/reports/components/ReportSettingsForm.tsx (grid lg:grid-cols-3, li + form-switch)
 *   + public-profile/components/PriceVisibilityToggleClient.tsx (optimistic + revert + pacesToast)
 *   theme: theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { settingsBanner } from '@/lib/auto-notify/settings-ui'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import AutoNotifyRow, { type TrackingTiming } from './AutoNotifyRow'
import DailyCapField from './DailyCapField'

interface KindView {
  kind: string
  label: string
  icon: string
  enabled: boolean
  enabledAt: string | null
  customFirstLine: string | null
}

export default function AutoNotifyClient({
  kinds: initial,
  dailyCap,
  trackingNoticeTiming,
  canEdit,
  hasChannel,
  noun,
  renderEditAction,
  editorFor,
}: {
  kinds: KindView[]
  dailyCap: number
  /** 00080 — จังหวะแจ้งเลขพัสดุของส่งเอง */
  trackingNoticeTiming: TrackingTiming
  canEdit: boolean
  hasChannel: boolean
  noun: string
  /** ช่องเสียบของ T18 — ไม่ส่ง = ไม่มีปุ่มแก้ข้อความ */
  renderEditAction?: (kind: string) => ReactNode
  editorFor?: (kind: string) => ReactNode
}) {
  const t = useT().autoNotify
  const router = useRouter()
  const [kinds, setKinds] = useState(initial)
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())

  const patch = (kind: string, p: Partial<KindView>) =>
    setKinds((ks) => ks.map((k) => (k.kind === kind ? { ...k, ...p } : k)))
  const setBusy = (kind: string, on: boolean) =>
    setPending((s) => {
      const n = new Set(s)
      if (on) n.add(kind)
      else n.delete(kind)
      return n
    })

  const [timing, setTiming] = useState<TrackingTiming>(trackingNoticeTiming)
  const [timingPending, setTimingPending] = useState(false)

  // optimistic + revert + pacesToast (แบบเดียวกับสวิตช์) — PATCH คีย์เดียว ไม่แตะเพดานข้อความ
  const changeTiming = async (next: TrackingTiming) => {
    if (!canEdit || timingPending || next === timing) return
    const prev = timing
    setTiming(next)
    setTimingPending(true)
    try {
      const res = await fetch('/api/shops/current/auto-notify/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNoticeTiming: next }),
      })
      if (!res.ok) throw new Error(String(res.status))
      pacesToast.success(t.toastTimingSaved)
    } catch {
      setTiming(prev)
      pacesToast.error(t.toastFailed)
    } finally {
      setTimingPending(false)
    }
  }

  const toggle = async (row: KindView, next: boolean) => {
    if (!canEdit) return
    // เปิดครั้งแรก = ถามก่อน (UX ไม่ใช่กฎ server — A-12) · ยกเลิก = สวิตช์ไม่ขยับ ไม่เรียก API
    if (next && row.enabledAt === null) {
      const ok = await pacesConfirm({
        icon: 'warning',
        confirmSemantic: 'primary',
        focusCancel: true,
        title: t.firstOnTitle,
        text: t.firstOnBody.replace('{when}', ' ' + row.label),
        confirmButtonText: t.firstOnConfirm,
        cancelButtonText: t.firstOnCancel,
      })
      if (!ok) return
    }
    const prev = row.enabled
    patch(row.kind, { enabled: next }) // optimistic
    setBusy(row.kind, true)
    try {
      const res = await fetch(`/api/shops/current/auto-notify/switches/${row.kind}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) {
        patch(row.kind, { enabled: prev }) // revert
        pacesToast.error(t.toastFailed)
        const code = res.status === 409 ? ((await res.json().catch(() => null)) as { error?: string } | null)?.error : null
        // สิทธิ์หรือชนิดที่ร้านใช้ได้เปลี่ยนไปแล้ว — หน้านี้ข้อมูลเก่า โหลดใหม่จาก server
        if (res.status === 403 || code === 'KIND_NOT_AVAILABLE') router.refresh()
        return
      }
      const data = (await res.json()) as { enabled: boolean; enabledAt: string | null }
      patch(row.kind, { enabled: data.enabled, enabledAt: data.enabledAt })
      pacesToast.success(data.enabled ? t.toastEnabled : t.toastDisabled)
    } catch {
      patch(row.kind, { enabled: prev })
      pacesToast.error(t.toastFailed)
    } finally {
      setBusy(row.kind, false)
    }
  }

  const empty = kinds.length === 0
  const banner = empty ? null : settingsBanner({ canEdit, hasChannel })

  return (
    <>
      {banner === 'readOnly' && (
        <div id="an-ro" className="bg-default-100 text-default-800 mb-base flex items-start gap-3 rounded-lg p-3 text-sm">
          <Icon icon="lock" className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>{t.readOnlyBanner}</p>
        </div>
      )}
      {banner === 'noChannel' && (
        <div className="bg-warning/15 text-warning-ink mb-base flex items-start gap-3 rounded-lg p-3 text-xs">
          <Icon icon="alert-triangle" className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p>{t.noChannelBanner}</p>
            <Link
              href="/settings/channels"
              className="text-warning-ink inline-flex min-h-11 items-center font-medium underline lg:min-h-0"
            >
              {t.noChannelCta}
            </Link>
          </div>
        </div>
      )}

      <div className={empty ? undefined : 'grid gap-base lg:grid-cols-3'}>
        <div className={empty ? undefined : 'lg:col-span-2'}>
          <div className="card">
            <div className="card-header">
              <h4 className="card-title">{t.cardEventsTitle}</h4>
            </div>
            <div className="card-body">
              {empty ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Icon icon="send" className="text-default-500 size-8" aria-hidden="true" />
                  <p className="text-default-700 text-sm">{t.emptyNoKinds}</p>
                </div>
              ) : (
                <>
                  <ul className="divide-default-200 divide-y">
                    {kinds.map((k) => (
                      <AutoNotifyRow
                        key={k.kind}
                        kind={k.kind}
                        label={k.label}
                        icon={k.icon}
                        checked={k.enabled}
                        pending={pending.has(k.kind)}
                        canEdit={canEdit}
                        customFirstLine={k.customFirstLine}
                        onToggle={(next) => void toggle(k, next)}
                        renderEditAction={renderEditAction ? () => renderEditAction(k.kind) : undefined}
                        editor={editorFor?.(k.kind)}
                        timing={k.kind === 'TRACKING' ? timing : undefined}
                        timingPending={timingPending}
                        onTimingChange={(next) => void changeTiming(next)}
                      />
                    ))}
                  </ul>
                  <DailyCapField initial={dailyCap} canEdit={canEdit} />
                </>
              )}
            </div>
          </div>
        </div>

        {!empty && (
          <div>
            <div className="card">
              <div className="card-header">
                <h4 className="card-title">{t.cardNotesTitle}</h4>
              </div>
              <div className="card-body">
                <ul className="space-y-3">
                  {[t.noteLinkedOnly.replaceAll('{noun}', noun), t.noteWindow, t.noteLineQuota].map((n) => (
                    <li key={n} className="flex items-start gap-2">
                      <Icon icon="info-circle" className="text-default-500 mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <p className="text-default-700 text-sm">{n}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
