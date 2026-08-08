'use client'

/**
 * RescheduleAppointmentSheet — แผงเต็มจอสำหรับเลื่อนนัดจากหน้ารายละเอียดออเดอร์ (feature 00036 งาน C)
 *
 * Base (โครงชีต): ../../orders/new/components/AppointmentDateSheet.tsx
 *   (fixed inset-0 z-80 + หัวแผ่นปุ่มย้อนกลับ + ไอคอนในกรอบ bg-{semantic}/15 + useLockBodyScroll
 *   + แถบปุ่มยืนยันติดขอบล่างที่เผื่อ safe-area)
 * Base (การ์ดเลือกคิวงาน + ช่องเวลา): ../../orders/new/components/AppointmentBlock.tsx
 *
 * ทำไมต้องมี: `PATCH /api/orders/{token}/appointment` รองรับการเลื่อนนัดมาตั้งแต่ feature 00024
 * และลูกค้ากด "ขอเลื่อน" ได้จริงจากหน้า /o/{token} — แต่ **ไม่มี UI ฝั่งร้านที่เรียกมันเลยทั้งระบบ**
 * สถานะ RESCHEDULE_REQUESTED จึงเป็นทางตัน: ลูกค้าขอมาแล้วผู้ขายตอบไม่ได้
 *
 * IMPORTANT: ตัวเลข "จองแล้ว n จาก m คิว" ที่นี่ใช้แสดงผลและกันกดล่วงหน้าเท่านั้น ตัวตัดสินจริงคือ
 *   EXCLUDE constraint ตอนบันทึก (BR-RSV-18) — ระหว่างที่แผงเปิดค้าง อีกเครื่องจองแทรกได้เสมอ
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { formatDayMonthTimeRangeTH, formatDateTH } from '@/lib/format-date'
import AppointmentDateSheet from '../../new/components/AppointmentDateSheet'

type Resource = {
  id: string
  name: string
  capacity: number
  durationMinutes: number | null
  isActive: boolean
}

type Props = {
  open: boolean
  publicToken: string
  /** นัดเดิม — ใช้ pre-select และเป็นตัวบอกว่าโหมดไหน (ทั้งวัน vs ระบุช่วงเวลา) */
  startISO: string
  endISO: string | null
  allDay: boolean
  resourceId: string | null
  /** เหตุผลที่ลูกค้าฝากไว้ — โชว์ค้างไว้ระหว่างเลือกเวลาใหม่ ไม่ต้องจำจากหน้าก่อน */
  rescheduleRequestNote: string | null
  onClose: () => void
}

/** "YYYY-MM-DD" ตามเวลาเครื่อง — ห้าม toISOString() (จะเพี้ยนเป็น UTC) เหมือน AppointmentBlock */
function localDateKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function localTimeHM(d: Date): string {
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
}

/** HR7 carve-out: Paces ไม่มี token ของ safe-area และ border-box ทำให้ padding ไม่ดันความสูง */
const FOOTBAR_PAD = 'pb-[calc(1rem+env(safe-area-inset-bottom))]'

