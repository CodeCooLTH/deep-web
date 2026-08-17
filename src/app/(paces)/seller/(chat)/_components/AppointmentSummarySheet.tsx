'use client'

/**
 * AppointmentSummarySheet — พรีวิว "สรุปนัดหมาย" ก่อนส่งเข้าแชท (ส่วนขยาย 00024, 2026-08-11)
 *
 * user เคาะว่าไม่ส่งทันที ต้อง **เห็นก่อน แก้ได้ แล้วค่อยกดส่ง** เพราะข้อความนี้ออกไปหาลูกค้าแล้ว
 * ถอนคืนไม่ได้ และร้านแต่ละที่มีนโยบายต่างกันว่าจะใส่เบอร์/ยอดเงินลงไปด้วยไหม
 *
 * วางที่ `(chat)/_components` ไม่ใช่ในโฟลเดอร์ห้องแชท เพราะ **1 ใน 3 จุดเรียกอยู่นอกห้องแชท**
 * (`/orders/[token]`) — ปฏิทิน `/queues` **ยังไม่มีปุ่มนี้** ดู `00024/EXTENSIONS-2026-08-11.md` §9
 *
 * เนื้อหาและคำทั้งหมดมาจาก `buildAppointmentSummary()` ตัวเดียวกับที่ route ใช้ประกอบของจริง —
 * พรีวิวที่คำนวณเองจะเพี้ยนจากสิ่งที่ส่งจริงได้โดยไม่มีอะไรฟ้อง (HR16)
 *
 * Base (เปลือกโมดัล): ../inbox/[conversationId]/components/QuickMessageManager.tsx
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { pacesToast } from '@/lib/paces-toast'
import { getChannelLabel } from '@/lib/chat-channel'
import { publicOrderUrl } from '@/lib/public-order-url'
import { formatDateTimeTH } from '@/lib/format-date'
import {
  APPOINTMENT_CLOSING_MAX,
  APPOINTMENT_SUMMARY_LABEL,
  DEFAULT_APPOINTMENT_CLOSING,
  HIDEABLE_APPOINTMENT_SUMMARY_KEYS,
  buildAppointmentSummary,
  type AppointmentSummaryInput,
  type AppointmentSummaryKey,
} from '@/lib/appointment-summary'

/** ห้องแชทที่ส่งได้ — มาจาก `GET /api/orders/[token]/conversations` หรือจากหน้าที่อยู่ในห้องอยู่แล้ว */
export interface AppointmentTarget {
  id: string
  channel: string
  contactName: string | null
  pageName: string | null
  /** ห้องที่ออเดอร์ใบนี้เกิดขึ้นจริง (`Order.conversationId`) — server เรียงมาให้เป็นตัวแรกแล้ว */
  isOrigin?: boolean
}

/** ไอคอนของแต่ละบรรทัด — สื่อความหมายแทนป้ายข้อความบนพรีวิว (พื้นที่จำกัด) */
const LINE_ICON: Record<AppointmentSummaryKey, string> = {
  when: 'calendar-event',
  service: 'tool',
  customer: 'user',
  phone: 'phone',
  amount: 'cash',
  deposit: 'coin',
}

/**
 * จำ "บรรทัดไหนแสดง" ไว้ให้ไม่ต้องติ๊กออกซ้ำทุกใบ · key มี `shopId` เพราะคนที่ดูแลหลายร้าน
 * ตั้งค่าต่างกันได้
 *
 * 🛑 **นี่คือความชอบของ "เครื่องนี้" ไม่ใช่นโยบายของร้าน** — `localStorage` ผูกกับเบราว์เซอร์
 * ⇒ พนักงาน 3 คนคนละเครื่องจะส่งการ์ดคนละหน้าตาให้ลูกค้าของร้านเดียวกัน. user เคาะ 2026-08-12
 * ว่าคงไว้ก่อน (ยังไม่รู้ว่าร้านที่มีพนักงานหลายคนใช้ฟีเจอร์นี้จริงแค่ไหน) — **ห้ามเขียนอ้างว่าเป็น
 * นโยบายระดับร้าน** ไม่งั้นคนอ่านทีหลังจะสร้างของบนสมมติฐานผิด; จะให้เป็นนโยบายร้านจริงต้องย้าย
 * ไปเก็บฝั่ง server (= migration)
 */
