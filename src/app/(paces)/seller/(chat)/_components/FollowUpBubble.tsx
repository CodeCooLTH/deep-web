'use client'

/**
 * FollowUpBubble — ปุ่มลอย "งานของฉัน" มุมขวาล่างของหน้าแชท/ความคิดเห็น (00066 พื้นผิว b, FR-ACT-07)
 *
 * Base: theme/paces/Admin/TS/src/assets/css/custom/_buttons.css (`.btn` pill) +
 *       theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (`.card` shadow-lg สำหรับกล่องที่กาง)
 *       — Paces ไม่มี floating pill button (Customizer เป็น offcanvas) มติ user: ประกอบจาก 2 primitive นี้
 *       ตำแหน่ง fixed ตามพี่น้อง dock ชิปใน DraftOrderProvider
 *
 * กฎหลัก (UX-Design-Spec §b):
 *  - ไม่มีงาน / ยังโหลดไม่เสร็จ / error ที่ไม่เคยมีข้อมูล = ไม่ render ปุ่มเลย (กันปุ่ม 0 กะพริบแล้วหาย)
 *  - เลยกำหนด = เปลี่ยนไอคอน+ข้อความ ไม่ใช่แค่สี · ห้าม text-white บน bg-danger (คอนทราสต์ตก AA)
 *  - มือถือ+อยู่ในห้อง = ซ่อน (bubbleModel) เพราะปุ่มส่งอยู่ขวาล่างเหมือนกัน
 *  - ไม่มี realtime: โหลดตอน mount / เปิดกล่อง / หลัง action
 *  - dialog ไม่ใส่ aria-modal (หลังกล่องยังกดได้ — aria-name-requires-supporting-role.md)
 */
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import FollowUpCard from '@/app/(paces)/seller/_follow-up/FollowUpCard'
import { useDraftDockVisible } from './DraftOrderProvider'
import { isChatThreadPath } from './chat-chrome'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { useMinWidth } from '@/hooks/useMinWidth'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { bubbleModel } from '@/lib/follow-up-rules'
import { formatCount, type FollowUpChange } from '@/lib/follow-up-view'
import { applyBubbleChange, bubbleLift, isComposerPath, type BubbleData, type BubbleLift } from '@/lib/follow-up-bubble'
import type { FollowUpDto } from '@/services/customer-follow-up.service'

type Data = BubbleData<FollowUpDto>

// ยกปุ่มตามสิ่งที่กีดขวาง (ช่องพิมพ์/dock ร่างออเดอร์) — ค่า calc() ด้านล่างเป็นค่านอก token ของ Paces
// (safe-area บน iOS ต้องบวกเข้าไปเอง) จึงเขียน comment กำกับทุกบรรทัด ตาม carve-out HR7
const LIFT_CLASS: Record<BubbleLift, string> = {
  0: 'bottom-[calc(1rem+env(safe-area-inset-bottom))]', // HR7 carve-out: safe-area ไม่มี token
  1: 'bottom-[calc(6rem+env(safe-area-inset-bottom))]', // HR7 carve-out: safe-area ไม่มี token
  2: 'bottom-[calc(10rem+env(safe-area-inset-bottom))]', // HR7 carve-out: safe-area ไม่มี token
}

