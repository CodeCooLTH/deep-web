'use client'

/**
 * AppointmentDaySheet — ชีตเต็มจอ "นัดของวันนี้" ที่เปิดเมื่อจิ้มวันในปฏิทิน (ส่วนขยาย 2026-08-11)
 *
 * Base (เปลือกชีต + scrim + ปุ่มปิด + ESC): src/app/(paces)/seller/(dashboard)/orders/components/OrderQrSheet.tsx
 *   ซึ่ง chase ต่อไปที่ theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx
 * Base (ท่าปัด: axis lock + touch-action pan-y + ดัก touchcancel):
 *   src/app/(paces)/seller/(chat)/inbox/components/SwipeableRow.tsx
 * Base (แถบปุ่มติดล่างจอ): src/app/(paces)/seller/(dashboard)/products/components/ProductFormV2.tsx
 *
 * user เคาะ 2026-08-11: "เลื่อนให้เต็มหน้าจอ (ทับด้านบนให้สุดเลย แล้วมีปุ่มให้เค้ากดปิดได้)"
 *
 * 🛑 ทับหัวแอปด้วย ⇒ ปุ่มเมนู/ชื่อหน้าหายไปหมด **ปุ่ม ✕ คือทางออกเดียวที่มองเห็น**
 * จึงอยู่ซ้ายสุดในระยะนิ้วโป้ง มีพื้นรอง และต้องมีปุ่ม back ของเครื่องเป็นทางออกสำรองเสมอ
 * (ถ้าอันใดอันหนึ่งพัง ผู้ใช้ติดอยู่ในหน้า — สองอย่างนี้ต้องมาคู่กัน)
 *
 * 🛑 ปัดเปลี่ยนวันเป็น **ทางลัด ไม่ใช่ทางเดียว** — iOS/WebView ยึด "ปัดขวาจากขอบซ้าย" ไว้เป็นปุ่ม
 * ย้อนกลับอยู่แล้ว คนที่เริ่มนิ้วตรงขอบจะออกจากหน้าแทน และผู้ใช้คีย์บอร์ด/screen reader ปัดไม่ได้เลย
 * ลูกศร ‹ › จึงเป็นของบังคับ ไม่ใช่ของแถม
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { formatDateTH, formatWeekdayDateTH } from '@/lib/format-date'
import { shiftDayKey, summarizeDay } from '@/lib/appointment-day-view'
import { localDateKey, type AppointmentDayApiItem } from './types'
import AppointmentDayList from './AppointmentDayList'

type Props = {
  /** "YYYY-MM-DD" ของวันที่กำลังดู — ผู้เรียกถือ state นี้ไว้เพื่อให้ปฏิทินข้างหลังเปลี่ยนตาม */
  dayKey: string
  onDayChange: (next: string) => void
  onClose: () => void
  /** กรองคิวงานเดียว — สืบทอดจากดรอปดาวน์บนปฏิทิน */
  resourceId: string
  resourceName: string | null
  showResourceName: boolean
  /** คำเรียกการสร้างรายการของร้านนี้ (ORDER_VOCAB) — ห้าม hardcode */
  createLabelShort: string
}

