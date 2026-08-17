'use client'

/**
 * StartWalkInSheet — "ลูกค้าเดินเข้ามาเลย เริ่มงานตอนนี้" (feature 00050 · BR-SQ-20/21)
 *
 * ## ปัญหาที่แก้
 *
 * ร้านคิวงานมี 2 ทางเข้า: จองล่วงหน้า กับ **เดินเข้ามาเลย** — แต่ระบบรองรับทางเดียว
 * ออเดอร์ที่ไม่ได้ตั้งนัดจะมี `serviceStart = null` แล้ว **หายจากตารางงานทั้งวัน** เพราะ query
 * กรองด้วย `serviceStart < to AND serviceEnd > from` ซึ่ง `null` ไม่เข้าเงื่อนไขทั้งคู่
 * ⇒ ร้านมีงานที่กำลังทำอยู่จริง แต่ตารางบอกว่าวันนี้ว่าง และไม่มีอะไรฟ้องเลย
 *
 * 🛑 ชีตนี้ **ไม่ได้สร้าง endpoint ใหม่** — `PATCH /api/orders/[token]/appointment` ทำงานนี้ได้
 * อยู่แล้วตั้งแต่ feature 00024 (รับ resourceId/start/end) สิ่งที่ขาดคือ *ทางเข้าที่แปลว่า
 * "เริ่มตอนนี้"* การเขียน endpoint ที่สองสำหรับเรื่องเดียวกันคือที่ที่กติกาสองชุดจะเพี้ยนจากกัน
 * (ประวัติการเลื่อนนัด · ที่นั่ง · EXCLUDE constraint ล้วนอยู่ในเส้นทางเดิมแล้ว)
 *
 * Base (เปลือกชีต + focus trap + แยก error retryable): ./AppointmentSummarySheet.tsx
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { pacesToast } from '@/lib/paces-toast'
import { formatTimeHM } from '@/lib/format-date'
import {
  DEFAULT_APPOINTMENT_DURATION_MIN,
  formatDurationTH,
  walkInWindow,
} from '@/lib/appointments'

/** ทรัพยากรที่จองเวลาได้ — shape ย่อจาก `GET /api/shops/current/service-resources` */
interface ResourceRow {
  id: string
  name: string
  capacity: number
  defaultDurationMin?: number | null
  isActive?: boolean
}

/**
 * ตัวเลือกระยะเวลา — ชุดเดียวกับที่ผู้ขายเห็นตอนจองล่วงหน้า (00024) เพื่อไม่ให้เกิด
 * "ชุดตัวเลขของ walk-in" ที่ต่างจาก "ชุดตัวเลขของการจอง" ในระบบเดียวกัน
 */
const DURATION_CHOICES = [30, 60, 90, 120] as const

export interface StartWalkInSheetProps {
  open: boolean
  onClose: () => void
  orderToken: string
  /** ป้ายที่ผู้ใช้เห็น — กันกดผิดใบเมื่อเธรดมีหลายใบ */
  orderLabel: string
  /** ร้านของเธรด — ส่งเป็น `?shopId=` (เธรดข้ามร้านเปิดได้ · BR-UNI-07) */
  shopId: string | null
  /** ยิงเมื่อเริ่มงานสำเร็จ — ผู้เรียกต้อง refresh ข้อมูลของตัวเอง */
  onStarted?: () => void
}

