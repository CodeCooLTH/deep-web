'use client'

/**
 * AppointmentDateSheet — ปฏิทินเต็มจอสำหรับเลือกวันนัด (user สั่ง 2026-08-07)
 *
 * Base: src/app/(paces)/seller/(dashboard)/queues/components/AppointmentCalendar.tsx
 *   (FullCalendar dayGridMonth + interactionPlugin + dayCellClassNames ย้อมวันใกล้เต็ม/เต็ม
 *   + หัวเรื่องเดือนที่วาดเอง) ซึ่ง copy มาจาก
 *   theme/paces/Admin/TS/src/app/(admin)/apps/calendar/components/CalendarPage.tsx อีกทอด
 * Base (โครง sheet): ./AddressSearchSheet.tsx — sheet เต็มจอของฟอร์มเดียวกันนี้
 *   (fixed inset-0 z-80 + แถบหัวมีปุ่มย้อนกลับ + useLockBodyScroll)
 *
 * ทำไมไม่ใช้ <input type="date"> เดิม: ช่องเดิมบอกได้แค่ "วันนี้คือวันอะไร" ผู้ขายต้องเดาเองว่า
 * วันไหนคิวว่าง แล้วไปรู้ตอนกดบันทึกไม่ผ่าน — ข้อมูลความว่างมีอยู่แล้วใน API แค่ไม่เคยถูก
 * เอามาแสดงเป็นภาพรวมเดือน
 *
 * โครง 2 ชั้น (user สั่ง 2026-08-07): กล่องแคบ = ปฏิทินบน / รายการนัดของวันที่จิ้มอยู่ล่าง /
 * ปุ่มยืนยันติดขอบล่าง · กล่องกว้าง (≥1024px) = ปฏิทินซ้าย / รายการขวา
 *
 * IMPORTANT: ทุก breakpoint ในไฟล์นี้เป็น **container query** (`@3xl`/`@5xl`) ไม่ใช่ viewport
 * (`md`/`lg`) — ชีตนี้เปิดได้จาก 2 บริบทที่กว้างไม่เท่ากันทั้งที่วิวพอร์ตเดียวกัน: เต็มจอที่
 * /orders/new และกล่อง 384px ในหน้าต่างร่างออเดอร์ของหน้าแชท เหตุผลเต็มอยู่ที่ `@container`
 * บน div หัวแผ่นด้านล่าง — ห้ามเปลี่ยนกลับเป็น md:/lg: (บั๊ก user report 2026-08-08)
 *
 * IMPORTANT: จิ้มวัน = **preview เท่านั้น** ค่าจริงในฟอร์มเปลี่ยนตอนกดปุ่มยืนยันล่าง — ต่างจาก
 *   พฤติกรรมเดิม (จิ้ม = เลือกแล้วปิดทันที) ที่ทำให้ "จิ้มเพื่อดูรายการ" เป็นไปไม่ได้เลย
 *   วันที่เต็มจึงจิ้มดูได้ด้วย (ใครจองอยู่) แต่ปุ่มยืนยันจะ disabled
 *
 * IMPORTANT: หัวเรื่องเดือนวาดเอง ไม่ใช้ title ของ FullCalendar — FullCalendar แสดงปี ค.ศ.
 *   ส่วนทั้งระบบต้องเป็น พ.ศ. ผ่าน src/lib/format-date.ts (docs/conventions/date-format.md)
 *   เหตุผลเดียวกับที่ AppointmentCalendar ตั้ง center: '' ไว้
 *
 * IMPORTANT: คำว่า "ที่นั่ง" (serviceSeat) เป็นกลไกภายใน ห้ามโผล่บนจอ — ผู้ใช้เห็นได้แค่
 *   "จองแล้ว n จาก m คิว" (เหมือน AppointmentCalendar/AppointmentBlock)
 *
 * IMPORTANT: ตัวเลขที่นี่ใช้ **แสดงผลและกันการกดล่วงหน้า** เท่านั้น ตัวตัดสินจริงคือ
 *   setOrRescheduleAppointment ที่วน seat ครอบ SAVEPOINT — ห้ามถือว่าเลขบนจอคือคำตอบสุดท้าย
 *   (ระหว่างที่ปฏิทินเปิดค้าง อีกเครื่องอาจจองแทรกได้)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
// DatesSetArg อยู่ใน core ส่วน DateClickArg มาจาก type augmentation ของ interaction plugin
// (คนละแพ็กเกจ — import รวมกันแล้ว tsc ฟ้อง TS2614)
import type { DatesSetArg } from '@fullcalendar/core'
import type { DateClickArg } from '@fullcalendar/interaction'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { formatMonthYearTH, formatWeekdayDateTH, formatDateTH, formatTimeHM } from '@/lib/format-date'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import {
  isAllDayAppointment,
  combineDateTime,
  addMinutesToTime,
  APPOINTMENT_STATUS_LABEL,
  type AppointmentStatus,
  type AppointmentGranularity,
} from '@/lib/appointments'
import { APPOINTMENT_STAGE_META } from '@/lib/appointment-stage'

/**
 * สีป้ายสถานะ — ยกมาจาก queues/components/AppointmentCalendar.tsx (STATUS_DOT) ทั้งชุด
 * ห้ามคิดใหม่: สถานะเดียวกันต้องหน้าตาเหมือนกันทั้งปฏิทินคิวและที่นี่ ไม่งั้นผู้ขายต้องจำสองชุด
 *
 * 2026-08-07 (feature 00036): ชุดสีถูกยกขึ้นเป็น SSOT ที่ src/lib/appointment-stage.ts แล้ว —
 * ไฟล์นี้เคยประกาศ map ของตัวเองเป็นที่ที่ **สาม** และเพี้ยนไปแล้วจริง 2 ช่อง
 * (CONFIRMED_BY_BUYER เขียว / COMPLETED เทา) หลังจาก user เคาะให้สลับเป็น primary/success
 * เพราะเขียวต้องอยู่กับสิ่งที่เกิดขึ้นแล้วเท่านั้น — คำเตือน "ห้ามคิดใหม่" ข้างบนกันไม่ได้
 * เพราะมันเตือนคนอ่าน ไม่ได้บังคับโค้ด จึงเลิกประกาศซ้ำแล้ว import แทน
 */

/**
 * 1 นัด = 1 แถว (ทรงเดียวกับที่ listAppointments คืน — มิเรอร์จาก AppointmentCalendar.tsx:49-57
 * ห้ามให้ 2 ที่นี้เพี้ยนจากกัน)
 *
 * เดิมไฟล์นี้ดึงจาก /service-resources/availability ซึ่งคืนแค่ {capacity, busy:[{start,end}]}
 * — ไม่มีชื่อลูกค้า/เลขออเดอร์/สถานะ จึงทำ "รายการของวันนั้น" ตามที่ user สั่งไม่ได้เลย
 * ย้ายมาใช้ /api/shops/current/appointments ที่มีอยู่แล้ว (หน้า /queues ใช้อยู่) ซึ่งคืนครบ
 * และ select ของมันกันเบอร์/อีเมลไว้ตั้งแต่ใน service (appointment.service.ts) แล้ว
 */
interface AppointmentItem {
  orderToken: string
  orderNo: string | null
  start: string
  end: string
  appointmentStatus: string | null
  buyerName: string | null
}

interface Props {
  open: boolean
  /** คิวงานที่เลือกไว้ในฟอร์ม — ปฏิทินโชว์ความว่างของคิวนี้คิวเดียว (user เคาะ 2026-08-07) */
  resourceId?: string
  /** ชื่อคิวงาน — โชว์ใต้หัวเรื่องให้รู้ว่ากำลังดูความว่างของคิวไหน */
  resourceName?: string
  /**
   * ความจุต่อช่วงเวลาของคิวงานนั้น — ส่งมาจากฟอร์มที่มีค่านี้อยู่แล้ว ไม่ต้อง query ซ้ำ
   * (endpoint appointments ไม่ได้คืน capacity มาให้เหมือน availability เดิม)
   */
  resourceCapacity?: number
  /**
   * ระยะเวลามาตรฐานของคิวงาน (นาที) — auto-fill เวลาสิ้นสุดให้เมื่อผู้ใช้เลือกเวลาเริ่ม
   * null/ไม่ส่ง = ไม่ auto-fill (ผู้ใช้กรอกเองทั้งคู่) ไม่ใช่ข้อผิดพลาด
   */
  resourceDurationMinutes?: number | null
  /**
   * ร้านนี้รับนัดแบบไหน (FR-RSV-13) — **บังคับ** ไม่ใช่ optional
   *
   * ผู้เรียกรู้ค่านี้เสมออยู่แล้ว และการปล่อยให้ optional แปลว่ามีค่าตั้งต้นเงียบ ๆ ที่อาจ
   * ผิดกับร้าน ซึ่งจะทำให้ชีตซ่อน/โชว์ส่วนเลือกเวลาผิดโดยไม่มีอะไรฟ้อง
   */
  granularity: AppointmentGranularity
  /** ค่าที่เลือกอยู่ "YYYY-MM-DD" */
  value?: string
  /** ค่าเวลาที่เลือกอยู่ "HH:mm" — มีความหมายเฉพาะเมื่อ granularity === 'TIME' */
  valueStartTime?: string
  valueEndTime?: string
  /**
   * ออเดอร์ที่กำลังเลื่อนนัดอยู่ (feature 00036) — กรองนัดของใบนี้ออกจากตัวนับความว่าง
   * ไม่ส่ง = โหมดตั้งนัดใหม่ตอนสร้างออเดอร์ (พฤติกรรมเดิม ไม่มีอะไรให้กรอง)
   */
  excludeOrderToken?: string
  /**
   * ยิงครั้งเดียวตอนกดปุ่มยืนยันเท่านั้น (แทน onSelect เดิมที่ส่งแต่วันที่)
   *
   * พฤติกรรม preview ไม่เปลี่ยน: จิ้มวัน/พิมพ์เวลาในชีตยังไม่แตะค่าจริงในฟอร์มเลย
   * จนกว่าจะกดยืนยัน — กด ‹ ย้อนกลับ = ไม่มีอะไรเปลี่ยน
   */
  onConfirm: (result: {
    date: string
    /** undefined เสมอเมื่อ granularity === 'DAY' */
    startTime?: string
    endTime?: string
    /**
     * จำนวนคิวที่ทับกับช่วงที่เพิ่งยืนยัน (DAY = ทั้งวัน · TIME = เฉพาะช่วงเวลานั้น)
     * ส่งกลับให้ฟอร์มแสดงผลต่อ **โดยไม่ต้องยิง availability ซ้ำ**
     *
     * IMPORTANT: แสดงผลเท่านั้น ห้ามใช้ตัดสินว่าจองได้/ไม่ได้ (BR-RSV-18) — ระหว่างที่
     * ผู้ใช้กรอกต่อ มีคนจองแทรกได้เสมอ ตัวตัดสินจริงคือ EXCLUDE constraint ตอน POST
     */
    bookedCount: number
  }) => void
  onClose: () => void
}

