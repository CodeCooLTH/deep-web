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
 * โครง 2 ชั้น (user สั่ง 2026-08-07): มือถือ = ปฏิทินบน / รายการนัดของวันที่จิ้มอยู่ล่าง /
 * ปุ่มยืนยันติดขอบล่าง · เดสก์ท็อป (lg) = ปฏิทินซ้าย / รายการขวา
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
import { isAllDayAppointment, APPOINTMENT_STATUS_LABEL, type AppointmentStatus } from '@/lib/appointments'
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
  /** ค่าที่เลือกอยู่ "YYYY-MM-DD" */
  value?: string
  /**
   * ออเดอร์ที่กำลังเลื่อนนัดอยู่ (feature 00036) — กรองนัดของใบนี้ออกจากตัวนับความว่าง
   * ไม่ส่ง = โหมดตั้งนัดใหม่ตอนสร้างออเดอร์ (พฤติกรรมเดิม ไม่มีอะไรให้กรอง)
   */
  excludeOrderToken?: string
  onSelect: (date: string) => void
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
  value,
  excludeOrderToken,
  onSelect,
  onClose,
}: Props) {
  useLockBodyScroll(open)

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
  // เปิดชีตใหม่ทุกครั้งต้องเริ่มจากค่าที่ฟอร์มถืออยู่ ไม่ใช่ค่าที่ค้างจากการเปิดครั้งก่อน
  useEffect(() => {
    if (open) setPendingDate(value)
  }, [open, value])
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

  const isFull = useCallback(
    (key: string) => capacity != null && capacity > 0 && (countByDay.get(key) ?? 0) >= capacity,
    [capacity, countByDay],
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

  const pendingFull = pendingDate ? isFull(pendingDate) : false
  const pendingCount = pendingDate ? (countByDay.get(pendingDate) ?? 0) : 0

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
      className="fixed inset-0 z-80 flex flex-col bg-card pt-[env(safe-area-inset-top)]" /* carve-out: safe-area ไม่มี token */
      role="dialog"
      aria-label="เลือกวันนัด"
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-default-200 px-4 py-3">
        {/* หัวแผ่นชุดเดียวกับ CustomerSearchSheet / AddressSearchSheet (3 ชีตของฟอร์มเดียวกัน)
            — แก้ที่ไหนแก้ให้ครบทั้งสาม */}
        <button
          type="button"
          onClick={onClose}
          aria-label="ย้อนกลับ"
          className="btn btn-icon text-default-800 hover:bg-default-100 shrink-0"
        >
          <Icon icon="chevron-left" className="size-6" />
        </button>
        {/* ไอคอนในกรอบพื้นอ่อนตาม mockup — idiom `bg-{semantic}/15` ของ Paces (HR7) */}
        <span className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded">
          <Icon icon="calendar-event" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-dark">เลือกวันนัด</h3>
          {/* mockup โชว์ความจุต่อวันไว้ตรงนี้ด้วย — ผู้ขายจะได้รู้ตั้งแต่ต้นว่า "เต็ม" ของคิวนี้
              คือกี่งาน โดยไม่ต้องจิ้มวันแล้วไปอ่านตัวเลขที่หัวรายการ */}
          {(resourceName || (capacity != null && capacity > 0)) && (
            <p className="truncate text-xs text-default-500">
              {[resourceName, capacity != null && capacity > 0 ? `รับได้ ${capacity} คิว/วัน` : null]
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
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={goPrev}
          aria-label="เดือนก่อนหน้า"
          className="btn btn-icon text-default-800 hover:bg-default-100"
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
            className="btn btn-sm border-default-300 text-default-800 hover:border-default-400 hover:bg-default-50 rounded-full border"
          >
            วันนี้
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="เดือนถัดไป"
            className="btn btn-icon text-default-800 hover:bg-default-100"
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
        <span className="inline-flex items-center gap-1.5">
          <Icon icon="x" className="text-danger size-3.5" aria-hidden="true" />
          เต็ม
        </span>
        {/* swatch ต้องเป็นสัญลักษณ์ตัวเดียวกับที่เห็นในช่องจริง (เส้นขอบ ไม่ใช่จุดสี)
            — legend ที่แสดงคนละสัญลักษณ์กับของจริงคือ legend ที่อธิบายผิด */}
        <span className="inline-flex items-center gap-1.5">
          <span className="border-default-300 size-2.5 rounded-full border" aria-hidden="true" />
          วันนี้
        </span>
      </div>

      {/* มือถือ = ปฏิทินบน / รายการล่าง · เดสก์ท็อป = ปฏิทินซ้าย / รายการขวา (user สั่ง 2026-08-07)
          lg (1024) คือ breakpoint เส้นเดียวของ seller shell — แท็บเล็ต 768 ยังได้ทรงมือถือ
          ใช้ viewport breakpoint ได้ตรง ๆ ที่นี่ (ต่างจากการ์ดใน AppointmentBlock) เพราะชีตนี้
          เป็น fixed inset-0 เต็มวิวพอร์ตเสมอ ความกว้างจอ = ความกว้างจริงของมัน */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* ไม่ใช้ shrink-0 กับปฏิทิน: FullCalendar height="auto" ยืดตามจำนวนแถวของเดือน (6 แถว
          ในบางเดือน) ถ้าห้ามหดแล้วเดือนนั้นสูงเกินพื้นที่ รายการข้างล่างจะถูกบีบเหลือศูนย์
          — ให้ปฏิทินหดแล้วเลื่อนในตัวเองแทน ส่วนรายการมี min-h กันไว้อีกชั้น */}
      {/* appt-date-sheet = สโคป CSS ที่รื้อทรงตารางของ FullCalendar ออก (เส้นขอบทุกช่อง /
          แถวสูงไม่จำกัด / เลขวันชิดขวาบน) — ดูเหตุผลเต็มที่ src/assets/css/plugins/_calendar.css
          ขาดคลาสนี้เมื่อไหร่ ปฏิทินจะกลับไปเป็นตารางดิบทันที */}
      <div className="appt-date-sheet min-h-0 overflow-y-auto overscroll-contain px-2 pb-2 lg:basis-3/5 lg:border-e lg:border-default-200">
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
           * หัวคอลัมน์ย่อบนมือถือ เต็มตั้งแต่ 768 ขึ้นไป (ตาม mockup ทั้งสองเฟรม)
           * ต้องเขียนเองเพราะ locale th ของ FullCalendar ให้ชื่อเต็มเสมอในมุมมองเดือน
           * — ที่ 390px ชื่อเต็ม 7 คอลัมน์ล้นจนคอลัมน์เบียดกัน
           * สลับด้วย CSS (md:hidden) ไม่ใช่ JS เพราะชีตนี้ fixed inset-0 = กว้างเท่าวิวพอร์ตเสมอ
           */
          dayHeaderContent={(arg) => (
            <>
              <span className="md:hidden">{DOW_SHORT[arg.date.getDay()]}</span>
              <span className="hidden md:inline">{DOW_FULL[arg.date.getDay()]}</span>
            </>
          )}
          dayCellContent={(arg) => {
            const key = localDateKey(arg.date)
            const used = countByDay.get(key) ?? 0
            const full = capacity != null && capacity > 0 && used >= capacity
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
            return (
              <div
                className={`flex min-h-11.5 w-full flex-col items-center justify-center gap-1 rounded-lg md:min-h-13 ${tone}`}
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
      <div className="border-default-200 bg-default-100 flex min-h-40 flex-1 flex-col border-t lg:min-h-0 lg:basis-2/5 lg:border-t-0">
        <div className="flex shrink-0 items-baseline gap-2 px-4 pt-3 pb-2">
          <h4 className="text-dark text-sm font-semibold">
            {pendingDate ? formatWeekdayDateTH(new Date(`${pendingDate}T00:00`)) : 'แตะวันในปฏิทิน'}
          </h4>
          {pendingDate && capacity != null && capacity > 0 && (
            <span className={`ms-auto text-xs ${pendingFull ? 'text-warning-ink' : 'text-default-500'}`}>
              จองแล้ว {pendingCount} จาก {capacity} คิว
            </span>
          )}
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
            <p className="text-default-500 text-xs">ยังไม่มีใครจองคิวนี้ — เลือกวันนี้ได้เลย</p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
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
      </div>
      </div>

      {/* ── แถบยืนยันติดขอบล่าง ──
          ปุ่มนี้คือที่เดียวที่ค่าจริงในฟอร์มถูกเปลี่ยน (จิ้มวันในปฏิทินแค่ preview)
          ไม่ใช้คำว่า "วันนี้" เพราะชนกับปุ่ม "วันนี้" บนหัวที่แปลว่ากระโดดไปวันปัจจุบัน
          — จอเดียวมีคำเดียวกันสองความหมายคืออ่านสลับกันได้ทันที จึงพูดวันที่ออกมาตรง ๆ */}
      <div className={`border-default-200 bg-card flex shrink-0 items-start gap-3 border-t px-4 pt-3 ${FOOTBAR_HEIGHT}`}>
        <button
          type="button"
          disabled={!pendingDate || pendingFull}
          onClick={() => {
            if (!pendingDate || pendingFull) return
            onSelect(pendingDate)
            onClose()
          }}
          /* combo หลักของปุ่ม CTA เต็มความกว้างในธีม Paces (theme/paces/Admin/TS/src ใช้ซ้ำ 27 ที่)
             ไม่ต้องมี disabled:opacity-50 เอง — `button:disabled` ใน custom/_buttons.css
             ให้ opacity-50 + cursor-not-allowed อยู่แล้วทั้งระบบ */
          className="btn bg-primary hover:bg-primary-hover min-h-11 w-full py-3 font-semibold text-white"
        >
          {pendingFull
            ? 'วันนี้เต็มแล้ว — เลือกวันอื่น'
            : pendingDate
              ? `เลือก ${formatDateTH(new Date(`${pendingDate}T00:00`))}`
              : 'แตะวันในปฏิทินก่อน'}
        </button>
      </div>
    </div>
  )
}
