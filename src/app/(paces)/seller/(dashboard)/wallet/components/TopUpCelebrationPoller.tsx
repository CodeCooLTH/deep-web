'use client'

/**
 * TopUpCelebrationPoller — poll /api/wallet/events ทุก 20s
 * เมื่อมี TopUpRequest ที่ approved + ยังไม่แจ้ง (notifiedAt=null) → เปิด celebration modal
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
 * (Paces card → card-header → card-body → card-footer shell — controlled via React state ไม่ใช่ hs-overlay)
 * Pattern ต่อยอดจาก:
 *   src/app/(paces)/seller/(dashboard)/wallet/components/TopUpRequestModal.tsx
 *   (controlled-open modal shell, hs-overlay structure ปรับเป็น React state-driven)
 *
 * ทำไม mount ที่ dashboard layout (ไม่ใช่ wallet page เท่านั้น):
 * seller อาจอยู่ที่ page ไหนก็ได้ในระหว่างรอ approve — poll ที่ layout ทำให้แจ้งทุก page
 *
 * RC-8: ไม่ log id/PII ใน console ฝั่ง client
 */

import Icon from '@/components/wrappers/Icon'
import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Constants ─────────────────────────────────────────────────────────────────
// POLL_MS: poll interval 20s = near-realtime per spec (T24)
const POLL_MS = 20_000

// ─── Types ────────────────────────────────────────────────────────────────────
interface ApprovedItem {
  id: string
  amount: number
  reviewedAt: string | null
}