const FOOTBAR_HEIGHT = 'h-[calc(4.5rem+env(safe-area-inset-bottom))]' // HR7 carve-out: Paces ไม่มี token ของ safe-area และ box-sizing border-box ทำให้การใส่ padding เฉย ๆ ไม่ดันความสูงให้โตขึ้น (docs/conventions/ios-safe-area.md)

/** หัวคอลัมน์วัน — index = getDay() (0 = อาทิตย์ ตรงกับ firstDay={0} ของปฏิทิน) */
const DOW_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const DOW_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์']

/** "YYYY-MM-DD" ตามเวลาเครื่อง (ตรงกับที่ AppointmentBlock ใช้เก็บค่า ห้ามใช้ toISOString ที่เป็น UTC) */
function localDateKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export default function AppointmentDateSheet({
  open,
  resourceId,
  resourceName,
  resourceCapacity,
  resourceDurationMinutes,
  granularity,
  value,
  valueStartTime,
  valueEndTime,
  excludeOrderToken,
  onConfirm,
  onClose,
}: Props) {
  useLockBodyScroll(open)
  const byDay = granularity === 'DAY'

  const calRef = useRef<FullCalendar>(null)
  const capacity = resourceCapacity ?? null
  const [items, setItems] = useState<AppointmentItem[]>([])
  const [loading, setLoading] = useState(false)
  /**
   * วันที่กำลัง "ดูอยู่" ยังไม่ยืนยัน (user สั่ง 2026-08-07: จิ้มวันเพื่อดูรายการได้)
   *
   * เดิมจิ้มวัน = onSelect + onClose ทันที ซึ่งทำให้ "จิ้มเพื่อดู" เป็นไปไม่ได้เลย
   * ตอนนี้จิ้ม = เปลี่ยนรายการข้างล่างเฉย ๆ ค่าจริงในฟอร์มเปลี่ยนตอนกดปุ่มยืนยันล่างเท่านั้น
   * → กด ‹ ย้อนกลับ = ไม่มีอะไรเปลี่ยน แม้จะเคยจิ้มดูวันอื่นไปแล้ว
   */
  const [pendingDate, setPendingDate] = useState<string | undefined>(value)
  /**
   * เวลาที่กำลังกรอกอยู่ — preview เหมือน pendingDate ทุกประการ (ค่าจริงเปลี่ยนตอนกดยืนยัน)
   *
   * ย้ายมาจากช่อง <input type="time"> คู่ที่เคยอยู่นอกชีตในฟอร์ม (user สั่ง 2026-08-08:
   * "อยากให้อยู่ตอนที่เลือกวันเลย (ใน Calendar) ทำไมต้องออกมาอยู่ข้างนอก") — ข้อมูลที่ใช้
   * ตัดสินว่าจะนัดกี่โมง (คิวที่มีอยู่แล้วของวันนั้น) อยู่ในชีตนี้ ไม่ใช่ในฟอร์ม
   */
  const [pendingStart, setPendingStart] = useState<string>(valueStartTime ?? '')
  const [pendingEnd, setPendingEnd] = useState<string>(valueEndTime ?? '')
  // ผู้ใช้พิมพ์เวลาสิ้นสุดเองแล้วหรือยัง — ถ้าเคย ห้าม auto-fill ทับ (ยกกติกามาจากฟอร์มเดิม)
  const endTouched = useRef(false)
  // เปิดชีตใหม่ทุกครั้งต้องเริ่มจากค่าที่ฟอร์มถืออยู่ ไม่ใช่ค่าที่ค้างจากการเปิดครั้งก่อน
  useEffect(() => {
    if (!open) return
    setPendingDate(value)
    setPendingStart(valueStartTime ?? '')
    setPendingEnd(valueEndTime ?? '')
    // ค่าที่ฟอร์มถืออยู่ = ผู้ใช้เคยตั้งเวลาสิ้นสุดไว้แล้ว จึงห้าม auto-fill ทับตอนเปิดซ้ำ
    endTouched.current = !!valueEndTime
  }, [open, value, valueStartTime, valueEndTime])
  /**
   * Escape ปิดชีต + ย้ายโฟกัสเข้ามาตอนเปิด — ยกมาจาก AddressSearchSheet.tsx:72-87
   *
   * ไฟล์นี้เขียนไว้เองว่า "หัวแผ่นชุดเดียวกับ CustomerSearchSheet / AddressSearchSheet
   * (3 ชีตของฟอร์มเดียวกัน) — แก้ที่ไหนแก้ให้ครบทั้งสาม" แล้วเป็นชีตเดียวที่ไม่มีทั้งคู่
   *
   * IMPORTANT: จำเป็นกว่าสองชีตนั้นด้วยซ้ำ เพราะชีตนี้ประกาศ aria-modal="true" ซึ่งสั่งให้
   * screen reader ปิดทุกอย่างนอกชีต — ถ้าไม่ย้ายโฟกัสเข้ามา ผู้ใช้ AT จะถูกทิ้งไว้กับ
   * โฟกัสที่อยู่หลังชีตในบริเวณที่ถูกซ่อนไปแล้ว และไม่มีทางออกที่เป็นมาตรฐาน
   */
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => closeBtnRef.current?.focus(), 60)
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open, onClose])

  /** เดือนที่กำลังมองอยู่ — วาดหัวเรื่อง พ.ศ. เอง (FullCalendar ให้มาเป็น ค.ศ.) */
  const [viewStart, setViewStart] = useState<Date | null>(null)
  /**
   * ช่วงที่โหลดไปแล้ว — กัน datesSet ยิงซ้ำช่วงเดิม
   * (FullCalendar เรียก datesSet ทุกครั้งที่ re-render ไม่ใช่เฉพาะตอนเปลี่ยนเดือน)
   */
  const loadedRangeRef = useRef<string>('')
  /**
   * ช่วงเดือนที่ปฏิทินกำลังแสดงอยู่ — เก็บไว้เพื่อ **ยิงซ้ำได้เองเมื่อคิวงานเปลี่ยน**
   *
   * จำเป็นเพราะ resourceId เดินทางมาจาก useWatch ของ OrderCreateForm ซึ่งอัปเดตแบบ async
   * (มีบั๊กจาก lag นี้มาแล้วที่ OrderCreateForm.tsx:456-459) ขณะที่ชีตถูกสั่งเปิดในคลิกเดียวกัน
   * → เฟรมแรกที่ FullCalendar mount อาจได้ resourceId เป็นค่าเก่า/undefined แล้ว loadRange
   * return ออกตั้งแต่ต้นทาง พอค่าที่ถูกต้องมาถึง ถ้าเราแค่ล้าง items ทิ้งโดยไม่ยิงใหม่
   * ปฏิทินจะขึ้นว่างทั้งเดือนทั้งที่มีนัดจริง จนกว่าผู้ใช้จะกดเปลี่ยนเดือนเอง
   */
  const viewRangeRef = useRef<{ from: Date; to: Date } | null>(null)

  const loadRange = useCallback(
    async (from: Date, to: Date) => {
      if (!resourceId) {
        setItems([])
        return
      }
      const key = `${resourceId}|${from.toISOString()}|${to.toISOString()}`
      if (loadedRangeRef.current === key) return
      loadedRangeRef.current = key

      setLoading(true)
      try {
        // pattern เดียวกับ queues/components/AppointmentCalendar.tsx (fetchAppointments)
        const res = await fetch(
          `/api/shops/current/appointments?resourceId=${resourceId}&from=${from.toISOString()}&to=${to.toISOString()}`,
        )
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { items?: AppointmentItem[] }
        setItems(data.items ?? [])
      } catch {
        // โหลดไม่ได้ = ไม่รู้ว่าวันไหนเต็ม → ปล่อยให้กดได้ทุกวันแล้วให้ server ตัดสิน
        // (ห้ามย้อมว่าง/เต็มมั่ว — ตัวเลขที่ผิดแย่กว่าไม่มีตัวเลข)
        setItems([])
        loadedRangeRef.current = ''
        pacesToast.error('โหลดข้อมูลนัดไม่สำเร็จ — ยังเลือกวันได้ตามปกติ')
      } finally {
        setLoading(false)
      }
    },
    [resourceId],
  )

  // เปลี่ยนคิวงาน (หรือค่าที่ถูกต้องเพิ่งเดินทางมาถึง) = ข้อมูลเดิมใช้ไม่ได้แล้ว
  // ต้อง **ยิงใหม่ด้วย** ไม่ใช่แค่ล้าง — เหตุผลเต็มอยู่ที่ viewRangeRef ด้านบน
  useEffect(() => {
    loadedRangeRef.current = ''
    setItems([])
    const r = viewRangeRef.current
    if (r) void loadRange(r.from, r.to)
  }, [resourceId, loadRange])

  /**
   * นัดของแต่ละวัน — 1 นัดที่คร่อมหลายวันต้องโผล่ทุกวันที่มันกิน ไม่ใช่เฉพาะวันเริ่ม
   *
   * excludeOrderToken (feature 00036): ตอน "เลื่อนนัด" ใบที่กำลังเลื่อนอยู่ต้องไม่ถูกนับเป็น
   * คิวที่ถูกจองแล้วของตัวเอง ไม่งั้นวันเดิมจะขึ้นเต็ม/ใกล้เต็มปลอม ๆ แล้วผู้ขายกดวันเดิมไม่ได้
   * ทั้งที่ระบบจะปล่อยผ่าน (server ปลดที่นั่งเดิมคืนในทรานแซกชันเดียวกัน)
   */
  const itemsByDay = useMemo(() => {
    const map = new Map<string, AppointmentItem[]>()
    for (const it of items) {
      if (excludeOrderToken && it.orderToken === excludeOrderToken) continue
      const start = new Date(it.start)
      const end = new Date(it.end)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      while (cursor.getTime() < end.getTime()) {
        const k = localDateKey(cursor)
        const bucket = map.get(k)
        if (bucket) bucket.push(it)
        else map.set(k, [it])
        cursor.setDate(cursor.getDate() + 1)
      }
    }
    return map
  }, [items, excludeOrderToken])

  const countByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const [k, v] of itemsByDay) map.set(k, v.length)
    return map
  }, [itemsByDay])

  /** นัดของวันที่กำลังดูอยู่ เรียงตามเวลาเริ่ม */
  const dayItems = useMemo(() => {
    if (!pendingDate) return []
    return [...(itemsByDay.get(pendingDate) ?? [])].sort((a, b) => a.start.localeCompare(b.start))
  }, [itemsByDay, pendingDate])

  /**
   * วันนี้เต็มไหม — **โหมดรายวันเท่านั้น**
   *
   * IMPORTANT: โหมดระบุช่วงเวลาห้ามใช้เกณฑ์นี้ เพราะความจุของมันวัดกันที่ "ช่วงเวลาที่ทับกัน"
   * ไม่ใช่ "จำนวนนัดทั้งวัน" — วันที่มี 10 นัดสั้น ๆ กระจายกันทั้งวันยังว่างเวลาอื่นอยู่เต็มไปหมด
   * ถ้าเอา day-count มาตัดสินจะขึ้น "เต็ม" หลอกแล้วกันผู้ขายออกจากวันที่จองได้จริง
   * (ตัวนับของโหมดเวลาอยู่ที่ pendingSlotBookedCount ด้านล่าง)
   */
  const isFull = useCallback(
    (key: string) =>
      byDay && capacity != null && capacity > 0 && (countByDay.get(key) ?? 0) >= capacity,
    [byDay, capacity, countByDay],
  )

  const onDatesSet = useCallback(
    (arg: DatesSetArg) => {
      setViewStart(arg.view.currentStart)
      viewRangeRef.current = { from: arg.start, to: arg.end }
      void loadRange(arg.start, arg.end)
    },
    [loadRange],
  )

  /**
   * จิ้มวัน = เปลี่ยน "วันที่กำลังดู" เท่านั้น ไม่ยืนยัน ไม่ปิดชีต
   *
   * วันที่เต็มยัง**จิ้มดูได้** (ต่างจากเดิมที่เด้ง toast แล้วไม่ทำอะไรเลย) — พอมีรายการอยู่
   * ข้างล่างแล้ว คำถาม "ทำไมวันนี้เต็ม / ใครจองอยู่" ควรตอบได้จากหน้าจอ ไม่ใช่แค่ถูกปฏิเสธ
   * การกันไม่ให้เลือกจริงย้ายไปอยู่ที่ปุ่มยืนยันล่าง (disabled) แทน
   */
  const onDateClick = useCallback((arg: DateClickArg) => {
    // วันของเดือนข้างเคียงที่ปฏิทินเอามาเติมแถวให้เต็ม (mockup ทำเป็น disabled) — จิ้มแล้ว
    // หัวรายการข้างล่างจะพูดถึงวันที่ไม่ได้อยู่ในเดือนตรงหน้า อ่านแล้วสับสนว่าเลือกอะไรอยู่
    if (arg.dayEl.classList.contains('fc-day-other')) return
    setPendingDate(localDateKey(arg.date))
  }, [])

  /**
   * เลือกวันด้วยคีย์บอร์ด (Enter / Space) — ทางเข้าที่ **สอง** ของการเลือกวัน
   *
   * ทำไมต้องมี: `dateClick` ของ FullCalendar ผูกกับ mousedown/touch เท่านั้น และช่องวันถูก
   * เรนเดอร์เป็น `<td role="gridcell">` ที่ไม่มี tabindex — งานหลักของทั้งจอนี้ (เลือกวัน)
   * จึงทำด้วยคีย์บอร์ดไม่ได้เลย 100% ทั้งที่ทุกอย่างที่เหลือ (ปิด/เลื่อนเดือน/กรอกเวลา/ยืนยัน)
   * ทำได้ครบ (WCAG 2.1.1 Keyboard — ระดับ A)
   *
   * ห้ามรื้อ FullCalendar เพื่อแก้เรื่องนี้: ตัวที่ทำให้กดได้คือ `<div>` ชั้นนอกที่เราคืนจาก
   * dayCellContent ซึ่ง lib วางไว้ใน `<a class="fc-daygrid-day-number">` ที่ไม่มี href
   * (navLinks ปิดอยู่ = ไม่ใช่ element ที่ interactive) จึงไม่เกิด nested interactive
   *
   * เรียก setPendingDate ตัวเดียวกับ onDateClick — สองทางเข้าต้องได้ผลเดียวกันเสมอ
   * (จิ้ม/กดปุ่ม = preview ไม่ยืนยัน ไม่ปิดชีต)
   */
  const onDayKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>, key: string) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    // Space บน div ที่ไม่ใช่ปุ่มจริงจะเลื่อนหน้าเป็นค่าเริ่มต้น — ต้องกันไว้
    e.preventDefault()
    setPendingDate(key)
  }, [])

  const pendingFull = pendingDate ? isFull(pendingDate) : false
  const pendingCount = pendingDate ? (countByDay.get(pendingDate) ?? 0) : 0

  // ─────────────────────────────────────────────────────────────────────────
  // ส่วนของโหมด "ระบุช่วงเวลา" — คำนวณสดจาก dayItems ที่โหลดมาแล้ว ไม่ยิง API เพิ่ม
  // ─────────────────────────────────────────────────────────────────────────

  /** จำนวนคิวที่ทับกับช่วงที่กำลังกรอก — เกณฑ์ overlap เดียวกับที่ฟอร์มเคยใช้ (bookedNow เดิม) */
  const pendingSlotBookedCount = useMemo(() => {
    if (!pendingDate) return 0
    // โหมดรายวัน: ทั้งวันคือช่วงเดียว → จำนวนนัดของวันนั้นตรง ๆ
    if (byDay) return pendingCount
    const start = combineDateTime(pendingDate, pendingStart)
    if (!start) return 0
    // ยังไม่กรอกเวลาสิ้นสุด → นับที่ "จุดเริ่ม" ไปก่อน (เหมือนพฤติกรรมเดิมของฟอร์ม)
    const end = combineDateTime(pendingDate, pendingEnd) ?? start
    const s = start.getTime()
    const e = Math.max(end.getTime(), s + 1)
    return dayItems.filter((it) => {
      const bs = new Date(it.start).getTime()
      const be = new Date(it.end).getTime()
      return bs < e && s < be
    }).length
  }, [byDay, dayItems, pendingCount, pendingDate, pendingEnd, pendingStart])

  /** ช่วงเวลาที่กรอกอยู่เต็มแล้วไหม (โหมดเวลาเท่านั้น — โหมดรายวันใช้ pendingFull) */
  const pendingSlotFull =
    !byDay && !!pendingStart && capacity != null && capacity > 0 && pendingSlotBookedCount >= capacity

  /**
   * เวลาที่คิวก่อนหน้าเลิก — ใช้เป็นทางลัด "ต่อจากคิวก่อนหน้า"
   *
   * ข้อมูลนี้อยู่ตรงหน้าผู้ใช้อยู่แล้ว (รายการนัดของวันนั้น) แต่เดิมกดใช้ไม่ได้ ต้องอ่านแล้ว
   * ไปพิมพ์เองในช่องที่อยู่คนละที่ — ชิปนี้ทำให้มันกดได้ ไม่ใช่การเพิ่มขั้นตอน
   * (วันที่ยังไม่มีนัด = ไม่มีชิป ตกไปพิมพ์เองเหมือนเดิม ไม่มีอะไรแย่ลง)
   *
   * ต้องเช็คว่า end อยู่ "วันเดียวกับที่กำลังเลือก" ด้วย — นัดที่คร่อมเที่ยงคืนมาจากวันก่อนหน้า
   * จะทำให้ชิปเสนอเวลาของวันผิด
   */
  const suggestedStart = useMemo(() => {
    if (byDay || dayItems.length === 0 || !pendingDate) return null
    let latest: Date | null = null
    for (const it of dayItems) {
      const e = new Date(it.end)
      if (Number.isNaN(e.getTime())) continue
      if (localDateKey(e) !== pendingDate) continue
      if (!latest || e.getTime() > latest.getTime()) latest = e
    }
    if (!latest) return null
    return `${`${latest.getHours()}`.padStart(2, '0')}:${`${latest.getMinutes()}`.padStart(2, '0')}`
  }, [byDay, dayItems, pendingDate])

  /** เติมเวลาเริ่ม + auto-fill เวลาสิ้นสุดจากระยะเวลามาตรฐาน (เว้นแต่ผู้ใช้พิมพ์เองไปแล้ว) */
  const applyStart = useCallback(
    (v: string) => {
      setPendingStart(v)
      if (v && resourceDurationMinutes && !endTouched.current) {
        setPendingEnd(addMinutesToTime(v, resourceDurationMinutes))
      }
    },
    [resourceDurationMinutes],
  )

  /**
   * ปุ่มยืนยันกดได้ไหม + จะเขียนว่าอะไร — รวมไว้ที่เดียวเพื่อไม่ให้ข้อความกับเงื่อนไขเพี้ยนจากกัน
   *
   * โหมดเวลาบังคับให้ครบทั้งเริ่มและสิ้นสุดก่อนยืนยัน — ไม่ใช่กฎใหม่: OrderCreateForm
   * บล็อกการบันทึกออเดอร์ด้วยเงื่อนไขเดียวกันนี้อยู่แล้ว เดิมผู้ใช้แค่ไปเจอมันทีหลัง
   * คนละจังหวะคนละบริบท ย้ายมาเช็คตรงนี้ = ปิดลูปการตัดสินใจจบในที่เดียวตามที่ user ขอ
   */
  /**
   * ปัญหาของช่องเวลา ณ ตอนนี้ — SSOT เดียวที่ **3 ที่** ใช้ร่วมกัน (HR16):
   *   1) ป้ายบนปุ่มยืนยัน  2) ข้อความใต้ช่องเวลา  3) aria-invalid/aria-describedby ของ input
   *
   * ทำไมต้องสกัดออกมา: เดิมข้อความเหล่านี้อยู่ในปุ่มยืนยันซึ่ง `disabled` — element ที่
   * disabled หลุด tab order และไม่มี live region ผู้ใช้ screen reader จึงกรอกเวลาผิดแล้ว
   * **ไม่มีอะไรบอกเลยว่าผิดตรงไหน** (WCAG 3.3.1 Error Identification / 3.3.3 Error Suggestion)
   * ย้ายข้อความมาผูกกับช่องที่ผิดจริง แล้วให้ปุ่มอ่านจากตัวเดียวกัน — ห้ามก็อปคำไปเขียนซ้ำ
   * ไม่งั้นสองที่จะเพี้ยนจากกันทันทีที่มีคนแก้ที่เดียว
   *
   * `invalid` แยกจาก "ยังกรอกไม่ครบ": ช่องว่างที่ยังไม่ถูกแตะไม่ควรถูกประกาศว่า "ผิด"
   * (aria-invalid บนช่องเปล่าตั้งแต่แรกคือเสียงรบกวน) — บอกด้วย aria-required + คำอธิบายพอ
   */
  const timeIssue = useMemo(():
    | { message: string; field: 'start' | 'end'; invalid: boolean }
    | null => {
    if (byDay || !pendingDate) return null
    if (!pendingStart) return { message: 'เลือกเวลาเริ่มก่อน', field: 'start', invalid: false }
    if (!pendingEnd) return { message: 'เลือกเวลาสิ้นสุดก่อน', field: 'end', invalid: false }
    if (pendingEnd <= pendingStart) {
      // คำเดียวกับ toast ของหน้าเลื่อนนัด (RescheduleAppointmentSheet.submit) — กฎเดียวกัน
      // ต้องได้ยินเป็นประโยคเดียวกันไม่ว่าจะไปเจอมันจากทางไหน
      return { message: 'เวลาสิ้นสุดต้องมาหลังเวลาเริ่ม', field: 'end', invalid: true }
    }
    if (pendingSlotFull) {
      return { message: 'ช่วงเวลานี้เต็มแล้ว — เลือกเวลาอื่น', field: 'start', invalid: true }
    }
    return null
  }, [byDay, pendingDate, pendingEnd, pendingSlotFull, pendingStart])

  const TIME_ISSUE_ID = 'appt-sheet-time-issue'

  const confirmState = useMemo((): { label: string; disabled: boolean } => {
    if (!pendingDate) return { label: 'แตะวันในปฏิทินก่อน', disabled: true }
    const dateLabel = formatDateTH(new Date(`${pendingDate}T00:00`))
    if (byDay) {
      // พูดวันที่ออกมาตรง ๆ ไม่ใช้คำว่า "วันนี้" — จอนี้มีปุ่ม "วันนี้" ที่แปลว่ากระโดดไป
      // วันปัจจุบัน (กติกาเดียวกับที่เขียนไว้ที่แถบยืนยันล่าง) และผู้ขายที่จิ้มดูหลายวัน
      // ติด ๆ กันต้องรู้ว่าใบไหนเต็ม ไม่ใช่ "วันนี้" ลอย ๆ
      if (pendingFull) return { label: `${dateLabel} เต็มแล้ว — เลือกวันอื่น`, disabled: true }
      // ใช้กริยา "ยืนยัน" ทั้งสองโหมด — ปุ่มเดียวกัน การกระทำเดียวกัน (ผูกค่าเข้าฟอร์มแล้วปิด)
      // คำว่า "เลือก" ทำให้อ่านเหมือนยังอยู่ในขั้นสำรวจ ทั้งที่กดแล้วมีผลจริง
      return { label: `ยืนยัน ${dateLabel}`, disabled: false }
    }
    // ป้ายปุ่มอ่านจาก timeIssue ตัวเดียวกับที่ผูกอยู่กับช่องเวลา (ดูคอมเมนต์ของ timeIssue)
    if (timeIssue) return { label: timeIssue.message, disabled: true }
    return { label: `ยืนยัน ${dateLabel} · ${pendingStart}–${pendingEnd}`, disabled: false }
  }, [byDay, pendingDate, pendingEnd, pendingFull, pendingStart, timeIssue])

  const goPrev = () => calRef.current?.getApi().prev()
  const goNext = () => calRef.current?.getApi().next()
  const goToday = () => calRef.current?.getApi().today()

  if (!open) return null

  return (
    /* HR7: fixed inset-0 z-80 = full-screen viewport-lock (Paces ไม่มี token) — ชุดเดียวกับ
       AddressSearchSheet ที่เปิดจากฟอร์มเดียวกัน
       pt safe-area: เต็มจอจริงตั้งแต่เปิด viewportFit:'cover' (2026-08-06) → หัวแผ่นต้องเว้น
       status bar เอง ไม่งั้นปุ่มย้อนกลับไปนอนใต้นาฬิกา/แบตเตอรี่ (CustomerSearchSheet ทำไว้แล้ว
       แต่ชีตนี้กับ AddressSearchSheet ตกสำรวจ — docs/conventions/ios-safe-area.md) */
    <div
      /* @container: layout ข้างในตัดสินจากความกว้าง "กล่องจริง" ไม่ใช่วิวพอร์ต
         `fixed inset-0` ไม่ได้แปลว่าเต็มจอเสมอ — ancestor ที่มี transform เป็น containing block
         ของ fixed descendant และหน้าต่างร่างออเดอร์ในแชทตั้ง transform-gpu ไว้โดยตั้งใจ
         (DraftOrderProvider.tsx:624-632) ชีตนี้จึงถูกขังในกล่อง lg:w-96 = 384px บนเดสก์ท็อป
         ขณะที่ breakpoint แบบวิวพอร์ตยังอ่าน ~1400px → สั่งทรง "จอกว้าง" ให้กล่องแคบ
         (เลขวันซ้อนกัน ชื่อวันไทยถูกตัดเป็นตัวอักษรทีละตัว — user report 2026-08-08)
         precedent: src/components/safepay/iship/PriceCompareSheet.tsx:191-195 (บั๊กคลาสเดียวกัน
         บริบทเดียวกัน) · @3xl=768px / @5xl=1024px = เลขเดียวกับ md/lg ของธีมเป๊ะ
         (ยืนยันแล้วว่าโปรเจกต์ไม่ได้ override ตัวแปรสเกล container หรือ breakpoint
         ใน src/assets/css จึงใช้สเกลมาตรฐานของ Tailwind v4 ตรง ๆ) */
      className="@container fixed inset-0 z-80 flex flex-col bg-card pt-[env(safe-area-inset-top)]" /* carve-out: safe-area ไม่มี token */
      role="dialog"
      aria-modal="true"
      /* ชื่อชีตต้องเป็นคำเดียวกับปุ่มที่เปิดมัน (AppointmentBlock/RescheduleAppointmentSheet
         เขียนว่า "เลือกวันและเวลา" ในโหมดระบุเวลา) — ตั้งแต่ 2026-08-08 ชีตนี้เป็นที่เลือก
         "เวลา" ด้วย ชื่อที่พูดถึงแต่วันจึงทำให้ผู้ขายกดปิดไปหาช่องเวลาที่อื่น */
      aria-label={byDay ? 'เลือกวันนัด' : 'เลือกวันและเวลา'}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-default-200 px-4 py-3">
        {/* หัวแผ่นชุดเดียวกับ CustomerSearchSheet / AddressSearchSheet (3 ชีตของฟอร์มเดียวกัน)
            — แก้ที่ไหนแก้ให้ครบทั้งสาม */}
        {/* ไอคอน x ไม่ใช่ chevron-left — ปุ่ม "เดือนก่อนหน้า" อยู่ต่ำลงไปแค่ ~60px และเคยใช้
            chevron เหมือนกันเป๊ะ ต่างกันแค่ขนาด ทั้งที่ผลของสองปุ่มนี้ต่างกันสุดขั้ว
            (ทิ้งงานที่กรอกค้าง vs เลื่อนเดือน) — ระยะเท่านี้บนมือถือคือ misclick ที่รอเกิด
            min-h-11/min-w-11 = 44px ตาม PRODUCT.md (btn-icon เปล่า ๆ ได้ 37px) */}
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="btn btn-icon text-default-800 hover:bg-default-100 min-h-11 min-w-11 shrink-0"
        >
          <Icon icon="x" className="size-6" />
        </button>
        {/* ไอคอนในกรอบพื้นอ่อนตาม mockup — idiom `bg-{semantic}/15` ของ Paces (HR7) */}
        <span className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded">
          <Icon icon="calendar-event" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          {/* คำเดียวกับ aria-label ด้านบนและกับปุ่มที่เปิดชีตนี้ — ห้ามให้สามที่นี้พูดคนละคำ */}
          <h3 className="truncate text-base font-semibold text-dark">
            {byDay ? 'เลือกวันนัด' : 'เลือกวันและเวลา'}
          </h3>
          {/* mockup โชว์ความจุต่อวันไว้ตรงนี้ด้วย — ผู้ขายจะได้รู้ตั้งแต่ต้นว่า "เต็ม" ของคิวนี้
              คือกี่งาน โดยไม่ต้องจิ้มวันแล้วไปอ่านตัวเลขที่หัวรายการ */}
          {(resourceName || (capacity != null && capacity > 0)) && (
            <p className="truncate text-xs text-default-500">
              {/* "คิว/วัน" ถูกเฉพาะโหมดรายวัน — โหมดระบุช่วงเวลา ความจุนี้วัดกันที่ "ช่วงเวลาที่ทับกัน"
                  (ดู isFull) ร้าน capacity 2 รับได้ทั้งวันหลายสิบคิว การเขียน "รับได้ 2 คิว/วัน"
                  ไว้หัวจอจึงขัดกับบรรทัด "จองแล้ว n จาก m คิว ในช่วงเวลานี้" ที่อยู่จอเดียวกัน (HR16)
                  คำโหมดเวลายกมาจากการ์ดเลือกบริการใน AppointmentBlock ("รับพร้อมกัน n คิว") ตรง ๆ */}
              {[
                resourceName,
                capacity != null && capacity > 0
                  ? byDay
                    ? `รับได้ ${capacity} คิว/วัน`
                    : `รับพร้อมกัน ${capacity} คิว`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/* หัวเรื่องเดือน + ปุ่มเลื่อน — วาดเองเพราะต้องเป็น พ.ศ. (ดูหมายเหตุหัวไฟล์)
          IMPORTANT: `btn-soft-default`/`btn-soft-primary` ที่เคยเขียนไว้ตรงนี้ **ไม่มีอยู่จริงในธีม**
          (grep ทั้ง src/assets/css + theme/paces = 0 — บทเรียนเดียวกับ `btn-ghost` ใน 00033)
          ปุ่มทั้งสามจึงเป็น `.btn` เปล่า ๆ ไม่มีพื้น ไม่มีขอบ อ่านเป็นตัวหนังสือลอย ๆ บนจอจริง
          ชุดที่ใช้ตอนนี้ยกมาจาก theme/paces/Admin/TS/src ตรง ๆ (combo ที่ธีมใช้ซ้ำหลักสิบครั้ง) */}
      {/* min-h-11/min-w-11 บนปุ่มไอคอนทั้งสาม: `.btn.btn-icon` ของธีม = `size-9.25` = 37px
          ซึ่งต่ำกว่าเกณฑ์ 44px ที่ PRODUCT.md ประกาศไว้สำหรับกลุ่ม digital-literacy ต่ำ/ผู้สูงวัย
          (WCAG 2.5.5 Target Size) — ปุ่มปิดบนหัวแผ่นแก้ไปแล้วรอบก่อน แต่ปุ่มเลื่อนเดือนกับ
          ปุ่ม "วันนี้" ซึ่งอยู่ห่างลงมา 60px ตกสำรวจ ทั้งที่เป็นแถวเดียวกันในสายตาผู้ใช้
          ใช้ min-h/min-w ไม่ใช่ size-11 เพราะ `.btn[class*="size-"]` บังคับ padding:0 อยู่แล้ว
          และ min-* ชนะ h/w ของ btn-icon ได้โดยไม่ต้องแก้ธีม (ท่าเดียวกับปุ่มปิดด้านบน) */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={goPrev}
          aria-label="เดือนก่อนหน้า"
          className="btn btn-icon text-default-800 hover:bg-default-100 min-h-11 min-w-11"
        >
          <Icon icon="chevron-left" className="size-4" />
        </button>
        {/* ชื่อเดือนอยู่กลางแถบตาม mockup — ต้อง flex-1 ไม่งั้นมันจะถูกดันไปชิดปุ่มซ้าย */}
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <h4 className="truncate text-base font-semibold text-dark">
            {viewStart ? formatMonthYearTH(viewStart) : ''}
          </h4>
          {loading && <Icon icon="loader-2" className="size-4 animate-spin text-default-400" />}
        </div>
        <div className="flex items-center gap-1.5">
          {/* กลาง ๆ ไม่ใช่ primary — น้ำเงินบนจอนี้สงวนไว้กับ "วันที่กำลังเลือก" กับปุ่มยืนยันล่าง
              (One Voice) ปุ่มนี้แค่พาไปเดือนปัจจุบัน ไม่ใช่การตัดสินใจของหน้าจอ */}
          <button
            type="button"
            onClick={goToday}
            className="btn btn-sm border-default-300 text-default-800 hover:border-default-400 hover:bg-default-50 min-h-11 rounded-full border px-4"
          >
            วันนี้
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="เดือนถัดไป"
            className="btn btn-icon text-default-800 hover:bg-default-100 min-h-11 min-w-11"
          >
            <Icon icon="chevron-right" className="size-4" />
          </button>
        </div>
      </div>

      {/* คำอธิบายสัญลักษณ์ — ย้ายขึ้นมาชิดปฏิทินที่มันอธิบาย (เดิมเป็นแถบแยกที่ก้นจอ กิน ~52px
          ซึ่งตอนนี้เป็นที่ของรายการแล้ว) "ว่าง" ไม่ต้องมี swatch เพราะมันคือช่องที่ไม่มีอะไรเลย */}
      <div className="text-default-600 text-2xs flex shrink-0 items-center justify-center gap-4 px-4 pb-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-warning size-1.5 rounded-full" aria-hidden="true" />
          มีคิวแล้ว
        </span>
        {/* "เต็ม" มีความหมายเฉพาะโหมดรายวัน — โหมดระบุช่วงเวลาไม่มีเครื่องหมายนี้ในปฏิทินเลย
            (ความจุวัดกันที่ช่วงเวลาทับกัน ไม่ใช่จำนวนนัดทั้งวัน — ดู isFull)
            legend ที่อธิบายสัญลักษณ์ซึ่งไม่มีวันโผล่ คือ legend ที่สอนผิด */}
        {byDay && (
          <span className="inline-flex items-center gap-1.5">
            <Icon icon="x" className="text-danger size-3.5" aria-hidden="true" />
            เต็ม
          </span>
        )}
        {/* swatch ต้องเป็นสัญลักษณ์ตัวเดียวกับที่เห็นในช่องจริง (เส้นขอบ ไม่ใช่จุดสี)
            — legend ที่แสดงคนละสัญลักษณ์กับของจริงคือ legend ที่อธิบายผิด */}
        <span className="inline-flex items-center gap-1.5">
          <span className="border-default-300 size-2.5 rounded-full border" aria-hidden="true" />
          วันนี้
        </span>
      </div>

      {/* กล่องแคบ = ปฏิทินบน / รายการล่าง · กล่องกว้าง = ปฏิทินซ้าย / รายการขวา (user สั่ง 2026-08-07)
          @5xl (1024) คือเส้นเดียวกับ lg ของ seller shell — แท็บเล็ต 768 ยังได้ทรงเรียงลง
          IMPORTANT: วัดจาก **กล่อง** ไม่ใช่วิวพอร์ต (ดูเหตุผลที่ @container บนหัวแผ่น) —
          เดิมเขียนไว้ว่า "ชีตนี้ fixed inset-0 เต็มวิวพอร์ตเสมอ" ซึ่งเป็นสมมติฐานที่ผิด
          และทำให้ชีตพังจริงเมื่อเปิดจากหน้าแชท */}
      {/* กล่องแคบ = เลื่อนเป็นคอลัมน์เดียว (ปฏิทิน → คิวของวันนั้น → เลือกเวลา) ปุ่มยืนยันตรึงล่าง
          กล่องกว้าง = สองคอลัมน์ที่ต่างคนต่างเลื่อนในตัวเอง

          IMPORTANT: ห้ามให้ 3 ส่วนแย่งความสูงกันในกล่องแคบ — ตอนโหมดระบุเวลา ส่วนเลือกเวลา
          (~198px, shrink-0) กับหัวรายการ กินพื้นที่จนรายการคิวของวันนั้นเหลือ 0px พอดี
          ซึ่งฆ่าเหตุผลทั้งหมดของการย้ายช่องเวลาเข้ามา (ย้ายมาเพื่อให้เห็นคิวขณะเลือกเวลา
          แล้วคิวดันหายไป = กลับไปเดาเวลาเหมือนก่อนแก้ โดยที่จอดู "ครบ" ทุกอย่าง)
          ให้เลื่อนแทนการบีบ: ไม่มีชิ้นไหนถูกครูดจนหาย และทุกอย่างยังไปถึงได้ */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain @5xl:flex-row @5xl:overflow-hidden">
      {/* ไม่ใช้ shrink-0 กับปฏิทิน: FullCalendar height="auto" ยืดตามจำนวนแถวของเดือน (6 แถว
          ในบางเดือน) ถ้าห้ามหดแล้วเดือนนั้นสูงเกินพื้นที่ รายการข้างล่างจะถูกบีบเหลือศูนย์
          — ให้ปฏิทินหดแล้วเลื่อนในตัวเองแทน ส่วนรายการมี min-h กันไว้อีกชั้น */}
      {/* appt-date-sheet = สโคป CSS ที่รื้อทรงตารางของ FullCalendar ออก (เส้นขอบทุกช่อง /
          แถวสูงไม่จำกัด / เลขวันชิดขวาบน) — ดูเหตุผลเต็มที่ src/assets/css/plugins/_calendar.css
          ขาดคลาสนี้เมื่อไหร่ ปฏิทินจะกลับไปเป็นตารางดิบทันที */}
      {/* กล่องแคบ: ปฏิทินสูงตามเนื้อหา แล้วให้คอลัมน์แม่เลื่อน (ไม่ซ้อน scroll สองชั้น)
          กล่องกว้าง: กลับไปเลื่อนในตัวเองเหมือนเดิม เพราะอยู่คู่กับคอลัมน์รายการ */}
      <div className="appt-date-sheet shrink-0 px-2 pb-2 @5xl:min-h-0 @5xl:shrink @5xl:overflow-y-auto @5xl:overscroll-contain @5xl:basis-3/5 @5xl:border-e @5xl:border-default-200">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          initialDate={value ? new Date(`${value}T00:00`) : undefined}
          headerToolbar={false}
          height="auto"
          locale="th"
          firstDay={0}
          editable={false}
          selectable={false}
          datesSet={onDatesSet}
          dateClick={onDateClick}
          /**
           * หัวคอลัมน์ย่อเมื่อกล่องแคบ เต็มตั้งแต่กล่องกว้าง 768 ขึ้นไป (ตาม mockup ทั้งสองเฟรม)
           * ต้องเขียนเองเพราะ locale th ของ FullCalendar ให้ชื่อเต็มเสมอในมุมมองเดือน
           * — ที่ 390px ชื่อเต็ม 7 คอลัมน์ล้นจนคอลัมน์เบียดกัน
           * สลับด้วย CSS (@3xl:) ไม่ใช่ JS — และต้องเป็น container query ไม่ใช่ md: เพราะกล่อง
           * ในหน้าแชทกว้าง 384px ขณะที่วิวพอร์ตกว้าง ~1400px (ดูเหตุผลเต็มที่ @container หัวแผ่น)
           * นี่คือจุดที่อาการหนักสุด: ชื่อวันเต็มถูกยัดลงคอลัมน์ ~30px แล้วตัดเป็นตัวอักษรทีละตัว
           */
          dayHeaderContent={(arg) => (
            <>
              <span className="@3xl:hidden">{DOW_SHORT[arg.date.getDay()]}</span>
              <span className="hidden @3xl:inline">{DOW_FULL[arg.date.getDay()]}</span>
            </>
          )}
          dayCellContent={(arg) => {
            const key = localDateKey(arg.date)
            const used = countByDay.get(key) ?? 0
            /* ต้องใช้ isFull() ตัวเดียวกับที่ปุ่มยืนยันใช้ ห้ามคำนวณเองซ้ำ — เดิมบรรทัดนี้
               ไม่ดู byDay ทำให้โหมดระบุช่วงเวลาวาดกากบาท "เต็ม" บนวันที่มีนัดครบ capacity
               ทั้งที่ (ก) legend ซ่อนสัญลักษณ์นั้นไปแล้วในโหมดนี้ → กากบาทไม่มีคำอธิบาย
               (ข) เกณฑ์นับทั้งวันไม่มีความหมายในโหมดเวลา (ร้านรับพร้อมกัน 2 คิวที่มีนัดสั้น ๆ
               8 นัดกระจายทั้งวัน ยังว่างอีกเยอะ) — เหตุผลเต็มอยู่ที่ isFull */
            const full = isFull(key)
            const selected = pendingDate === key
            /**
             * ทั้งช่องคือ "ปุ่มกลม ๆ" ใบเดียว — ขนาด/พื้น/ขอบอยู่ที่ div นี้ ไม่ใช่ที่ td ของตาราง
             * (td ของ FullCalendar อยู่ในตาราง border-collapse จึงมนมุมไม่ได้จริง และ
             * dayCellClassNames เอื้อมไปได้แค่ td) — ดู .appt-date-sheet ใน _calendar.css
             *
             * สถานะทั้งหมดอยู่ตรงนี้ที่เดียวเพื่อให้มันอัปเดตเองเมื่อข้อมูลนัดโหลดมาทีหลัง
             * (ปฏิทินถูกวาดก่อน fetch เสร็จเสมอ)
             *
             * วันเต็ม = กากบาทแทนเลขวัน (user สั่ง 2026-08-07 พร้อมภาพอ้างอิง) — 3 สถานะ
             * แยกกันด้วย **รูปร่าง** ไม่ใช่ด้วยสีอย่างเดียว คนตาบอดสีจึงยังแยกออก
             * เลขวันต้องยังอยู่ใน DOM (sr-only) ไม่งั้นคนใช้ screen reader จะได้ยินแต่
             * "กากบาท" เรียงกันทั้งเดือนโดยไม่รู้ว่าช่องไหนคือวันที่เท่าไหร่
             */
            const tone = selected
              ? 'bg-primary text-white'
              : arg.isOther
                ? 'text-default-400 opacity-55'
                : arg.isToday
                  ? 'text-default-800 border-default-300 hover:bg-default-100 border'
                  : 'text-default-800 hover:bg-default-100'
            /**
             * ช่องของเดือนข้างเคียงไม่รับโฟกัส — `onDateClick` กันมันไว้แล้วด้วย `fc-day-other`
             * ถ้าปล่อยให้ tab ไปหยุดได้ จะกลายเป็นจุดที่กดแล้วไม่มีอะไรเกิดขึ้น (WCAG 2.4.3)
             * และเพิ่มจุดแวะให้คีย์บอร์ดอีก 7-14 จุดต่อเดือนโดยไม่ได้อะไรกลับมา
             */
            const pickable = !arg.isOther
            /**
             * ป้ายเสียงต่อช่องวัน — เดิมมี sr-only เฉพาะกรณี "เต็ม" เท่านั้น ช่องปกติจึงได้ยิน
             * แค่เลขวันลอย ๆ ("8") ไม่รู้ว่าเดือนอะไร มีคิวอยู่แล้วกี่งาน หรือกำลังเลือกอยู่ไหม
             * ประกอบจาก formatDateTH (พ.ศ. ตาม docs/conventions/date-format.md) ไม่ใช่ต่อสตริงเอง
             *
             * ตัวหาร (capacity) พูดเฉพาะโหมดรายวัน ด้วยเหตุผลเดียวกับที่หัวรายการทำ —
             * โหมดระบุช่วงเวลาเอา day-count มาหารด้วยความจุไม่ได้ (ดู isFull) พูดจำนวนดิบพอ
             */
            const dayLabel = pickable
              ? [
                  formatDateTH(arg.date),
                  full
                    ? 'เต็มแล้ว'
                    : used > 0
                      ? byDay && capacity != null && capacity > 0
                        ? `จองแล้ว ${used} จาก ${capacity} คิว`
                        : `มี ${used} คิว`
                      : 'ยังไม่มีคิว',
                  arg.isToday ? 'วันนี้' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : undefined
            return (
              <div
                /* role/tabIndex/onKeyDown = ทางเข้าคีย์บอร์ดของงานหลักในจอนี้ (ดู onDayKeyDown)
                   aria-pressed บอกว่า "วันนี้คือวันที่กำลังดูอยู่" ซึ่งเป็นสถานะสลับได้ ไม่ใช่
                   การนำทาง — ตรงกับที่การ์ดเลือกบริการใน AppointmentBlock ใช้อยู่แล้ว
                   focus-visible ชุด ring: idiom เดียวกับทั้ง (paces) (ProductGrid/OrdersList)
                   ring-offset-1 จำเป็นเพราะช่องที่เลือกอยู่พื้นเป็น bg-primary — ring สีเดียวกัน
                   บนพื้นสีเดียวกันคือขอบโฟกัสที่มองไม่เห็น (WCAG 2.4.7) */
                role={pickable ? 'button' : undefined}
                tabIndex={pickable ? 0 : undefined}
                aria-pressed={pickable ? selected : undefined}
                aria-label={dayLabel}
                onKeyDown={pickable ? (e) => onDayKeyDown(e, key) : undefined}
                className={`flex min-h-11.5 w-full flex-col items-center justify-center gap-1 rounded-lg focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none @3xl:min-h-13 ${tone}`}
              >
                {full ? (
                  <>
                    <span className="sr-only">{arg.dayNumberText} เต็ม</span>
                    {/* บนพื้น primary ของวันที่เลือกอยู่ กากบาทชมพูอ่านไม่ออก ต้องกลับเป็นขาว */}
                    <Icon
                      icon="x"
                      className={`size-5 ${selected ? 'text-white' : 'text-danger'}`}
                      aria-hidden="true"
                    />
                  </>
                ) : (
                  <>
                    <span className={`text-sm leading-none ${selected ? 'font-semibold' : 'font-medium'}`}>
                      {arg.dayNumberText}
                    </span>
                    {/* จุดว่างโปร่งใสยังต้องอยู่ ไม่งั้นเลขวันของช่องที่มีคิวกับไม่มีคิวจะไม่ตรงแนวกัน */}
                    <span
                      className={`size-1.5 rounded-full ${
                        used > 0 ? (selected ? 'bg-white' : 'bg-warning') : 'bg-transparent'
                      }`}
                      aria-hidden="true"
                    />
                  </>
                )}
              </div>
            )
          }}
        />
      </div>

      {/* ── รายการนัดของวันที่กำลังดู (user สั่ง 2026-08-07: "จิ้มวันแต่ละวันเพื่อดูรายการได้") ── */}
      {/* min-h-40 = พื้นที่ขั้นต่ำที่รายการต้องได้เสมอ (flex-1 basis 0 อย่างเดียวไม่การันตี
          อะไรเลยเมื่อพื้นที่ติดลบ — ปฏิทินจะกินหมดแล้วรายการหายไปทั้งก้อน) */}
      <div className="border-default-200 bg-default-100 flex flex-col border-t @5xl:min-h-0 @5xl:flex-1 @5xl:basis-2/5 @5xl:border-t-0">
        {/* aria-live/atomic: การเลือกวันเปลี่ยนแค่ "รายการข้างล่าง" ซึ่งอยู่คนละที่กับมือ/โฟกัส
            ผู้ใช้ screen reader ที่เพิ่งกด Enter บนช่องวันจึงไม่มีทางรู้ผลของสิ่งที่เพิ่งทำเลย
            (WCAG 4.1.3 Status Messages) — atomic=true เพื่อให้ได้ยินทั้งวันที่ + จำนวนคิว
            เป็นประโยคเดียว ไม่ใช่ได้ยินเฉพาะตัวเลขที่เปลี่ยน */}
        <div className="flex shrink-0 items-baseline gap-2 px-4 pt-3 pb-2" aria-live="polite" aria-atomic="true">
          <h4 className="text-dark text-sm font-semibold">
            {pendingDate ? formatWeekdayDateTH(new Date(`${pendingDate}T00:00`)) : 'แตะวันในปฏิทิน'}
          </h4>
          {/* ตัวหาร (capacity) มีความหมายเฉพาะโหมดรายวัน ซึ่ง "ทั้งวัน" คือช่วงเดียว —
              โหมดระบุช่วงเวลาเอา day-count มาหารด้วย capacity ไม่ได้ เพราะนัดสั้น ๆ ที่กระจาย
              กันทั้งวันจะได้เลขเกินความจุทันที (ร้าน capacity 2 ที่มี 8 นัดจะขึ้น "จองแล้ว 8
              จาก 2 คิว" ซึ่งอ่านไม่รู้เรื่อง) และมันจะขัดกับบรรทัด "จองแล้ว n จาก m คิว
              ในช่วงเวลานี้" ที่อยู่ห่างลงไปไม่ถึงจอเดียวกัน — คนละเลขบนจอเดียว (HR16)
              โหมดเวลาจึงบอกจำนวนดิบอย่างเดียว ตัวหารไปอยู่กับช่วงเวลาที่ใช้ตัวหารได้จริง */}
          {pendingDate &&
            (byDay
              ? capacity != null &&
                capacity > 0 && (
                  <span
                    className={`ms-auto text-xs ${pendingFull ? 'text-warning-ink' : 'text-default-500'}`}
                  >
                    จองแล้ว {pendingCount} จาก {capacity} คิว
                  </span>
                )
              : pendingCount > 0 && (
                  /* "ในวันนี้" อ่านได้ว่า today ทั้งที่หมายถึง "วันที่จิ้มอยู่" — และจอนี้มีปุ่ม
                     "วันนี้" ที่แปลว่ากระโดดไปวันปัจจุบันอยู่ห่างไม่ถึงจอเดียว (คำเตือนเดียวกับ
                     ที่เขียนไว้ที่แถบยืนยันล่าง) ขึ้นต้นด้วย "ทั้งวัน" แทน ได้ทั้งความชัดและ
                     ความต่างจากบรรทัด "…ในช่วงเวลานี้" ที่อยู่ใต้ช่องเวลา */
                  <span className="text-default-500 ms-auto text-xs">
                    ทั้งวันมี {pendingCount} คิว
                  </span>
                ))}
        </div>

        {dayItems.length === 0 ? (
          /* วันว่าง = ผลลัพธ์ที่ดีของหน้าจอนี้ (จองได้) ไม่ใช่ความล้มเหลว — น้ำเสียงจึงไม่ใช่
             "ไม่พบข้อมูล" และไอคอนเป็นเทากลาง **ไม่ใช่เขียว** เพราะเขียวสงวนไว้กับสัญญาณ
             ความเชื่อใจที่ยืนยันแล้ว (Verified-Means-Green) ว่างไม่ใช่ trust signal */
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <span className="bg-default-200 text-default-500 flex size-11 items-center justify-center rounded-full">
              <Icon icon="calendar-check" className="size-5" />
            </span>
            <p className="text-default-800 text-sm font-semibold">ว่างทั้งวัน</p>
            {/* เลี่ยงคำว่า "วันนี้" — บนจอเดียวกันมีปุ่ม "วันนี้" ที่แปลว่ากระโดดไปวันปัจจุบัน
                (คำเตือนเรื่องนี้เขียนไว้แล้วที่แถบยืนยันล่าง แต่บรรทัดนี้ตกสำรวจ)
                และในโหมดระบุเวลา ยังเลือกวันอย่างเดียวแล้วยืนยันไม่ได้ ต้องกรอกเวลาก่อน
                2026-08-08 (clarify): สาขารายวันยังเขียนว่า "เลือกวันนี้ได้เลย" อยู่ ทั้งที่
                คอมเมนต์ข้างบนประกาศว่าเลี่ยงคำนี้ — แก้ให้ตรงกับที่ประกาศไว้ และไม่ชี้ไปที่ปุ่ม
                ใดปุ่มหนึ่ง เพราะกล่องนี้ขึ้นตั้งแต่ตอนที่ยังไม่ได้จิ้มวันด้วย (ปุ่มยืนยันยัง disabled) */}
            <p className="text-default-500 text-xs">
              {byDay ? 'ยังไม่มีใครจองคิวนี้ — จองได้เลย' : 'ยังไม่มีใครจองคิวนี้ — เลือกเวลาได้ตามสะดวก'}
            </p>
          </div>
        ) : (
          <div className="px-3 pb-3 @5xl:min-h-0 @5xl:flex-1 @5xl:overflow-y-auto @5xl:overscroll-contain">
            <ul className="flex flex-col gap-2">
              {dayItems.map((it) => {
                const start = new Date(it.start)
                const end = new Date(it.end)
                const allDay = isAllDayAppointment(start, end)
                const status = (it.appointmentStatus ?? 'SCHEDULED') as AppointmentStatus
                return (
                  /* ไม่ทำเป็นลิงก์ไปหน้าออเดอร์ — ผู้ใช้กำลังกรอกฟอร์มสร้างงานค้างอยู่
                     กดออกไปแล้วร่างที่พิมพ์ไว้จะเสีย (ต่างจากปฏิทินในหน้า /queues ที่กดได้) */
                  <li key={it.orderToken} className="bg-card flex items-start gap-3 rounded-lg p-3">
                    <span className="text-dark w-14 shrink-0 text-sm font-semibold tabular-nums">
                      {allDay ? (
                        'ทั้งวัน'
                      ) : (
                        <>
                          {formatTimeHM(start)}
                          <span className="text-default-500 block text-xs font-normal">
                            – {formatTimeHM(end)}
                          </span>
                        </>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-dark block truncate text-sm font-medium">
                        {it.buyerName || 'ไม่ระบุชื่อ'}
                      </span>
                      {it.orderNo && (
                        <span className="text-default-500 block text-xs tabular-nums">#{it.orderNo}</span>
                      )}
                    </span>
                    <span
                      className={`badge shrink-0 ${(APPOINTMENT_STAGE_META[status] ?? APPOINTMENT_STAGE_META.SCHEDULED).cls}`}
                    >
                      {APPOINTMENT_STATUS_LABEL[status] ?? APPOINTMENT_STATUS_LABEL.SCHEDULED}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* ── เลือกเวลา (โหมดระบุช่วงเวลาเท่านั้น) ──
            user สั่ง 2026-08-08: "อยากให้อยู่ตอนที่เลือกวันเลย (ใน Calendar) ทำไมต้องออกมา
            อยู่ข้างนอก UX ใช้งานยากมาก" — เดิมต้องกดยืนยันวัน ปิดชีต แล้วไปกรอกเวลาในฟอร์ม
            ซึ่งเป็นคนละบริบทกับตอนที่เพิ่งดูคิวว่างอยู่ วางไว้ "ใต้รายการนัดของวันนั้น"
            โดยตั้งใจ เพราะรายการนั้นคือข้อมูลที่ใช้ตัดสินว่าจะนัดกี่โมง — อ่านแล้วกรอกต่อได้เลย
            shrink-0: ห้ามให้ส่วนนี้ถูกบีบหายเมื่อรายการนัดยาว (รายการมี overflow ของตัวเองแล้ว) */}
        {!byDay && pendingDate && (
          <div className="border-default-200 shrink-0 border-t border-dashed px-4 pt-3 pb-3">
            <p className="form-label mb-2">เลือกเวลา</p>

            {/* ทางลัดจากข้อมูลที่อยู่ตรงหน้าอยู่แล้ว — ไม่ใช่ขั้นตอนบังคับ วันที่ยังว่างจะไม่มีชิปนี้
                combo ปุ่มเดียวกับ "วันนี้" บนหัวแถบเดือนของไฟล์นี้ (ไม่ใช่คลาสใหม่) */}
            {/* นี่คือทางลัดหลักของทั้งงานนี้ (กดครั้งเดียวได้ทั้งเวลาเริ่มและสิ้นสุด) จึงต้องเป็น
                ปุ่มเต็มความกว้าง min-h-11 ไม่ใช่ชิปเล็ก 30px — ของที่ตัดสินใจแทนผู้ใช้ได้เร็วที่สุด
                ห้ามเป็นของที่กดยากที่สุดในจอ (PRODUCT.md: tap target ≥44px) */}
            {suggestedStart && suggestedStart !== pendingStart && (
              <button
                type="button"
                onClick={() => applyStart(suggestedStart)}
                className="btn border-default-300 text-default-800 hover:border-default-400 hover:bg-default-50 mb-3 min-h-11 w-full justify-start gap-2 rounded-lg border"
              >
                {/* ป้ายต้องบอก "กดแล้วได้อะไร" ไม่ใช่บอกแค่ข้อเท็จจริง — "ต่อจากคิวก่อนหน้า 15:30"
                    อ่านได้เป็นป้ายบอกข้อมูลเฉย ๆ (คลาสเดียวกับปุ่ม "ทักแชท" ที่กลายเป็นป้ายบอกเวลา)
                    ขึ้นต้นด้วยกริยา + ค่าที่จะถูกเติม แล้วต่อด้วยเหตุผลที่เสนอเวลานี้ */}
                <Icon icon="arrow-narrow-right" className="size-4 shrink-0" aria-hidden="true" />
                ตั้งเวลาเริ่ม {suggestedStart} ต่อจากคิวก่อนหน้า
              </button>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="appt-sheet-start" className="form-label">
                  เวลาเริ่ม
                </label>
                {/* aria-required: ทั้งคู่บังคับกรอกในโหมดนี้ (ปุ่มยืนยัน disabled จนกว่าจะครบ)
                    แต่ไม่มี `required` จริงเพราะไม่ได้อยู่ใน <form> ที่ submit
                    aria-invalid เฉพาะตอน "ค่าที่กรอกผิดจริง" ไม่ใช่ตอนยังว่าง (ดู timeIssue)
                    aria-describedby ชี้ไปที่ข้อความใต้ช่อง ซึ่งเป็น live region ด้วย */}
                <input
                  id="appt-sheet-start"
                  type="time"
                  className="form-input"
                  aria-required
                  aria-invalid={timeIssue?.field === 'start' && timeIssue.invalid ? true : undefined}
                  aria-describedby={timeIssue ? TIME_ISSUE_ID : undefined}
                  value={pendingStart}
                  onChange={(e) => applyStart(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="appt-sheet-end" className="form-label">
                  เวลาสิ้นสุด
                </label>
                <input
                  id="appt-sheet-end"
                  type="time"
                  className="form-input"
                  min={pendingStart || undefined}
                  aria-required
                  aria-invalid={timeIssue?.field === 'end' && timeIssue.invalid ? true : undefined}
                  aria-describedby={timeIssue ? TIME_ISSUE_ID : undefined}
                  value={pendingEnd}
                  onChange={(e) => {
                    endTouched.current = true
                    setPendingEnd(e.target.value)
                  }}
                />
              </div>
            </div>

            {/* กล่อง live region ต้องอยู่ใน DOM **ตลอดเวลา** ไม่ใช่โผล่มาพร้อมข้อความ —
                live region ที่เพิ่งถูกแทรกเข้ามาในเฟรมเดียวกับเนื้อหา มักไม่ถูกประกาศเลย
                จึงเป็น div ว่างที่มี aria-live ค้างไว้ แล้วให้ <p> ข้างในโผล่/หายแทน
                polite ไม่ใช่ assertive: ผู้ใช้กำลังพิมพ์เวลาอยู่ ไม่ควรถูกขัดกลางคัน
                น้ำเสียงแยกตาม invalid — "ยังกรอกไม่ครบ" เป็นคำแนะนำ (เทา) ไม่ใช่ความผิดพลาด
                (แดง) ที่ต้องตกใจ ทั้งที่ผู้ใช้แค่ยังพิมพ์ไม่เสร็จ */}
            <div aria-live="polite">
              {timeIssue && (
                <p
                  id={TIME_ISSUE_ID}
                  className={`mt-2 mb-0 text-sm ${
                    timeIssue.invalid ? 'text-danger' : 'text-default-500'
                  }`}
                >
                  {timeIssue.message}
                </p>
              )}
            </div>

            {/* ตัวนับของ "ช่วงเวลา" ไม่ใช่ของทั้งวัน — แสดงผลเท่านั้น ไม่ใช่คำตัดสิน (BR-RSV-18)
                ตัวที่กันจริงคือปุ่มยืนยันล่าง ซึ่ง disabled เมื่อช่วงนี้เต็ม */}
            {pendingStart && capacity != null && capacity > 0 && (
              <p
                className={`mt-2 mb-0 text-sm ${
                  pendingSlotFull ? 'text-warning-ink' : 'text-default-500'
                }`}
              >
                จองแล้ว {pendingSlotBookedCount} จาก {capacity} คิว ในช่วงเวลานี้
              </p>
            )}
          </div>
        )}
      </div>
      </div>

      {/* ── แถบยืนยันติดขอบล่าง ──
          ปุ่มนี้คือที่เดียวที่ค่าจริงในฟอร์มถูกเปลี่ยน (จิ้มวันในปฏิทินแค่ preview)
          ไม่ใช้คำว่า "วันนี้" เพราะชนกับปุ่ม "วันนี้" บนหัวที่แปลว่ากระโดดไปวันปัจจุบัน
          — จอเดียวมีคำเดียวกันสองความหมายคืออ่านสลับกันได้ทันที จึงพูดวันที่ออกมาตรง ๆ */}
      <div className={`border-default-200 bg-card flex shrink-0 items-start gap-3 border-t px-4 pt-3 ${FOOTBAR_HEIGHT}`}>
        <button
          type="button"
          disabled={confirmState.disabled}
          onClick={() => {
            if (confirmState.disabled || !pendingDate) return
            onConfirm({
              date: pendingDate,
              // โหมดรายวันไม่มีเวลา — ส่ง undefined ไม่ใช่สตริงว่าง เพื่อให้ผู้เรียกล้างค่าเดิมได้ชัด
              startTime: byDay ? undefined : pendingStart,
              endTime: byDay ? undefined : pendingEnd,
              bookedCount: pendingSlotBookedCount,
            })
            onClose()
          }}
          /* combo หลักของปุ่ม CTA เต็มความกว้างในธีม Paces (theme/paces/Admin/TS/src ใช้ซ้ำ 27 ที่)
             ไม่ต้องมี disabled:opacity-50 เอง — `button:disabled` ใน custom/_buttons.css
             ให้ opacity-50 + cursor-not-allowed อยู่แล้วทั้งระบบ */
          className="btn bg-primary hover:bg-primary-hover min-h-11 w-full py-3 font-semibold text-white"
        >
          {confirmState.label}
        </button>
      </div>
    </div>
  )
}