export default function AppointmentDaySheet({
  dayKey,
  onDayChange,
  onClose,
  resourceId,
  resourceName,
  showResourceName,
  createLabelShort,
}: Props) {
  useLockBodyScroll(true)

  const [items, setItems] = useState<AppointmentDayApiItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [reloadSeq, setReloadSeq] = useState(0)
  /**
   * เวลาปัจจุบันตัวเดียวของทั้งชีต — เดินเองทุกนาที
   *
   * 🛑 ห้ามให้การ์ดแต่ละใบเรียก `new Date()` เอง: ปุ่ม "ให้บริการแล้ว" จะไม่ปลดล็อกจนกว่าจะมี
   * re-render จากเหตุอื่น ซึ่งพฤติกรรมปกติที่สุดของจอนี้คือเปิดค้างรอลูกค้ามาถึง
   * (บทเรียนเดียวกับ notStarted ใน AppointmentCard.tsx)
   */
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // ── ปุ่ม back ของเครื่อง = ปิดชีต ไม่ใช่ออกจากหน้า ────────────────────────
  /**
   * 🛑 ข้อนี้ลืมบ่อยที่สุดและไม่มี gate ไหนจับได้ — ผู้ขายที่ใช้ผ่านแอปจะกด back หวังปิดชีต
   * แล้วหลุดออกจากหน้าคิวงานทั้งหน้า
   *
   * cleanup ต้องเช็ค `history.state` ก่อนเรียก `back()` — ถ้าผู้ใช้กดการ์ดไปหน้าออเดอร์
   * (Next เขียน state ของตัวเองทับ) การเรียก back() จะย้อนการนำทางนั้นทิ้งทันที
   */
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    window.history.pushState({ __apptDaySheet: true }, '')
    const onPop = () => onCloseRef.current()
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      const state = window.history.state as { __apptDaySheet?: boolean } | null
      if (state?.__apptDaySheet) window.history.back()
    }
  }, [])

  // ESC ปิด (เหมือนทุก sheet ในแอป)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ── โหลดนัดของวันที่กำลังดู ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoaded(false)
      setLoadError(false)
      setItems([])
      try {
        const qs = new URLSearchParams({ date: dayKey, ...(resourceId ? { resourceId } : {}) })
        const res = await fetch(`/api/shops/current/appointments/day?${qs}`, { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setLoadError(true)
          return
        }
        const json = (await res.json()) as { items: AppointmentDayApiItem[] }
        if (!cancelled) {
          setItems(Array.isArray(json.items) ? json.items : [])
          setLoaded(true)
        }
      } catch {
        if (!cancelled) setLoadError(true)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [dayKey, resourceId, reloadSeq])

  const summary = useMemo(() => summarizeDay(items), [items])
  const selectedDate = new Date(`${dayKey}T00:00`)
  const isToday = dayKey === localDateKey(now)

  const goDay = useCallback(
    (delta: number) => {
      onDayChange(shiftDayKey(dayKey, delta))
    },
    [dayKey, onDayChange],
  )

  /**
   * 🛑 ไม่มีการปัดซ้ายขวาเปลี่ยนวัน — user สั่งถอด 2026-08-12 ("เอา slide ข้าง ออกก็ได้นะ")
   *
   * ที่ถอดแล้วไม่เสียอะไร: ลูกศร ‹ › ทำงานได้ทุกกรณีอยู่แล้ว (รวมคีย์บอร์ด/screen reader ที่ปัดไม่ได้เลย)
   * และ iOS/WebView ก็ยึด "ปัดขวาจากขอบซ้าย" ไว้เป็นปุ่มย้อนกลับอยู่แล้ว การปัดจึงไม่เคยเป็นทางที่
   * เชื่อถือได้ตั้งแต่แรก
   *
   * ที่ได้กลับมา: ไม่ต้องมี transform บนกล่องเลื่อน = ไม่มีทางที่เนื้อหาจะค้างเลื่อนออกไปนอกจอ
   * และไม่ต้องแย่งแกนกับการเลื่อนอ่านรายการ
   */

  return (
    <div
      /* z-80 = ชั้น overlay เต็มจอ (precedent OrderQrSheet/AccountSwitcherSheet — Paces ไม่มี token)
         pt = safe-area: ทับหัวแอปแล้วหัวชีตจะไปนอนใต้รอยบากถ้าไม่เว้น (viewport-fit=cover เปิดแล้ว
         ตั้งแต่ 2026-08-06 ค่านี้จึงคืนค่าจริง ไม่ใช่ 0) — carve-out HR7: safe-area ไม่มี token */
      className="bg-default-100 fixed inset-0 z-80 flex flex-col pt-[env(safe-area-inset-top)] lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={`นัดของ ${formatWeekdayDateTH(selectedDate)}`}
    >
      {/* ── หัวชีต ─────────────────────────────────────────────────────────── */}
      <div className="bg-card border-default-200 shrink-0 border-b px-1.5 pt-2 pb-2.5">
        <div className="flex items-center gap-1">
          {/* ทางออกเดียวที่มองเห็น — พื้นรองไม่ใช่ไอคอนลอย ๆ (ไอคอนเปล่าบนพื้นขาวอ่านเป็นของตกแต่ง) */}
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดรายการนัด กลับไปที่ปฏิทิน"
            className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11 min-w-11 shrink-0 rounded-lg"
          >
            <Icon icon="x" className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => goDay(-1)}
            aria-label="วันก่อนหน้า"
            className="btn text-default-700 hover:bg-default-100 min-h-11 min-w-11 shrink-0 rounded-lg"
          >
            <Icon icon="chevron-left" className="size-5" aria-hidden="true" />
          </button>
          {/* aria-live: ปัด/กดลูกศรแล้วเนื้อหาเปลี่ยนยกแผง ผู้ใช้ screen reader ต้องได้ยินว่า
              ตอนนี้เป็นวันไหนและกี่นัด ไม่งั้นการเดินวันเป็นการกระทำที่ไม่มีผลลัพธ์ให้รับรู้ (WCAG 4.1.3) */}
          <div className="min-w-0 flex-1 text-center" aria-live="polite" aria-atomic="true">
            <p className="text-dark truncate text-base font-semibold">
              {formatWeekdayDateTH(selectedDate)}
            </p>
            <p className="text-default-500 text-2xs">
              {!loaded ? (
                'กำลังโหลด'
              ) : (
                <>
                  <span className="text-default-800 font-semibold">{summary.total}</span> นัด
                  {summary.closed > 0 ? (
                    <>
                      {/* "ปิดผล" เป็นศัพท์ในเอกสาร/โค้ด (setAppointmentOutcome, BR-RSV-34)
                          ที่ไม่เคยโผล่ใน UI ที่ไหนเลย — หน้าออเดอร์พูดว่า "ให้บริการแล้ว"/"ไม่มาตามนัด"
                          "จบแล้ว" ครอบทั้งสองผลลัพธ์โดยไม่เอนไปทางไหน (impeccable clarify 2026-08-12) */}
                      {' · จบแล้ว '}
                      <span className="text-default-800 font-semibold">{summary.closed}</span>
                    </>
                  ) : null}
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => goDay(1)}
            aria-label="วันถัดไป"
            className="btn text-default-700 hover:bg-default-100 min-h-11 min-w-11 shrink-0 rounded-lg"
          >
            <Icon icon="chevron-right" className="size-5" aria-hidden="true" />
          </button>
        </div>

        {/* แถบความคืบหน้า — derive จาก items ที่มีอยู่แล้ว ไม่ต้องขอ API เพิ่ม
            มีตัวเลขกำกับเสมอ (WCAG 1.4.1 — ห้ามให้ความหมายอยู่ที่สีล้วน) */}
        {loaded && summary.total > 0 ? (
          <div className="mt-2 flex items-center gap-2 px-1.5">
            <span className="bg-default-300 flex h-1.5 flex-1 overflow-hidden rounded-full">
              <span
                className="bg-success block h-full"
                style={{ width: `${(summary.completed / summary.total) * 100}%` }}
              />
              <span
                className="bg-danger block h-full"
                style={{ width: `${(summary.noShow / summary.total) * 100}%` }}
              />
            </span>
            <span className="text-default-500 text-2xs tabular-nums">
              {summary.closed} / {summary.total}
            </span>
          </div>
        ) : null}
      </div>

      {/* ── เนื้อรายการ ────────────────────────────────────────────────────── */}
      {/* overscroll-contain: ชีตประกอบเองด้วย React state — ขาดตัวนี้แล้วลากนิ้วในชีตจะดึงหน้า
          ข้างหลังตาม (overlay-scroll-lock.md)
          🛑 overflow-x-hidden ไม่ใช่ของประดับ: `overflow-y-auto` ทำให้แกน x กลายเป็น `auto` ตาม
          สเปก CSS โดยอัตโนมัติ ⇒ ลูกที่ล้นแนวนอนแม้พิกเซลเดียวจะทำให้ทั้งกล่อง "เลื่อนข้างได้"
          แล้วการ์ดจะถูกดันหลุดขอบซ้ายจนอ่านชื่อไม่ได้ (เกิดจริงบน prod 2026-08-12: ชื่อเพจยาว
          "Messenger · BT Premium Auto Xenon คลอง4 ธัญบุรี" ไม่ถูกตัดเพราะ flex-wrap ไม่มี min-w-0) */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3"
        aria-busy={!loaded && !loadError}
      >
        <div>
          {loadError ? (
            /* บล็อกค้างบนจอ ไม่ใช่ toast ที่หายเอง — และห้ามพูดว่า "ว่าง" เพราะเราไม่รู้
               (กติกาเดียวกับ AppointmentMonthBoard) */
            <div className="border-danger/30 bg-danger/10 flex flex-col items-center gap-2 rounded-lg border px-6 py-6 text-center">
              <Icon icon="cloud-off" className="text-danger-ink size-6" aria-hidden="true" />
              <p className="text-default-800 text-sm font-semibold">โหลดรายการนัดไม่สำเร็จ</p>
              <p className="text-default-600 text-xs">ยังไม่รู้ว่าวันที่เลือกมีนัดกี่รายการ</p>
              <button
                type="button"
                onClick={() => setReloadSeq((n) => n + 1)}
                className="btn border-default-300 text-default-800 hover:bg-default-50 mt-1 min-h-11 rounded-full border px-4 text-sm"
              >
                ลองอีกครั้ง
              </button>
            </div>
          ) : !loaded ? (
            /* skeleton ไม่ใช่สปินเนอร์กลางเนื้อหา และไม่ใช่ "ว่างทั้งวัน" ซึ่งเป็นคำตอบที่ผิด
               สำหรับคำถามเดียวที่จอนี้มีอยู่เพื่อตอบ */
            <ul className="flex flex-col gap-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="bg-card rounded-lg p-3">
                  <span className="flex items-start gap-2.5">
                    <span className="bg-default-200 block size-10 shrink-0 animate-pulse rounded-full motion-reduce:animate-none" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="bg-default-200 block h-4 w-2/5 animate-pulse rounded motion-reduce:animate-none" />
                      <span className="bg-default-200 block h-3 w-1/3 animate-pulse rounded motion-reduce:animate-none" />
                    </span>
                  </span>
                  <span className="bg-default-200 mt-3 block h-5 w-1/2 animate-pulse rounded motion-reduce:animate-none" />
                </li>
              ))}
            </ul>
          ) : items.length === 0 ? (
            /* วันว่าง = ผลลัพธ์ที่ดีของจอนี้ (ยังรับงานได้) ไม่ใช่ความล้มเหลว — ไอคอนเทากลาง
               ไม่ใช่เขียว (เขียวสงวนไว้กับสัญญาณความเชื่อใจที่ยืนยันแล้ว) */
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <span className="bg-default-200 text-default-500 flex size-11 items-center justify-center rounded-full">
                <Icon icon="calendar-check" className="size-5" aria-hidden="true" />
              </span>
              <p className="text-default-800 text-sm font-semibold">ว่างทั้งวัน</p>
              <p className="text-default-500 text-xs">
                {resourceName ? `ยังไม่มีนัดของ ${resourceName}` : 'ยังไม่มีนัดเข้ามา'}
              </p>
            </div>
          ) : (
            <AppointmentDayList
              items={items}
              showResourceName={showResourceName}
              isToday={isToday}
              now={now}
              onChanged={() => setReloadSeq((n) => n + 1)}
            />
          )}
        </div>
      </div>

      {/* ── แถบสร้างงานของวันที่กำลังดู ────────────────────────────────────── */}
      <div className="bg-card border-default-200 shrink-0 border-t p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {/* carve-out HR7: safe-area ไม่มี token — ปุ่มจะไปนอนใต้แถบ home indicator ถ้าไม่เว้น */}
        <Link
          href={`/orders/new?appointmentDate=${dayKey}`}
          /* `·` ถูก screen reader ข้ามเป็นความว่าง — ป้ายบนจอคงเดิม แต่ชื่อสำหรับ AT ต้องมีคำเชื่อม */
          aria-label={`${createLabelShort} สำหรับวันที่ ${formatDateTH(selectedDate)}`}
          className="btn bg-primary hover:bg-primary-hover min-h-11 w-full gap-1.5 text-white"
        >
          <Icon icon="plus" className="size-4" aria-hidden="true" />
          {createLabelShort} · {formatDateTH(selectedDate)}
        </Link>
      </div>
    </div>
  )
}