interface EventsResponse {
  approved: ApprovedItem[]
  balance: number
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function TopUpCelebrationPoller() {
  // ─── Modal state ────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [pendingItems, setPendingItems] = useState<ApprovedItem[]>([])
  const [balance, setBalance] = useState(0)
  // ackError: track ว่า ack ล้มเหลว → ยังปิด modal ได้ (poll รอบหน้าจะเจอใหม่)
  const [ackError, setAckError] = useState(false)

  // ─── Poll control ────────────────────────────────────────────────────────
  // inFlight ref: guard ไม่ให้ fetch overlap (ถ้า 20s หมดก่อน response มา)
  const inFlight = useRef(false)
  // stopped ref: set = true เฉพาะตอนเจอ 401 (session หมด) → หยุด poll ถาวร ไม่ restart.
  // unmount ไม่ set stopped (effect deps=[poll] → cleanup fire ทุกครั้ง open toggle ไม่ใช่
  // เฉพาะ unmount; ถ้า set ที่นี่ poll จะตายหลัง modal เปิดครั้งแรก). unmount = cleanup
  // clearInterval พอ; in-flight fetch ที่ค้างแล้ว setState หลัง unmount = React no-op ไม่ crash
  const stopped = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Fetch helper ─────────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    // ป้องกัน overlap fetch และ poll หลัง stopped
    if (inFlight.current || stopped.current) return
    inFlight.current = true

    try {
      const res = await fetch('/api/wallet/events', {
        // ไม่ cache — ต้องการ fresh data ทุกรอบ
        cache: 'no-store',
      })

      // 401 = session หมด → หยุด poll ถาวร (ไม่ spam re-auth error)
      if (res.status === 401) {
        stopped.current = true
        if (intervalRef.current) clearInterval(intervalRef.current)
        return
      }

      if (!res.ok) return // 500 / network error → รอรอบหน้า (ไม่หยุด)

      const data: EventsResponse = await res.json()

      // ถ้ามี approved ที่ยังไม่แจ้ง → เปิด modal (ถ้า modal ยังไม่เปิดอยู่)
      if (data.approved.length > 0 && !open) {
        setPendingItems(data.approved)
        setBalance(data.balance)
        setAckError(false)
        setOpen(true)
      }
    } catch {
      // network error → รอรอบหน้า (ไม่ log RC-8)
    } finally {
      inFlight.current = false
    }
  }, [open])

  // ─── Interval setup + visibilitychange ──────────────────────────────────
  useEffect(() => {
    if (stopped.current) return

    // เริ่ม poll ทันที 1 ครั้งเมื่อ mount
    poll()

    intervalRef.current = setInterval(poll, POLL_MS)

    // visibilitychange: pause เมื่อ tab hidden, resume + poll ทันทีเมื่อ visible
    const handleVisibility = () => {
      if (document.hidden) {
        // tab ถูกซ่อน → clear interval (ไม่ waste request)
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } else {
        // tab กลับมา visible → poll ทันที + restart interval
        if (!stopped.current) {
          poll()
          intervalRef.current = setInterval(poll, POLL_MS)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      // cleanup: clearInterval + removeEventListener
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  // ทำไม poll ใน deps: poll memoize ด้วย useCallback([open]) → identity เปลี่ยนเมื่อ open
  // เปลี่ยน. หมายเหตุ: `!open` guard ใน poll fn แค่กัน modal "เปิดซ้ำ" ขณะเปิดอยู่ —
  // ไม่ได้หยุด fetch/poll (interval ยังยิง fetch ปกติ แค่ไม่ setOpen ซ้ำ)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll])

  // ─── Ack + ปิด modal ────────────────────────────────────────────────────
  const handleAck = async () => {
    const ids = pendingItems.map((item) => item.id)

    try {
      await fetch('/api/wallet/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      // ไม่ log ids (RC-8)
    } catch {
      // ack fail → ยังปิด modal (poll รอบหน้าจะเจอใหม่ → S-C8 notifiedAt null guard กัน double-celebrate)
      setAckError(true)
    }

    // ปิด modal เสมอ ไม่ว่า ack จะสำเร็จหรือไม่
    setOpen(false)
    setPendingItems([])
  }

  // ─── Computed display values ─────────────────────────────────────────────
  const totalAmount = pendingItems.reduce((sum, item) => sum + item.amount, 0)
  const itemCount = pendingItems.length

  // ─── ไม่ render อะไรถ้า modal ไม่เปิด ─────────────────────────────────
  if (!open) return null

  return (
    /*
     * Modal shell — copy จาก AddCategoryModal.tsx (Paces hs-overlay card structure)
     * ปรับเป็น controlled-open via React state (เหมือน TopUpRequestModal.tsx)
     * ทำไม controlled แทน hs-overlay data-attr:
     * - ต้อง reset state + trigger ack เมื่อปิด
     * - hs-overlay require trigger element ภายนอก; poller trigger จาก data fetch
     */
    <div
      className="size-full fixed top-0 start-0 z-80 overflow-x-hidden overflow-y-auto bg-black/50 flex items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebrationModalLabel"
      tabIndex={-1}
    >
      <div className="ease-in-out transition-all duration-200 lg:max-w-md md:max-w-sm md:w-full w-[calc(100%-24px)] m-3 md:mx-auto flex items-center">
        <div className="w-full flex flex-col card pointer-events-auto">

          {/* ─── Header ──────────────────────────────────────────────────── */}
          <div className="card-header p-5">
            <h3 id="celebrationModalLabel" className="font-medium text-sm">
              การแจ้งเตือน
            </h3>
            {/* ปุ่มปิด X — กด = ack + ปิด (เหมือนกดรับทราบ) */}
            <button
              type="button"
              aria-label="ปิด"
              onClick={handleAck}
            >
              <Icon icon="x" className="text-2xl align-middle text-default-600" />
            </button>
          </div>

          {/* ─── Body ────────────────────────────────────────────────────── */}
          <div className="card-body overflow-y-auto space-y-4 text-center py-8">
            {/* ไอคอน celebration */}
            <div className="flex justify-center">
              <span className="inline-flex items-center justify-center size-16 rounded-full bg-success/10 text-success">
                <Icon icon="confetti" className="text-4xl" />
              </span>
            </div>

            {/* หัวข้อ */}
            <h2 className="text-xl font-semibold text-default-900">
              ยินดีด้วย!
            </h2>

            {/* จำนวนเงินที่ได้รับ */}
            <p className="text-2xl font-bold text-success">
              เติมเงิน +{totalAmount.toLocaleString()}
            </p>

            {/* ถ้าหลายรายการ — แสดงจำนวน */}
            {itemCount > 1 && (
              <p className="text-sm text-default-500">
                ({itemCount} คำขอได้รับการอนุมัติ)
              </p>
            )}

            {/* ยอดคงเหลือปัจจุบัน (จาก response) */}
            <p className="text-sm text-default-600">
              ยอดคงเหลือ{' '}
              <span className="font-semibold text-default-800">
                {balance.toLocaleString()} SMS
              </span>
            </p>

            {/* Deep brand copy */}
            <p className="text-xs text-default-400">
              Deep เติมเงินให้คุณแล้ว พร้อมส่ง SMS ให้ลูกค้า
            </p>

            {/* ack fail fallback — แจ้ง UX แต่ไม่บล็อก */}
            {ackError && (
              <p className="text-xs text-warning">
                หมายเหตุ: บันทึกการรับทราบไม่สำเร็จ — ระบบจะแจ้งซ้ำในรอบถัดไป
              </p>
            )}
          </div>

          {/* ─── Footer ──────────────────────────────────────────────────── */}
          <div className="flex justify-center border-t border-default-300 card-body">
            <button
              type="button"
              // autoFocus เพื่อ a11y — ปุ่มเดียวในdialog ควรได้ focus ทันที
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              onClick={handleAck}
              className="btn bg-success text-white hover:bg-success/90 w-full"
            >
              รับทราบ
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
