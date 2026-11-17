'use client'

/**
 * ChannelSection — ② "ช่องทางที่ติดตาม": ช่องที่เลือกเป็นพิล (รูปเพจ + ไอคอนแพลตฟอร์ม + "ชื่อ · แพลตฟอร์ม" + ×) แล้วปุ่ม "เพิ่มช่องทาง" เปิดโมดัลเลือกจากรายการทั้งหมดจัดกลุ่มตามเพจ
 * (ผู้ใช้สั่ง 2026-11-17: การ์ดสวิตช์หลุดธีม → พิล + โมดัล) · cancel = ทิ้งที่ติ๊กไว้ · ตกลง = ใช้ผลทั้งชุดผ่าน onToggle ตัวเดิม
 * ช่องที่ชน (findChannelConflicts ตัวเดียวกับ server · คำนวณสดตามสถานะการขายที่เลือก): ในโมดัลล็อก + lock + "บอท “…” ใช้ช่องทางนี้อยู่" (AC-FB-20)
 * ช่องที่เลือกไว้แล้วกลับกลายเป็นชน = ข้อความแดงใต้พิล · ช่องที่หลุดเลือกได้เหมือนเดิม พิลสีเหลืองอำพัน + ลิงก์เชื่อมใหม่
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx (โครง modal: header/body/footer · controlled + portal เพราะ Preline พังเมื่อ re-render)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (พิล rounded-full) + .../form/elements/components/ChecksRadioSwitches.tsx (form-checkbox)
 *   + src/app/(paces)/seller/(dashboard)/settings/channels/ChannelsClient.tsx (รูปเพจ + ชื่อ + ชนิดช่องทาง)
 */
import Link from 'next/link'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { getChannelDisplay } from '@/app/(paces)/seller/(chat)/inbox/components/ChannelBadge'
import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { channelPillLabel, channelRowState, filterChannelGroups, groupChannelsByPage } from '@/lib/sales-follow-bot/ui'
import type { BotOptions } from '@/services/sales-follow-bot.service'
import { AvatarWithPlatform } from './sfb-ui'

type ChannelOpt = BotOptions['channels'][number]
type Conflicts = ReadonlyMap<string, { botId: string; botName: string }>

const PLATFORM = {
  MESSENGER: { key: 'platMessenger' },
  INSTAGRAM: { key: 'platInstagram' },
  LINE: { key: 'platLine' },
} as const

/** เกิน 6 ช่อง = มีช่องค้นหา */
const SEARCH_FROM = 6

