'use client'

/**
 * FollowUpDaySheet — "ชีตวัน" ของปฏิทินติดตามลูกค้า (00066 พื้นผิว c · มติ user 2026-09-29: ชีตวันแทน popover)
 *
 * Base: src/components/safepay/appointment-board/AppointmentDaySheet.tsx (เปลือก overlay React-controlled: z-80, pt safe-area,
 *   หัวชีตแถวปิด + แถวเดินวัน ‹ › แบบไม่มีการปัด, เนื้อรายการ overscroll-contain + overflow-x-hidden)
 *   ← Base ของมัน: theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx + ui/modals/page.tsx
 * มือถือ = เต็มจอทับหัวแอป · ≥lg = modal กลางจอ (lg:max-w-md) — จอเดียวกัน ไม่ทำสองชุด
 *
 * เนื้อหา = FollowUpCard variant='board' ของวันนั้นทั้งหมด (ทำแล้ว/เลื่อน/เปิดแชท ครบ — ลบ/แก้อยู่ใน ⋮ ของการ์ด)
 * ประกอบเองด้วย React state ⇒ ต้อง useLockBodyScroll + overscroll-contain (overlay-scroll-lock.md)
 * ESC: ฟังที่ window แบบไม่ capture — เมนู ⋮/ฟอร์มของการ์ดจับ Esc แบบ capture+stopPropagation ก่อน ชีตจึงไม่ปิดตามเมื่อกดปิดเมนู
 */
import { useEffect, useMemo, useRef } from 'react'
import FollowUpCard from '@/app/(paces)/seller/_follow-up/FollowUpCard'
import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { formatWeekdayDateTH, thaiDayKey } from '@/lib/format-date'
import { shiftDay } from '@/lib/follow-up-page'
import type { FollowUpChange } from '@/lib/follow-up-view'
import type { FollowUpDto } from '@/services/customer-follow-up.service'

type Props = {
  /** YYYY-MM-DD */
  dayKey: string
  /** รายการของ "เดือนที่โหลดอยู่" — null = ยังโหลดไม่เสร็จ (ห้ามพูดว่าว่าง เพราะยังไม่รู้) */
  items: FollowUpDto[] | null
  onClose: () => void
  onDayChange: (dayKey: string) => void
  onChange: (c: FollowUpChange<FollowUpDto>) => void
  onEdit: (i: FollowUpDto) => void
}

export default function FollowUpDaySheet({ dayKey, items, onClose, onDayChange, onChange, onEdit }: Props) {
  const dict = useT()
  const t = dict.followUps
  useLockBodyScroll(true)
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(
    () =>
      (items ?? [])
        .filter((i) => thaiDayKey(i.dueAt) === dayKey)
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()),
    [items, dayKey],
  )
  const date = new Date(`${dayKey}T05:00:00Z`) // กลางวันไทย กันเขตเวลาเลื่อนวัน
  const label = formatWeekdayDateTH(date)

  // โฟกัสเข้าชีตตอนเปิด + คืนโฟกัสเดิมตอนปิด (ไม่งั้นผู้ใช้คีย์บอร์ดตกไป <body>)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => prev?.focus?.()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Tab') {
        // focus trap — aria-modal ไม่พอ Tab ยังหลุดไปหน้าข้างหลังได้
        const els = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex="0"]') ?? [],
        ).filter((el) => !(el as HTMLButtonElement).disabled && el.tabIndex >= 0)
        if (els.length === 0) return
        const first = els[0]!
        const last = els[els.length - 1]!
        const cur = document.activeElement
        if (e.shiftKey && (cur === first || !panelRef.current?.contains(cur))) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && (cur === last || !panelRef.current?.contains(cur))) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      // z-80 = ชั้น overlay เต็มจอ (precedent AppointmentDaySheet — Paces ไม่มี token) · pt = safe-area (ทับหัวแอปแล้วหัวชีตจะไปนอนใต้รอยบาก)
      // carve-out HR7: env(safe-area-inset-*) ไม่มี token · scrim ≥lg = default-900/50 ไม่ใช่ hex
      className={'bg-default-100 fixed inset-0 z-80 flex flex-col pt-[env(safe-area-inset-top)] lg:bg-default-900/50 lg:items-center lg:justify-center lg:p-6 lg:pt-6' /* HR7 carve-out: safe-area ไม่มี token ใน Paces */}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={fmt(t.daySheetAria, { date: label })}
        className="bg-default-100 flex min-h-0 flex-1 flex-col lg:w-full lg:max-w-md lg:flex-none lg:max-h-full lg:overflow-hidden lg:rounded-lg lg:shadow-lg"
      >
        <div className="bg-card border-default-200 shrink-0 border-b px-1.5 py-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onDayChange(shiftDay(dayKey, -1))}
              aria-label={t.dayPrev}
              className="btn text-default-700 hover:bg-default-100 min-h-11 min-w-11 shrink-0 rounded-lg"
            >
              <Icon icon="chevron-left" className="size-5" aria-hidden="true" />
            </button>
            {/* aria-live: เดินวันแล้วเนื้อหาเปลี่ยนยกแผง — ผู้ใช้ screen reader ต้องได้ยินว่าตอนนี้วันไหน (WCAG 4.1.3) */}
            <div className="min-w-0 flex-1 text-center" aria-live="polite" aria-atomic="true">
              <p className="text-dark truncate text-base font-semibold">{label}</p>
              <p className="text-default-600 text-2xs">
                {items === null ? t.loading : fmt(t.panelTitle, { n: rows.length })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onDayChange(shiftDay(dayKey, 1))}
              aria-label={t.dayNext}
              className="btn text-default-700 hover:bg-default-100 min-h-11 min-w-11 shrink-0 rounded-lg"
            >
              <Icon icon="chevron-right" className="size-5" aria-hidden="true" />
            </button>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={dict.common.close}
              className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11 min-w-11 shrink-0 rounded-lg"
            >
              <Icon icon="x" className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* overscroll-contain: ชีตประกอบเองด้วย React state — ขาดแล้วลากนิ้วดึงหน้าข้างหลังตาม
            overflow-x-hidden: overflow-y-auto เปิดแกน x เป็น auto ตามสเปก ลูกล้นพิกเซลเดียวก็เลื่อนข้าง (flex-header-truncation.md) */}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3" aria-busy={items === null}>
          {items === null ? (
            <ul className="space-y-2.5" aria-hidden="true">
              {[0, 1].map((i) => (
                <li key={i} className="card border-light border p-4">
                  <span className="bg-default-200 block h-4 w-3/4 animate-pulse rounded motion-reduce:animate-none" />
                  <span className="bg-default-200 mt-2 block h-3 w-1/2 animate-pulse rounded motion-reduce:animate-none" />
                </li>
              ))}
            </ul>
          ) : rows.length === 0 ? (
            <p className="text-default-600 px-1 py-10 text-center text-sm">{t.calDayEmpty}</p>
          ) : (
            <ul className="space-y-2.5">
              {rows.map((it) => (
                <li key={it.id}>
                  <FollowUpCard item={it} variant="board" onChange={onChange} onEdit={onEdit} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