const storageKey = (shopId: string) => `deep:appt-summary-lines:${shopId}`

interface LoadedSummary {
  shopId: string
  /** ISO — เคยส่งสรุปนัดใบนี้ไปแล้วเมื่อไหร่ · null = ยังไม่เคยส่ง */
  lastSentAt: string | null
  data: AppointmentSummaryInput
  targets: AppointmentTarget[]
}

export interface AppointmentSummarySheetProps {
  open: boolean
  onClose: () => void
  /** token ของออเดอร์ที่มีนัด — ใช้เป็น `orderRefToken` ตอนส่ง และเป็นทุกอย่างที่ชีตต้องรู้ */
  orderToken: string
  /** ยิงเมื่อส่งสำเร็จ (ปิดชีตให้เอง) */
  onSent?: () => void
}

export default function AppointmentSummarySheet({
  open,
  onClose,
  orderToken,
  onSent,
}: AppointmentSummarySheetProps) {
  useLockBodyScroll(open)

  const [loaded, setLoaded] = useState<LoadedSummary | null>(null)
  /**
   * แยก "ลองใหม่แล้วมีโอกาสสำเร็จ" ออกจาก "ไม่มีวันสำเร็จ" (impeccable critique P2)
   *
   * `retryable` = เน็ตหลุด / 5xx ⇒ ต้องมีปุ่มลองใหม่ เพราะนี่คือความล้มเหลวที่พบบ่อยที่สุดของ
   * ผู้ขายที่ใช้เน็ตมือถือในร้าน · `false` = 4xx ที่ server อธิบายเหตุผลมาแล้ว (ไม่มีนัด/นัดจบแล้ว/
   * ร้านไม่ได้ใช้คิวงาน) ⇒ ห้ามมีปุ่มลองใหม่ มันคือคำเชิญให้กดสิ่งที่ไม่มีทางสำเร็จ
   */
  const [loadError, setLoadError] = useState<{ message: string; retryable: boolean } | null>(null)
  const [hidden, setHidden] = useState<AppointmentSummaryKey[]>([])
  const [closing, setClosing] = useState(DEFAULT_APPOINTMENT_CLOSING)
  const [targetId, setTargetId] = useState<string>('')
  const [sending, setSending] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  /** element ที่โฟกัสอยู่ก่อนเปิดชีต — ต้องคืนให้ตอนปิด ไม่งั้นคีย์บอร์ดเริ่มใหม่จากต้นหน้า */
  const restoreRef = useRef<HTMLElement | null>(null)

  const load = useCallback(async () => {
    setLoaded(null)
    setLoadError(null)
    try {
      const res = await fetch(`/api/orders/${orderToken}/appointment-summary`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError({
          message: (json as { error?: string }).error ?? 'โหลดข้อมูลนัดไม่สำเร็จ',
          // 5xx = ฝั่งเราสะดุด ลองใหม่มีโอกาส · 4xx = server ตัดสินแล้ว ลองกี่ครั้งก็เท่าเดิม
          retryable: res.status >= 500,
        })
        return
      }
      setLoaded(json as LoadedSummary)
      setTargetId((json as LoadedSummary).targets[0]?.id ?? '')
    } catch {
      // เน็ตหลุดกลางทาง — เคสที่พบบ่อยที่สุดของผู้ขายที่ใช้มือถือในร้าน
      setLoadError({ message: 'โหลดข้อมูลนัดไม่สำเร็จ', retryable: true })
    }
  }, [orderToken])

  /**
   * โหลดตอนเปิดเท่านั้น — 🛑 ห้ามย้ายไปรับเป็น prop: สรุปนัดมีเบอร์โทรลูกค้าอยู่ในนั้น และหน้า
   * seller อยู่ใต้ client layout ⇒ prop จะถูก serialize ลง flight payload ของทุกหน้าที่มีปุ่มนี้
   * ไม่ว่าผู้ขายจะกดเปิดหรือไม่ (`feedback_rsc_pii_neutralize_at_source`)
   */
  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  useEffect(() => {
    if (!open) return
    // ข้อความท้าย **ไม่จำ** ค่าครั้งก่อนโดยตั้งใจ (ต่างจากรายการบรรทัด): บรรทัดไหนแสดงคือ
    // *นโยบายของร้าน* แต่ข้อความท้ายคือ *คำพูดกับลูกค้ารายนี้* — จำไว้แล้วคำที่เขียนให้คนก่อน
    // จะหลุดไปหาคนถัดไปโดยที่ผู้ขายไม่ทันอ่าน
    setClosing(DEFAULT_APPOINTMENT_CLOSING)
    if (!loaded) return
    try {
      const raw = localStorage.getItem(storageKey(loaded.shopId))
      const parsed: unknown = raw ? JSON.parse(raw) : []
      setHidden(
        Array.isArray(parsed)
          ? parsed.filter((k): k is AppointmentSummaryKey =>
              (HIDEABLE_APPOINTMENT_SUMMARY_KEYS as readonly string[]).includes(k as string),
            )
          : [],
      )
    } catch {
      // localStorage ปิด (โหมดส่วนตัวบางเบราว์เซอร์) — แสดงครบทุกบรรทัดคือค่าตั้งต้นที่ปลอดภัย
      setHidden([])
    }
  }, [open, loaded])

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      // ยังไม่มีอะไรถูกส่ง → ปิดได้เลยไม่ต้องถามยืนยัน
      if (e.key === 'Escape' && !sending) onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose, sending])

  /**
   * โฟกัส: ย้ายเข้า · ขังไว้ · คืนที่เดิมตอนปิด (impeccable critique — persona Sam)
   *
   * 🛑 `aria-modal="true"` บอก **screen reader** ว่าข้างหลังไม่มีอยู่ แต่ไม่ได้ทำอะไรกับคีย์บอร์ดเลย
   * ถ้าไม่มีบล็อกนี้ ผู้ใช้คีย์บอร์ดจะยัง Tab ทะลุออกไปหน้าที่ตัวเองมองไม่เห็นแล้ว
   */
  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null
    // โฟกัสปุ่มปิด ไม่ใช่ปุ่มส่ง — ปุ่มแรกที่คีย์บอร์ดแตะต้องเป็นทางออก ไม่ใช่ทางที่ถอนคืนไม่ได้
    const t = setTimeout(() => closeRef.current?.focus(), 0)
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onTab)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onTab)
      restoreRef.current?.focus?.()
    }
  }, [open])

  const summary = useMemo(
    () =>
      loaded
        ? buildAppointmentSummary(loaded.data, {
            hiddenKeys: hidden,
            closing,
            /**
             * 🛑 ต้องส่ง `url` เท่ากับตอนส่งจริง — ก่อนหน้านี้พรีวิวไม่ส่ง แต่ route ส่ง
             * ⇒ ผู้ขายเห็นข้อความไม่มีลิงก์ แล้วลูกค้าได้ข้อความที่มีลิงก์ (พรีวิวโกหก)
             * ลิงก์นี้คือสิ่งที่ลูกค้าใช้ตรวจบิล/แนบสลิป/กดยืนยัน — ต้องเห็นก่อนกดส่ง
             */
            url: publicOrderUrl(orderToken),
          })
        : null,
    [loaded, hidden, closing],
  )

  /**
   * บรรทัดที่ "มีข้อมูลจริง" เท่านั้นที่ได้ checkbox
   *
   * บรรทัดที่ไม่มีข้อมูลไม่โผล่ในรายการเลย (ไม่ใช่ติ๊กแล้วเทา) — ติ๊กที่กดไม่ได้โดยไม่บอกเหตุผล
   * อ่านเป็นระบบพัง ส่วนบรรทัดที่ไม่มีข้อมูลก็ไม่มีอะไรให้เลือกอยู่แล้ว
   *
   * คำนวณจาก summary ที่ **ไม่ซ่อนอะไรเลย** ไม่ใช่จาก summary ปัจจุบัน — ไม่งั้นพอติ๊กออก
   * ตัวเลือกนั้นจะหายไปจากรายการทันที แล้วติ๊กกลับไม่ได้ตลอดกาล
   */
  const available = useMemo(() => {
    if (!loaded) return []
    return buildAppointmentSummary(loaded.data, { closing: null }).lines.map((l) => l.key)
  }, [loaded])

  if (!open) return null

  const toggle = (key: AppointmentSummaryKey) => {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]
    setHidden(next)
    if (!loaded) return
    try {
      localStorage.setItem(storageKey(loaded.shopId), JSON.stringify(next))
    } catch {
      // เขียนไม่ได้ = จำได้แค่รอบนี้ ดีกว่าติ๊กแล้วไม่มีอะไรเกิดขึ้น
    }
  }

  async function handleSend() {
    if (sending || !targetId) return
    setSending(true)
    try {
      const res = await fetch(`/api/chat/conversations/${targetId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'APPOINTMENT',
          orderRefToken: orderToken,
          hiddenSummaryKeys: hidden,
          summaryClosing: closing.trim() || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        pacesToast.error((d as { error?: string }).error ?? 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      pacesToast.success('ส่งสรุปนัดแล้ว')
      onSent?.()
      onClose()
    } catch {
      pacesToast.error('ส่งไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setSending(false)
    }
  }

  /**
   * ป้ายบอกปลายทาง — 🛑 `contactName ?? pageName` แบบเดิมผิด 2 ทาง (impeccable critique):
   * ห้อง DEEP ไม่มีทั้งคู่ ⇒ เหลือคำว่า "Deep" ลอย ๆ · ห้องช่องทางนอกที่ยังไม่รู้ชื่อลูกค้าจะไป
   * หยิบ **ชื่อเพจของร้านเอง** มาวางตรงที่ควรเป็นชื่อคน จนอ่านเหมือนกำลังส่งหาตัวเอง
   */
  const targetLabel = (t: AppointmentTarget) => {
    const who = t.contactName?.trim()
      ? t.contactName.trim()
      : t.pageName
        ? `ผู้ติดต่อทางเพจ ${t.pageName}`
        : 'ยังไม่รู้ชื่อผู้ติดต่อ'
    return [
      getChannelLabel(t.channel),
      who,
      // ติดป้ายให้ผู้ขายรู้ว่าทำไมห้องนี้ถูกเลือกไว้ให้ — ไม่ใช่ "ห้องที่คุยล่าสุด" ลอย ๆ
      t.isOrigin ? '(ห้องที่สร้างนัดนี้)' : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return (
    <div
      className="fixed inset-0 z-90 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      // ชี้ไปที่หัวข้อที่ตาเห็น แทนการเขียนสตริงที่สอง — ชื่อที่ AT อ่านกับที่คนอื่นเห็นต้องเป็นคำเดียวกัน
      aria-labelledby="appt-sheet-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !sending) onClose()
      }}
    >
      {/* sm:h-auto ไม่ใช่ความสูงตรึง — Base (QuickMessageManager) ตรึงไว้เพราะลิสต์ของมันหด/ขยาย
          ตอนกรอง ทำให้เนื้อหาเด้ง ชีตนี้เนื้อหานิ่ง การตรึง 640px จึงได้แค่ที่ว่างตายใต้เนื้อหา */}
      <div
        ref={panelRef}
        className="card bg-card flex h-full max-h-full w-full flex-col rounded-b-none sm:h-auto sm:rounded-lg sm:max-w-lg"
      >
        <div className="card-header flex flex-nowrap items-center justify-between gap-2">
          <h5 id="appt-sheet-title" className="mb-0 flex min-w-0 grow items-center gap-2 text-base">
            <Icon icon="calendar-check" className="text-primary shrink-0 text-lg" />
            <span className="truncate">ส่งสรุปนัด</span>
          </h5>
          {/* size-11! = 44px — `.btn.btn-icon` ของธีมเป็น 37px ซึ่งต่ำกว่าเกณฑ์ที่ design.json
              ประกาศไว้เอง และบนมือถือชีตนี้เต็มจอ (ไม่มีฉากหลังให้แตะ) ปุ่มนี้จึงเป็นทางออกเดียว */}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label="ปิด"
            className="btn btn-icon text-default-700 hover:bg-default-100 size-11! shrink-0"
          >
            <Icon icon="x" className="text-lg" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          {loadError ? (
            /* บอกเหตุผลจริงจาก server ตรง ๆ (ไม่มีนัด / นัดจบแล้ว / ร้านไม่ได้ใช้คิวงาน) —
               ข้อความรวม ๆ ว่า "ลองใหม่อีกครั้ง" จะเชิญให้กดวนสิ่งที่ไม่มีทางสำเร็จ
               แต่เน็ตหลุด/5xx เป็นคนละเรื่อง: ไม่มีปุ่มลองใหม่ = ชีตตาย ทางกลับเดียวคือปิดแล้วเปิดใหม่
               ซึ่งไม่มีอะไรบอกผู้ใช้ */
            <div role="alert">
              <p className="text-danger-ink bg-danger/15 mb-0 rounded-lg px-3 py-2 text-sm">
                {loadError.message}
              </p>
              {loadError.retryable && (
                <button
                  type="button"
                  onClick={() => void load()}
                  className="btn bg-default-100 text-default-800 hover:bg-default-200 mt-3 min-h-11 w-full gap-2"
                >
                  <Icon icon="refresh" className="text-base" aria-hidden="true" />
                  ลองอีกครั้ง
                </button>
              )}
            </div>
          ) : !summary ? (
            <p className="text-default-500 py-8 text-center text-sm" role="status">
              กำลังโหลดข้อมูลนัด…
            </p>
          ) : (
            <>
          {/**
           * ── ส่งไปที่ ── **แสดงเสมอ ห้ามซ่อนตอนมีห้องเดียว** (impeccable critique P0)
           *
           * ของเดิมโผล่เฉพาะ `targets.length > 1` ⇒ เคสห้องเดียวซึ่งเป็นเคสส่วนใหญ่ ผู้ขายกดส่ง
           * ข้อความที่ **ถอนคืนไม่ได้และไม่มี idempotent guard** โดยที่จอไม่เคยบอกว่าส่งไปหาใคร
           * เปิดจาก `/orders/[token]` ยิ่งหนัก เพราะผู้ขายไม่ได้อยู่ในแชทด้วยซ้ำ
           *
           * `route.ts` บันทึกไว้เองว่า "ส่งผิดห้อง" เป็น failure mode จริง แล้วแก้ด้วยการเรียงลำดับ
           * ให้ถูก — แต่ค่าตั้งต้นที่ถูกและผู้ใช้มองไม่เห็น ไม่ใช่การยืนยัน มันคือความบังเอิญ
           * (มาตรฐานเดียวกับที่ `AppointmentCard` ร้อย `buyerLabel` เข้ากล่องยืนยันเพราะกดผิดใบแล้วย้อนไม่ได้)
           *
           * อยู่ **เหนือ** พรีวิว: เลือกคนรับก่อน แล้วค่อยตรวจของที่เขาจะได้
           */}
          {/**
           * เคยส่งไปแล้ว — **บอกอย่างเดียว ไม่ขวาง** (user เคาะ 2026-08-12)
           *
           * ระบบไม่มี idempotent guard โดยตั้งใจ เพราะร้านส่งเตือนซ้ำก่อนถึงวันนัดเป็นเรื่องปกติ
           * แต่ "ไม่ขวาง" ไม่ได้แปลว่า "ไม่บอก" — เคสที่เกิดจริงคือเน็ตหลุดตอนเห็นสปินเนอร์ แล้ว
           * ผู้ขายไม่แน่ใจว่าออกไปหรือยัง ⇒ ลูกค้าได้การ์ดยืนยันสองใบ ซึ่งอ่านได้ทางเดียวว่า
           * "การจองมีอะไรผิดพลาด" — ตรงข้ามกับเหตุผลทั้งหมดที่ฟีเจอร์นี้มีอยู่
           *
           * โทน warning ไม่ใช่ danger: นี่คือข้อเท็จจริงที่ต้องรู้ก่อนตัดสินใจ ไม่ใช่ความผิดพลาด
           */}
          {loaded?.lastSentAt && (
            <p className="text-warning-ink bg-warning/15 mb-0 flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
              <Icon icon="history" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
              <span className="min-w-0">
                ส่งสรุปนัดใบนี้ไปแล้วเมื่อ {formatDateTimeTH(loaded.lastSentAt)}
              </span>
            </p>
          )}

          <section>
            <p className="text-default-700 mb-2 text-xs font-semibold">ส่งไปที่</p>
            {(loaded?.targets.length ?? 0) > 1 ? (
              <>
                <label htmlFor="appt-target" className="sr-only">
                  เลือกห้องแชทปลายทาง
                </label>
                {/* 🛑 `min-h-11` เพราะ `.form-select` = `h-11 lg:h-9.25` เหมือน `.form-input` เป๊ะ
                    และ `lg:` เป็น **viewport query ไม่ใช่ container** ⇒ ชีตที่กว้างแค่ `sm:max-w-lg`
                    บนจอเดสก์ท็อปได้ช่องสูง 37px · รอบก่อนแก้ `textarea` แล้วไม่ได้ไล่ดูว่าใครใช้กฎ
                    เดียวกันอีกในไฟล์เดียวกัน · ใช้ `min-height` ไม่ใช่ `height` เพราะ `_forms.css`
                    ไม่ได้ห่อ `@layer` — utility ที่ตั้ง `height` จะแพ้ แต่คนละ property ชนะได้ */}
                <select
                  id="appt-target"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="form-select min-h-11"
                >
                  {loaded?.targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {targetLabel(t)}
                    </option>
                  ))}
                </select>
              </>
            ) : loaded?.targets[0] ? (
              <p className="text-default-900 bg-default-100 mb-0 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm">
                <Icon icon="send" className="text-default-700 shrink-0 text-base" aria-hidden="true" />
                <span className="min-w-0">{targetLabel(loaded.targets[0])}</span>
              </p>
            ) : (
              /* ไม่มีห้องเลย — บอกทั้งสาเหตุและทางออกตรงนี้ ไม่ใช่ไปโผล่ใต้ปุ่มที่กดไม่ได้ */
              <p className="text-warning-ink bg-warning/15 mb-0 rounded-lg px-3 py-2 text-sm">
                ลูกค้ารายนี้ยังไม่มีห้องแชทกับร้าน — ต้องเคยคุยกันในแชทอย่างน้อยหนึ่งครั้งจึงจะส่งได้
              </p>
            )}
          </section>

          {/* ── พรีวิว: การ์ดหน้าตาเดียวกับที่ลูกค้าจะได้รับ ─────────────────────── */}
          {/* หัวข้อนี้หนักกว่า section อื่นโดยตั้งใจ (text-sm/default-800 vs text-xs/default-700) —
              พรีวิวคือเหตุผลทั้งหมดที่ชีตนี้มีอยู่ ไม่ควรมีน้ำหนักเท่าป้ายช่องข้อความปิดท้าย */}
          <section aria-label="ตัวอย่างที่จะส่ง">
            <p className="text-default-800 mb-2 text-sm font-semibold">ตัวอย่างที่จะส่ง</p>
            <div className="border-default-200 rounded-lg border">
              <div className="border-default-200 flex items-center gap-2 border-b px-3 py-2.5">
                <span className="bg-primary/15 text-primary flex size-7 shrink-0 items-center justify-center rounded">
                  <Icon icon="calendar-event" className="text-base" aria-hidden="true" />
                </span>
                <span className="text-default-900 text-sm font-semibold">{summary.title}</span>
              </div>
              <div className="space-y-2 px-3 py-2.5">
                {summary.lines.map((l) => (
                  <div key={l.key} className="flex items-start gap-2 text-sm">
                    <Icon
                      icon={LINE_ICON[l.key]}
                      className="text-default-500 mt-0.5 shrink-0 text-base"
                      aria-hidden="true"
                    />
                    {/* ป้ายต้อง **มองเห็น** ไม่ใช่ sr-only — การ์ด Flex ที่ลูกค้าได้รับแสดงป้ายจริง
                        (label/value rows) การซ่อนไว้ทำให้พรีวิวของผู้ขายที่ตามองเห็น ตรงกับของจริง
                        น้อยกว่าที่ screen reader ได้ยิน ซึ่งกลับด้านกับเจตนา */}
                    <span className="text-default-500 shrink-0">{l.label}</span>
                    <span className="text-default-900 min-w-0 flex-1 text-end font-medium">{l.value}</span>
                  </div>
                ))}
                {summary.closing && (
                  <p className="text-default-700 mb-0 pt-1 text-sm">{summary.closing}</p>
                )}
              </div>
            </div>
            {/* 🛑 เคยเขียนว่า "ตัวอย่างที่ลูกค้าจะได้รับ" ซึ่งไม่จริงสำหรับ 3 ใน 4 ช่องทาง:
                LINE เป็น label/value rows · Messenger/IG ได้ subtitle แค่ "วันเวลา · บริการ"
                ที่เหลือไปอยู่ข้อความแยก · DEEP เป็น OrderCardBubble อีกทรง
                บอกตามตรงดีกว่าอ้างความเหมือนที่ไม่มีอยู่ */}
            <p className="text-default-500 mb-0 mt-2 text-xs">
              รูปแบบการ์ดจะต่างกันเล็กน้อยตามแอปที่ลูกค้าใช้
            </p>
          </section>

          {/* ── ติ๊กบรรทัดที่จะแสดง ────────────────────────────────────────────── */}
          <section>
            {/* ต้องไม่ใช้ก้านคำเดียวกับหัวพรีวิว — "ข้อมูลที่จะส่ง" กับ "เลือกข้อมูลที่จะส่ง" ต่างกัน
                คำเดียว วางติดกัน แล้วต่างกันแค่ 1px กับเทาหนึ่งขั้น ผู้ขายต้องคิดว่าอันไหนคุมอันไหน */}
            <p className="text-default-700 mb-2 text-xs font-semibold">แสดงข้อมูลไหนบ้าง</p>
            {available.map((key) => {
              const locked = key === 'when'
              const on = !hidden.includes(key)
              return (
                <label
                  key={key}
                  className={`flex min-h-11 items-center gap-3 text-sm ${locked ? 'text-default-700' : 'text-default-900 cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    /* 🛑 `when` ปิดไม่ได้ — การ์ดชื่อ "ยืนยันนัดหมาย" ที่ไม่มีวันนัดคือของที่ทำให้
                       ลูกค้ามาผิดวัน. ด่านจริงอยู่ที่ schema ฝั่ง server (allow-list ที่ไม่มี 'when')
                       ตัวนี้เป็นแค่ชั้นแรก — UI กันได้แค่คนที่เดินผ่านประตู */
                    disabled={locked}
                    // ผูกเหตุผลเข้ากับ checkbox — ไม่งั้น screen reader ได้ยินแค่ "ปิดใช้งาน" ลอย ๆ
                    aria-describedby={locked ? 'appt-line-locked' : undefined}
                    onChange={() => !locked && toggle(key)}
                    className="form-checkbox"
                  />
                  <span className="min-w-0 flex-1">{APPOINTMENT_SUMMARY_LABEL[key]}</span>
                  {locked && (
                    <span id="appt-line-locked" className="text-default-500 shrink-0 text-xs">
                      ต้องมีเสมอ
                    </span>
                  )}
                </label>
              )
            })}
          </section>

          {/* ── ข้อความปิดท้าย ──────────────────────────────────────────────────── */}
          <section>
            <label htmlFor="appt-closing" className="text-default-700 mb-2 block text-xs font-semibold">
              ข้อความปิดท้าย
            </label>
            {/* 🛑 `form-textarea` ไม่ใช่ `form-input` — `_forms.css` ไม่ได้ห่อ `@layer` ⇒ `.form-input`
                (`h-11 lg:h-9.25` + `py-0`) ชนะทุก utility และทับ `rows` ทิ้ง ได้กล่องบรรทัดเดียว
                สูง 37px บนเดสก์ท็อปสำหรับฟิลด์ 120 ตัวอักษร · กฎนี้เขียนไว้แล้วที่ ChatThread.tsx
                (`unlayered-css-beats-utilities.md`) · `maxLength` ให้ native cap ยิงเอง AT จะได้ประกาศ
                ส่วน `slice` คงไว้กันวางทับจากคลิปบอร์ด */}
            <textarea
              id="appt-closing"
              value={closing}
              onChange={(e) => setClosing(e.target.value.slice(0, APPOINTMENT_CLOSING_MAX))}
              maxLength={APPOINTMENT_CLOSING_MAX}
              rows={2}
              className="form-textarea"
              placeholder="เว้นว่างได้ถ้าไม่ต้องการข้อความปิดท้าย"
            />
            <p
              className="text-default-500 mb-0 mt-1 text-end text-xs tabular-nums"
              aria-live="polite"
            >
              {closing.length}/{APPOINTMENT_CLOSING_MAX}
            </p>
          </section>
            </>
          )}
        </div>

        <div className="border-default-200 shrink-0 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"> {/* carve-out: safe-area ไม่มี token ในธีม */}
          {/* ยกเลิกอยู่คู่กับส่ง — บนมือถือชีตเต็มจอ ไม่มีฉากหลังให้แตะ ถ้าไม่มีปุ่มนี้ ทางออกเดียว
              คือปุ่มมุมขวาบน ขณะที่ปุ่มที่ถอนคืนไม่ได้นั่งอยู่ในโซนนิ้วโป้ง = ทางที่ง่ายที่สุด
              จากการกดพลาดคือการส่ง (แพตเทิร์นเดียวกับ footer ของ AppointmentCard) */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11 flex-1 disabled:opacity-60"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !targetId || !summary}
              className="btn bg-primary hover:bg-primary-hover min-h-11 flex-[2] items-center justify-center gap-2 text-white disabled:opacity-60"
            >
              {/* spinner อยู่บนปุ่ม ไม่ใช่ overlay ทับทั้งชีต — ผู้ขายต้องยังอ่านสิ่งที่ตัวเองกำลังส่งได้ */}
              <Icon
                icon={sending ? 'loader-2' : 'send'}
                className={`text-base ${sending ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {/* คำบนปุ่มต้องตรงกับสิ่งที่กำลังจะเกิด — กดครั้งที่สองไม่ใช่ "ส่ง" มันคือ "ส่งอีกครั้ง" */}
              {loaded?.lastSentAt ? 'ส่งอีกครั้ง' : 'ส่งเข้าแชท'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
