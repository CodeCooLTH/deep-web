'use client'

/**
 * CapiChatLine — บรรทัดเทากลางห้อง "ส่ง event ให้ Meta" + โมดัลรายการ (ผู้ใช้สั่ง 2026-11-17: เลิกกล่องกางในบรรทัด) (feature 00097 · UX-Design-Spec §1)
 * ไม่ใช่ฟอง/ไม่ใช่ข้อความ: ไม่มีพื้น กรอบ หรือ accent — สีมีแค่คำผล · ลูกค้าไม่เห็น
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ChatPage.tsx (แถว my-5) ผ่านพี่น้อง FollowBotNoteLine.tsx / META_NOTICE ใน ThreadMessageList.tsx
 *   โมดัล = theme .../ui/modals/page.tsx (controlled + portal เพราะ Preline พังเมื่อ re-render) ท่าเดียวกับ ChannelPicker ใน sales-follow-bot/ChannelSection.tsx
 */
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { CAPI_STATUS_ICON, CAPI_STATUS_TEXT } from '@/components/safepay/capi-status-view'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { formatDayMonthTimeTH, formatTimeHM } from '@/lib/format-date'
import { capiGroupResult, capiLineSummary, type CapiDatasetResult, type CapiLineGroup, type CapiStatus } from '@/lib/meta-capi/chat-lines'
import { cn } from '@/utils/helpers'

import { formatBaht } from '@/lib/format-money'
const money = (n: number) => `${formatBaht(n)}`

type Props = {
  groups: CapiLineGroup[]
  conversationId: string
  /** null = เพจถูกถอดการเชื่อม → ไม่มีลิงก์ไปบันทึกการส่ง */
  channelId: string | null
  /** เพจหยุดส่งทั้งหมด — ชุดที่รอไม่ต่อเหตุผล "รอเชื่อมเพจใหม่" (แถบหัวห้องบอกอยู่แล้ว) */
  pageStopped: boolean
}

