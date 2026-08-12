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

import { useEffect, useMemo, useRef, useState } from 'react'
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
        if (!cancelled) pacesToast.error('โหลดรายการประเภทงานไม่สำเร็จ — ปิดแล้วลองใหม่')
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
   * Escape ปิดแผง + ย้ายโฟกัสเข้ามาตอนเปิด — ยกมาจาก AppointmentDateSheet.tsx (ชีตที่แผงนี้
   * ประกาศตัวเองว่า Base มาจากมัน) ซึ่งได้ทั้งคู่ไปตั้งแต่ impeccable critique รอบก่อน
   * ส่วนแผงนี้ตกสำรวจ ทั้งที่ประกาศ `aria-modal="true"` เหมือนกันเป๊ะ — และนั่นคือส่วนที่
   * อันตราย: aria-modal สั่งให้ screen reader ตัดทุกอย่างนอกแผงทิ้ง ถ้าไม่ย้ายโฟกัสเข้ามา
   * ผู้ใช้ AT จะเหลือโฟกัสค้างอยู่ในบริเวณที่เพิ่งถูกซ่อนไป และไม่มีทางออกที่เป็นมาตรฐาน
   * (WCAG 2.1.2 No Keyboard Trap / 2.4.3 Focus Order)
   */
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => closeBtnRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [open])
  useEffect(() => {
    /**
     * ห้ามฟัง Escape ตอนปฏิทินซ้อนอยู่ข้างบน — ชีตนั้นมี handler ของตัวเองที่ document
     * เหมือนกัน กด Escape ครั้งเดียวจะปิด **ทั้งสองชั้นพร้อมกัน** แล้วสิ่งที่ผู้ขายกรอกค้าง
     * ในแผงเลื่อนนัดหายไปทั้งที่เขาแค่ตั้งใจปิดปฏิทิน (Escape เป็นของ dialog ที่อยู่บนสุดเสมอ)
     */
    if (!open || dateSheetOpen) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, dateSheetOpen, onClose])

  /* auto-fill เวลาสิ้นสุดจากความยาวมาตรฐานของคิวงาน ย้ายไปอยู่ใน AppointmentDateSheet แล้ว
     (ส่งผ่าน prop resourceDurationMinutes) — เดิมตรรกะเดียวกันนี้ถูกเขียนไว้ 2 ที่
     คือที่นี่กับ AppointmentBlock ซึ่งเป็นคู่ที่พร้อมจะเพี้ยนจากกัน (HR16) */

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
            ? `${data.message ?? 'ช่วงเวลานี้เต็มแล้ว'} — เลือกเวลาอื่นหรือประเภทงานอื่น`
            : terminal
              ? 'นัดนี้ถูกปิดผลไปแล้ว จึงเลื่อนไม่ได้'
              : data.error === 'RESOURCE_INACTIVE'
                ? 'ประเภทงานนี้ถูกปิดใช้งานแล้ว — เลือกประเภทงานอื่น'
                : data.error === 'RESOURCE_NOT_FOUND'
                  ? 'ไม่พบประเภทงานนี้แล้ว — เลือกประเภทงานอื่น'
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
          {/* min-h-11/min-w-11: `.btn.btn-icon` ของธีม = size-9.25 = 37px ต่ำกว่าเกณฑ์ 44px
              ที่ PRODUCT.md ประกาศ (WCAG 2.5.5) — ปุ่มปิดของชีตพี่น้องแก้ไปแล้ว ตัวนี้ตกสำรวจ */}
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="ย้อนกลับ"
            className="btn btn-icon text-default-800 hover:bg-default-100 min-h-11 min-w-11 shrink-0"
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
                กำลังโหลดประเภทงาน
              </div>
            ) : resources.length === 0 ? (
              <p className="text-default-500 mb-0 text-sm">
                ไม่มีประเภทงานที่เปิดใช้งานอยู่ — เปิดใช้งานประเภทงานก่อนจึงจะเลื่อนนัดได้
              </p>
            ) : (
              <div role="group" aria-label="เลือกประเภทงาน" className="grid grid-cols-2 gap-2">
                {resources.map((r) => {
                  const active = pickedResourceId === r.id
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPickedResourceId(r.id)}
                      /* motion-reduce: กฎ blanket ใน safepay-overrides.css ย่นเวลา transition
                         เหลือ 0.12s แต่ไม่ได้ยกเลิกการย่อ-ขยายเอง — ต้องปิดที่ตัวการ์ดเอง
                         (คู่เดียวกับ AppointmentBlock ซึ่งการ์ดใบนี้ copy มา) */
                      className={`flex flex-col overflow-hidden rounded-xl border text-left transition-transform duration-150 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${
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

            {/* ปุ่มเดียวคุมทั้งวันและเวลา — ช่องเวลาย้ายเข้าไปอยู่ในปฏิทินแล้ว (user สั่ง 2026-08-08)
                เดิมที่นี่มีช่อง <input type="time"> คู่หนึ่งอยู่ข้างนอก ทำให้ผู้ขายต้องเลือกวันในปฏิทิน
                → ปิดปฏิทิน → แล้วค่อยกรอกเวลาโดยไม่เห็นคิวของวันนั้นอีกแล้ว
                หน้าเลื่อนนัดกับหน้าสร้างออเดอร์ต้องทำงานเหมือนกัน (sibling-surface-parity) */}
            <div className="mt-4">
              {/* นัดทั้งวันไม่มีเวลาให้เลือกเลย (ปฏิทินซ่อนส่วนเลือกเวลาเมื่อ granularity='DAY')
                  ป้ายที่สัญญาว่าจะได้เลือก "เวลา" ด้วย จึงผิดกับสิ่งที่เกิดขึ้นจริงเมื่อ allDay
                  — ผันตามนัดใบนี้เหมือนที่ปุ่มด้านล่างทำอยู่แล้ว (BR-RSV-57) */}
              <p className="form-label mb-2">{allDay ? 'วันที่นัด' : 'วันและเวลาที่นัด'}</p>
              <button
                type="button"
                onClick={() => setDateSheetOpen(true)}
                disabled={!pickedResourceId}
                className="btn border-default-300 text-default-800 hover:bg-default-50 min-h-11 w-full justify-between disabled:opacity-60"
              >
                <span>
                  {date
                    ? allDay
                      ? `${formatDateTH(`${date}T00:00`)} · ทั้งวัน`
                      : startTime && endTime
                        ? `${formatDateTH(`${date}T00:00`)} · ${startTime}–${endTime}`
                        : formatDateTH(`${date}T00:00`)
                    : allDay
                      ? 'เลือกวันนัด'
                      : 'เลือกวันและเวลา'}
                </span>
                <Icon icon="calendar-event" className="text-base" aria-hidden="true" />
              </button>
              {/* นัดแบบระบุเวลาที่ยังกรอกไม่ครบ = กดบันทึกไม่ได้ (canSubmit) ต้องบอกว่าทำไม
                  ไม่ใช่ปล่อยให้ปุ่มบันทึกเทาแล้วเดาเอง */}
              {!allDay && date && !(startTime && endTime) && (
                /* คำเดียวกับฟอร์มสร้างออเดอร์ (AppointmentBlock) — ต้องบอกว่าให้แตะ "ปุ่มด้านบน"
                   ไม่ใช่ตัวข้อความนี้ (sibling-surface-parity) */
                <p className="text-default-500 mt-1 mb-0 text-sm">
                  แตะปุ่มด้านบนเพื่อเลือกเวลาเริ่มและเวลาสิ้นสุด
                </p>
              )}
            </div>

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
            /* aria-busy: ระหว่างบันทึก ปุ่มเปลี่ยนแค่ "มีสปินเนอร์โผล่มา" ซึ่งเป็นสัญญาณที่
               มองเห็นอย่างเดียว — ผู้ใช้ screen reader ไม่มีทางรู้ว่ากดติดแล้วหรือยัง
               ป้ายบนปุ่มยังเขียนว่า "ยืนยันเลื่อนนัด" เหมือนเดิมทุกประการ (WCAG 4.1.3) */
            aria-busy={saving}
            className="btn bg-primary hover:bg-primary-hover mx-auto min-h-11 w-full max-w-xl justify-center text-white disabled:opacity-60"
          >
            {saving && <Icon icon="mdi:loading" className="animate-spin text-sm" aria-hidden="true" />}
            ยืนยันเลื่อนนัด
          </button>
        </div>
      </div>

      {/* excludeOrderToken: นัดใบที่กำลังเลื่อนต้องไม่ถูกนับเป็นคิวที่เต็มของตัวเอง
          ไม่งั้นวันเดิมจะขึ้นเต็มปลอม ๆ แล้วกดเลือกวันเดิม (เปลี่ยนแค่เวลา) ไม่ได้ */}
      {/* granularity ของ *นัดใบนี้* ไม่ใช่ของร้าน ณ ปัจจุบัน (BR-RSV-57) — ร้านที่สลับโหมด
          ไปแล้วต้องเลื่อนนัดเก่าได้ในรูปแบบเดิมของนัดนั้น ไม่ใช่ถูกบังคับตามโหมดใหม่ */}
      <AppointmentDateSheet
        open={dateSheetOpen}
        resourceId={pickedResourceId ?? undefined}
        resourceName={picked?.name}
        resourceCapacity={picked?.capacity}
        resourceDurationMinutes={picked?.durationMinutes}
        granularity={allDay ? 'DAY' : 'TIME'}
        value={date || undefined}
        valueStartTime={startTime || undefined}
        valueEndTime={endTime || undefined}
        excludeOrderToken={publicToken}
        onConfirm={(r) => {
          setDate(r.date)
          // นัดทั้งวันไม่มีเวลาให้เก็บ — submit() คำนวณ 00:00→00:00+1วัน เองอยู่แล้ว
          if (!allDay) {
            setStartTime(r.startTime ?? '')
            setEndTime(r.endTime ?? '')
          }
          setDateSheetOpen(false)
        }}
        onClose={() => setDateSheetOpen(false)}
      />
    </>
  )
}
