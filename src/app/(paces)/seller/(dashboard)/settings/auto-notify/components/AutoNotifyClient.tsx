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
import { useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { settingsBanner } from '@/lib/auto-notify/settings-ui'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import type { AutoNotifyKind } from '@/lib/auto-notify/ledger-constants'
import type { TemplateVariable } from '@/lib/auto-notify/variables'
import AutoNotifyRow, { type TrackingTiming } from './AutoNotifyRow'
import TemplateEditor from './TemplateEditor'
import { renderTemplate } from '@/lib/auto-notify/render'
import { fmt } from '@/i18n/fmt'
import DailyCapField from './DailyCapField'

interface KindView {
  kind: AutoNotifyKind
  label: string
  icon: string
  enabled: boolean
  enabledAt: string | null
  template: {
    /** null = ร้านยังไม่แก้ (ใช้ defaultBody) */
    body: string | null
    defaultBody: string
    isCustom: boolean
    updatedAt: string | null
    updatedBy: { name: string } | null
  }
  variables: readonly TemplateVariable[]
}

/** บรรทัดแรกของข้อความหลังเติมค่าตัวอย่าง — ตัวสร้างข้อความเดียวกับตัวส่งจริง ไม่โชว์ `{ชื่อ}` ดิบในแถว */
function rowPreviewLine(k: KindView, t: { rowDefaultText: string; rowCustomText: string; useDefaultText: string }): string {
  const r = renderTemplate(k.template.body ?? k.template.defaultBody, Object.fromEntries(k.variables.map((v) => [v.name, v.sample])))
  const line = r.ok ? (r.text.split('\n').find((x) => x.trim() !== '') ?? '') : ''
  if (!line) return t.useDefaultText
  return fmt(k.template.isCustom ? t.rowCustomText : t.rowDefaultText, { line })
}

export default function AutoNotifyClient({
  kinds: initial,
  dailyCap,
  trackingNoticeTiming,
  canEdit,
  hasChannel,
  noun,
}: {
  kinds: KindView[]
  dailyCap: number
  /** 00080 — จังหวะแจ้งเลขพัสดุของส่งเอง */
  trackingNoticeTiming: TrackingTiming
  canEdit: boolean
  hasChannel: boolean
  noun: string
}) {
  const t = useT().autoNotify
  const router = useRouter()
  const [kinds, setKinds] = useState(initial)
  // router.refresh() (409 / สิทธิ์เปลี่ยน) ส่ง props ชุดใหม่มา — รับเข้า state ไม่งั้น updatedAt เก่าค้างจนโหลดหน้าเอง
  const [prevInitial, setPrevInitial] = useState(initial)
  if (initial !== prevInitial) {
    setPrevInitial(initial)
    setKinds(initial)
  }
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

  // T18 — กางตัวแก้ได้ทีละแถว · กางแถวอื่นขณะข้อความค้าง = ถามก่อน (ท่า closeSettings ใน ShippingSettingsRow)
  const [openKind, setOpenKind] = useState<string | null>(null)
  const [editorDirty, setEditorDirty] = useState(false)
  const openEditor = async (kind: string | null) => {
    if (kind === openKind) return
    if (editorDirty && !(await pacesConfirm.warning(t.discardConfirmTitle, undefined, { confirmButtonText: t.discardConfirmOk, cancelButtonText: t.keepEditing }))) return
    setEditorDirty(false)
    setOpenKind(kind)
  }
  const patchTemplate = (kind: string, tp: Partial<KindView['template']>) =>
    setKinds((ks) => ks.map((k) => (k.kind === kind ? { ...k, template: { ...k.template, ...tp } } : k)))

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
                        previewLine={rowPreviewLine(k, t)}
                        onToggle={(next) => void toggle(k, next)}
                        renderEditAction={
                          canEdit && openKind !== k.kind
                            ? () => (
                                <button
                                  type="button"
                                  onClick={() => void openEditor(k.kind)}
                                  className="btn btn-sm border-default-300 text-default-800 min-h-11 shrink-0 border lg:min-h-8"
                                >
                                  <Icon icon="pencil" className="size-4" aria-hidden="true" />
                                  {t.editText}
                                </button>
                              )
                            : undefined
                        }
                        editor={
                          canEdit && openKind === k.kind ? (
                            <TemplateEditor
                              kind={k.kind}
                              label={k.label}
                              variables={k.variables}
                              body={k.template.body ?? k.template.defaultBody}
                              defaultBody={k.template.defaultBody}
                              isCustom={k.template.isCustom}
                              updatedAt={k.template.updatedAt}
                              updatedBy={k.template.updatedBy}
                              onDirtyChange={setEditorDirty}
                              onClose={() => {
                                setEditorDirty(false)
                                setOpenKind(null)
                              }}
                              onSaved={(r) => {
                                patchTemplate(k.kind, { body: r.body, isCustom: true, updatedAt: r.updatedAt, updatedBy: r.updatedBy })
                                setEditorDirty(false)
                                setOpenKind(null)
                              }}
                              onReset={() => {
                                patchTemplate(k.kind, { body: null, isCustom: false, updatedAt: null, updatedBy: null })
                                setEditorDirty(false)
                                setOpenKind(null)
                              }}
                            />
                          ) : undefined
                        }
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
