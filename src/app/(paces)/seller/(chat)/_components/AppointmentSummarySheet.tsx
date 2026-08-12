'use client'

/**
 * AppointmentSummarySheet — พรีวิว "สรุปนัดหมาย" ก่อนส่งเข้าแชท (ส่วนขยาย 00024, 2026-08-11)
 *
 * user เคาะว่าไม่ส่งทันที ต้อง **เห็นก่อน แก้ได้ แล้วค่อยกดส่ง** เพราะข้อความนี้ออกไปหาลูกค้าแล้ว
 * ถอนคืนไม่ได้ และร้านแต่ละที่มีนโยบายต่างกันว่าจะใส่เบอร์/ยอดเงินลงไปด้วยไหม
 *
 * วางที่ `(chat)/_components` ไม่ใช่ในโฟลเดอร์ห้องแชท เพราะ **2 ใน 4 จุดเรียกอยู่นอกห้องแชท**
 * (`/orders/[token]` และปฏิทิน `/queues`)
 *
 * เนื้อหาและคำทั้งหมดมาจาก `buildAppointmentSummary()` ตัวเดียวกับที่ route ใช้ประกอบของจริง —
 * พรีวิวที่คำนวณเองจะเพี้ยนจากสิ่งที่ส่งจริงได้โดยไม่มีอะไรฟ้อง (HR16)
 *
 * Base (เปลือกโมดัล): ../inbox/[conversationId]/components/QuickMessageManager.tsx
 */