export default function ChannelSection({
  channels,
  selected,
  conflicts,
  onToggle,
  error,
}: {
  channels: readonly ChannelOpt[]
  selected: readonly string[]
  conflicts: Conflicts
  onToggle: (id: string, on: boolean) => void
  error: string | null
}) {
  const t = useT().salesFollowBot
  const [open, setOpen] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)
  const hasLine = channels.some((c) => c.provider === 'LINE' && selected.includes(c.id))

  if (channels.length === 0)
    return (
      <p className="text-default-700 text-sm">
        {t.noChannelsInForm}{' '}
        <Link href="/settings/channels" className="text-primary-ink inline-flex min-h-11 items-center font-medium underline lg:min-h-0">
          {t.goConnect}
        </Link>
      </p>
    )

  const picked = channels.filter((c) => selected.includes(c.id))
  const platName = (c: ChannelOpt) => {
    const pf = PLATFORM[c.provider as keyof typeof PLATFORM]
    return pf ? t[pf.key] : c.provider
  }

  return (
    <div id="sfb-ch">
      {picked.length === 0 ? (
        <p className="text-default-700 mb-2 text-sm">{t.channelNone}</p>
      ) : (
        <ul className="mb-2 flex flex-wrap gap-2">
          {picked.map((c) => {
            const dead = c.status !== 'ACTIVE'
            const label = channelPillLabel(c.name, platName(c))
            return (
              <li key={c.id} className="flex max-w-full min-w-0 flex-col gap-0.5">
                <span
                  className={`flex max-w-full min-w-0 items-center gap-2 rounded-full border py-1 ps-1 pe-1 text-sm ${dead ? 'border-warning bg-warning/15 text-warning-ink' : 'border-default-300 bg-card text-default-900'}`}
                >
                  <AvatarWithPlatform imageUrl={c.avatarUrl} name={c.name} provider={c.provider} className="size-6" badge="sm" />
                  <span className="min-w-0 truncate font-medium">{label}</span>
                  {dead && (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium">
                      <Icon icon="alert-triangle" aria-hidden="true" />
                      {t.channelDisconnected}
                    </span>
                  )}
                  {/* พื้นที่นิ้ว 44px บนมือถือด้วย size-11 + margin ลบ — ก้อนพิลยังเตี้ย (audit §17) */}
                  <button
                    type="button"
                    onClick={() => onToggle(c.id, false)}
                    aria-label={fmt(t.channelRemove, { name: label })}
                    className="hover:bg-default-100 focus-visible:ring-primary -my-2.5 -me-1 flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 lg:m-0 lg:size-6"
                  >
                    <Icon icon="x" className="size-4" aria-hidden="true" />
                  </button>
                </span>
                {dead && (
                  <Link href="/settings/channels" className="text-primary-ink -my-2 inline-flex min-h-11 items-center ps-3 text-xs font-medium underline lg:my-0 lg:min-h-0">
                    {t.channelReconnect}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {picked.map((c) => {
        const clash = conflicts.get(c.id)
        if (!clash) return null
        const [pre, post] = t.channelConflictErr.split('{bot}')
        return (
          <p key={c.id} id={`sfb-ch-clash-${c.id}`} role="alert" className="text-danger-ink mb-1 text-xs">
            {c.name} · {platName(c)}: {pre}
            <BotLink id={clash.botId} name={clash.botName} />
            {post}
          </p>
        )
      })}
      <button
        ref={addRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-describedby={error ? 'sfb-ch-err' : undefined}
        className="btn border-default-300 text-default-900 hover:bg-default-100 min-h-11 border lg:min-h-0"
      >
        <Icon icon="plus" aria-hidden="true" />
        {t.channelAdd}
      </button>
      {hasLine && (
        <p className="bg-info/15 text-info-ink mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
          <Icon icon="info-circle" className="mt-0.5 shrink-0" aria-hidden="true" />
          {t.lineQuotaNote}
        </p>
      )}
      {error && (
        <p id="sfb-ch-err" role="alert" className="text-danger-ink mt-2 flex items-start gap-1 text-xs">
          <Icon icon="alert-circle" className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {open && (
        <ChannelPicker
          channels={channels}
          selected={selected}
          conflicts={conflicts}
          platName={platName}
          onCancel={() => {
            setOpen(false)
            addRef.current?.focus()
          }}
          onApply={(next) => {
            for (const c of channels) {
              const was = selected.includes(c.id)
              const now = next.has(c.id)
              if (was !== now) onToggle(c.id, now)
            }
            setOpen(false)
            addRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}

/** โมดัลเลือกช่องทาง — portal ไป body (ไม่โดน overflow ตัด) · มือถือเป็น bottom sheet · focus trap + Escape + ล็อก scroll */
function ChannelPicker({
  channels,
  selected,
  conflicts,
  platName,
  onCancel,
  onApply,
}: {
  channels: readonly ChannelOpt[]
  selected: readonly string[]
  conflicts: Conflicts
  platName: (c: ChannelOpt) => string
  onCancel: () => void
  onApply: (next: ReadonlySet<string>) => void
}) {
  const t = useT().salesFollowBot
  const titleId = useId()
  const [draft, setDraft] = useState<ReadonlySet<string>>(() => new Set(selected))
  const [q, setQ] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCancelRef = useRef(onCancel)
  useLockBodyScroll(true)
  useEffect(() => {
    onCancelRef.current = onCancel
  })

  useEffect(() => {
    const first = dialogRef.current?.querySelector<HTMLElement>('input:not([disabled]), button')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelRef.current()
      if (e.key !== 'Tab') return
      const els = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled])') ?? [])
      if (els.length === 0) return
      const a = els[0]
      const z = els[els.length - 1]
      const inside = dialogRef.current?.contains(document.activeElement)
      if (!inside || (e.shiftKey && document.activeElement === a)) {
        e.preventDefault()
        z.focus()
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault()
        a.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const groups = useMemo(() => filterChannelGroups(groupChannelsByPage(channels), q), [channels, q])
  const added = [...draft].filter((id) => !selected.includes(id)).length

  return createPortal(
    <div className="fixed inset-0 z-80 flex items-end justify-center sm:items-center sm:p-4">
      <div className="bg-dark/45 absolute inset-0" onClick={onCancel} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-card relative flex max-h-5/6 w-full flex-col rounded-t-2xl shadow-lg sm:max-w-lg sm:rounded-2xl"
      >
        <div className="border-default-200 flex items-center gap-2 border-b px-4 py-2">
          <h3 id={titleId} className="text-default-900 flex-1 text-base font-semibold">
            {t.channelPickTitle}
          </h3>
          <button type="button" onClick={onCancel} aria-label={t.close} className="btn btn-icon text-default-700 hover:bg-default-100 size-11">
            <Icon icon="x" className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {channels.length > SEARCH_FROM && (
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} className="form-input mb-3" placeholder={t.channelSearch} aria-label={t.channelSearch} />
          )}
          {groups.length === 0 && <p className="text-default-700 py-4 text-center text-sm">{t.channelNoMatch}</p>}
          <ul className="flex flex-col gap-3">
            {groups.map((g) => (
              <li key={g.key} className="border-default-200 overflow-hidden rounded-lg border">
                <div className="border-default-200 flex items-center gap-2 border-b px-3 py-2">
                  <AvatarWithPlatform imageUrl={g.avatarUrl} name={g.name} provider={g.channels[0].provider} className="size-8" badge="none" />
                  <span className="text-default-900 min-w-0 flex-1 truncate text-sm font-semibold">{g.name}</span>
                </div>
                <ul>
                  {g.channels.map((c) => {
                    const checked = draft.has(c.id)
                    const clash = conflicts.get(c.id)
                    const locked = channelRowState({ checked, clashed: !!clash }) === 'locked'
                    const dead = c.status !== 'ACTIVE'
                    const logo = getChannelDisplay(c.provider).logoSrc
                    const noteId = `${titleId}-n-${c.id}`
                    const inner = (
                      <>
                        {logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logo} alt="" className={`size-6 shrink-0 rounded ${dead ? 'grayscale' : ''}`} />
                        ) : (
                          <Icon icon="message" className="size-6 shrink-0" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="text-default-900 block truncate text-sm font-medium">
                            {platName(c)}
                            {c.handle && <span className="text-default-700 font-normal"> · {c.handle}</span>}
                          </span>
                          {dead && <span className="badge bg-warning/15 text-warning-ink mt-0.5 text-xs">{t.channelDisconnected}</span>}
                          {locked && clash && (
                            <span id={noteId} className="text-default-700 block text-xs">
                              {t.channelTakenBy} <BotLink id={clash.botId} name={clash.botName} /> {t.channelTakenBySuffix}
                            </span>
                          )}
                        </span>
                      </>
                    )
                    return (
                      <li key={c.id} className="border-default-200 border-b last:border-b-0">
                        {locked ? (
                          <div className="flex min-h-11 items-center gap-3 px-3 py-2">
                            {inner}
                            <input type="checkbox" className="form-checkbox shrink-0" disabled checked={false} readOnly aria-describedby={noteId} aria-label={`${g.name} · ${platName(c)}`} />
                            <Icon icon="lock" className="text-default-700 size-5 shrink-0" aria-hidden="true" />
                          </div>
                        ) : (
                          <label className="has-focus-visible:ring-primary hover:bg-default-100 flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 has-focus-visible:ring-2 has-focus-visible:ring-inset">
                            {inner}
                            <input
                              type="checkbox"
                              className="form-checkbox shrink-0"
                              checked={checked}
                              onChange={(e) =>
                                setDraft((p) => {
                                  const n = new Set(p)
                                  if (e.target.checked) n.add(c.id)
                                  else n.delete(c.id)
                                  return n
                                })
                              }
                            />
                          </label>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
          {channels.some((c) => c.provider === 'LINE' && draft.has(c.id)) && (
            <p className="bg-info/15 text-info-ink mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
              <Icon icon="info-circle" className="mt-0.5 shrink-0" aria-hidden="true" />
              {t.lineQuotaNote}
            </p>
          )}
        </div>
        <div className="border-default-200 flex justify-end gap-2 border-t px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
          <button type="button" onClick={onCancel} className="btn border-default-300 text-default-900 hover:bg-default-100 min-h-11 border lg:min-h-0">
            {t.channelCancel}
          </button>
          <button type="button" onClick={() => onApply(draft)} className="btn bg-primary hover:bg-primary-hover min-h-11 text-white lg:min-h-0">
            {added > 0 ? fmt(t.channelAddN, { n: added }) : t.channelApply}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** ลิงก์ไปบอทที่ครองช่อง — พื้นที่กด ≥44px บนมือถือด้วย min-h-11 + padding (แยกพื้นที่นิ้วกับก้อนสี · audit §17) */
function BotLink({ id, name }: { id: string; name: string }) {
  return (
    <Link href={`/settings/sales-follow-bot/${id}`} className="text-primary-ink -my-2 inline-flex min-h-11 items-center px-1 font-medium underline lg:my-0 lg:min-h-0">
      “{name}”
    </Link>
  )
}
