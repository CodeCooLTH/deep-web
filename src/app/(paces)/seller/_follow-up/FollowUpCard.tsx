'use client'

/**
 * FollowUpCard — การ์ด "รายการติดตาม" ชุดเดียวทุกพื้นผิว (00066 UX §0.3)
 * variant: panel (แผงในห้องแชท) · profile (โปรไฟล์ลูกค้า) · board (กระดาน/ชีตวัน) · bubble (งานของฉัน — ✓ อย่างเดียว)
 *
 * Base:
 *  - theme/paces/Admin/TS/src/app/(admin)/apps/projects/kanban/components/TaskItem.tsx (โครง .card border-light + เมนู ⋮ — เฉพาะ board)
 *  - theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (badge bg-{c}/15 text-{c}-ink)
 *  - theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (.btn / .btn-icon)
 *  - theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (.dropdown-item — เมนูขับด้วย React ตาม orders/[token]/components/OrderOverflowMenu.tsx)
 *  - theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTypes.tsx (form-input date/time ในแถว "เลือกเอง")
 *
 * ตัดสินใจที่ควรรู้:
 *  - ทำแล้ว/เลื่อน = "แถวเปิดต่อท้ายในการ์ด" ไม่ใช่ dropdown: แผงอยู่ในกล่อง overflow-y-auto popover absolute โดนตัด
 *    (scroll-container-clips-popovers.md) และผล 4 ค่ากับปุ่มลัด 3 ค่าเห็นครบในการกดเดียว
 *  - เมนู ⋮ ต้อง portal ออกนอกกล่อง overflow (OrderOverflowMenu เป็น absolute อย่างเดียว ใช้ตรง ๆ ในแผงเลื่อนไม่ได้ — UX Q-8)
 *  - ห้ามใช้ breakpoint ของ viewport ใน layout การ์ด (แผง 384px บนจอกว้างจะเข้าใจผิด) → container query (`@container` + `@lg:`)
 *    ยกเว้น min-h-11 lg:min-h-0 ของชิปกด ซึ่งเป็นเรื่องนิ้ว/เมาส์ ไม่ใช่ความกว้างการ์ด (UX §Theme mapping)
 *  - สีเขียวห้ามใช้ทั้งฟีเจอร์ — "ทำแล้ว" ไม่ใช่ verified (UX §0.2)
 */
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/wrappers/Icon'
import AccountAvatar from '@/components/AccountAvatar'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { formatDateTH, formatRelativeDayTime, formatDayMonthTH } from '@/lib/format-date'
import { quickSnooze } from '@/lib/follow-up-time'
import { FOLLOW_UP_OUTCOMES, SNOOZE_PRESETS, type FollowUpOutcome, type SnoozePreset } from '@/lib/follow-up-constants'
import {
  canSetOutcome,
  cardBadges,
  doneButtonIsSolid,
  snoozeDateBounds,
  formatDueLabel,
  needsNoteToggle,
  typeIcon,
  typeLabel,
  validateSnoozeCustom,
  type FollowUpChange,
} from '@/lib/follow-up-view'
import type { Dictionary } from '@/i18n/dictionaries/th'
import type { FollowUpDto } from '@/services/customer-follow-up.service'
import { callFollowUpApi } from './follow-up-client'
import BeDateHint from '@/components/safepay/BeDateHint'

export type FollowUpCardVariant = 'panel' | 'profile' | 'board' | 'bubble'

export interface FollowUpCardProps {
  item: FollowUpDto
  variant: FollowUpCardVariant
  /** การ์ดเรียก API เอง แล้วแจ้งผลเป็น upsert/remove/refresh — ผู้เรียกถือ list เอง */
  onChange: (c: FollowUpChange<FollowUpDto>) => void
  /** เปิดฟอร์มแก้ไข (ฟอร์มอยู่ที่ผู้เรียก) — ไม่ส่ง = ไม่มีเมนู "แก้ไข" */
  onEdit?: (item: FollowUpDto) => void
  /** ทดสอบ/ตรึงเวลา — ไม่ส่ง = เวลาจริง */
  now?: Date
}

type Reveal = null | 'outcome' | 'snooze'
type T = Dictionary['followUps']