export default function CapiChatLine({ groups, conversationId, channelId, pageStopped }: Props) {
  const t = useT().conversionsApi
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const btnRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const close = () => {
    setOpen(false)
    btnRef.current?.focus()
  }
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })
  useLockBodyScroll(open)
  // โมดัล: โฟกัสเข้าปุ่มปิด · Escape ปิด · Tab วนในโมดัล
  useEffect(() => {
    if (!open) return
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
      if (e.key !== 'Tab') return
      const els = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href]') ?? [])
      if (els.length === 0) return
      const a = els[0]
      const z = els[els.length - 1]
      if (!dialogRef.current?.contains(document.activeElement) || (e.shiftKey && document.activeElement === a)) {
        e.preventDefault()
        z.focus()
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault()
        a.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  const sum = capiLineSummary(groups)
  const single = groups.length === 1 ? groups[0] : null
  const eventLabel = (k: string) => t.events[k as keyof typeof t.events]?.label ?? k
  const dsName = (d: CapiDatasetResult) => d.label?.trim() || `Dataset ${d.datasetId}`

  // ยังไม่เคยยิงเลย (queued ทุกชุด) = แถว "กำลังส่ง…" ไม่มีปุ่ม/ผล
  if (sum.sending) {
    return (
      <div className="my-5 px-4 text-center">
        <p className="text-default-500 mb-0 text-xs">
          <Icon icon="loader-2" className="me-1 inline size-3.5 animate-spin align-text-bottom motion-reduce:animate-none" aria-hidden="true" />
          {single ? fmt(t.chatLineSending, { label: eventLabel(single.eventKey) }) : fmt(t.chatGroupSending, { n: groups.length })}
        </p>
      </div>
    )
  }

  const one = single ? capiGroupResult(single) : null
  // ผลสั้นของบรรทัด: ชุดเดียว/สถานะเดียวกัน = คำสถานะ · ไม่เท่ากัน = "Meta รับแล้ว {ok} จาก {n}" (นับชุดข้อมูลของเหตุการณ์เดียว / นับเหตุการณ์ของบรรทัดรวม)
  const status: CapiStatus = one ? one.worst : sum.worst
  const resultText = one
    ? one.kind === 'uniform'
      ? t.logStatus[one.status as CapiStatus]
      : fmt(t.chatGroupPartial, { ok: one.okCount, n: one.total })
    : sum.allReceived
      ? t.chatGroupAllReceived
      : fmt(t.chatGroupPartial, { ok: sum.okCount, n: sum.total })
  const reasonKey = one?.kind === 'uniform' ? one.shortReasonKey : null
  const attempts = single?.datasets[0]?.attempts ?? 1
  // queued/none ไม่มีเหตุผลสั้น (queued ทั้งกลุ่มเป็นแถว sending ไปแล้ว)
  const shortReason = reasonKey && reasonKey !== 'none' && reasonKey !== 'queued' && !(pageStopped && reasonKey === 'waitToken') ? fmt(t.logReasonShort[reasonKey], { n: Math.min(Math.max(attempts, 1), 3) }) : ''
  const failed = status === 'FAILED'
  const first = groups[0]

  const datasetList = (ds: CapiDatasetResult[]) => (
    <ul className="mb-0 list-none space-y-2 p-0">
      {ds.map((d) => (
        <li key={d.datasetId} className="flex items-start gap-2">
          <Icon icon={CAPI_STATUS_ICON[d.status]} className={cn('size-4 shrink-0', CAPI_STATUS_TEXT[d.status])} aria-hidden="true" />
          <span className="min-w-0">
            <span className="text-default-800 block font-medium break-words">{dsName(d)}</span>
            <span className="text-default-700 block">
              {d.status === 'SENT' && d.sentAt
                ? fmt(t.logSentAt, { date: formatDayMonthTimeTH(d.sentAt) })
                : [t.logStatus[d.status], d.reasonKey !== 'none' ? fmt(t.logReason[d.reasonKey], { n: Math.min(Math.max(d.attempts, 1), 3) }) : ''].filter(Boolean).join(' · ')}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="my-5 px-4 text-center">
      <button
        type="button"
        ref={btnRef}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="text-default-600 hover:bg-default-100 focus-visible:ring-primary inline-flex min-h-11 max-w-full flex-wrap items-center justify-center gap-x-1 rounded px-2 py-1 text-xs focus-visible:ring-2 lg:min-h-8"
      >
        <Icon icon="brand-meta" className="size-3.5 align-text-bottom" aria-hidden="true" />
        <span>{single ? fmt(t.chatLine, { label: eventLabel(single.eventKey) }) : fmt(t.chatGroupLine, { n: groups.length })}</span>
        {single?.value != null && (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-default-700 whitespace-nowrap tabular-nums">{money(single.value)}</span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{formatTimeHM(first.at)}</span>
        <span aria-hidden="true">·</span>
        <span className="whitespace-nowrap">
          <Icon icon={CAPI_STATUS_ICON[status]} className={cn('me-0.5 inline size-3.5 align-text-bottom', CAPI_STATUS_TEXT[status])} aria-hidden="true" />
          <span className={CAPI_STATUS_TEXT[status]}>{resultText}</span>
          {shortReason && <span className={failed ? 'text-danger-ink' : 'text-default-600'}> · {shortReason}</span>}
          <Icon icon="info-circle" className="ms-0.5 inline size-3.5 align-text-bottom" aria-hidden="true" />
        </span>
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-80 flex items-end justify-center sm:items-center sm:p-4">
            <div className="bg-dark/45 absolute inset-0" onClick={close} aria-hidden="true" />
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="bg-card relative flex max-h-5/6 w-full flex-col rounded-t-2xl text-start shadow-lg sm:max-w-md sm:rounded-2xl"
            >
              <div className="border-default-200 flex items-center gap-2 border-b px-4 py-2">
                <h3 id={titleId} className="text-default-900 flex-1 text-base font-semibold">
                  {fmt(t.chatModalTitle, { n: groups.length, date: formatDayMonthTimeTH(first.at) })}
                </h3>
                <button type="button" onClick={close} aria-label={t.close} className="btn btn-icon text-default-700 hover:bg-default-100 size-11">
                  <Icon icon="x" className="size-5" aria-hidden="true" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
                {groups.map((g, i) => {
                  const r = capiGroupResult(g)
                  return (
                    <div key={g.id} className={i > 0 ? 'border-default-200 mt-3 border-t pt-3' : undefined}>
                      <p className="text-default-900 mb-1 font-medium">
                        {eventLabel(g.eventKey)} · <span className="tabular-nums">{formatTimeHM(g.at)}</span>
                        {g.value != null && <span className="text-default-700 font-normal tabular-nums"> · {money(g.value)}</span>}
                      </p>
                      {/* แตกรายชุดเฉพาะเหตุการณ์ที่ผลไม่เท่ากัน — เท่ากันทุกชุดสรุปบรรทัดเดียว */}
                      {r.kind === 'mixed' || r.kind === 'sending' ? (
                        datasetList(g.datasets)
                      ) : (
                        <p className="mb-0 flex items-start gap-2">
                          <Icon icon={CAPI_STATUS_ICON[r.worst]} className={cn('size-4 shrink-0', CAPI_STATUS_TEXT[r.worst])} aria-hidden="true" />
                          <span className="text-default-700">
                            {r.status === 'SENT' && r.sentAt
                              ? fmt(t.logSentAt, { date: formatDayMonthTimeTH(r.sentAt) })
                              : [t.logStatus[r.worst], g.datasets[0].reasonKey !== 'none' ? fmt(t.logReason[g.datasets[0].reasonKey], { n: Math.min(Math.max(g.datasets[0].attempts, 1), 3) }) : ''].filter(Boolean).join(' · ')}
                          </span>
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="border-default-200 flex items-center justify-between gap-2 border-t px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
                {channelId ? (
                  <Link
                    href={`/settings/capis/${channelId}/log?conversation=${conversationId}`}
                    className="text-primary-ink inline-flex min-h-11 items-center gap-0.5 text-sm font-medium hover:underline lg:min-h-0"
                  >
                    {t.openLog}
                    <Icon icon="chevron-right" className="size-3.5" aria-hidden="true" />
                  </Link>
                ) : (
                  <span />
                )}
                <button type="button" onClick={close} className="btn border-default-300 text-default-900 hover:bg-default-100 min-h-11 border lg:min-h-0">
                  {t.close}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