import { useEffect, useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { pacesToast } from '@/lib/paces-toast'
import { getChannelLabel } from '@/lib/chat-channel'
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
 * 🛑 จำ "บรรทัดไหนแสดง" ต่อร้าน ไม่ใช่ต่อผู้ใช้หรือต่อออเดอร์
 *
 * ร้านหนึ่งมีนโยบายเดียว (ร้านที่ไม่อยากส่งเบอร์ให้ลูกค้าไม่ควรต้องติ๊กออกทุกใบ) แต่ผู้ขายที่ดูแล
 * หลายร้านมีนโยบายต่างกัน — key จึงต้องมี `shopId` เสมอ
 */
const storageKey = (shopId: string) => `deep:appt-summary-lines:${shopId}`

interface LoadedSummary {
  shopId: string
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hidden, setHidden] = useState<AppointmentSummaryKey[]>([])
  const [closing, setClosing] = useState(DEFAULT_APPOINTMENT_CLOSING)
  const [targetId, setTargetId] = useState<string>('')
  const [sending, setSending] = useState(false)

  /**
   * โหลดตอนเปิดเท่านั้น — 🛑 ห้ามย้ายไปรับเป็น prop: สรุปนัดมีเบอร์โทรลูกค้าอยู่ในนั้น และหน้า
   * seller อยู่ใต้ client layout ⇒ prop จะถูก serialize ลง flight payload ของทุกหน้าที่มีปุ่มนี้
   * ไม่ว่าผู้ขายจะกดเปิดหรือไม่ (`feedback_rsc_pii_neutralize_at_source`)
   */
  useEffect(() => {
    if (!open) return
    let alive = true
    setLoaded(null)
    setLoadError(null)
    void (async () => {
      try {
        const res = await fetch(`/api/orders/${orderToken}/appointment-summary`)
        const json = await res.json().catch(() => ({}))
        if (!alive) return
        if (!res.ok) {
          setLoadError((json as { error?: string }).error ?? 'โหลดข้อมูลนัดไม่สำเร็จ')
          return
        }
        setLoaded(json as LoadedSummary)
        setTargetId((json as LoadedSummary).targets[0]?.id ?? '')
      } catch {
        if (alive) setLoadError('โหลดข้อมูลนัดไม่สำเร็จ')
      }
    })()
    return () => {
      alive = false
    }
  }, [open, orderToken])

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

  const summary = useMemo(
    () => (loaded ? buildAppointmentSummary(loaded.data, { hiddenKeys: hidden, closing }) : null),
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
      pacesToast.success('ส่งสรุปนัดเข้าแชทแล้ว')
      onSent?.()
      onClose()
    } catch {
      pacesToast.error('ส่งไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setSending(false)
    }
  }

  const targetLabel = (t: AppointmentTarget) =>
    [getChannelLabel(t.channel), t.contactName ?? t.pageName].filter(Boolean).join(' · ')

  return (
    <div
      className="fixed inset-0 z-90 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ส่งสรุปนัดหมาย"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !sending) onClose()
      }}
    >
      <div className="card bg-card flex h-full max-h-full w-full flex-col rounded-b-none sm:h-160 sm:rounded-lg sm:max-w-lg">
        <div className="card-header flex flex-nowrap items-center justify-between gap-2">
          <h5 className="mb-0 flex min-w-0 grow items-center gap-2 text-base">
            <Icon icon="calendar-check" className="text-primary shrink-0 text-lg" />
            <span className="truncate">ส่งสรุปนัดหมาย</span>
          </h5>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label="ปิด"
            className="btn btn-icon text-default-700 hover:bg-default-100 shrink-0"
          >
            <Icon icon="x" className="text-lg" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          {loadError ? (
            /* บอกเหตุผลจริงจาก server ตรง ๆ (ไม่มีนัด / นัดจบแล้ว / ร้านไม่ได้ใช้คิวงาน) —
               ข้อความรวม ๆ ว่า "ลองใหม่อีกครั้ง" จะเชิญให้กดวนสิ่งที่ไม่มีทางสำเร็จ */
            <p className="text-danger-ink bg-danger/15 mb-0 rounded-lg px-3 py-2 text-sm" role="alert">
              {loadError}
            </p>
          ) : !summary ? (
            <p className="text-default-500 py-8 text-center text-sm" role="status">
              กำลังโหลดข้อมูลนัด…
            </p>
          ) : (
            <>
          {/* ── พรีวิว: การ์ดหน้าตาเดียวกับที่ลูกค้าจะได้รับ ─────────────────────── */}
          <section aria-label="ตัวอย่างที่ลูกค้าจะได้รับ">
            <p className="text-default-700 mb-2 text-xs font-semibold">ตัวอย่างที่ลูกค้าจะได้รับ</p>
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
                    {/* ป้ายอยู่ใน sr-only: บนการ์ดจริงไอคอนสื่อความหมายพอ แต่ผู้ใช้ screen reader
                        ต้องได้ยินว่าค่าที่อ่านอยู่คืออะไร (ไอคอนถูก aria-hidden ไปแล้ว) */}
                    <span className="sr-only">{l.label}:</span>
                    <span className="text-default-900 min-w-0 font-medium">{l.value}</span>
                  </div>
                ))}
                {summary.closing && (
                  <p className="text-default-700 mb-0 pt-1 text-sm">{summary.closing}</p>
                )}
              </div>
            </div>
          </section>

          {/* ── เลือกห้องแชท: โผล่เฉพาะเมื่อลูกค้ารายนี้มีมากกว่า 1 ห้อง ──────────── */}
          {(loaded?.targets.length ?? 0) > 1 && (
            <section>
              <label htmlFor="appt-target" className="text-default-700 mb-2 block text-xs font-semibold">
                ส่งไปที่
              </label>
              <select
                id="appt-target"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="form-select"
              >
                {loaded?.targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {targetLabel(t)}
                  </option>
                ))}
              </select>
            </section>
          )}

          {/* ── ติ๊กบรรทัดที่จะแสดง ────────────────────────────────────────────── */}
          <section>
            <p className="text-default-700 mb-1 text-xs font-semibold">แสดงบรรทัด</p>
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
                    onChange={() => !locked && toggle(key)}
                    className="form-checkbox"
                  />
                  <span className="min-w-0 flex-1">{APPOINTMENT_SUMMARY_LABEL[key]}</span>
                  {locked && <span className="text-default-500 shrink-0 text-xs">ต้องมีเสมอ</span>}
                </label>
              )
            })}
          </section>

          {/* ── ข้อความท้าย ──────────────────────────────────────────────────── */}
          <section>
            <label htmlFor="appt-closing" className="text-default-700 mb-2 block text-xs font-semibold">
              ข้อความท้าย
            </label>
            <textarea
              id="appt-closing"
              value={closing}
              onChange={(e) => setClosing(e.target.value.slice(0, APPOINTMENT_CLOSING_MAX))}
              rows={2}
              className="form-input"
              placeholder="เว้นว่างได้ถ้าไม่ต้องการข้อความปิดท้าย"
            />
            <p className="text-default-500 mb-0 mt-1 text-end text-xs tabular-nums">
              {closing.length}/{APPOINTMENT_CLOSING_MAX}
            </p>
          </section>
            </>
          )}
        </div>

        <div className="border-default-200 shrink-0 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"> {/* carve-out: safe-area ไม่มี token ในธีม */}
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !targetId || !summary}
            className="btn bg-primary hover:bg-primary-hover flex w-full items-center justify-center gap-2 text-white disabled:opacity-60"
          >
            {/* spinner อยู่บนปุ่ม ไม่ใช่ overlay ทับทั้งชีต — ผู้ขายต้องยังอ่านสิ่งที่ตัวเองกำลังส่งได้ */}
            <Icon
              icon={sending ? 'loader-2' : 'send'}
              className={`text-base ${sending ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            ส่งเข้าแชท
          </button>
          {/* ปุ่มที่กดไม่ได้โดยไม่บอกเหตุผลอ่านเป็นระบบพัง — เคสนี้เกิดจริงกับออเดอร์ที่ไม่มีเบอร์
              (ไม่ถูกผูก Customer จึงหาห้องแชทไม่เจอ) */}
          {summary && !targetId && (
            <p className="text-default-500 mb-0 mt-2 text-center text-xs">
              ลูกค้ารายนี้ยังไม่มีห้องแชทกับร้าน
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