export default function RescheduleAppointmentSheet({
  open,
  publicToken,
  startISO,
  endISO,
  allDay,
  resourceId,
  rescheduleRequestNote,
  onClose,
}: Props) {
  const router = useRouter()
  useLockBodyScroll(open)

  const [resources, setResources] = useState<Resource[]>([])
  const [loadingResources, setLoadingResources] = useState(false)
  const [pickedResourceId, setPickedResourceId] = useState<string | null>(resourceId)
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [reason, setReason] = useState('')
  const [dateSheetOpen, setDateSheetOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  /** เปิดแผงใหม่ทุกครั้งต้องเริ่มจากค่าของนัดปัจจุบัน ไม่ใช่ค่าที่ค้างจากการเปิดครั้งก่อน */
  useEffect(() => {
    if (!open) return
    const s = new Date(startISO)
    const e = endISO ? new Date(endISO) : null
    setPickedResourceId(resourceId)
    setDate(localDateKey(s))
    setStartTime(allDay ? '' : localTimeHM(s))
    setEndTime(allDay || !e ? '' : localTimeHM(e))
    setReason('')
  }, [open, startISO, endISO, allDay, resourceId])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingResources(true)
    fetch('/api/shops/current/service-resources?activeOnly=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((data: { resources?: Resource[] }) => {
        if (!cancelled) setResources(data.resources ?? [])
      })
      .catch(() => {
        // โหลดรายชื่อคิวงานไม่สำเร็จ = เลือกคิวไม่ได้ ซึ่งบันทึกไม่ได้อยู่ดี (resourceId บังคับ)
        // จึงต้องบอกให้รู้ ไม่ปล่อยเงียบแบบตัวนับความว่างที่ล้มแล้วยังกรอกต่อได้
        if (!cancelled) pacesToast.error('โหลดรายการคิวงานไม่สำเร็จ — ปิดแล้วลองใหม่')
      })
      .finally(() => {
        if (!cancelled) setLoadingResources(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const picked = useMemo(
    () => resources.find((r) => r.id === pickedResourceId) ?? null,
    [resources, pickedResourceId],
  )

  /**
   * เติมเวลาสิ้นสุดให้อัตโนมัติจากความยาวมาตรฐานของคิวงาน — พฤติกรรมเดียวกับฟอร์มสร้างออเดอร์
   * ผู้ขายแก้ทับได้เสมอ (เป็นค่าเริ่มต้น ไม่ใช่ค่าบังคับ)
   */
  const applyStartTime = useCallback(
    (v: string) => {
      setStartTime(v)
      const mins = picked?.durationMinutes
      if (!v || !mins || mins <= 0) return
      const base = new Date(`${date || localDateKey(new Date())}T${v}`)
      if (Number.isNaN(base.getTime())) return
      setEndTime(localTimeHM(new Date(base.getTime() + mins * 60_000)))
    },
    [picked, date],
  )

  const canSubmit =
    !saving && !!pickedResourceId && !!date && (allDay || (!!startTime && !!endTime))

  const submit = async () => {
    if (!canSubmit) return
    /**
     * นัดทั้งวันส่งช่วง 00:00 ของวันนั้น ถึง 00:00 ของวันถัดไป — ตรงกับนิยามที่
     * isAllDayAppointment() ใช้ตัดสิน (ห้ามส่ง 23:59 ไม่งั้นนัดจะเลิกเป็น "ทั้งวัน" เงียบ ๆ)
     */
    const startLocal = allDay ? new Date(`${date}T00:00`) : new Date(`${date}T${startTime}`)
    const endLocal = allDay
      ? new Date(new Date(`${date}T00:00`).getTime() + 86_400_000)
      : new Date(`${date}T${endTime}`)
    if (Number.isNaN(startLocal.getTime()) || Number.isNaN(endLocal.getTime())) {
      pacesToast.error('วันหรือเวลาไม่ถูกต้อง')
      return
    }
    if (endLocal.getTime() <= startLocal.getTime()) {
      pacesToast.error('เวลาสิ้นสุดต้องมาหลังเวลาเริ่ม')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/orders/${publicToken}/appointment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceId: pickedResourceId,
          start: startLocal.toISOString(),
          end: endLocal.toISOString(),
          reason: reason.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
        // ทุกข้อความต้องบอก "ทางออกที่ทำได้จริง" ไม่ใช่แค่บอกว่าล้มเหลว (BR-SOV-05)
        // TERMINAL = นัดจบไปแล้วระหว่างเปิดแผงค้าง → แผงนี้ไม่มีประโยชน์อีก ปิดทิ้งแล้วรีเฟรช
        // ที่เหลือให้แผงเปิดค้างไว้ เพราะผู้ขายแก้ตัวเลือกแล้วกดซ้ำได้ทันที
        const terminal = data.error === 'APPOINTMENT_TERMINAL'
        const message =
          data.error === 'APPOINTMENT_SLOT_FULL'
            ? `${data.message ?? 'ช่วงเวลานี้เต็มแล้ว'} — เลือกเวลาอื่นหรือคิวงานอื่น`
            : terminal
              ? 'นัดนี้ถูกปิดผลไปแล้ว จึงเลื่อนไม่ได้'
              : data.error === 'RESOURCE_INACTIVE'
                ? 'คิวงานนี้ถูกปิดใช้งานแล้ว — เลือกคิวงานอื่น'
                : data.error === 'RESOURCE_NOT_FOUND'
                  ? 'ไม่พบคิวงานนี้แล้ว — เลือกคิวงานอื่น'
                  : data.error === 'APPOINTMENT_NOT_FOUND'
                    ? 'ไม่พบนัดนี้แล้ว — รีเฟรชหน้าเพื่อดูข้อมูลล่าสุด'
                    : data.error === 'INVALID_APPOINTMENT_RANGE'
                      ? (data.message ?? 'เวลาสิ้นสุดต้องมาหลังเวลาเริ่ม')
                      : 'เลื่อนนัดไม่สำเร็จ — ตรวจวันเวลาแล้วลองอีกครั้ง'
        pacesToast.error(message)
        if (terminal) {
          onClose()
          router.refresh()
        }
        return
      }
      /**
       * บอกผลข้างเคียงที่ผู้ขายต้องรู้ทันที: service ล้าง buyerConfirmedAt ทุกครั้งที่เลื่อนนัด
       * ที่มีอยู่แล้ว ลูกค้าจึงต้องกดยืนยันใหม่ — ถ้าไม่บอก ผู้ขายจะงงว่าทำไมป้ายถอยกลับ
       */
      pacesToast.success('เลื่อนนัดแล้ว · ลูกค้าต้องยืนยันนัดใหม่อีกครั้ง')
      onClose()
      router.refresh()
    } catch {
      pacesToast.error('เลื่อนนัดไม่สำเร็จ — ตรวจการเชื่อมต่อแล้วลองอีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const originalText = endISO
    ? formatDayMonthTimeRangeTH(startISO, endISO)
    : formatDateTH(startISO)

  return (
    <>
      <div
        /* fixed inset-0 z-80 + pt safe-area = ชุดเดียวกับ AppointmentDateSheet ที่เปิดซ้อนจากที่นี่ */
        className="bg-card fixed inset-0 z-80 flex flex-col pt-[env(safe-area-inset-top)]" /* carve-out: safe-area ไม่มี token */
        role="dialog"
        aria-modal="true"
        aria-label="เลื่อนนัด"
      >
        <div className="border-default-200 flex shrink-0 items-center gap-3 border-b px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="ย้อนกลับ"
            className="btn btn-icon text-default-800 hover:bg-default-100 shrink-0"
          >
            <Icon icon="chevron-left" className="size-6" />
          </button>
          <span className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded">
            <Icon icon="calendar-repeat" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-dark truncate text-base font-semibold">เลื่อนนัด</h3>
            <p className="text-default-500 truncate text-xs">
              นัดเดิม: {allDay ? `${formatDateTH(startISO)} · ทั้งวัน` : originalText}
            </p>
          </div>
        </div>

        {/* overscroll-contain: กล่อง scroll ในแผงเต็มจอที่เนื้อหายังไม่ล้นก็ chain ออกไปเลื่อน
            หน้าข้างหลังได้ (ชัดที่สุดตอนเนื้อหาสั้น ซึ่งเป็นกรณีปกติของแผงนี้) */}
        <div className="flex-1 overflow-auto overscroll-contain p-4">
          <div className="mx-auto max-w-xl">
            {rescheduleRequestNote && (
              <div className="bg-info/10 border-info/30 mb-4 rounded-lg border p-3">
                <p className="text-default-800 mb-0 text-xs">
                  ลูกค้าขอเลื่อน:{' '}
                  <span className="text-default-700">&ldquo;{rescheduleRequestNote}&rdquo;</span>
                </p>
              </div>
            )}

            <p className="form-label mb-2">บริการ</p>
            {loadingResources ? (
              <div className="text-default-500 flex items-center gap-2 text-sm">
                <Icon icon="mdi:loading" className="animate-spin text-base" aria-hidden="true" />
                กำลังโหลดคิวงาน
              </div>
            ) : resources.length === 0 ? (
              <p className="text-default-500 mb-0 text-sm">
                ไม่มีคิวงานที่เปิดใช้งานอยู่ — เปิดใช้งานคิวงานก่อนจึงจะเลื่อนนัดได้
              </p>
            ) : (
              <div role="group" aria-label="เลือกคิวงาน" className="grid grid-cols-2 gap-2">
                {resources.map((r) => {
                  const active = pickedResourceId === r.id
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPickedResourceId(r.id)}
                      className={`flex flex-col overflow-hidden rounded-xl border text-left transition-transform duration-150 active:scale-95 ${
                        active
                          ? 'border-primary ring-primary bg-primary/5 ring-2'
                          : 'border-default-200 hover:border-default-300'
                      }`}
                    >
                      <span
                        className={`flex aspect-video w-full shrink-0 items-center justify-center ${
                          active ? 'bg-primary/15 text-primary' : 'bg-default-100 text-default-500'
                        }`}
                      >
                        <Icon icon="user-cog" className="size-7" />
                      </span>
                      <span className="min-w-0 p-2">
                        <span className="text-dark line-clamp-2 block min-h-8 text-xs font-medium">
                          {r.name}
                        </span>
                        <span className="text-default-500 text-2xs mt-0.5 block">
                          รับพร้อมกัน {r.capacity} คิว
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="mt-4">
              <p className="form-label mb-2">วันที่นัด</p>
              <button
                type="button"
                onClick={() => setDateSheetOpen(true)}
                disabled={!pickedResourceId}
                className="btn border-default-300 text-default-800 hover:bg-default-50 min-h-11 w-full justify-between disabled:opacity-60"
              >
                <span>{date ? formatDateTH(`${date}T00:00`) : 'เลือกวันที่'}</span>
                <Icon icon="calendar-event" className="text-base" aria-hidden="true" />
              </button>
            </div>

            {/* นัดทั้งวันไม่มีช่วงเวลาให้กรอก — โชว์ช่องเวลาแล้วปล่อยว่างจะกลายเป็นฟอร์มที่กรอกไม่จบ */}
            {!allDay && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reschedule-start" className="form-label">
                    เวลาเริ่ม
                  </label>
                  <input
                    id="reschedule-start"
                    type="time"
                    value={startTime}
                    onChange={(e) => applyStartTime(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div>
                  <label htmlFor="reschedule-end" className="form-label">
                    เวลาสิ้นสุด
                  </label>
                  <input
                    id="reschedule-end"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>
            )}

            <div className="mt-4">
              <label htmlFor="reschedule-reason" className="form-label">
                เหตุผล (ไม่บังคับ · ไม่เกิน 500 ตัวอักษร)
              </label>
              <textarea
                id="reschedule-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="เช่น ลูกค้าขอเลื่อน / ช่างติดงานอื่น"
                className="form-textarea"
              />
            </div>
          </div>
        </div>

        <div className={`border-default-200 shrink-0 border-t px-4 pt-4 ${FOOTBAR_PAD}`}>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="btn bg-primary hover:bg-primary-hover mx-auto min-h-11 w-full max-w-xl justify-center text-white disabled:opacity-60"
          >
            {saving && <Icon icon="mdi:loading" className="animate-spin text-sm" aria-hidden="true" />}
            ยืนยันเลื่อนนัด
          </button>
        </div>
      </div>

      {/* excludeOrderToken: นัดใบที่กำลังเลื่อนต้องไม่ถูกนับเป็นคิวที่เต็มของตัวเอง
          ไม่งั้นวันเดิมจะขึ้นเต็มปลอม ๆ แล้วกดเลือกวันเดิม (เปลี่ยนแค่เวลา) ไม่ได้ */}
      <AppointmentDateSheet
        open={dateSheetOpen}
        resourceId={pickedResourceId ?? undefined}
        resourceName={picked?.name}
        resourceCapacity={picked?.capacity}
        value={date || undefined}
        excludeOrderToken={publicToken}
        onSelect={(d) => {
          setDate(d)
          setDateSheetOpen(false)
        }}
        onClose={() => setDateSheetOpen(false)}
      />
    </>
  )
}