export default function StartWalkInSheet({
  open,
  onClose,
  orderToken,
  orderLabel,
  shopId,
  onStarted,
}: StartWalkInSheetProps) {
  useLockBodyScroll(open)

  const [resources, setResources] = useState<ResourceRow[] | null>(null)
  const [loadError, setLoadError] = useState<{ message: string; retryable: boolean } | null>(null)
  const [resourceId, setResourceId] = useState('')
  const [durationMin, setDurationMin] = useState<number>(DEFAULT_APPOINTMENT_DURATION_MIN)
  const [saving, setSaving] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  const qs = shopId ? `?shopId=${encodeURIComponent(shopId)}` : ''

  const load = useCallback(async () => {
    setResources(null)
    setLoadError(null)
    try {
      const sep = qs ? '&' : '?'
      const res = await fetch(`/api/shops/current/service-resources${qs}${sep}activeOnly=1`, {
        cache: 'no-store',
      })
      const json: unknown = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError({
          message: (json as { error?: string }).error ?? 'โหลดรายการคิวงานไม่สำเร็จ',
          // 5xx/เน็ต = ลองใหม่มีโอกาส · 4xx = server ตัดสินแล้ว ลองกี่ครั้งก็เท่าเดิม
          retryable: res.status >= 500,
        })
        return
      }
      const list = (json as { resources?: ResourceRow[] }).resources ?? []
      setResources(list)
      /**
       * มีคิวงานเดียว → เลือกให้เลย ผู้ขายเหลือกดยืนยันครั้งเดียว
       *
       * 🛑 มีหลายคิว → **ไม่เลือกให้** ต้องกดเอง: การเดาว่าเป็นคิวไหนแปลว่างานไปนั่งทับ
       * ที่นั่งของคิวอื่น แล้วตารางงานทั้งวันผิดโดยที่ไม่มีใครสังเกต
       */
      if (list.length === 1) {
        setResourceId(list[0].id)
        setDurationMin(list[0].defaultDurationMin || DEFAULT_APPOINTMENT_DURATION_MIN)
      }
    } catch {
      setLoadError({ message: 'โหลดรายการคิวงานไม่สำเร็จ', retryable: true })
    }
  }, [qs])

  useEffect(() => {
    if (!open) return
    setResourceId('')
    setDurationMin(DEFAULT_APPOINTMENT_DURATION_MIN)
    void load()
  }, [open, load])

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose, saving])

  /** โฟกัส: ย้ายเข้า · ขังไว้ · คืนที่เดิม — `aria-modal` ไม่ได้ทำอะไรกับคีย์บอร์ดเลย */
  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null
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

  async function handleStart() {
    if (!resourceId || saving) return
    setSaving(true)
    try {
      /**
       * `new Date()` ตอนกด ไม่ใช่ตอนเปิดชีต — ชีตอาจเปิดค้างไว้หลายนาทีระหว่างที่ผู้ขาย
       * คุยกับลูกค้าอยู่ เวลาที่บันทึกต้องเป็นเวลาที่ "เริ่มจริง" ไม่ใช่เวลาที่เปิดจอ
       */
      const { start, end } = walkInWindow(new Date(), durationMin)
      const res = await fetch(`/api/orders/${orderToken}/appointment${qs}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceId,
          start: start.toISOString(),
          end: end.toISOString(),
        }),
      })
      const json: unknown = await res.json().catch(() => ({}))
      if (!res.ok) {
        pacesToast.error(errorText(json))
        return
      }
      pacesToast.success(`เริ่มงาน ${orderLabel} แล้ว`)
      onStarted?.()
      onClose()
    } catch {
      pacesToast.error('เริ่มงานไม่สำเร็จ ตรวจสอบสัญญาณแล้วลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const preview = walkInWindow(new Date(), durationMin)

  return (
    <div
      className="fixed inset-0 z-90 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="walkin-sheet-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="card bg-card flex h-full max-h-full w-full flex-col rounded-b-none sm:h-auto sm:rounded-lg sm:max-w-lg"
      >
        <div className="card-header flex flex-nowrap items-center justify-between gap-2">
          <h5 id="walkin-sheet-title" className="mb-0 flex min-w-0 grow items-center gap-2 text-base">
            <Icon icon="player-play" className="text-primary shrink-0 text-lg" />
            <span className="truncate">เริ่มงานเลย · {orderLabel}</span>
          </h5>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="ปิด"
            className="btn btn-icon text-default-700 hover:bg-default-100 size-11! shrink-0"
          >
            <Icon icon="x" className="text-lg" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          {loadError ? (
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
          ) : resources === null ? (
            <p className="text-default-500 py-8 text-center text-sm" role="status">
              กำลังโหลดรายการคิวงาน…
            </p>
          ) : resources.length === 0 ? (
            /* ไม่มีคิวงานเลย = ตั้งค่าร้านยังไม่ครบ — บอกทางออกตรงนี้ ไม่ใช่ปล่อยให้กดปุ่มที่ไม่ทำงาน */
            <p className="text-warning-ink bg-warning/15 mb-0 rounded-lg px-3 py-2 text-sm">
              ร้านยังไม่มีคิวงาน — เพิ่มที่หน้าตารางงานก่อน แล้วค่อยกลับมาเริ่มงานนี้
            </p>
          ) : (
            <>
              <section>
                <p className="text-default-700 mb-2 text-xs font-semibold">เข้าคิวงานไหน</p>
                <div className="space-y-2">
                  {resources.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setResourceId(r.id)
                        if (r.defaultDurationMin) setDurationMin(r.defaultDurationMin)
                      }}
                      aria-pressed={resourceId === r.id}
                      className={`btn min-h-11 w-full items-center justify-start gap-2 text-start ${
                        resourceId === r.id
                          ? 'bg-primary/15 text-primary-ink'
                          : 'bg-default-100 text-default-800 hover:bg-default-200'
                      }`}
                    >
                      <Icon
                        icon={resourceId === r.id ? 'circle-check' : 'circle'}
                        className="shrink-0 text-base"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 truncate">{r.name}</span>
                      {/* คำว่า "ที่นั่ง" (serviceSeat) เป็นกลไกภายใน ห้ามโผล่บนจอ — ใช้ "คิว" */}
                      <span className="text-default-600 ms-auto shrink-0 text-xs">
                        {r.capacity} คิว
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <p className="text-default-700 mb-2 text-xs font-semibold">ใช้เวลาประมาณ</p>
                <div className="flex flex-wrap gap-2">
                  {DURATION_CHOICES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDurationMin(d)}
                      aria-pressed={durationMin === d}
                      className={`btn min-h-11 flex-1 basis-20 items-center justify-center ${
                        durationMin === d
                          ? 'bg-primary hover:bg-primary-hover text-white'
                          : 'bg-default-100 text-default-800 hover:bg-default-200'
                      }`}
                    >
                      {formatDurationTH(d)}
                    </button>
                  ))}
                </div>
              </section>

              {/* บอกเวลาที่จะถูกบันทึกจริง — ผู้ขายต้องเห็นก่อนกด ไม่ใช่ไปรู้ตอนเปิดตารางงาน */}
              <p className="text-default-700 bg-default-100 mb-0 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm">
                <Icon icon="clock" className="text-default-600 shrink-0 text-base" aria-hidden="true" />
                <span className="min-w-0">
                  เริ่ม {formatTimeHM(preview.start.toISOString())} — ประมาณ{' '}
                  {formatTimeHM(preview.end.toISOString())} น. ของวันนี้
                </span>
              </p>
            </>
          )}
        </div>

        <div className="border-default-200 shrink-0 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* carve-out HR7: safe-area ไม่มี token ในธีม Paces */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11 flex-1 disabled:opacity-60"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={saving || !resourceId}
              className="btn bg-primary hover:bg-primary-hover min-h-11 flex-[2] items-center justify-center gap-2 text-white disabled:opacity-60"
            >
              <Icon
                icon={saving ? 'loader-2' : 'player-play'}
                className={`text-base ${saving ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              เริ่มงานตอนนี้
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * แปล error จาก `PATCH /api/orders/[token]/appointment` เป็นคำที่บอกทางออก
 *
 * 🛑 "คิวเต็ม" ต้องบอกว่าเต็มของอะไรและทำอะไรต่อได้ — ข้อความรวม ๆ ว่า "ลองใหม่อีกครั้ง"
 * คือคำเชิญให้กดสิ่งที่ไม่มีวันสำเร็จตราบใดที่คิวยังเต็มอยู่ (บทเรียน iShip 2026-08-06)
 */
function errorText(json: unknown): string {
  const e = json as { error?: string | { code?: string; message?: string } }
  const raw = typeof e.error === 'string' ? e.error : e.error?.code
  const message = typeof e.error === 'object' ? e.error?.message : undefined
  switch (raw) {
    case 'APPOINTMENT_SLOT_FULL':
      return message ?? 'คิวนี้เต็มในช่วงเวลานี้ — เลือกคิวอื่น หรือลดเวลาที่ใช้ลง'
    case 'APPOINTMENT_TERMINAL':
      return 'งานใบนี้ปิดผลไปแล้ว เริ่มใหม่ไม่ได้'
    case 'APPOINTMENT_NOT_FOUND':
      return 'ไม่พบงานใบนี้ในร้านที่เปิดอยู่ ลองปิดแล้วเปิดเธรดใหม่'
    case 'RESOURCE_NOT_FOUND':
      return 'คิวงานนี้ถูกปิดไปแล้ว เลือกคิวอื่น'
    case 'FORBIDDEN':
      return 'ไม่มีสิทธิ์ในร้านนี้'
    default:
      return message ?? 'เริ่มงานไม่สำเร็จ ลองใหม่อีกครั้ง'
  }
}
