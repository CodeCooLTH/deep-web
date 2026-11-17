'use client'

/**
 * ChatPreview — "ตัวอย่างที่ลูกค้าเห็น": กรอบมือถือ + ตัวคั่นเวลา + ฟองข้อความของทุกรอบ + ป้าย "บอทติดตาม n/N" เหนือฟองแรกของรอบ (mockup ส่วน 3 / 3b)
 * ไม่ใส่ข้อความลูกค้าสมมติ — แสดงเฉพาะสิ่งที่ระบบส่งจริง (buildStepBubbles ตัวเดียวกับตัวส่ง ผ่าน previewRounds) · ป้าย/ตัวคั่นเห็นเฉพาะฝั่งร้าน
 * มือถือ: เปิดเป็น sheet จากปุ่ม "ดูตัวอย่าง" ในแถบบันทึก (PreviewSheet)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (card-header/card-body/card-footer)
 *   + src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ThreadMessageList.tsx (บับเบิลฝั่งร้าน `rounded px-6 py-3 bg-primary text-white` · ป้ายเกยขอบ "ส่งโดยระบบ")
 *   theme: theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx (badge) · .../ui/offcanvas/page.tsx (แผงเลื่อนขึ้นจากขอบล่างบนมือถือ)
 */
import { useEffect, useRef } from 'react'

import Icon from '@/components/wrappers/Icon'
import { fmt } from '@/i18n/fmt'
import { useT } from '@/i18n/LocaleProvider'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { FINAL_KEY, finalDelayOf, formatDuration, previewRounds, type Draft, type QuickMessageLite } from '@/lib/sales-follow-bot/ui'
import { AvatarWithPlatform, FileThumb, useDurationWords } from './sfb-ui'

export interface PreviewChannel {
  name: string
  provider: string
  avatarUrl: string | null
}