export default function FollowUpBubble({ unified }: { unified: boolean }) {
  const t = useT()
  const tf = t.followUps
  const pathname = usePathname()
  const search = useSearchParams()
  const wide = useMinWidth(1024)
  const dockVisible = useDraftDockVisible()

  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const seq = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)

  // เรียกได้ทุกที่ (mount/เปิดกล่อง/หลัง action) — ตอบช้ากว่าคำขอใหม่ = ทิ้ง กันข้อมูลเก่าทับใหม่
  const load = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true)
    try {
      const res = await fetch('/api/follow-ups/mine', { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const j = (await res.json()) as Data
      if (mine !== seq.current) return
      setData({ rows: j.rows, total: j.total, lateCount: j.lateCount })
      setFailed(false)
    } catch {
      if (mine === seq.current) setFailed(true)
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดครั้งแรกตอน mount (ไม่มี realtime ตามสเปก)
    void load()
  }, [load])

  const model = bubbleModel({
    total: data?.total ?? 0,
    lateCount: data?.lateCount ?? 0,
    isMobile: wide === false,
    inThread: isChatThreadPath(pathname, search),
  })
  // wide === null = ยังไม่รู้ขนาดจอ → ยังไม่แสดง (กันปุ่มโผล่แล้วหายบนมือถือที่อยู่ในห้อง)
  const visible = model.visible && wide !== null

  // ปุ่มหายขณะกล่องเปิด (เปลี่ยนห้อง/ทำครบทุกแถว) ต้องปิดกล่องด้วย ไม่ปล่อยกล่องลอยไร้ปุ่ม
  useEffect(() => {
    if (!visible && open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์ "กล่องเปิด" กับ "ปุ่มมองเห็น" ให้ไม่หลุดกัน
      setOpen(false)
    }
  }, [visible, open])

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) btn.current?.focus()
  }, [])

  // Esc ปิด + กดนอกกล่องปิด (หลังกล่องยังกดได้ จึงไม่มีฉากทึบ) — ฟังเฉพาะตอนเปิด
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true)
    }
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open, close])

  // มือถือ: กล่องกางเป็น overlay ประกอบเอง → ตรึงหน้าข้างหลัง (overlay-scroll-lock.md)
  useLockBodyScroll(open && wide === false)

  // แผงลูกค้าฝั่งขวา (CustomerPanel) อ่านธงนี้เพื่อเว้น pb ท้ายเนื้อหา ไม่ให้ปุ่มทับ (UX §b ตารางชน)
  useEffect(() => {
    const el = document.documentElement
    if (visible) el.setAttribute('data-follow-up-bubble', '')
    else el.removeAttribute('data-follow-up-bubble')
    return () => el.removeAttribute('data-follow-up-bubble')
  }, [visible])

  const onChange = useCallback(
    (c: FollowUpChange<FollowUpDto>) => {
      setData((d) => (d ? applyBubbleChange(d, c) : d))
      // ยืนยันกับ server หลัง action — 404 (ผู้รับเปลี่ยนคน) ก็หายไปเองตอนโหลดใหม่
      void load()
    },
    [load],
  )

  if (!visible || !data) return null

  const late = data.lateCount
  const isLate = model.tone === 'late'
  const count = formatCount(data.total)
  const label = isLate ? fmt(tf.bubbleLate, { n: formatCount(late) }) : fmt(tf.bubbleToday, { n: count })
  const aria = isLate
    ? fmt(tf.bubbleAriaLate, { n: count, late: formatCount(late) })
    : fmt(tf.bubbleAria, { n: count })

  const lateRows = data.rows.filter((r) => r.bucket === 'late')
  const todayRows = data.rows.filter((r) => r.bucket !== 'late')

  const group = (title: string, rows: FollowUpDto[]) =>
    rows.length === 0 ? null : (
      <section aria-label={title}>
        <h3 className="text-default-700 mb-0 px-4 pt-2 text-xs font-semibold">{title}</h3>
        <ul className="m-0 list-none p-0">
          {rows.map((r) => (
            <li key={r.id} className="border-default-200 border-b px-4 last:border-b-0">
              <FollowUpCard item={r} variant="bubble" onChange={onChange} />
              {unified && r.shopName && <p className="text-default-600 -mt-1 mb-2 truncate text-xs">{r.shopName}</p>}
            </li>
          ))}
        </ul>
      </section>
    )

  return (
    <div
      ref={box}
      className={`pointer-events-none fixed inset-x-4 z-50 flex flex-col items-end gap-2 ${LIFT_CLASS[bubbleLift({ composerPresent: isComposerPath(pathname), dockVisible })]}`}
    >
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label={tf.bubbleHeading}
          tabIndex={-1}
          // ปิดกล่องเมื่อกดลิงก์แถว (ไปห้องนั้น) — ไม่คืนโฟกัสปุ่ม เพราะกำลังเปลี่ยนหน้า
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest('a')) close(false)
          }}
          className="card pointer-events-auto flex max-h-[70dvh] w-full flex-col shadow-lg outline-none sm:w-80" // dvh carve-out (HR7): ความสูงจอมือถือจริงที่ไม่มี token
        >
          <div className="card-header flex items-center justify-between gap-2">
            <h2 className="text-default-900 mb-0 text-sm font-semibold">{tf.bubbleHeading}</h2>
            <button
              type="button"
              onClick={() => close(true)}
              aria-label={t.common.close}
              className="btn btn-icon min-h-11 min-w-11 text-default-700 hover:bg-default-100"
            >
              <Icon icon="x" className="text-lg" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {failed && (
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <p className="text-default-800 mb-0 text-sm">{tf.bubbleError}</p>
                <button type="button" onClick={() => void load()} className="btn border border-default-300 text-default-800 min-h-11">
                  {tf.retry}
                </button>
              </div>
            )}
            {loading && data.rows.length === 0 && !failed ? (
              <div className="space-y-3 px-4 py-3" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="bg-default-100 h-10 animate-pulse rounded-lg" />
                ))}
              </div>
            ) : (
              <>
                {group(tf.bubbleGroupLate, lateRows)}
                {group(tf.bubbleGroupToday, todayRows)}
              </>
            )}
          </div>
          {/* ลิงก์หน้ารวมของฉัน — total นับก่อนตัด 8 แถว จึงชี้ไปดูทั้งหมดได้เสมอ */}
          <Link href="/follow-ups?mine=1" className="border-default-200 text-primary-ink flex min-h-11 items-center justify-between gap-2 border-t px-4 text-sm font-medium">
            <span>{tf.bubbleSeeAll}</span>
            <Icon icon="arrow-right" className="text-base" />
          </Link>
        </div>
      )}
      <button
        ref={btn}
        type="button"
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) void load()
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={aria}
        className={`btn pointer-events-auto min-h-11 min-w-11 gap-2 rounded-full border shadow-lg ${
          isLate ? 'bg-danger/15 text-danger-ink border-danger' : 'bg-card text-default-800 border-default-300'
        }`}
      >
        <Icon icon={isLate ? 'clock-exclamation' : 'list-check'} className="text-lg" />
        <span className="hidden lg:inline">{label}</span>
        <span className="lg:hidden">{isLate ? formatCount(late) : count}</span>
      </button>
    </div>
  )
}