const OUTCOME_KEY: Record<FollowUpOutcome, keyof T> = {
  REACHED: 'outcomeReached',
  NO_ANSWER: 'outcomeNoAnswer',
  CALL_LATER: 'outcomeCallLater',
  NOT_INTERESTED: 'outcomeNotInterested',
}
const PRESET_KEY: Record<SnoozePreset, keyof T> = {
  TOMORROW_9: 'snoozeTomorrow',
  IN_3_DAYS: 'snooze3d',
  NEXT_WEEK: 'snoozeWeek',
}

// ชิปกด — พื้นที่นิ้ว 44px บนจอสัมผัส (min-h-11) คืนเป็นชิปเล็กบนเมาส์ (lg:min-h-0)
const CHIP =
  'badge min-h-11 lg:min-h-0 cursor-pointer border border-default-300 bg-card text-default-800 hover:bg-default-100 disabled:opacity-60'

/** เมนู ⋮ — portal + fixed เพื่อไม่ให้โดนตัดโดย overflow ของแผง (ดูหัวไฟล์) */
function RowMenu({
  items,
  label,
}: {
  items: { key: string; icon: string; label: string; danger?: boolean; href?: string; onSelect?: () => void }[]
  label: string
}) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node
      if (!menu.current?.contains(n) && !btn.current?.contains(n)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
        btn.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    // capture: กัน sheet ข้างหลังปิดตามด้วย Esc ตัวเดียวกัน
    window.addEventListener('keydown', onKey, true)
    // เลื่อนกล่องแม่/ย่อจอ = ตำแหน่ง fixed ที่คำนวณไว้เพี้ยน → ปิดดีกว่าลอยผิดที่
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [pos])

  // เปิดเมนู → โฟกัส menuitem แรก (ARIA menu pattern)
  useEffect(() => {
    if (pos) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [pos])

  const onMenuKey = (e: React.KeyboardEvent) => {
    const els = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const i = els.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Tab') {
      // Tab ออกจากเมนู = ปิด + คืนโฟกัสปุ่ม ⋮ (เมนูอยู่ท้าย body ไม่งั้น Tab หลุดไปท้ายหน้า)
      e.preventDefault()
      setPos(null)
      btn.current?.focus()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      const n = els.length
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
      els[next]?.focus()
    }
  }

  const toggle = () => {
    if (pos) return setPos(null)
    const r = btn.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="btn btn-icon min-h-11 min-w-11 text-default-700 hover:bg-default-100 lg:min-h-0 lg:min-w-0"
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        aria-label={label}
        onClick={toggle}
      >
        <Icon icon="dots-vertical" className="text-lg" />
      </button>
      {pos &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            onKeyDown={onMenuKey}
            style={{ top: pos.top, right: pos.right }}
            className="fixed z-80 min-w-44 overflow-hidden rounded border border-default-300 bg-card shadow-lg"
          >
            <div className="space-y-0.5 p-1">
              {items.map((it) =>
                it.href ? (
                  <Link key={it.key} href={it.href} role="menuitem" className="dropdown-item text-sm" onClick={() => setPos(null)}>
                    <Icon icon={it.icon} className="size-4" />
                    {it.label}
                  </Link>
                ) : (
                  <button
                    key={it.key}
                    type="button"
                    role="menuitem"
                    className={`dropdown-item text-sm ${it.danger ? 'text-danger-ink hover:bg-danger/10' : ''}`}
                    onClick={() => {
                      setPos(null)
                      it.onSelect?.()
                    }}
                  >
                    <Icon icon={it.icon} className="size-4" />
                    {it.label}
                  </button>
                ),
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

export default function FollowUpCard({ item, variant, onChange, onEdit, now: nowProp }: FollowUpCardProps) {
  const t = useT().followUps
  const now = nowProp ?? new Date()
  const [reveal, setReveal] = useState<Reveal>(null)
  const [busy, setBusy] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [custom, setCustom] = useState(false)
  const [cDate, setCDate] = useState('')
  const [cTime, setCTime] = useState('09:00')
  const [cAllDay, setCAllDay] = useState(false)
  const [cErr, setCErr] = useState<'errDateRequired' | 'errDateRange' | 'errTimeRequired' | null>(null)
  const outcomeBtn = useRef<HTMLButtonElement>(null)
  const snoozeBtn = useRef<HTMLButtonElement>(null)
  const revealRef = useRef<HTMLDivElement>(null)

  // toast: แผงในห้องแชทเป็นระบบแชท (bottom-right) · พื้นผิวอื่นเป็น action ปกติ (top-right) — HR9
  const notify = variant === 'panel' ? pacesToast.chat : pacesToast
  const isOpen = item.status === 'OPEN'
  const badges = cardBadges(item)
  const dueLabel = formatDueLabel(t, item, now, formatDayMonthTH)
  const snoozeBounds = snoozeDateBounds(now)
  const chatHref = `/inbox/${item.conversationId}`

  // เปิดแถวต่อท้าย → โฟกัสชิปแรก (UX §โฟกัส)
  useEffect(() => {
    if (reveal) revealRef.current?.querySelector<HTMLElement>('button, input')?.focus()
  }, [reveal])

  function closeReveal(returnFocus = true) {
    const which = reveal
    setReveal(null)
    setCustom(false)
    setCErr(null)
    if (returnFocus) (which === 'snooze' ? snoozeBtn : outcomeBtn).current?.focus()
  }

  /** ทุก action ผ่านที่นี่: busy กันกดซ้ำ · 404 = ถูกลบ/เปลี่ยนโดยอีกคน → บอก + ให้ผู้เรียกรีเฟรช */
  async function run(
    url: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body: unknown,
    onOk: (next: FollowUpDto | null) => void,
  ) {
    if (busy) return
    setBusy(true)
    const r = await callFollowUpApi(url, method, body)
    setBusy(false)
    if (r.ok) return onOk(r.item)
    if (r.status === 404 || r.status === 409) {
      notify.error(t.errNotFound)
      return onChange({ kind: 'refresh' })
    }
    notify.error(t.errAction)
  }

  // ปิดทันทีทุกพื้นผิว ไม่ถามผลก่อน — ผลใส่ทีหลังได้ที่ชิปในการ์ดที่ปิดแล้ว (setOutcome)
  const complete = () =>
    run(`/api/follow-ups/${item.id}/complete`, 'POST', { outcome: null }, (next) => {
      setReveal(null)
      if (next) onChange({ kind: 'upsert', item: next })
      notify.success(t.toastDone)
    })

  const setOutcome = (outcome: FollowUpOutcome) =>
    run(`/api/follow-ups/${item.id}/outcome`, 'POST', { outcome }, (next) => {
      setReveal(null)
      if (next) onChange({ kind: 'upsert', item: next })
    })

  const snooze = (body: { preset: SnoozePreset } | { date: string; time: string | null }) =>
    run(`/api/follow-ups/${item.id}/snooze`, 'POST', body, (next) => {
      setReveal(null)
      setCustom(false)
      if (next) {
        onChange({ kind: 'upsert', item: next })
        notify.success(fmt(t.toastSnoozed, { when: formatDueLabel(t, next, new Date(), formatDayMonthTH) }))
      }
    })

  const reopen = () =>
    run(`/api/follow-ups/${item.id}/reopen`, 'POST', {}, (next) => {
      if (next) onChange({ kind: 'upsert', item: next })
      notify.success(t.toastReopened)
    })

  async function remove() {
    const ok = await pacesConfirm.danger(t.deleteTitle, t.deleteBody, {
      confirmButtonText: t.deleteConfirm,
      cancelButtonText: t.deleteCancel,
    })
    if (!ok) return
    await run(`/api/follow-ups/${item.id}`, 'DELETE', undefined, () => {
      onChange({ kind: 'remove', id: item.id })
      notify.success(t.toastDeleted)
    })
  }

  function submitCustom() {
    const err = validateSnoozeCustom(cDate, cTime, cAllDay, now)
    setCErr(err)
    if (!err) void snooze({ date: cDate, time: cAllDay ? null : cTime })
  }

  // ── bubble: ✓ อย่างเดียว ปิดทันทีไม่ถามผล (BRD FR-07) ──
  if (variant === 'bubble') {
    return (
      <div className="flex min-w-0 items-center gap-2 py-2">
        <div className="min-w-0 flex-1">
          <Link href={chatHref} className="text-default-900 block truncate text-sm font-medium hover:text-primary" title={item.title}>
            {item.title}
          </Link>
          <p className="text-default-700 mb-0 truncate text-xs">
            {[item.customerName, dueLabel].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void complete()}
          aria-label={`${t.done}: ${item.title}`}
          title={t.done}
          className="btn btn-icon min-h-11 min-w-11 shrink-0 border border-default-300 text-default-800 hover:bg-default-100"
        >
          <Icon icon="check" className="text-lg" />
        </button>
      </div>
    )
  }

  const isBoard = variant === 'board'
  const menuItems = [
    ...(onEdit ? [{ key: 'edit', icon: 'pencil', label: t.edit, onSelect: () => onEdit(item) }] : []),
    ...(isBoard ? [{ key: 'chat', icon: 'message-circle', label: t.openChat, href: chatHref }] : []),
    { key: 'delete', icon: 'trash', label: t.delete, danger: true, onSelect: () => void remove() },
  ]

  // board: ผู้รับผิดชอบเป็น avatar เล็กท้ายบรรทัดกำหนด (ไม่เป็นแถวแยก) — ชื่ออยู่ใน title/sr-only
  const assigneeChip = item.assigneeRemoved ? (
    <span className="inline-flex items-center gap-1" title={t.assigneeRemoved}>
      <Icon icon="user-off" className="text-sm" />
      <span className="sr-only">{t.assigneeRemoved}</span>
    </span>
  ) : item.assignee ? (
    <span className="inline-flex items-center" title={item.assignee.name}>
      <AccountAvatar src={item.assignee.avatar} kind="personal" className="size-5" />
      <span className="sr-only">{item.assignee.name}</span>
    </span>
  ) : (
    <span>{t.filterUnassigned}</span>
  )

  const outcomeText = item.outcome ? (t[OUTCOME_KEY[item.outcome]] as string) : t.done

  const body = (
    <div
      className="@container min-w-0"
      onKeyDown={(e) => {
        // Esc ปิดแถวต่อท้ายก่อน — stopPropagation กัน sheet/แผงข้างหลังปิดตามด้วยคีย์เดียวกัน
        if (e.key === 'Escape' && reveal) {
          e.stopPropagation()
          closeReveal()
        }
      }}
    >
      <div className="flex min-w-0 flex-col gap-2 @lg:flex-row @lg:items-start @lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <Icon icon={typeIcon(item.type)} className="text-default-700 mt-0.5 shrink-0 text-base" role="img" aria-label={typeLabel(t, item.type)} />
            <div className="min-w-0 flex-1">
              {isBoard ? (
                <Link href={chatHref} className="text-default-900 line-clamp-2 text-sm font-semibold underline-offset-2 hover:text-primary hover:underline" title={item.title}>
                  {item.title}
                </Link>
              ) : (
                <p className="text-default-900 mb-0 line-clamp-2 text-sm font-semibold" title={item.title}>
                  {item.title}
                </p>
              )}
            </div>
            <div className="-me-2 -mt-2 shrink-0 @lg:hidden">
              <RowMenu items={menuItems} label={t.more} />
            </div>
          </div>

          {isOpen ? (
            <p className="text-default-700 mb-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span>{dueLabel}</span>
              {badges.overdue && (
                <span className="badge bg-danger/15 text-danger-ink gap-1">
                  <Icon icon="clock-exclamation" className="text-sm" />
                  {t.badgeOverdue}
                </span>
              )}
              {badges.dueToday && (
                <span className="badge bg-warning/15 text-warning-ink gap-1">
                  <Icon icon="clock" className="text-sm" />
                  {t.badgeDueToday}
                </span>
              )}
              {badges.snoozed !== null && (
                <span className="badge bg-warning/15 text-warning-ink gap-1">
                  <Icon icon="clock-play" className="text-sm" />
                  {fmt(t.badgeSnoozed, { n: badges.snoozed })}
                </span>
              )}
              {isBoard && assigneeChip}
            </p>
          ) : (
            <p className="text-default-700 mb-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="badge bg-default-100 text-default-800 gap-1">
                <Icon icon="check" className="text-sm" />
                {outcomeText}
              </span>
              <span>{fmt(t.closedBy, { name: item.doneBy?.name ?? '—', time: formatRelativeDayTime(item.doneAt) })}</span>
            </p>
          )}

          {/* ผู้รับผิดชอบ = แถวของตัวเอง (ไม่ปนกับป้าย) — board ยุบไปอยู่บรรทัดกำหนดแล้ว (เฉพาะรายการที่เปิดอยู่) */}
          {(!isBoard || !isOpen) && (
          <p className="text-default-700 mb-0 mt-1 flex min-w-0 items-center gap-1.5 text-xs">
            {item.assigneeRemoved ? (
              <>
                <Icon icon="user-off" className="shrink-0 text-sm" />
                <span className="truncate">{t.assigneeRemoved}</span>
              </>
            ) : item.assignee ? (
              <>
                <AccountAvatar src={item.assignee.avatar} kind="personal" className="size-5" />
                <span className="truncate">{item.assignee.name}</span>
              </>
            ) : (
              <span className="truncate">{t.filterUnassigned}</span>
            )}
          </p>
          )}

          {isBoard && item.customerName && (
            <p className="text-default-800 mb-0 mt-1 flex min-w-0 items-center gap-1.5 text-xs">
              <AccountAvatar src={item.customerAvatar} kind="personal" className="size-5" />
              <span className="truncate">{item.customerName}</span>
            </p>
          )}

          {item.room && !isBoard && (
            <p className="mb-0 mt-1 min-w-0 text-xs">
              <Link href={`/inbox/${item.room.id}`} className="text-default-700 inline-block max-w-full truncate hover:text-primary">
                {fmt(t.fromRoom, { room: item.room.label })}
              </Link>
            </p>
          )}

          {item.note && (
            <div className="mt-1">
              <p className={`text-default-800 mb-0 whitespace-pre-line break-words text-sm ${noteOpen ? '' : 'line-clamp-2'}`}>{item.note}</p>
              {needsNoteToggle(item.note) && (
                <button
                  type="button"
                  onClick={() => setNoteOpen((o) => !o)}
                  aria-expanded={noteOpen}
                  className="text-primary-ink hover:bg-primary/10 -ms-2 flex min-h-11 items-center rounded-lg px-2 text-xs font-medium lg:min-h-0"
                >
                  {noteOpen ? t.noteLess : t.noteMore}
                </button>
              )}
            </div>
          )}
        </div>

        {/* แถวปุ่ม — ทำแล้ว = ปุ่มหลักเดียว (ทึบเฉพาะเลยกำหนด) · เลื่อน = outline */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isOpen ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void complete()}
                className={`btn min-h-11 gap-1 lg:min-h-0 ${
                  doneButtonIsSolid(item)
                    ? 'bg-primary text-white hover:bg-primary-hover'
                    : 'border border-default-300 text-default-800 hover:bg-default-100'
                }`}
              >
                <Icon icon="check" className="text-base" />
                {t.done}
              </button>
              <button
                ref={snoozeBtn}
                type="button"
                disabled={busy}
                aria-expanded={reveal === 'snooze'}
                onClick={() => (reveal === 'snooze' ? closeReveal() : setReveal('snooze'))}
                className="btn min-h-11 gap-1 border border-default-300 text-default-800 hover:bg-default-100 lg:min-h-0"
              >
                <Icon icon="clock-play" className="text-base" />
                {t.snooze}
              </button>
            </>
          ) : (
            <>
              {canSetOutcome(item) && (
                <button
                  ref={outcomeBtn}
                  type="button"
                  disabled={busy}
                  aria-expanded={reveal === 'outcome'}
                  onClick={() => (reveal === 'outcome' ? closeReveal() : setReveal('outcome'))}
                  className="btn min-h-11 border border-default-300 text-default-800 hover:bg-default-100 lg:min-h-0"
                >
                  {t.outcomeSet}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void reopen()}
                className="btn min-h-11 border border-default-300 text-default-800 hover:bg-default-100 lg:min-h-0"
              >
                {t.reopen}
              </button>
            </>
          )}
          <div className="hidden @lg:block">
            <RowMenu items={menuItems} label={t.more} />
          </div>
        </div>
      </div>

      {reveal === 'outcome' && (
        <div ref={revealRef} className="border-default-200 mt-3 border-t border-dashed pt-3">
          <p className="text-default-800 mb-2 text-xs font-medium">{t.outcomePrompt}</p>
          <div className="flex flex-wrap gap-2">
            {FOLLOW_UP_OUTCOMES.map((o) => (
              <button key={o} type="button" disabled={busy} className={CHIP} onClick={() => void setOutcome(o)}>
                {t[OUTCOME_KEY[o]] as string}
              </button>
            ))}
            <button type="button" className="text-default-700 hover:bg-default-100 badge min-h-11 lg:min-h-0" onClick={() => closeReveal()}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {reveal === 'snooze' && (
        <div ref={revealRef} className="border-default-200 mt-3 border-t border-dashed pt-3">
          <p className="text-default-800 mb-2 text-xs font-medium">{t.snoozeTitle}</p>
          <div className="flex flex-wrap gap-2">
            {SNOOZE_PRESETS.map((p) => {
              // แสดงวันที่จริงในชิป (server คำนวณค่าจริงด้วยฟังก์ชันเดียวกัน — เวลาไทยตายตัว BR-ACT-12)
              const label = `${t[PRESET_KEY[p]] as string} · ${formatDayMonthTH(quickSnooze(p, now).dueAt)}`
              return (
                <button key={p} type="button" disabled={busy} className={CHIP} onClick={() => void snooze({ preset: p })}>
                  {label}
                </button>
              )
            })}
            <button type="button" disabled={busy} aria-expanded={custom} className={CHIP} onClick={() => setCustom((c) => !c)}>
              {t.snoozeCustom}
              <Icon icon="chevron-down" className="ms-1 text-sm" />
            </button>
            <button type="button" className="text-default-700 hover:bg-default-100 badge min-h-11 lg:min-h-0" onClick={() => closeReveal()}>
              {t.cancel}
            </button>
          </div>
          {custom && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
                <div>
                  <label className="form-label mb-1 text-xs" htmlFor={`${item.id}-cd`}>
                    {t.fieldDate}
                  </label>
                  <input
                    id={`${item.id}-cd`}
                    type="date"
                    className={`form-input ${cErr === 'errDateRequired' || cErr === 'errDateRange' ? 'is-invalid' : ''}`}
                    value={cDate}
                    min={snoozeBounds.min}
                    max={snoozeBounds.max}
                    aria-invalid={cErr === 'errDateRequired' || cErr === 'errDateRange'}
                    aria-describedby={cErr ? `${item.id}-ce ${item.id}-cd-be` : `${item.id}-cd-be`}
                    onChange={(e) => setCDate(e.target.value)}
                  />
                  <BeDateHint id={`${item.id}-cd-be`} value={cDate} />
                </div>
                <div>
                  <label className="form-label mb-1 text-xs" htmlFor={`${item.id}-ct`}>
                    {t.fieldTime}
                  </label>
                  <input
                    id={`${item.id}-ct`}
                    type="time"
                    className={`form-input ${cErr === 'errTimeRequired' ? 'is-invalid' : ''}`}
                    value={cTime}
                    disabled={cAllDay}
                    aria-invalid={cErr === 'errTimeRequired'}
                    aria-describedby={cErr ? `${item.id}-ce` : undefined}
                    onChange={(e) => setCTime(e.target.value)}
                  />
                </div>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm lg:min-h-0">
                <input type="checkbox" className="form-checkbox" checked={cAllDay} onChange={(e) => setCAllDay(e.target.checked)} />
                {t.fieldAllDay}
              </label>
              {cErr && (
                <p id={`${item.id}-ce`} role="alert" className="text-danger-ink mb-0 text-xs">
                  {cErr === 'errDateRange'
                    ? fmt(t.errDateRange, { from: formatDateTH(snoozeBounds.min), to: formatDateTH(snoozeBounds.max) })
                    : t[cErr]}
                </p>
              )}
              <button type="button" disabled={busy} onClick={submitCustom} className="btn bg-primary min-h-11 text-white hover:bg-primary-hover lg:min-h-0">
                {t.snooze}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )

  // board = .card ตาม TaskItem · panel/profile = แถวแบ่งเส้น (ห้ามการ์ดซ้อนการ์ด)
  return isBoard ? (
    <div className="card border-light border">
      <div className="card-body p-4">{body}</div>
    </div>
  ) : (
    <div className="border-default-200 border-b py-3 last:border-b-0">{body}</div>
  )
}