function ChatBody({ draft, quick, channel }: { draft: Draft; quick: ReadonlyMap<string, QuickMessageLite>; channel: PreviewChannel | null }) {
  const t = useT().salesFollowBot
  const words = useDurationWords()
  const rounds = previewRounds(draft, quick, t.previewSampleName)
  const total = rounds.length

  return (
    <div>
      <div className="border-default-200 flex items-center gap-2 border-b pb-2">
        <AvatarWithPlatform imageUrl={channel?.avatarUrl ?? null} name={channel?.name ?? t.previewPageName} provider={channel?.provider ?? 'MESSENGER'} className="size-8" badge="sm" />
        <span className="text-default-900 min-w-0 truncate text-sm font-semibold">{channel?.name ?? t.previewPageName}</span>
      </div>
      <div className="flex flex-col gap-2 pt-2">
        {rounds.map((r) => {
          const wait = formatDuration(r.delayMin, words)
          let shownBadge = false
          return (
            <div key={r.index} className="flex flex-col gap-2">
              <p className="text-default-700 flex items-center justify-center gap-1 text-center text-xs">
                <Icon icon="clock" aria-hidden="true" />
                {r.index === 0 ? fmt(t.previewWaitFirst, { d: `${wait} ` }) : fmt(t.previewWaitNext, { d: wait })}
              </p>
              {r.adOnly && (
                <span className="block text-center">
                  <span className="badge bg-warning/15 text-warning-ink text-xs">
                    <Icon icon="speakerphone" aria-hidden="true" />
                    {t.previewAdOnly}
                  </span>
                </span>
              )}
              {r.empty && r.bubbles.length === 0 && (
                <p className="text-default-700 text-end text-xs">{fmt(t.previewGhost, { n: r.index + 1 })}</p>
              )}
              {r.bubbles.map((b, k) => {
                if (b.type === 'GONE') return <p key={k} className="text-default-700 text-end text-2xs italic">{t.previewSkipped}</p>
                // ป้ายอยู่บรรทัดของตัวเองเหนือฟอง (ไม่เกยทับข้อความ) เฉพาะฟองแรกของรอบ (รูป/ข้อความสำเร็จรูปเป็นฟองถัดไปในรอบเดียวกัน)
                const withBadge = !shownBadge
                shownBadge = true
                const title = fmt(t.previewBadgeTitle, { n: r.index + 1, total })
                const text = b.type === 'TEXT' || b.type === 'QUICK' ? b.text : null
                return (
                  <div key={k} className="flex justify-end">
                    <div className="flex min-w-0 max-w-96 flex-col items-end gap-1">
                      {withBadge && (
                        <span
                          title={title}
                          className="border-default-300 bg-card text-default-700 text-2xs inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium whitespace-nowrap"
                        >
                          <Icon icon="target-arrow" aria-hidden="true" />
                          {t.previewBadge} <span className="font-semibold tabular-nums">{r.index + 1}/{total}</span>
                          <span className="sr-only">{title}</span>
                        </span>
                      )}
                      {text !== null && <div className="bg-primary rounded px-4 py-2 text-sm break-words whitespace-pre-wrap text-white">{text}</div>}
                      {b.type === 'IMAGES' && (
                        <div className={`grid justify-end gap-1 ${b.fileIds.length > 1 ? 'w-56 grid-cols-2' : 'w-36 grid-cols-1'}`}>
                          {b.fileIds.map((id) => (
                            <FileThumb key={id} fileId={id} alt="" className="bg-default-200 h-26 w-full rounded object-cover" />
                          ))}
                        </div>
                      )}
                      {b.type === 'QUICK' && b.imageCount > 0 && (
                        <div className="flex justify-end">
                          {b.thumbUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={b.thumbUrl} alt="" className="bg-default-200 h-26 w-36 rounded object-cover" />
                          ) : (
                            <span className="bg-default-200 text-default-700 flex h-26 w-36 items-center justify-center rounded">
                              <Icon icon="photo" className="text-3xl" aria-hidden="true" />
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
        {/* ส่วนต่อขยาย: สิ่งที่ระบบทำกับแชทหลังติดตามครบ (ฝั่งร้านเท่านั้น ลูกค้าไม่เห็น) */}
        {draft.finalAction !== 'NONE' && (
          <p className="text-default-700 flex items-center justify-center gap-1 text-center text-xs">
            <Icon icon="flag" aria-hidden="true" />
            {fmt(t.finalSummary, { d: formatDuration(finalDelayOf(draft), words), a: t[FINAL_KEY[draft.finalAction]] })}
          </p>
        )}
      </div>
    </div>
  )
}

/** การ์ดตัวอย่างฝั่งขวา (≥md) — card เดียวเหมือนการ์ดสรุป: หัวบรรทัดเดียว · แชทเต็มความกว้าง · หมายเหตุท้ายการ์ด */
export default function ChatPreview({ draft, quick, channel }: { draft: Draft; quick: ReadonlyMap<string, QuickMessageLite>; channel: PreviewChannel | null }) {
  const t = useT().salesFollowBot
  return (
    <div className="card">
      <div className="card-header flex flex-wrap items-baseline justify-between gap-x-2">
        <h4 className="card-title">{t.previewTitle}</h4>
        <span className="text-default-700 text-xs">{fmt(t.previewSample, { name: t.previewSampleName })}</span>
      </div>
      <div className="card-body p-4">
        <ChatBody draft={draft} quick={quick} channel={channel} />
      </div>
      <div className="card-footer text-default-700 text-xs">{t.previewNote}</div>
    </div>
  )
}

/** sheet เลื่อนขึ้นจากขอบล่าง (มือถือ <md) — ล็อก scroll หน้าหลังตลอดอายุ (useLockBodyScroll) · Escape/ปุ่มปิด/แตะฉากหลังปิดได้ */
export function PreviewSheet({ draft, quick, channel, onClose }: { draft: Draft; quick: ReadonlyMap<string, QuickMessageLite>; channel: PreviewChannel | null; onClose: () => void }) {
  const t = useT().salesFollowBot
  useLockBodyScroll(true)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
  }, [])
  useEffect(() => {
    // sheet เป็นของมือถือ (<md) — หมุนจอข้าม md แล้วต้องปิดและคืนการล็อก scroll (ไม่ปล่อยค้างเมานต์แต่มองไม่เห็น)
    const mq = window.matchMedia('(min-width: 768px)')
    const onMq = () => mq.matches && onClose()
    mq.addEventListener('change', onMq)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      // focus trap: Tab วนอยู่ในแผง (ฉากหลังเข้าถึงด้วยคีย์บอร์ดไม่ได้ขณะเปิด)
      if (e.key === 'Tab') {
        const els = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])') ?? [])
        if (els.length === 0) return
        const first = els[0]
        const last = els[els.length - 1]
        const inside = dialogRef.current?.contains(document.activeElement)
        if (!inside || (e.shiftKey && document.activeElement === first)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      mq.removeEventListener('change', onMq)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="bg-dark/45 absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t.previewTitle} className="bg-card absolute inset-x-0 bottom-0 max-h-5/6 overflow-auto rounded-t-2xl px-4 pt-2 pb-6 shadow-lg">
        <div className="bg-default-300 mx-auto mt-1 mb-2 h-1 w-10 rounded-full" aria-hidden="true" />
        <div className="flex items-center gap-2">
          <h4 className="card-title flex-1">{t.previewTitle}</h4>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t.close} className="btn btn-icon text-default-700 hover:bg-default-100 size-11">
            <Icon icon="x" className="size-5" aria-hidden="true" />
          </button>
        </div>
        <p className="text-default-700 mb-2 text-xs">{fmt(t.previewSample, { name: t.previewSampleName })}</p>
        <ChatBody draft={draft} quick={quick} channel={channel} />
        <p className="text-default-700 mt-2 text-xs">{t.previewNote}</p>
      </div>
    </div>
  )
}
