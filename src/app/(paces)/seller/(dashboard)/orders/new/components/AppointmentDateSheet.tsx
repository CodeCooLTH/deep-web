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

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  minutesBetweenTimes,
  formatDurationTH,
  nextShowAllHours,
  resolveInitialDuration,
  DEFAULT_APPOINTMENT_DURATION_MIN as DEFAULT_DURATION_MIN,
  type AppointmentGranularity,
} from '@/lib/appointments'
import AppointmentDayCell from '@/components/safepay/appointment-board/AppointmentDayCell'
import AppointmentDayRows from '@/components/safepay/appointment-board/AppointmentDayRows'
import { localDateKey, type AppointmentBoardItem } from '@/components/safepay/appointment-board/types'

/**
 * ป้ายสถานะของแต่ละแถวย้ายไป AppointmentDayRows แล้ว (2026-08-10) — ไฟล์นี้ไม่ประกาศชุดสี
 * หรือคำของสถานะเองอีกต่อไป
 *
 * ประวัติที่ต้องไม่ลืม: ไฟล์นี้เคยประกาศ map ของตัวเองเป็นที่ที่ **สาม** แล้วเพี้ยนไปจริง 2 ช่อง
 * (CONFIRMED_BY_BUYER เขียว / COMPLETED เทา) หลัง user เคาะให้สลับเป็น primary/success —
 * คำเตือน "ห้ามคิดใหม่" ที่เขียนไว้ตรงนี้กันไม่ได้ เพราะมันเตือนคนอ่าน ไม่ได้บังคับโค้ด
 * SSOT ของชุดสีอยู่ที่ src/lib/appointment-stage.ts
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

interface Props {
  open: boolean
  /** คิวงานที่เลือกไว้ในฟอร์ม — ปฏิทินโชว์ความว่างของคิวนี้คิวเดียว (user เคาะ 2026-08-07) */
  resourceId?: string
  /**
   * โหมด "ภาพรวมทุกคิวงาน" (2026-08-10) — ส่งมาแทน `resourceId` ไม่ใช่ส่งคู่กัน
   *
   * ใช้กับปุ่มปฏิทินในแถบเครื่องมือแชท ซึ่งเปิดขึ้นมาตอนที่ยังไม่มีการเลือกคิวเลย (ผู้ขาย
   * แค่อยากรู้ว่าวันไหนพอรับได้) — ความจุของวันจึงเป็นผลรวมของทุกคิวที่เปิดใช้
   *
   * 🛑 ตัวเลขที่ได้เป็น **ภาพรวม** ไม่ใช่คำตอบของคิวใดคิวหนึ่ง — จอต้องติดป้ายบอกเสมอ
   * (ดูบรรทัดเตือนใต้หัวแผ่น) ไม่งั้นผู้ขายอ่านว่า "ว่าง" แล้วไปเจอคิวที่เลือกจริงเต็ม
   * ซึ่งเป็นคลาส "ตัวเลขบางส่วนที่หน้าตาเหมือนตัวเลขที่ครบแล้ว"
   * (docs/conventions/partial-data-must-be-labeled-or-filled.md)
   */
  aggregateResources?: { id: string; name: string; capacity: number }[]
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

/**
 * ชิประยะเวลาพื้นฐาน — `durationMinutes` ของคิวงานถูก "แทรก" เข้าไปตามลำดับ ไม่ใช่แทนที่ชุดนี้
 * (ร้านที่ตั้ง 45 นาทีจึงได้ 30/45/60/90/120 ไม่ใช่ 45/90/135 ซึ่งจะทำให้เลือก 1 ชม. ไม่ได้เลย)
 */
const BASE_DURATION_CHOICES = [30, 60, 90, 120] as const

/** หน้าต่างเวลาตั้งต้นของชิปเวลาเริ่ม — ปุ่ม "เวลาอื่น" กาง 00:00–23:00 (ดู showAllHours) */
const DEFAULT_HOUR_FROM = 8
const DEFAULT_HOUR_TO = 20

/** หัวคอลัมน์วัน — index = getDay() (0 = อาทิตย์ ตรงกับ firstDay={0} ของปฏิทิน) */
const DOW_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const DOW_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์']


export default function AppointmentDateSheet({
  open,
  resourceId,
  aggregateResources,
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
  /** โหมดภาพรวมทุกคิว — ตัดสินจาก prop ที่ส่งมา ไม่ใช่จาก "ไม่มี resourceId" (ซึ่งเกิดตอน
   *  ค่าจาก useWatch ยังเดินทางมาไม่ถึงด้วย — คนละความหมายกันคนละเรื่อง) */
  const aggregate = Array.isArray(aggregateResources) && aggregateResources.length > 0
  const capacity = aggregate
    ? aggregateResources!.reduce((sum, r) => sum + r.capacity, 0) || null
    : (resourceCapacity ?? null)
  const [items, setItems] = useState<AppointmentBoardItem[]>([])
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
  /**
   * ระยะเวลาที่เลือก (นาที) — `null` = โหมด "กำหนดเอง" ที่ผู้ใช้พิมพ์เวลาสิ้นสุดเอง
   *
   * 2026-08-09: **เลิกถามเวลาสิ้นสุด ถามระยะเวลาแทน** (user เคาะแบบ A จาก mockup
   * docs/superpowers/specs/2026-08-09-appointment-time-step-mockup.html)
   *
   * เหตุผลไม่ใช่แค่ "กดง่ายขึ้น": เมื่อไม่มีช่องเวลาสิ้นสุดให้กรอก เงื่อนไข `end <= start`
   * ก็เกิดขึ้นไม่ได้ตั้งแต่ต้นทาง — บั๊ก `endTouched` ที่เคยอยู่ตรงนี้ (ตั้งเป็น true ตอนเปิด
   * ถ้าฟอร์มเคยมี endTime แล้ว auto-fill ไม่ทำงานอีกเลยทั้งชีต → กดชิปเวลาใหม่กี่ครั้งก็ได้
   * ช่วงที่ผิดกฎทุกครั้ง) จึง**หายไปพร้อมกับกลไกที่มันอาศัยอยู่ ไม่ใช่ถูกแพตช์**
   *
   * ผู้ขายคิดเป็น "13:00 ใช้เวลา 1 ชม." อยู่แล้ว — เวลาสิ้นสุดเป็นผลลัพธ์ ไม่ใช่ input
   */
  const [pendingDurationMin, setPendingDurationMin] = useState<number | null>(DEFAULT_DURATION_MIN)
  /** เวลาสิ้นสุดที่พิมพ์เอง — มีความหมายเฉพาะเมื่อ pendingDurationMin === null */
  const [customEnd, setCustomEnd] = useState<string>('')
  /** กางชิปเวลาเริ่มเป็น 00:00–23:00 — ร้านที่เปิดดึก/เปิดเช้าต้องไปถึงได้ ไม่ใช่ถูกกันเงียบ ๆ */
  const [showAllHours, setShowAllHours] = useState(false)
  /**
   * กางรายการคิวของวันนั้นในขั้นเลือกเวลา — **กล่องแคบเท่านั้น**
   *
   * กล่องกว้าง (@5xl) เห็นรายการเต็มอยู่แล้วตลอดเวลา ค่านี้ไม่มีผลที่นั่น (สลับด้วยคลาส
   * `@5xl:` ไม่ใช่ JS — idiom เดียวกับ DOW_SHORT/DOW_FULL และปุ่มคู่ที่แถบล่างของไฟล์นี้)
   */
  const [showDayList, setShowDayList] = useState(false)
  /**
   * ขั้นที่กำลังอยู่ — มีความหมายเฉพาะ **กล่องแคบ + โหมดระบุเวลา** เท่านั้น
   *
   * user รายงาน 2026-08-09 ว่าเลือกเวลาบนมือถือ (เปิดจากหน้าแชท) ใช้ยาก: พอเลือกวันเสร็จ
   * ปฏิทินเดือนยังกินพื้นที่ ~320px กลางจอทั้งที่ทำหน้าที่จบไปแล้ว ช่องเวลาเลยถูกดันไปใต้
   * เส้นพับ ต้องเลื่อนลงไปหาแล้วปั่น native picker ทีละช่อง — งานที่ควรจบใน 2 แตะกลายเป็น
   * เลื่อน → แตะ → ปั่น → ปั่น → เลื่อนกลับ
   *
   * IMPORTANT: กล่องกว้าง (@5xl) **ไม่อ่านค่านี้เพื่อจัด layout เลย** — ที่นั่นเห็นปฏิทินกับ
   * รายการพร้อมกันคนละคอลัมน์อยู่แล้ว การบังคับแยกขั้นคือการเพิ่มคลิกโดยไม่ได้อะไรกลับมา
   * การซ่อน/แสดงจึงทำด้วยคลาส `@5xl:` ทับ ไม่ใช่ด้วย JS (ไม่ต้องรู้ความกว้างกล่องใน JS)
   */
  const [step, setStep] = useState<'date' | 'time'>('date')
  /** โหมดรายวันไม่มีขั้นที่ 2 — ทรงเดิมทุกประการ */
  const twoStep = !byDay
  const atTimeStep = twoStep && step === 'time'

  /**
   * ชิประยะเวลาที่จะแสดง — ชุดพื้นฐาน + ค่ามาตรฐานของคิวงาน (ถ้ามีและยังไม่อยู่ในชุด)
   * เรียงจากน้อยไปมากเสมอ เพื่อให้ตำแหน่งชิปไม่กระโดดเมื่อสลับคิวงาน
   */
  const durationChoices = useMemo(() => {
    const set = new Set<number>(BASE_DURATION_CHOICES)
    if (resourceDurationMinutes && resourceDurationMinutes > 0) set.add(resourceDurationMinutes)
    return [...set].sort((a, b) => a - b)
  }, [resourceDurationMinutes])

  // เปิดชีตใหม่ทุกครั้งต้องเริ่มจากค่าที่ฟอร์มถืออยู่ ไม่ใช่ค่าที่ค้างจากการเปิดครั้งก่อน
  useEffect(() => {
    if (!open) return
    setPendingDate(value)
    setPendingStart(valueStartTime ?? '')
    const init = resolveInitialDuration(
      valueStartTime,
      valueEndTime,
      durationChoices,
      resourceDurationMinutes,
    )
    setPendingDurationMin(init.durationMin)
    setCustomEnd(init.customEnd)
    setStep('date')
    setShowDayList(false)
    /* เวลาที่บันทึกไว้เดิมอยู่นอกหน้าต่างตั้งต้น (ร้านเปิดดึก/เปิดเช้า) → กางให้เห็นตั้งแต่แรก
       ไม่งั้นชิปที่ "ถูกเลือกอยู่" จะซ่อนอยู่หลังปุ่ม "เวลาอื่น" แล้วจอดูเหมือนยังไม่ได้เลือกอะไร */
    const h = valueStartTime ? Number(valueStartTime.slice(0, 2)) : NaN
    setShowAllHours(Number.isFinite(h) && (h < DEFAULT_HOUR_FROM || h >= DEFAULT_HOUR_TO))
  }, [open, value, valueStartTime, valueEndTime, durationChoices, resourceDurationMinutes])
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
  /**
   * ปลายทางโฟกัสตอนเปิดชีต (ขั้นเลือกวัน) — เป็น "ตัวชีต" ไม่ใช่ปุ่มปิด
   *
   * 🛑 เดิมโฟกัสไปที่ปุ่ม `x` ทำให้ทุกครั้งที่เปิดชีตจะมีกรอบโฟกัสสีฟ้าคาดรอบปุ่มปิด
   * (user เจอบนเครื่องจริง 2026-08-11: "ทุกครั้งที่เข้า มันไป focus ปุ่ม x") — นอกจากดูเป็น
   * ของเสียแล้ว มันยังพาผู้ใช้คีย์บอร์ด/AT ไปจ่อ "ปุ่มทิ้งงาน" เป็นสิ่งแรกทั้งที่เพิ่งกดเข้ามา
   *
   * ชีตพี่น้องอีก 2 ใบ (CustomerSearchSheet/AddressSearchSheet) โฟกัส "ช่องค้นหา" = ตัวงาน
   * ของจอนั้น ชีตนี้ไม่มี input ในขั้นเลือกวัน (งานคือจิ้มปฏิทิน) จึงโฟกัสตัว dialog แทน —
   * ยังย้ายโฟกัสเข้ามาในชีตครบตามเจตนาเดิม (จำเป็นเพราะ aria-modal="true") และ AT จะอ่าน
   * ชื่อชีตจาก aria-label ให้เอง แล้ว Tab ถัดไปค่อยเดินเข้าปุ่มปิด → แถบเดือน → ปฏิทิน
   */
  const sheetRef = useRef<HTMLDivElement>(null)
  /** กริดชิปเวลาเริ่ม — ปลายทางโฟกัสของขั้นที่ 2 และเจ้าของ roving tabindex */
  const slotGridRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    /* ย้ายโฟกัสทุกครั้งที่ "ขั้น" เปลี่ยนด้วย ไม่ใช่แค่ตอนเปิด — ปุ่มที่เพิ่งกด (ถัดไป/ย้อนกลับ)
       ถูกซ่อนด้วย hidden ทันทีที่ขั้นเปลี่ยน ถ้าไม่ย้าย โฟกัสจะค้างอยู่บนปุ่มที่หายไปแล้ว
       และ aria-label ของปุ่มหัวแผ่นเปลี่ยนไปพร้อมบอกบริบทใหม่ในตัว (ไม่ต้องมี live region แยก)

       🛑 ขั้นเลือกเวลา: โฟกัสไปที่ **ชิปเวลา** ไม่ใช่ปุ่มย้อนกลับ (critique/Sam 2026-08-09)
       ปุ่มหัวแผ่นในขั้นนี้แปลว่า "ถอยกลับไปเลือกวันใหม่" — วางโฟกัสไว้ที่นั่นคือพาผู้ใช้คีย์บอร์ด
       ไปจ่อปุ่มเลิกทำ ทั้งที่เขาเพิ่งตัดสินใจเดินหน้ามา งานของขั้นนี้อยู่ที่กริดชิป
       ยังต้องเป็น setTimeout เหมือนเดิม เพราะ element ปลายทางเพิ่งถูก unhide ในเฟรมนี้ */
    const t = setTimeout(() => {
      if (atTimeStep) {
        const target = slotGridRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')
        if (target) {
          target.focus()
          return
        }
      }
      // preventScroll: ตัวชีตสูงเต็มจอ การโฟกัสไม่ควรทำให้เนื้อหาเลื่อนเอง
      sheetRef.current?.focus({ preventScroll: true })
    }, 60)
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // อยู่ขั้นเลือกเวลา = ถอยกลับไปขั้นเลือกวันก่อน ไม่ปิดชีตทิ้งทั้งใบ (สมมาตรกับปุ่ม ‹)
      // ไม่กระทบกลไก "ปิดทีละชั้น" ของ RescheduleAppointmentSheet ซึ่งกัน Escape ของตัวเอง
      // ด้วย dateSheetOpen อยู่แล้ว — มันเห็นแค่ว่าปฏิทินเปิดอยู่ ไม่สนใจขั้นภายใน
      if (atTimeStep) {
        setStep('date')
        return
      }
      onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open, onClose, atTimeStep, step])

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
      // โหมดภาพรวม: ไม่ส่ง resourceId ให้ endpoint = คืนนัดของทุกคิว (API.md §4.5 รองรับอยู่แล้ว)
      if (!aggregate && !resourceId) {
        setItems([])
        return
      }
      const key = `${aggregate ? 'ALL' : resourceId}|${from.toISOString()}|${to.toISOString()}`
      if (loadedRangeRef.current === key) return
      loadedRangeRef.current = key

      setLoading(true)
      try {
        // pattern เดียวกับ queues/components/AppointmentCalendar.tsx (fetchAppointments)
        const qs = new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
          ...(aggregate ? {} : { resourceId: resourceId! }),
        })
        const res = await fetch(`/api/shops/current/appointments?${qs}`)
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { items?: AppointmentBoardItem[] }
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
    [resourceId, aggregate],
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
    const map = new Map<string, AppointmentBoardItem[]>()
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
   * ช่วงเวลาของคิวที่มีอยู่ ย่อเป็นบรรทัดเดียว — ใช้บนแถบสรุปตอนรายการถูกยุบ (ขั้นเลือกเวลา)
   *
   * เอา 3 ตัวแรกพอ: บรรทัดนี้มีหน้าที่ตอบว่า "วันนี้แน่นแค่ไหน" ไม่ใช่แทนรายการ —
   * คนที่อยากรู้ว่าใครจองกดปุ่ม "ดูรายการ" ได้ และตัวเลขรวมอยู่ข้าง ๆ อยู่แล้ว
   */
  const dayRangesPreview = useMemo(() => {
    if (dayItems.length === 0) return ''
    const parts = dayItems.slice(0, 3).map((it) => {
      const s = new Date(it.start)
      const e = new Date(it.end)
      return isAllDayAppointment(s, e) ? 'ทั้งวัน' : `${formatTimeHM(s)}–${formatTimeHM(e)}`
    })
    const rest = dayItems.length - parts.length
    return rest > 0 ? `${parts.join(' · ')} · อีก ${rest}` : parts.join(' · ')
  }, [dayItems])

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

  /**
   * เวลาสิ้นสุด = **ผลลัพธ์ ไม่ใช่ state** (2026-08-09)
   *
   * ที่เก็บเป็น state คือ "ระยะเวลา" ส่วนเวลาสิ้นสุด derive จาก start + duration ทุกครั้ง
   * → ไม่มีทางที่ start กับ end จะหลุด sync กันได้ ซึ่งเป็นรูปร่างของบั๊กเดิมทั้งดุ้น
   * โหมด "กำหนดเอง" เท่านั้นที่ end เป็นค่าที่ผู้ใช้ถือเอง (customEnd)
   *
   * ชื่อตัวแปรคงเดิม (`pendingEnd`) เพราะที่เรียกใช้ต่อจากนี้ทั้งหมด — ตัวนับ overlap,
   * timeIssue, ป้ายปุ่มยืนยัน, onConfirm — ต้องการ "HH:mm" เหมือนเดิมเป๊ะ ไม่ต้องแก้สักจุด
   */
  const pendingEnd = useMemo(() => {
    if (byDay || !pendingStart) return ''
    if (pendingDurationMin == null) return customEnd
    return addMinutesToTime(pendingStart, pendingDurationMin)
  }, [byDay, customEnd, pendingDurationMin, pendingStart])

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

  /**
   * เติมเวลาเริ่ม — ไม่ต้องแตะเวลาสิ้นสุดอีกแล้ว มัน derive จาก start + duration เอง
   *
   * นี่คือจุดที่บั๊ก 2026-08-09 เคยอยู่: เดิมมีเงื่อนไข `!endTouched.current` คร่อมการ
   * auto-fill ทำให้กดชิปเวลาใหม่แล้วเวลาสิ้นสุดค้างค่าเก่า ตอนนี้ไม่มีอะไรให้ค้าง
   */
  const applyStart = useCallback((v: string) => setPendingStart(v), [])

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
  /**
   * `blocking` แยกจาก `invalid` (เพิ่ม 2026-08-09 จาก impeccable critique P1)
   *
   * 🛑 **เลขความจุฝั่ง client ห้ามกั้นการบันทึก (BR-RSV-18)** — ไฟล์นี้อ้างกฎข้อนี้ 3 ครั้งเพื่อ
   * อธิบายว่าทำไมไม่ disable ชิปที่ชนคิว (ข้อมูลอาจเก่าระหว่างเปิดค้าง ตัวตัดสินจริงคือ EXCLUDE
   * constraint ตอนบันทึก) แล้วเดิมกลับเอาเลขเดียวกันนั้นไป disable **ปุ่มยืนยัน** ซึ่งเป็นด่านจริง
   * ผลคือ: พนักงานอีกคนยกเลิกนัด 13:00 ขณะชีตเปิดค้าง → ช่องว่างจริง ชิปปล่อยให้กดถูกต้อง
   * แต่ปุ่มปฏิเสธถาวร ทางออกเดียวคือปิดชีตแล้วเสียค่าที่กรอกไว้ (เปิดประตูไว้แล้วล็อกทางออก)
   *
   * ตอนนี้ `blocking` สงวนไว้กับเคสที่ **client ตัดสินได้เองจริง ๆ** เท่านั้น (ยังไม่เลือกเวลา,
   * ช่วงข้ามเที่ยงคืน) ส่วน "เต็มแล้ว" เป็นคำเตือนสีแดงที่ยังกดต่อได้ แล้วให้ server ปฏิเสธเอง
   */
  const timeIssue = useMemo(():
    | { message: string; field: 'start' | 'end'; invalid: boolean; blocking: boolean }
    | null => {
    if (byDay || !pendingDate) return null
    if (!pendingStart)
      return { message: 'เลือกเวลาเริ่มก่อน', field: 'start', invalid: false, blocking: true }
    // "ระบุ" ไม่ใช่ "เลือก": ข้อความนี้ขึ้นเฉพาะโหมดกำหนดเอง ซึ่ง control เป็นช่องที่พิมพ์ลงไป
    if (!pendingEnd)
      return { message: 'ระบุเวลาสิ้นสุดก่อน', field: 'end', invalid: false, blocking: true }
    if (pendingEnd <= pendingStart) {
      /* โหมดชิประยะเวลาไปถึงตรงนี้ได้ทางเดียว: ช่วงที่เลือกล้นข้ามเที่ยงคืน (addMinutesToTime
         วนกลับที่ 24 ชม.) ซึ่ง "เวลาสิ้นสุดต้องมาหลังเวลาเริ่ม" อธิบายไม่ตรงเลย — ผู้ใช้ไม่ได้
         กรอกเวลาสิ้นสุด เขากดระยะเวลา แล้วประโยคนั้นจะชี้ไปที่ของที่ไม่มีอยู่บนจอ
         คนละสาเหตุต้องคนละประโยค แม้เงื่อนไขทางคณิตศาสตร์จะเป็นอันเดียวกัน */
      if (pendingDurationMin != null) {
        return {
          message: 'ช่วงเวลานี้ข้ามเที่ยงคืน — ลดระยะเวลาหรือเลื่อนเวลาเริ่มให้เร็วขึ้น',
          field: 'start',
          invalid: true,
          blocking: true,
        }
      }
      // คำเดียวกับ toast ของหน้าเลื่อนนัด (RescheduleAppointmentSheet.submit) — กฎเดียวกัน
      // ต้องได้ยินเป็นประโยคเดียวกันไม่ว่าจะไปเจอมันจากทางไหน
      return { message: 'เวลาสิ้นสุดต้องมาหลังเวลาเริ่ม', field: 'end', invalid: true, blocking: true }
    }
    if (pendingSlotFull) {
      /* เตือน ไม่ใช่กั้น (BR-RSV-18 — ดูคอมเมนต์เหนือ timeIssue)
         คำเปลี่ยนจาก "เลือกเวลาอื่น" เป็น "ยืนยันต่อได้" เพราะประโยคเดิมสั่งให้ทำสิ่งที่
         อาจไม่จำเป็น: ตัวเลขนี้อาจเก่าไปแล้วและช่วงนี้ว่างจริง */
      return {
        message: 'ช่วงเวลานี้เต็มตามข้อมูลล่าสุด — ยืนยันต่อได้ ระบบจะตรวจอีกครั้งตอนบันทึก',
        field: 'start',
        invalid: true,
        blocking: false,
      }
    }
    return null
  }, [byDay, pendingDate, pendingDurationMin, pendingEnd, pendingSlotFull, pendingStart])

  const TIME_ISSUE_ID = 'appt-sheet-time-issue'

  /**
   * ชิป "เวลาเริ่ม" — ทางลัดให้จบใน 2 แตะ (เวลาเริ่ม → ระยะเวลา) แทนการปั่น native time picker
   *
   * ป้ายเป็น **เวลาเริ่มอย่างเดียว** ไม่ใช่ช่วง `08:00–09:00` เพราะปลายทางถูกตัดสินด้วยชิป
   * "ใช้เวลา" ที่อยู่ใต้ลงไป — เขียนช่วงไว้บนชิปด้วยจะมีเลขที่ขัดกันสองชุดบนจอเดียว (HR16)
   *
   * หน้าต่างตั้งต้น 08:00–20:00 = 12 ปุ่ม (user เคาะ 2026-08-09 ว่า "ยังไม่ต้องมีคอลัมน์
   * เวลาทำการ ใช้ 08:00–20:00 ไปก่อน") — ปุ่ม "เวลาอื่น" กางเป็น 00:00–23:00 ให้ร้านที่เปิด
   * ดึก/เปิดเช้าไปถึงได้ ไม่ใช่ถูกกันออกเงียบ ๆ แล้วต้องไปหาช่องกรอกที่อื่น
   *
   * ระยะห่างคงที่ 1 ชั่วโมง ไม่ผูกกับ durationMinutes โดยตั้งใจ — บริการที่ยาว 25 นาทีจะได้
   * ~28 ปุ่มซึ่งล้นทุกความกว้าง ความละเอียดกว่านั้นไปที่โหมด "กำหนดเอง"
   *
   * IMPORTANT: ปุ่มที่ชนคิวเดิม **ไม่ disable** แค่ติดจุดเตือน — BR-RSV-18 ยืนยันว่าเลขบนจอ
   * ไม่ใช่คำตัดสิน (ข้อมูลอาจ stale ระหว่างเปิดค้าง) ตัวตัดสินจริงคือ EXCLUDE constraint
   * ตอนบันทึก การ disable จากข้อมูลฝั่ง client จะบล็อกช่วงที่จริง ๆ ยังจองได้
   */
  const timeSlots = useMemo(() => {
    if (byDay || !pendingDate) return []
    /* ระยะเวลาที่ใช้ "ประเมิน" ว่าช่วงนั้นชนคิวเดิมไหม = ระยะเวลาที่ผู้ใช้เลือกอยู่ตอนนี้
       เดิมใช้ resourceDurationMinutes อย่างเดียว → คิวงานที่ไม่ได้ตั้งค่า (null) ไม่มีช่วงให้
       เทียบเลย จุดเตือน "มีคิวแล้ว" จึงไม่เคยขึ้นสักปุ่ม ทั้งที่ข้อมูลอยู่ในมือครบ */
    const previewDur =
      pendingDurationMin ??
      (pendingStart && customEnd ? minutesBetweenTimes(pendingStart, customEnd) : null) ??
      (resourceDurationMinutes && resourceDurationMinutes > 0
        ? resourceDurationMinutes
        : DEFAULT_DURATION_MIN)
    const nowMs = Date.now()
    const from = showAllHours ? 0 : DEFAULT_HOUR_FROM
    const to = showAllHours ? 24 : DEFAULT_HOUR_TO
    const out: { start: string; busy: boolean; past: boolean }[] = []
    for (let h = from; h < to; h++) {
      const start = `${`${h}`.padStart(2, '0')}:00`
      const s = combineDateTime(pendingDate, start)
      let busy = false
      if (s && capacity != null && capacity > 0) {
        const sT = s.getTime()
        /* บวกเป็นมิลลิวินาทีตรง ๆ ไม่ผ่าน addMinutesToTime — ตัวนั้นวนกลับที่ 24 ชม.โดยตั้งใจ
           ซึ่งถูกสำหรับ "ค่าที่ผู้ใช้ต้องเห็นแล้วแก้" แต่ผิดสำหรับการเทียบช่วงเวลาจริง
           (23:00 + 2 ชม. ต้องเป็น 01:00 ของวันถัดไป ไม่ใช่ย้อนกลับไปต้นวันเดียวกัน) */
        const eT = Math.max(sT + previewDur * 60_000, sT + 1)
        const overlap = dayItems.filter((it) => {
          const bs = new Date(it.start).getTime()
          const be = new Date(it.end).getTime()
          return bs < eT && sT < be
        }).length
        busy = overlap >= capacity
      }
      out.push({
        start,
        busy,
        // เลยเวลาไปแล้วของวันนี้ — มัวลงเป็นคำใบ้ แต่ยังกดได้ (นัดย้อนหลังทำได้ตาม FR-RSV-03)
        past: s ? s.getTime() < nowMs : false,
      })
    }
    return out
  }, [
    byDay,
    capacity,
    customEnd,
    dayItems,
    pendingDate,
    pendingDurationMin,
    pendingStart,
    resourceDurationMinutes,
    showAllHours,
  ])

  const confirmState = useMemo((): { label: string; disabled: boolean } => {
    if (!pendingDate) return { label: 'แตะวันในปฏิทินก่อน', disabled: true }
    const dateLabel = formatDateTH(new Date(`${pendingDate}T00:00`))
    if (byDay) {
      // พูดวันที่ออกมาตรง ๆ ไม่ใช้คำว่า "วันนี้" — จอนี้มีปุ่ม "วันนี้" ที่แปลว่ากระโดดไป
      // วันปัจจุบัน (กติกาเดียวกับที่เขียนไว้ที่แถบยืนยันล่าง) และผู้ขายที่จิ้มดูหลายวัน
      // ติด ๆ กันต้องรู้ว่าใบไหนเต็ม ไม่ใช่ "วันนี้" ลอย ๆ
      /* วันเต็มก็ยืนยันได้ ด้วยเหตุผลเดียวกับช่วงเวลาเต็ม (BR-RSV-18 — ดูคอมเมนต์เหนือ timeIssue)
         คำเตือนที่ผู้ใช้เห็นคือตัวนับ "จองแล้ว n จาก m คิว" ที่หัวรายการ ซึ่งเปลี่ยนเป็นสีเตือน
         อยู่แล้วเมื่อเต็ม — ไม่ต้องมีประโยคซ้ำบนปุ่ม (ปุ่มพูดเรื่องเดียว: ยืนยันอะไร) */
      if (pendingFull) return { label: `ยืนยัน ${dateLabel}`, disabled: false }
      // ใช้กริยา "ยืนยัน" ทั้งสองโหมด — ปุ่มเดียวกัน การกระทำเดียวกัน (ผูกค่าเข้าฟอร์มแล้วปิด)
      // คำว่า "เลือก" ทำให้อ่านเหมือนยังอยู่ในขั้นสำรวจ ทั้งที่กดแล้วมีผลจริง
      return { label: `ยืนยัน ${dateLabel}`, disabled: false }
    }
    /**
     * 2026-08-09: **ปุ่มเลิกกลายร่างเป็นข้อความ error**
     *
     * เดิมป้ายปุ่มถูกแทนที่ด้วย `timeIssue.message` ตัวเดียวกับบรรทัดสีแดงที่อยู่เหนือมัน
     * → ประโยคเดียวกันโผล่สองที่ห่างกัน 40px แล้วผู้ใช้เสียคำที่บอกว่ากดแล้วจะเกิดอะไร
     * ยิ่งกว่านั้น ปุ่มที่ `disabled` หลุด tab order อยู่แล้ว ข้อความบนมันจึงไปไม่ถึง
     * ผู้ใช้ screen reader ตั้งแต่แรก (เหตุผลเดียวกับที่ timeIssue ถูกสกัดออกมาผูกกับช่อง)
     *
     * ตอนนี้ปุ่มพูดเรื่องเดียว — "ยืนยันอะไร" — และ disabled เมื่อยังยืนยันไม่ได้
     * คำอธิบายว่าติดอะไรอยู่เป็นหน้าที่ของบรรทัดใต้ช่องที่ผิดจริง ที่เดียว
     */
    if (timeIssue?.blocking) return { label: `ยืนยัน ${dateLabel}`, disabled: true }
    return { label: `ยืนยัน ${dateLabel} · ${pendingStart}–${pendingEnd}`, disabled: false }
  }, [byDay, pendingDate, pendingEnd, pendingFull, pendingStart, timeIssue])

  /**
   * ยุบรายการคิวเหลือแถบบรรทัดเดียว — **กล่องแคบ + ขั้นเลือกเวลา + ยังไม่กดกาง** เท่านั้น
   *
   * ที่ต้องยุบ: ขั้นนี้มีงานเดียวคือเลือกเวลา แต่กล่อง "ว่างทั้งวัน" เป็น `flex-1 justify-center`
   * จึงกินพื้นที่ที่เหลือทั้งหมด (~45% ของจอ 812px) เพื่อบอกว่า *ไม่มีอะไรอยู่ตรงนี้* แล้วดัน
   * ตัวเลือกเวลาลงไปใต้เส้นพับ — อาการที่ user รายงาน 2026-08-09 ว่า "ตั้งค่าเวลายาก"
   *
   * IMPORTANT: การซ่อน/แสดงทำด้วยคลาส `@5xl:` ทับ ไม่ใช่ตัดออกจาก DOM ด้วย JS — กล่องกว้าง
   * ไม่มีการแยกขั้นและต้องเห็นรายการเต็มเสมอ (idiom เดียวกับปุ่มคู่ที่แถบล่างของไฟล์นี้)
   */
  const collapsedDay = atTimeStep && !showDayList

  /**
   * เดินชิปเวลาเริ่มด้วยลูกศร (คู่กับ roving tabindex ที่ตัวชิป)
   *
   * ทำไมมีแค่ ซ้าย/ขวา/Home/End ไม่มี บน/ล่าง: จำนวนคอลัมน์เป็น **container query**
   * (4 ที่กล่องแคบ / 6 ที่ `@3xl`) ซึ่ง JS ในนี้ไม่รู้ค่า — การเดาว่า "ขึ้น = ถอย 4 ช่อง"
   * จะกระโดดผิดช่องทันทีที่กล่องกว้างขึ้น ปล่อยให้ บน/ล่าง เป็นพฤติกรรมเริ่มต้นของเบราว์เซอร์
   * (เลื่อนหน้า) ดีกว่าเดาผิด — ซ้าย/ขวาเดินตามลำดับเวลาซึ่งเป็นสิ่งที่ผู้ใช้คิดถึงอยู่แล้ว
   *
   * ย้ายแค่ "โฟกัส" ไม่ใช่ "เลือก" — ชิปเป็น toggle button (aria-pressed) ไม่ใช่ radio
   * การเลื่อนแล้วเลือกอัตโนมัติจะเปลี่ยนค่านัดของลูกค้าโดยที่ผู้ใช้แค่กำลังมองหา
   */
  const onSlotGridKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    const isEdge = e.key === 'Home' || e.key === 'End'
    if (!step && !isEdge) return
    const grid = e.currentTarget
    const chips = Array.from(grid.querySelectorAll<HTMLButtonElement>('button[data-slot-index]'))
    if (chips.length === 0) return
    const from = chips.findIndex((el) => el === document.activeElement)
    let to: number
    if (e.key === 'Home') to = 0
    else if (e.key === 'End') to = chips.length - 1
    else to = Math.min(chips.length - 1, Math.max(0, (from < 0 ? 0 : from) + step))
    // ไม่วน: ชนขอบแล้วอยู่กับที่ ตรงกับความรู้สึกว่า "หมดวันแล้ว" มากกว่ากระโดดกลับไป 00:00
    e.preventDefault()
    chips[to]?.focus()
  }, [])

  /**
   * เวลาเริ่มที่เลือกอยู่ตกนอกหน้าต่างชิปตั้งต้นไหม — ใช้ 2 ที่ที่ต้องตัดสินใจตรงกัน:
   * effect ตอนเปิดชีต (กางให้อัตโนมัติ) และปุ่ม "ย่อกลับ" (ห้ามย่อจนชิปที่เลือกหายไป)
   * เดิมมีแต่ที่แรก ปุ่มจึงย่อจนค่าที่เลือกค้างอยู่นอกกริดได้ (critique P2-a)
   */
  const startsOutsideDefaultWindow = useMemo(() => {
    if (!pendingStart) return false
    const h = Number(pendingStart.slice(0, 2))
    return Number.isFinite(h) && (h < DEFAULT_HOUR_FROM || h >= DEFAULT_HOUR_TO)
  }, [pendingStart])

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
      ref={sheetRef}
      /* tabIndex={-1} = โฟกัสด้วยโค้ดได้ แต่ Tab ไม่มีวันหยุดที่นี่ — จึงไม่ใช่การซ่อนขอบโฟกัส
         ของ control ที่ผู้ใช้เดินไปถึงได้เอง (ที่ห้ามทำ) แต่เป็นการไม่วาดกรอบให้กล่องที่ผู้ใช้
         ไม่ได้ตั้งใจโฟกัสเอง — ปุ่มทุกตัวในชีตยังมี focus-visible ครบเหมือนเดิม */
      tabIndex={-1}
      className="@container fixed inset-0 z-80 flex flex-col bg-card pt-[env(safe-area-inset-top)] focus:outline-none" /* carve-out: safe-area ไม่มี token */
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
        {/* ปุ่มเดียวทำสองหน้าที่ตามขั้น — ขั้นเลือกวัน = ปิดชีต · ขั้นเลือกเวลา = ถอยกลับ
            ไม่ทำปุ่ม "เปลี่ยนวัน" แยกอีกปุ่มในหัวแผ่น เพราะจะเป็นสองปุ่มที่ทำงานเดียวกัน */}
        <button
          type="button"
          onClick={() => (atTimeStep ? setStep('date') : onClose())}
          aria-label={
            atTimeStep && pendingDate
              ? `กลับไปเลือกวันที่ (${formatDateTH(new Date(`${pendingDate}T00:00`))})`
              : 'ปิด'
          }
          className="btn btn-icon text-default-800 hover:bg-default-100 min-h-11 min-w-11 shrink-0"
        >
          <Icon icon={atTimeStep ? 'chevron-left' : 'x'} className="size-6" />
        </button>
        {/* ไอคอนในกรอบพื้นอ่อนตาม mockup — idiom `bg-{semantic}/15` ของ Paces (HR7) */}
        <span className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded">
          {/* ไอคอนบอกว่ากำลังทำอะไรอยู่ — ขั้นเลือกเวลาใช้นาฬิกา ไม่ใช่ปฏิทินที่หลบไปแล้ว */}
          <Icon icon={atTimeStep ? 'clock' : 'calendar-event'} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          {/* คำเดียวกับ aria-label ด้านบนและกับปุ่มที่เปิดชีตนี้ — ห้ามให้สามที่นี้พูดคนละคำ */}
          <h3 className="truncate text-base font-semibold text-dark">
            {atTimeStep ? 'เลือกเวลา' : byDay ? 'เลือกวันนัด' : 'เลือกวันและเวลา'}
          </h3>
          {/* ขั้นเลือกเวลา: บอกว่ากำลังตั้งเวลาของวันไหน (แทนชื่อบริการ/ความจุที่รู้ไปแล้วจากขั้นก่อน)
              เป็นข้อความล้วน ไม่ใช่ปุ่ม — ปุ่ม ‹ ข้างซ้ายทำหน้าที่ "กลับไปเปลี่ยนวัน" อยู่แล้ว */}
          {atTimeStep && pendingDate && (
            /* ต่อท้ายด้วยความจุ: ขั้นนี้โชว์ "จองแล้ว n จาก m คิว" แต่คำอธิบายว่า m คืออะไร
               ("รับพร้อมกัน m คิว") อยู่ในบรรทัดที่ถูก gate ด้วย !atTimeStep = หายไปแล้วตอนที่
               ตัวเลขโผล่ → ผู้ขายเห็นเลข 10 มาลอย ๆ โดยไม่มีบริบท (critique H10) */
            <p className="truncate text-xs text-default-500">
              {[
                formatWeekdayDateTH(new Date(`${pendingDate}T00:00`)),
                /* ต้องมี "รวม" เหมือนขั้นเลือกวัน — เลขเดียวกันบนจอเดียวกันห้ามเรียกคนละอย่าง
                   ตามขั้น ไม่งั้นผู้ขายอ่านว่าเลขเปลี่ยนความหมายไปแล้ว (ซึ่งมันไม่ได้เปลี่ยน) */
                /* ห้ามแทรก "รวม" กลางคำ ("รับพร้อมกันรวม 6 คิว" ไม่เป็นภาษาไทย) และบรรทัดนี้
                   เป็น truncate ที่ 320px เหลือ ~244px — คำที่ยาวขึ้นดันให้ตัวเลขความจุถูกตัดหาย
                   ซึ่งเป็นค่าที่บรรทัดนี้มีอยู่เพื่อบอก. ป้าย "ภาพรวมทุกคิวงาน" อยู่ใต้หัวแผ่น
                   และเห็นทั้ง 2 ขั้นอยู่แล้ว จึงไม่ต้องย้ำในประโยคนี้ */
                capacity != null && capacity > 0 ? `รับพร้อมกัน ${capacity} คิว` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {/* mockup โชว์ความจุต่อวันไว้ตรงนี้ด้วย — ผู้ขายจะได้รู้ตั้งแต่ต้นว่า "เต็ม" ของคิวนี้
              คือกี่งาน โดยไม่ต้องจิ้มวันแล้วไปอ่านตัวเลขที่หัวรายการ */}
          {!atTimeStep && (aggregate || resourceName || (capacity != null && capacity > 0)) && (
            <p className="truncate text-xs text-default-500">
              {/* "คิว/วัน" ถูกเฉพาะโหมดรายวัน — โหมดระบุช่วงเวลา ความจุนี้วัดกันที่ "ช่วงเวลาที่ทับกัน"
                  (ดู isFull) ร้าน capacity 2 รับได้ทั้งวันหลายสิบคิว การเขียน "รับได้ 2 คิว/วัน"
                  ไว้หัวจอจึงขัดกับบรรทัด "จองแล้ว n จาก m คิว ในช่วงเวลานี้" ที่อยู่จอเดียวกัน (HR16)
                  คำโหมดเวลายกมาจากการ์ดเลือกบริการใน AppointmentBlock ("รับพร้อมกัน n คิว") ตรง ๆ */}
              {[
                /* โหมดภาพรวมไม่มี "ชื่อคิว" ให้พูด — ต้องบอกแทนว่ากำลังดูอะไรอยู่ ไม่งั้นบรรทัดนี้
                   จะเหลือแค่ตัวเลขความจุลอย ๆ ที่อ่านไม่ออกว่าเป็นของใคร */
                aggregate ? 'ภาพรวมทุกคิวงาน' : resourceName,
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

      {/* 🛑 ป้ายกำกับของตัวเลขภาพรวม — ตัวเลขที่รวมทุกคิวคือ "ข้อมูลบางส่วนที่หน้าตาเหมือน
          ข้อมูลครบ" ถ้าไม่ติดป้าย ผู้ขายจะอ่านว่าวันนี้ว่างแล้วไปเจอคิวที่เลือกจริงเต็ม
          (docs/conventions/partial-data-must-be-labeled-or-filled.md)
          ขึ้นเฉพาะขั้นเลือกวัน — ขั้นเลือกเวลาผู้ใช้ตัดสินใจไปแล้วและพื้นที่ตรงนั้นมีจำกัด */}
      {/* 🛑 ไม่มีป้าย "ตัวเลขนี้รวมทุกคิวงาน…" แยกบรรทัดแล้ว (user ทัก 2026-08-11: "มีทำไม")
          — บรรทัดรองใต้หัวแผ่นเขียน "ภาพรวมทุกคิวงาน · รับพร้อมกัน N คิว" อยู่แล้ว ป้ายนั้นจึง
          พูดซ้ำสิ่งเดียวกันเป็นย่อหน้าที่สอง แล้วกิน 2 บรรทัดดันปฏิทินลงไปเกือบครึ่งจอ
          (clarify: say each idea once)

          ส่วนที่ป้ายเคยเพิ่มจริง ๆ คือ "คิวงานที่เลือกจริงอาจเต็มกว่านี้" ซึ่งเป็นอาการของ
          ช่องว่างเชิงดีไซน์ ไม่ใช่ของที่ควรแก้ด้วยคำเตือน — ทางแก้จริงคือให้ชีตถามว่าจะให้
          คิวงานไหนรับเป็นขั้นสุดท้าย (บันทึกไว้ที่ spec §10 "ยังเปิดค้าง") */}

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
      {/* แถบเดือน/legend/ปฏิทิน หายไปในขั้นเลือกเวลา **เฉพาะกล่องแคบ** — ข้อมูลพวกนี้ซ้ำกับ
          สิ่งที่ผู้ใช้เพิ่งตัดสินใจไปแล้ว และมันคือ ~400px ที่ไปเบียดช่องเวลาให้ตกใต้เส้นพับ
          `@5xl:flex` ทับกลับเสมอที่กล่องกว้าง → ที่นั่นไม่มีการแยกขั้น (เห็นครบพร้อมกันอยู่แล้ว
          การบังคับแยกขั้นคือการเพิ่มคลิกโดยไม่ได้อะไรกลับมา) — ไม่ต้องรู้ความกว้างกล่องใน JS */}
      <div
        className={`shrink-0 items-center justify-between gap-2 px-4 py-3 @5xl:flex ${
          atTimeStep ? 'hidden' : 'flex'
        }`}
      >
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
      <div
        className={`text-default-600 text-2xs shrink-0 items-center justify-center gap-4 px-4 pb-2 @5xl:flex ${
          atTimeStep ? 'hidden' : 'flex'
        }`}
      >
        <span className="inline-flex items-center gap-1.5">
          {/* swatch ต้องเป็นสัญลักษณ์เดียวกับที่เห็นในช่องจริงเป๊ะ ๆ (สี/ขนาด/รูปร่าง) —
              AppointmentDayCell เปลี่ยนจุดเป็น warning-ink 8px และวงแหวนเป็น default-400
              เพื่อผ่านเกณฑ์คอนทราสต์ non-text 3:1 legend จึงต้องตามไปด้วย ไม่งั้นกลายเป็น
              legend ที่สอนสัญลักษณ์ที่ไม่มีอยู่บนจอ */}
          <span className="bg-warning-ink size-2 rounded-full" aria-hidden="true" />
          มีนัดแล้ว
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
          <span className="border-default-400 size-2.5 rounded-full border" aria-hidden="true" />
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
      <div
        className={`flex min-h-0 flex-1 flex-col overscroll-contain @5xl:flex-row @5xl:overflow-hidden ${
          /* ขั้นเลือกวัน: ปฏิทินสูงตามเดือน จึงให้ทั้งคอลัมน์เลื่อน (กันการบีบจนรายการหาย)
             ขั้นเลือกเวลา: ทั้งคอลัมน์ไม่เลื่อน — **แผงเวลาข้างในเป็นตัวเลื่อนแทน**
             (ดูคอมเมนต์ "ตัวเลื่อนของขั้นเลือกเวลา" ที่แผงนั้น) เจตนาเดิมคือกันไม่ให้คิวยาว
             ดันช่องเวลาตกใต้เส้นพับ ซึ่งยังอยู่ครบ เพราะรายการถูก cap ความสูงแล้ว

             🛑 2026-08-09 (impeccable critique P0): คอมเมนต์เดิมตรงนี้เขียนว่า "ปฏิทินหายไปแล้ว
             พื้นที่พอ" แล้วตั้ง overflow-hidden บนสมมติฐานนั้น — สมมติฐานเป็นเท็จทันทีที่ผู้ใช้กด
             "เวลาอื่น" (24 ชิป = +150px) หรือเข้าโหมดกำหนดเอง: เนื้อหาล้น ~209px บนจอ 375×667
             แล้ว **ไม่มีอะไรเลื่อนไปหาได้เลย** ส่วนที่หายคือกล่องสรุปช่วงเวลากับบรรทัด error
             = ผู้ขายกดครบทุกอย่างแล้วเจอปุ่มเทาโดยไม่มีเหตุผลให้เห็น
             ม็อกอัพที่อนุมัติไว้ระบุ overflow-y-auto บนแผงเวลาตั้งแต่แรก (บรรทัด 406/467) */
          atTimeStep ? 'overflow-hidden' : 'overflow-y-auto'
        }`}
      >
      {/* ไม่ใช้ shrink-0 กับปฏิทิน: FullCalendar height="auto" ยืดตามจำนวนแถวของเดือน (6 แถว
          ในบางเดือน) ถ้าห้ามหดแล้วเดือนนั้นสูงเกินพื้นที่ รายการข้างล่างจะถูกบีบเหลือศูนย์
          — ให้ปฏิทินหดแล้วเลื่อนในตัวเองแทน ส่วนรายการมี min-h กันไว้อีกชั้น */}
      {/* appt-date-sheet = สโคป CSS ที่รื้อทรงตารางของ FullCalendar ออก (เส้นขอบทุกช่อง /
          แถวสูงไม่จำกัด / เลขวันชิดขวาบน) — ดูเหตุผลเต็มที่ src/assets/css/plugins/_calendar.css
          ขาดคลาสนี้เมื่อไหร่ ปฏิทินจะกลับไปเป็นตารางดิบทันที */}
      {/* กล่องแคบ: ปฏิทินสูงตามเนื้อหา แล้วให้คอลัมน์แม่เลื่อน (ไม่ซ้อน scroll สองชั้น)
          กล่องกว้าง: กลับไปเลื่อนในตัวเองเหมือนเดิม เพราะอยู่คู่กับคอลัมน์รายการ */}
      <div
        className={`appt-date-sheet shrink-0 px-2 pb-2 @5xl:block @5xl:min-h-0 @5xl:shrink @5xl:overflow-y-auto @5xl:overscroll-contain @5xl:basis-3/5 @5xl:border-e @5xl:border-default-200 ${
          atTimeStep ? 'hidden' : 'block'
        }`}
      >
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
          /* ช่องวันย้ายไป src/components/safepay/appointment-board/AppointmentDayCell.tsx
             (2026-08-10) — จอเดียวกันนี้ถูกใช้ที่ /queues บนมือถือด้วยแล้ว กติกา a11y ของช่องวัน
             (3 สถานะแยกด้วยรูปร่าง / เลขวันต้องอยู่ใน DOM เสมอ / ช่องเดือนข้างเคียงไม่รับโฟกัส)
             จึงต้องอยู่ที่เดียว ไม่งั้นหายไปทีละข้อโดยไม่มี gate ไหนเห็น */
          dayCellContent={(arg) => {
            const key = localDateKey(arg.date)
            return (
              <AppointmentDayCell
                date={arg.date}
                dayNumberText={arg.dayNumberText}
                isOther={arg.isOther}
                isToday={arg.isToday}
                used={countByDay.get(key) ?? 0}
                capacity={capacity}
                byDay={byDay}
                /* ต้องใช้ isFull() ตัวเดียวกับที่ปุ่มยืนยันใช้ ห้ามคำนวณเองซ้ำ — เดิมบรรทัดนี้
                   ไม่ดู byDay ทำให้โหมดระบุช่วงเวลาวาดกากบาท "เต็ม" บนวันที่มีนัดครบ capacity
                   ทั้งที่ legend ซ่อนสัญลักษณ์นั้นไปแล้วในโหมดนี้ (เหตุผลเต็มอยู่ที่ isFull) */
                full={isFull(key)}
                selected={pendingDate === key}
                onKeyDown={(e) => onDayKeyDown(e, key)}
              />
            )
          }}
        />
      </div>

      {/* ── รายการนัดของวันที่กำลังดู (user สั่ง 2026-08-07: "จิ้มวันแต่ละวันเพื่อดูรายการได้") ── */}
      {/* คอมเมนต์เดิมตรงนี้อ้าง `min-h-40` ว่าเป็นพื้นที่ขั้นต่ำของรายการ — **ไม่เคยมีคลาสนั้น
          อยู่จริงทั้งบน div นี้และบนรายการ** (critique 2026-08-09) และมันเป็นพี่น้องของการบีบ
          พื้นที่ที่ทำให้เกิด P0 พอดี. ตัวที่การันตีพื้นที่จริงตอนนี้คือ: ขั้นเลือกวัน = ทั้งคอลัมน์
          เลื่อนได้ · ขั้นเลือกเวลา/กล่องกว้าง = รายการถูก cap ด้วย max-h-48 แล้วแผงเวลาเลื่อนเอง */}
      <div
        className={`border-default-200 bg-default-100 flex flex-col border-t @5xl:min-h-0 @5xl:flex-1 @5xl:basis-2/5 @5xl:border-t-0 ${
          atTimeStep ? 'min-h-0 flex-1' : ''
        }`}
      >
        {/* aria-live/atomic: การเลือกวันเปลี่ยนแค่ "รายการข้างล่าง" ซึ่งอยู่คนละที่กับมือ/โฟกัส
            ผู้ใช้ screen reader ที่เพิ่งกด Enter บนช่องวันจึงไม่มีทางรู้ผลของสิ่งที่เพิ่งทำเลย
            (WCAG 4.1.3 Status Messages) — atomic=true เพื่อให้ได้ยินทั้งวันที่ + จำนวนคิว
            เป็นประโยคเดียว ไม่ใช่ได้ยินเฉพาะตัวเลขที่เปลี่ยน */}
        {/* ── แถบสรุปคิวของวันนั้น (แทนหัวเรื่อง+รายการเต็มตอนอยู่ขั้นเลือกเวลาบนกล่องแคบ) ──
            aria-live เหมือนหัวเรื่องเต็ม เพราะมันคือ "ผลของการเลือกวัน" เวอร์ชันย่อ —
            ผู้ใช้ screen reader ที่ยุบรายการไว้ต้องยังได้ยินว่าวันที่เลือกมีคิวกี่คิว */}
        <div
          className={`shrink-0 items-center gap-3 px-4 py-3 @5xl:hidden ${
            collapsedDay ? 'flex' : 'hidden'
          }`}
          aria-live="polite"
          aria-atomic="true"
        >
          {/* เทากลาง ไม่ใช่เขียว — Verified-Means-Green สงวนเขียวไว้กับสัญญาณความเชื่อใจที่
              ยืนยันแล้ว "วันว่าง" เป็นข่าวดีก็จริงแต่ไม่ใช่ trust signal (กติกาเดียวกับกล่องเต็ม) */}
          <span className="bg-default-200 text-default-500 flex size-7 shrink-0 items-center justify-center rounded-full">
            <Icon
              icon={dayItems.length === 0 ? 'calendar-check' : 'calendar-event'}
              className="size-4"
              aria-hidden="true"
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-default-800 mb-0 truncate text-sm font-semibold">
              {dayItems.length === 0 ? 'ว่างทั้งวัน' : `ทั้งวันมี ${pendingCount} นัด`}
            </p>
            <p className="text-default-500 mb-0 truncate text-xs">
              {dayItems.length === 0
                ? aggregate
                  ? 'ยังไม่มีใครจองในวันที่เลือก'
                  : 'ยังไม่มีใครจองคิวงานนี้'
                : dayRangesPreview}
            </p>
          </div>
          {dayItems.length > 0 && (
            /* combo ปุ่ม outline ชุดเดียวกับชิปด้านล่างและปุ่ม "วันนี้" บนหัวแถบเดือน
               min-h-9 ไม่ใช่ 11: ปุ่มรองที่อยู่ในแถบข้อมูล ไม่ใช่ทางเดินหลักของขั้นนี้
               (ทางหลักคือชิปเวลา ซึ่งได้ 44px ครบ) */
            <button
              type="button"
              onClick={() => setShowDayList(true)}
              className="btn border-default-300 text-default-800 hover:border-default-400 hover:bg-default-50 min-h-9 shrink-0 gap-1.5 rounded-full border px-3 text-xs"
            >
              ดูรายการ
              <Icon icon="chevron-down" className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div
          className={`shrink-0 items-baseline gap-2 px-4 pt-3 pb-2 @5xl:flex ${
            collapsedDay ? 'hidden' : 'flex'
          }`}
          aria-live="polite"
          aria-atomic="true"
        >
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
                    ทั้งวันมี {pendingCount} นัด
                  </span>
                ))}
          {/* ทางกลับของปุ่ม "ดูรายการ" — ไม่มีปุ่มนี้ = กางแล้วยุบคืนไม่ได้จนกว่าจะถอยไปเลือกวันใหม่
              กล่องกว้างไม่มีการยุบตั้งแต่แรก จึงซ่อนด้วย @5xl:hidden ไม่ใช่เช็คใน JS */}
          {atTimeStep && showDayList && (
            <button
              type="button"
              onClick={() => setShowDayList(false)}
              /* ไม่ใส่ ms-auto: ตัวนับ "ทั้งวันมี n คิว" ข้าง ๆ ถือ ms-auto อยู่แล้วและมันมีเสมอ
                 เมื่อปุ่มนี้โผล่ (ปุ่มนี้ขึ้นได้ต่อเมื่อกด "ดูรายการ" ซึ่งขึ้นเฉพาะวันที่มีคิว)
                 — auto สองตัวในแถวเดียวจะแบ่งที่ว่างกันแล้วดันตัวนับไปลอยกลางแถว */
              className="btn text-default-700 hover:bg-default-200 min-h-9 shrink-0 gap-1.5 rounded-full px-3 text-xs @5xl:hidden"
            >
              ซ่อนรายการ
              <Icon icon="chevron-up" className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {dayItems.length === 0 ? (
          /* วันว่าง = ผลลัพธ์ที่ดีของหน้าจอนี้ (จองได้) ไม่ใช่ความล้มเหลว — น้ำเสียงจึงไม่ใช่
             "ไม่พบข้อมูล" และไอคอนเป็นเทากลาง **ไม่ใช่เขียว** เพราะเขียวสงวนไว้กับสัญญาณ
             ความเชื่อใจที่ยืนยันแล้ว (Verified-Means-Green) ว่างไม่ใช่ trust signal */
          /* collapsedDay: ยุบเหลือแถบบรรทัดเดียวด้านบน (ดูคอมเมนต์ของ collapsedDay) — กล่องนี้
             เป็น flex-1 justify-center จึงกินพื้นที่ที่เหลือทั้งหมดเพื่อบอกว่าไม่มีอะไรอยู่ตรงนี้
             `@5xl:flex` ทับกลับเสมอ: กล่องกว้างไม่มีการแยกขั้น ต้องเห็นเหมือนเดิมทุกประการ */
          <div
            /* shrink-0 ตอนอยู่ขั้นเลือกเวลา/กล่องกว้าง: กล่องนี้เคยเป็น flex-1 justify-center จึง
               ดูดพื้นที่ที่เหลือทั้งหมดไปบอกว่า "ไม่มีอะไรอยู่ตรงนี้" แล้วเบียดแผงเวลา (critique P0)
               ที่ขั้นเลือกวันยังเป็น flex-1 เหมือนเดิม เพราะที่นั่นมันคือเนื้อหาหลักของครึ่งล่างจริง ๆ */
            className={`flex-col items-center justify-center gap-2 px-6 text-center @5xl:flex @5xl:flex-none @5xl:shrink-0 @5xl:py-6 ${
              collapsedDay ? 'hidden' : 'flex'
            } ${atTimeStep ? 'shrink-0 py-6' : 'flex-1 py-8'}`}
          >
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
              {/* โหมดรวมทุกคิวไม่มี "คิวนี้" ให้ชี้ — คำนั้นถูกเขียนไว้ตอนที่ชีตดูได้ทีละคิวเท่านั้น */}
              {/* "วันนี้" ห้ามใช้ที่นี่ — จอนี้มีปุ่ม "วันนี้" ที่แปลว่ากระโดดไปวันปัจจุบัน
                  และผู้ใช้จิ้มดูวันอื่นได้ (จิ้ม = preview) · "คิวนี้" ก็กำกวมเพราะเลขรอบ ๆ
                  นับ "คิว" เป็นช่องความจุ ไม่ใช่ตัวคิวงาน */}
              {aggregate
                ? byDay
                  ? 'ยังไม่มีใครจองในวันที่เลือก — จองได้เลย'
                  : 'ยังไม่มีใครจองในวันที่เลือก — เลือกเวลาได้ตามสะดวก'
                : byDay
                  ? 'ยังไม่มีใครจองคิวงานนี้ — จองได้เลย'
                  : 'ยังไม่มีใครจองคิวงานนี้ — เลือกเวลาได้ตามสะดวก'}
            </p>
          </div>
        ) : (
          <div
            /* 🛑 ที่ขั้นเลือกเวลาและกล่องกว้าง รายการถูก **cap ความสูง** ไม่ใช่ flex-1
               เดิมมันกิน flex-1 แล้วแผงเวลา (shrink-0) ถูกดันจนล้นออกนอกกล่องที่ overflow-hidden
               → กด "ดูรายการ" แล้วเหมือนไม่เกิดอะไร เพราะรายการหดเหลือ 0 ส่วนแผงเวลายังล้นเท่าเดิม
               ม็อกอัพระบุ cap ไว้ที่ ~186px (max-h-48 = 192px ใกล้ที่สุดบนสเกลมาตรฐาน)
               ขั้นเลือกวันไม่แตะ: ที่นั่นทั้งคอลัมน์เลื่อนได้อยู่แล้ว รายการจึงยาวได้ตามจริง */
            className={`px-3 pb-3 @5xl:block @5xl:max-h-48 @5xl:flex-none @5xl:shrink-0 @5xl:overflow-y-auto @5xl:overscroll-contain ${
              collapsedDay ? 'hidden' : ''
            } ${atTimeStep ? 'max-h-48 shrink-0 overflow-y-auto overscroll-contain' : ''}`}
          >
            {/* แถวรายการย้ายไป AppointmentDayRows (2026-08-10) — ทรงเดียวกับ /queues มือถือ
                ไม่ส่ง onRowClick: ผู้ใช้กำลังกรอกฟอร์มสร้างงานค้างอยู่ กดออกไปแล้วร่างที่พิมพ์
                ไว้จะเสีย (ต่างจากบอร์ดใน /queues ที่ไม่มีร่างอะไรค้าง) */}
            <AppointmentDayRows
              items={dayItems}
              // รวมหลายคิว = ต้องบอกว่าแถวไหนของคิวไหน · คิวเดียวแล้วชื่อซ้ำทุกแถว = เสียงรบกวน
              showResourceName={aggregate && (aggregateResources?.length ?? 0) > 1}
            />
          </div>
        )}

        {/* ── เลือกเวลา (โหมดระบุช่วงเวลาเท่านั้น) ──
            user สั่ง 2026-08-08: "อยากให้อยู่ตอนที่เลือกวันเลย (ใน Calendar) ทำไมต้องออกมา
            อยู่ข้างนอก UX ใช้งานยากมาก" — เดิมต้องกดยืนยันวัน ปิดชีต แล้วไปกรอกเวลาในฟอร์ม
            ซึ่งเป็นคนละบริบทกับตอนที่เพิ่งดูคิวว่างอยู่ วางไว้ "ใต้รายการนัดของวันนั้น"
            โดยตั้งใจ เพราะรายการนั้นคือข้อมูลที่ใช้ตัดสินว่าจะนัดกี่โมง — อ่านแล้วกรอกต่อได้เลย
            shrink-0: ห้ามให้ส่วนนี้ถูกบีบหายเมื่อรายการนัดยาว (รายการมี overflow ของตัวเองแล้ว) */}
        {/* กล่องแคบ: โผล่เฉพาะขั้นที่ 2 · กล่องกว้าง: โผล่เสมอ (`@5xl:block` ทับ) */}
        {!byDay && pendingDate && (
          <div
            /* ── ตัวเลื่อนของขั้นเลือกเวลา ──
               แผงนี้ดูดพื้นที่ที่เหลือแล้วเลื่อนในตัวเอง (ไม่ใช่ shrink-0 เหมือนเดิม) เพราะความสูง
               ของมันไม่คงที่: 12 ชิป → 24 ชิปเมื่อกด "เวลาอื่น", บวกช่องกำหนดเอง, บวกปุ่มต่อคิว
               ที่โผล่เฉพาะบางวัน. อะไรที่ความสูงผันได้ขนาดนี้ห้ามเป็น shrink-0 ในกล่องที่
               overflow-hidden — นั่นคือ critique P0 ของ 2026-08-09 ตรง ๆ */
            className={`border-default-200 border-t border-dashed px-4 pt-3 pb-3 @5xl:block @5xl:min-h-0 @5xl:flex-1 @5xl:overflow-y-auto @5xl:overscroll-contain ${
              atTimeStep ? 'block min-h-0 flex-1 overflow-y-auto overscroll-contain' : 'hidden shrink-0'
            }`}
          >
            {/* หัวข้อกลุ่มเป็น "เวลาเริ่ม" ไม่ใช่ "เลือกเวลา" — หัวแผ่นพูดคำว่า "เลือกเวลา"
                ไปแล้วในขั้นนี้ และกลุ่มนี้ถามค่าเดียวจริง ๆ คือเวลาเริ่ม (ปลายทางมาจาก "ใช้เวลา") */}
            {/* id + role="group" + aria-labelledby: `<p className="form-label">` เป็นหัวข้อทาง
                สายตาอย่างเดียว ไม่ผูกกับอะไรเลย — ผู้ใช้ screen reader ที่เดินเข้ามาที่ชิปจะได้ยิน
                แค่ "08:00, toggle button" โดยไม่มีอะไรบอกว่ากลุ่มนี้คืออะไร (critique/Sam)
                ต้องเป็น role ที่รองรับชื่อจากผู้เขียน — `<p>` รองรับไม่ได้
                (docs/conventions/aria-name-requires-supporting-role.md) */}
            <p className="form-label mb-2" id="appt-sheet-start-label">
              เวลาเริ่ม
            </p>

            {/* ทางลัดจากข้อมูลที่อยู่ตรงหน้าอยู่แล้ว — ไม่ใช่ขั้นตอนบังคับ วันที่ยังว่างจะไม่มีชิปนี้
                combo ปุ่มเดียวกับ "วันนี้" บนหัวแถบเดือนของไฟล์นี้ (ไม่ใช่คลาสใหม่) */}
            {/* เต็มความกว้าง min-h-11 ไม่ใช่ชิปเล็ก 30px — ของที่ตัดสินใจแทนผู้ใช้ได้เร็วที่สุด
                ห้ามเป็นของที่กดยากที่สุดในจอ (PRODUCT.md: tap target ≥44px)
                อยู่เหนือกริดชิปเพราะมันเสนอเวลาที่ **ไม่อยู่ในกริด** (คิวก่อนหน้ามักเลิกเวลา
                ไม่ลงชั่วโมงพอดี เช่น 15:30) — ถ้าอยู่ใต้กริดจะอ่านเหมือนตัวเลือกที่ 13 ของกริด */}
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

            {/* ── ชิปเวลาเริ่ม ── ครึ่งแรกของ "จบใน 2 แตะ"
                🛑 สัญลักษณ์ "เต็ม" ของชิป **ไม่ใช่ตัวเดียวกับจุดในปฏิทิน** — จุดในปฏิทินคือ
                `used > 0` (มีคิวบ้าง) ส่วนชิปคือ `overlap >= capacity` (เต็ม) คนละความหมายกัน
                คอมเมนต์เดิมตรงนี้เขียนว่า "ใช้สัญลักษณ์เดียวกับ legend ปฏิทิน" ซึ่งผิด และทำให้
                สองสถานะที่ต่างกันหน้าตาเหมือนกันเป๊ะ. ปฏิทินสื่อ "เต็ม" ด้วยกากบาทแทนเลขวัน
                ชิปจึงใช้ พื้น+ตัวหนังสือ warning-ink + ไอคอนสามเหลี่ยม = ภาษาเดียวกัน */}
            {timeSlots.length > 0 && (
              <div className="mb-3">
                {/* กริดกว้างขึ้นตามกล่อง: 4 คอลัมน์ที่กล่องแคบ (ชิป ~78px อ่านออกที่ 320px)
                    6 ที่ @3xl — ไม่ใช่ breakpoint วิวพอร์ต เพราะชีตนี้เปิดได้จากกล่อง 384px
                    ในหน้าต่างร่างออเดอร์ของหน้าแชท (ดูเหตุผลเต็มที่ @container บนหัวแผ่น) */}
                <div
                  role="group"
                  aria-labelledby="appt-sheet-start-label"
                  ref={slotGridRef}
                  onKeyDown={onSlotGridKeyDown}
                  className="grid grid-cols-4 gap-2 @3xl:grid-cols-6"
                >
                  {timeSlots.map((s, i) => {
                    const active = pendingStart === s.start
                    return (
                      <Fragment key={s.start}>
                        {/* เส้นแบ่ง "บ่าย" ตอนกาง 24 ชิป — ที่ 12 ชิปไม่ต้องมี (กวาดตาเจอได้อยู่แล้ว)
                            critique: 6 แถวติดกันไม่มีจุดอ้างอิงทำลายการหาตำแหน่งแบบดูหน้าปัดนาฬิกา
                            ซึ่งเป็นเหตุผลเดียวที่กริดนี้ได้รับยกเว้นจากกฎ "≤4 ตัวเลือกต่อการตัดสินใจ"
                            aria-hidden: เป็นตัวช่วยทางสายตาล้วน ผู้ใช้ screen reader ได้เวลาเต็ม
                            อยู่แล้วจาก aria-label ของทุกชิป ไม่ต้องมีหัวข้อคั่นให้เดินผ่านเพิ่ม */}
                        {showAllHours && (s.start === '06:00' || s.start === '12:00' || s.start === '18:00') && (
                          <div
                            aria-hidden="true"
                            className="text-default-500 col-span-full flex items-center gap-2 pt-1 text-xs"
                          >
                            <span className="shrink-0">
                              {s.start === '06:00' ? 'เช้า' : s.start === '12:00' ? 'บ่าย' : 'เย็น'}
                            </span>
                            <span className="bg-default-200 h-px flex-1" />
                          </div>
                        )}
                      <button
                        type="button"
                        onClick={() => applyStart(s.start)}
                        /* roving tabindex (critique/Sam): กาง 24 ชิป = 24 tab stop ถ้าไม่ทำ
                           ชิปที่เลือกอยู่เป็นตัวเดียวที่รับ Tab ได้ ที่เหลือเดินด้วยลูกศร
                           ยังไม่ได้เลือกอะไร → ชิปแรกรับ Tab (ห้ามให้กลุ่มนี้ไม่มีทางเข้าเลย) */
                        tabIndex={active || (!pendingStart && i === 0) ? 0 : -1}
                        data-slot-index={i}
                        aria-pressed={active}
                        /* "เต็มแล้ว" ไม่ใช่ "มีคิวแล้ว" — `s.busy` คือ overlap >= capacity (เต็ม)
                           ไม่ใช่ used > 0 (มีคิวบ้าง) ซึ่งเป็นเงื่อนไขของจุดในปฏิทิน
                           คำเดิมพูดผิดความหมายมาตั้งแต่ต้น ผู้ใช้ screen reader จึงได้ยินว่า
                           "มีคิวแล้ว" ในช่วงที่จริง ๆ เต็ม แล้วเลือกไปโดยไม่รู้ว่ากำลังจองทับ */
                        aria-label={`เวลาเริ่ม ${s.start}${s.busy ? ' ช่วงนี้เต็มแล้ว' : ''}${s.past ? ' เลยเวลาไปแล้ว' : ''}`}
                        /* 🛑 text-primary-ink ไม่ใช่ text-primary บนพื้น /15 (DESIGN.md + critique P1)
                           primary บนพื้น primary/15 วัดได้ 4.17:1 (บนการ์ด) และ 3.91:1 (บนพื้นเทา)
                           ตก AA ที่ 14px semibold ซึ่งต้องการ 4.5 — primary-ink บนพื้นเดียวกันได้
                           8.44:1 · เฉดคงเดิม (น้ำเงินทั้งคู่) จึงไม่ขัด Hue-Preserving Rule
                           และตระกูล -ink มีคู่ dark mode ให้ ส่วน text-primary เป็นค่าคงที่ไม่มี
                           สถานะ "ถูกเลือก" คือสิ่งเดียวที่แยกชิปนี้จากพี่น้องอีก 11 ตัว จะให้อ่านยาก
                           ที่สุดในจอไม่ได้ โดยเฉพาะกับกลุ่มผู้สูงวัยที่ PRODUCT.md ผูกไว้

                           past: หรี่ "ตัวหนังสือ" ด้วย opacity ไม่ได้ — 50% ของ text-default-800
                           ได้ 2.75:1 ทั้งที่ชิปพวกนี้ตั้งใจให้ยังกดได้ (FR-RSV-03 นัดย้อนหลัง)
                           ใช้ text-default-500 แทน = 6.22:1 บนการ์ด / 5.81:1 บนพื้นเทา ผ่านทั้งคู่
                           แล้วหรี่เฉพาะ "ขอบ" ซึ่งไม่ใช่ตัวแบกความหมาย */
                        className={`btn relative min-h-11 justify-center rounded-lg border px-1 text-sm tabular-nums ${
                          active
                            ? 'border-primary bg-primary/15 text-primary-ink font-semibold'
                            : s.busy
                              ? /* เต็ม: พื้น warning/15 + ตัวหนังสือ warning-ink (6.2–6.6:1)
                                   ตัวแบกความหมายคือ "สีตัวหนังสือ" ซึ่งวัดด้วยเกณฑ์ข้อความ 4.5:1
                                   และผ่าน — ต่างจากจุด 6px เดิมที่ได้ 1.55:1 (ตกเกณฑ์ non-text 3:1)
                                   ยังกดได้ตามเดิม (BR-RSV-18) แค่เห็นชัดขึ้นว่ากำลังจะจองทับ */
                                'border-warning bg-warning/15 text-warning-ink hover:bg-warning/25'
                              : s.past
                                ? 'border-default-200 text-default-500 hover:border-default-400 hover:bg-default-50'
                                : 'border-default-300 text-default-800 hover:border-default-400 hover:bg-default-50'
                        }`}
                      >
                        {s.start}
                        {/* ไม่ disable ปุ่มที่ชนคิว — BR-RSV-18 เลขบนจอไม่ใช่คำตัดสิน (ข้อมูลอาจ
                            เก่าระหว่างเปิดค้าง) ตัวตัดสินจริงคือ EXCLUDE constraint ตอนบันทึก
                            การปิดปุ่มจากข้อมูลฝั่ง client จะบล็อกช่วงที่จริง ๆ ยังจองได้ */}
                        {/* 🛑 ไอคอน ไม่ใช่จุดสี — WCAG 1.4.1 ห้ามสื่อความหมายด้วยสีอย่างเดียว
                            ปฏิทินแก้เรื่องเดียวกันนี้ด้วยการเปลี่ยน "รูปร่าง" (กากบาทแทนเลขวัน)
                            สำหรับวันที่เต็ม ชิปจึงต้องพูดภาษาเดียวกัน: มีทั้งสี (พื้น+ตัวหนังสือ)
                            และรูปร่าง (ไอคอน) ไม่ใช่จุดกลมสีเหลืองที่ตาบอดสีแยกไม่ออกจากจุดของ
                            "มีคิวแล้ว" ในปฏิทิน ทั้งที่สองอย่างนี้คนละความหมายกัน */}
                        {s.busy && (
                          <Icon
                            icon="alert-triangle-filled"
                            className="absolute end-0.5 top-0.5 size-3"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                      </Fragment>
                    )
                  })}
                </div>
                {/* หน้าต่าง 08:00–20:00 เป็นค่าตั้งต้น ไม่ใช่เพดาน — ร้านที่เปิดดึก/เปิดเช้าต้อง
                    ไปถึงได้จากจอนี้ ไม่ใช่ต้องรู้เองว่ามีช่องกรอกซ่อนอยู่ที่อื่น
                    (ทางที่ถูกจริงคือ "เวลาทำการ" ต่อคิวงาน ซึ่ง user เคาะ 2026-08-09 ว่ายังไม่ทำ) */}
                <button
                  type="button"
                  /* 🛑 ย่อไม่ได้ถ้าค่าที่เลือกอยู่นอกหน้าต่างตั้งต้น (critique P2-a)
                     effect ตอนเปิดชีตกางหน้าต่างให้อัตโนมัติด้วยเหตุผลนี้อยู่แล้ว แต่ปุ่มนี้เคยเป็น
                     toggle เปล่า → เลือก 22:00 แล้วกดย่อ = กริด 12 ชิปไม่มีตัวไหน active
                     ขณะที่กล่องสรุปยืนยัน 22:00–23:00 และปุ่มยืนยันกดได้ (จอโกหกตัวเอง) */
                  onClick={() => setShowAllHours((v) => nextShowAllHours(v, startsOutsideDefaultWindow))}
                  disabled={showAllHours && startsOutsideDefaultWindow}
                  title={
                    showAllHours && startsOutsideDefaultWindow
                      ? `ย่อไม่ได้เพราะเลือก ${pendingStart} ไว้ซึ่งอยู่นอกช่วง 08:00–20:00`
                      : undefined
                  }
                  aria-expanded={showAllHours}
                  className="btn text-primary hover:bg-default-100 mt-2 min-h-11 w-full justify-center gap-1.5 rounded-lg text-sm"
                >
                  <Icon
                    icon={showAllHours ? 'chevron-up' : 'chevron-down'}
                    className="size-4 shrink-0"
                    aria-hidden="true"
                  />
                  {showAllHours
                    ? startsOutsideDefaultWindow
                      ? `เลือก ${pendingStart} ไว้ — ย่อกลับไม่ได้`
                      : 'ย่อกลับเป็น 08:00–20:00'
                    : 'เวลาอื่น (ก่อน 08:00 / หลัง 20:00)'}
                </button>
              </div>
            )}

            {/* ── ชิประยะเวลา ── ครึ่งหลังของ "จบใน 2 แตะ" และเป็นหัวใจของการแก้รอบนี้
                ผู้ขายคิดเป็น "ใช้เวลาเท่าไหร่" ไม่ใช่ "เลิกกี่โมง" — และเมื่อไม่มีช่องเวลาสิ้นสุด
                ให้กรอก ช่วงที่ผิดกฎก็สร้างไม่ได้ตั้งแต่ต้นทาง (ดูคอมเมนต์ของ pendingDurationMin) */}
            <p className="form-label mb-2" id="appt-sheet-duration-label">
              ใช้เวลา
            </p>
            {/* กลุ่มนี้จำเป็นกว่ากลุ่มเวลาเริ่มด้วยซ้ำ: ชิปที่นี่อ่านว่า "30 นาที" ซึ่งไม่มีคำว่า
                "ใช้เวลา" อยู่ในตัวเลย และผู้ใช้เพิ่งเดินออกมาจากกริดของ "เวลา" ที่หน้าตาคล้ายกัน */}
            <div
              role="group"
              aria-labelledby="appt-sheet-duration-label"
              className="flex flex-wrap gap-2"
            >
              {durationChoices.map((min) => {
                const active = pendingDurationMin === min
                const isResourceDefault = resourceDurationMinutes === min
                return (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setPendingDurationMin(min)}
                    aria-pressed={active}
                    className={`btn min-h-11 justify-center gap-1.5 rounded-lg border px-3.5 text-sm ${
                      active
                        ? 'border-primary bg-primary/15 text-primary-ink font-semibold'
                        : 'border-default-300 text-default-800 hover:border-default-400 hover:bg-default-50'
                    }`}
                  >
                    {formatDurationTH(min)}
                    {/* ทำไมชิปนี้ถึงถูกเลือกไว้ให้ — ไม่ใช่ตัวเลขที่โผล่มาลอย ๆ
                        (ค่านี้ตั้งที่ /queues > คิวงาน > ระยะเวลามาตรฐาน)
                        -ink ด้วยเหตุผลเดียวกับชิปเวลา และตัวนี้เป็น text-xs จึงตกหนักกว่าถ้าใช้ primary */}
                    {isResourceDefault && (
                      <span className={`text-xs ${active ? 'text-primary-ink' : 'text-default-500'}`}>
                        ค่าตั้งต้น
                      </span>
                    )}
                  </button>
                )
              })}
              {/* ทางออกสำหรับช่วงที่ไม่ลงล็อก (13:00–16:45) — ของเดิมไม่ได้หายไปจากระบบ
                  แค่ถอยไปเป็นทางเลือกที่สอง แทนที่จะเป็นทางเดียวเหมือนก่อนหน้านี้ */}
              <button
                type="button"
                /**
                 * 🛑 ต้องเลือกเวลาเริ่มก่อนถึงเข้าโหมดนี้ได้ — ไม่ใช่แค่เรื่องลำดับที่สวยงาม
                 *
                 * ช่อง `type="time"` ข้างล่างคือ native picker ตัวสุดท้ายที่เหลือในจอนี้ และ
                 * **iOS เปิดวงล้อที่ "เวลาปัจจุบัน" เสมอเมื่อช่องว่าง** → แค่แตะดูก็ได้ค่าเป็น
                 * เวลาตอนนั้นทันที ซึ่งแทบไม่มีทางถูก (เคสจริงที่ user รายงาน 2026-08-09:
                 * เวลาเริ่ม 18:00 แต่ช่องสิ้นสุดกลายเป็น 13:51 = เวลาบนนาฬิกาพอดี แล้วจอขึ้น
                 * error ทั้งที่ผู้ใช้ยังไม่ได้ตั้งใจกรอกอะไรเลย)
                 *
                 * พอบังคับให้มีเวลาเริ่มก่อน `customEnd` จะถูก prefill ด้วย เวลาเริ่ม+ระยะเวลา
                 * เสมอ → ช่องไม่เคยว่าง → วงล้อเปิดที่ค่าที่สมเหตุผล ไม่ใช่ที่นาฬิกาของเครื่อง
                 */
                disabled={!pendingStart}
                title={!pendingStart ? 'เลือกเวลาเริ่มก่อน' : undefined}
                onClick={() => {
                  if (!pendingStart) return
                  // เข้าโหมดกำหนดเองพร้อมค่าเริ่มที่สมเหตุผล ไม่ใช่ช่องว่างที่ผู้ใช้ต้องเดาเอง
                  setCustomEnd(
                    (prev) => prev || addMinutesToTime(pendingStart, pendingDurationMin ?? DEFAULT_DURATION_MIN),
                  )
                  setPendingDurationMin(null)
                }}
                aria-pressed={pendingDurationMin == null}
                className={`btn min-h-11 justify-center gap-1.5 rounded-lg border px-3.5 text-sm ${
                  pendingDurationMin == null
                    ? 'border-primary bg-primary/15 text-primary-ink font-semibold'
                    : 'border-default-300 text-default-800 hover:border-default-400 hover:bg-default-50'
                }`}
              >
                <Icon icon="adjustments-horizontal" className="size-4 shrink-0" aria-hidden="true" />
                กำหนดเอง
              </button>
            </div>

            {/* ช่องเวลาสิ้นสุดโผล่เฉพาะโหมดกำหนดเอง — ครึ่งความกว้างเพราะมันคือช่องเดียวแล้ว
                (เวลาเริ่มมาจากชิปด้านบน ไม่ต้องมีช่องคู่ให้เทียบอีก) */}
            {pendingDurationMin == null && (
              <div className="mt-3 max-w-48">
                <label htmlFor="appt-sheet-end" className="form-label">
                  เวลาสิ้นสุด
                </label>
                {/* aria-required: บังคับกรอกในโหมดนี้ (ปุ่มยืนยัน disabled จนกว่าจะครบ)
                    แต่ไม่มี `required` จริงเพราะไม่ได้อยู่ใน <form> ที่ submit
                    aria-invalid เฉพาะตอน "ค่าที่กรอกผิดจริง" ไม่ใช่ตอนยังว่าง (ดู timeIssue) */}
                <input
                  id="appt-sheet-end"
                  type="time"
                  /* 🛑 min-h-11 ทับ `.form-input` — คลาสนั้นเป็น `h-11 lg:h-9.25` และ **`lg:` เป็น
                     viewport query ไม่ใช่ container query** ชีตนี้จึงได้ช่องสูง 37px ตอนเปิดจากราง
                     384px ในหน้าแชทบนจอกว้าง (วิวพอร์ตอ่าน ~1400px แต่กล่องจริงแคบ) = ต่ำกว่าเกณฑ์
                     44px ของ PRODUCT.md ทั้งที่นิ้วมีที่ให้แตะเท่ามือถือเป๊ะ
                     คลาสเดียวกับกับดัก `.btn.btn-icon = 37px` ที่ไฟล์นี้ดักไว้แล้วที่ปุ่มหัวแผ่น */
                  className="form-input min-h-11"
                  min={pendingStart || undefined}
                  aria-required
                  aria-invalid={timeIssue?.field === 'end' && timeIssue.invalid ? true : undefined}
                  aria-describedby={timeIssue ? TIME_ISSUE_ID : undefined}
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            )}

            {/* ── ช่วงที่ได้ ── ผลลัพธ์ที่คำนวณให้ ไม่ใช่ช่องกรอก
                ผู้ใช้ยังเห็นเวลาสิ้นสุดตลอดเวลา แค่ตั้งให้ผิดกฎไม่ได้ — ซ่อนมันไปเลยจะกลายเป็น
                ระบบที่ตัดสินใจลับหลัง ซึ่งแย่กว่าเดิมสำหรับคนที่ต้องบอกเวลาเลิกกับลูกค้า
                aria-live: ค่านี้เปลี่ยนเองเมื่อกดชิป (คนละที่กับมือ) ต้องประกาศ (WCAG 4.1.3) */}
            {/* 🛑 wrapper ที่ถือ aria-live ต้อง mount **ถาวร** ไม่ใช่โผล่พร้อมเนื้อหา (critique P2-b)
                live region ที่ถูกแทรกเข้ามาในเฟรมเดียวกับเนื้อหามักไม่ถูกประกาศเลย — กฎนี้เขียนไว้
                แล้วที่กล่อง timeIssue ข้างล่าง แต่กล่องนี้เคยทำตรงข้าม (gate ทั้ง div ด้วย
                pendingStart && pendingEnd) ทำให้ **การประกาศครั้งแรก** ของเวลาสิ้นสุดที่คำนวณให้
                ซึ่งเป็นค่าที่สำคัญที่สุดสำหรับคนที่มองไม่เห็น คือตัวที่มีโอกาสหายมากที่สุด */}
            <div aria-live="polite" aria-atomic="true">
            {pendingStart && pendingEnd && (
              <div className="bg-default-100 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5">
                <span className="text-dark flex items-center gap-2 text-base font-semibold tabular-nums">
                  {pendingStart}
                  {/* ไอคอนลูกศรสื่อ "ถึง" ให้คนที่มองเห็น — screen reader ที่ได้ยินเลขสองตัวติดกัน
                      โดยไม่มีคำเชื่อมจะไม่รู้ว่านี่คือช่วงเวลา จึงต้องมีคำจริงคู่กันเสมอ */}
                  <Icon icon="arrow-narrow-right" className="size-4 shrink-0" aria-hidden="true" />
                  <span className="sr-only">ถึง</span>
                  {pendingEnd}
                </span>
                {capacity != null && capacity > 0 && (
                  /* ตัวนับของ "ช่วงเวลา" ไม่ใช่ของทั้งวัน — แสดงผลเท่านั้น ไม่ใช่คำตัดสิน
                     (BR-RSV-18) ตัวที่กันจริงคือปุ่มยืนยันล่าง ซึ่ง disabled เมื่อช่วงนี้เต็ม */
                  <span
                    className={`ms-auto text-xs ${
                      pendingSlotFull ? 'text-warning-ink' : 'text-default-500'
                    }`}
                  >
                    จองแล้ว {pendingSlotBookedCount} จาก {capacity} คิว
                    {/* ที่กล่องกว้างมี "ทั้งวันมี n คิว" อยู่บนจอเดียวกันห่างไป ~200px — สองตัวเลข
                        คนละขอบเขตที่ไม่มีตัวไหนบอกขอบเขตตัวเองคืออ่านสลับกันได้ทันที (HR16)
                        กล่องแคบไม่ต้องมี เพราะที่นั่นตัวนับรายวันถูกยุบไปอยู่ในแถบสรุปแล้ว */}
                    <span className="hidden @5xl:inline"> ในช่วงเวลานี้</span>
                  </span>
                )}
              </div>
            )}
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
                    /* danger-ink ไม่ใช่ danger: บรรทัดนี้อยู่บนพื้น bg-default-100 ซึ่งทำให้
                       text-danger ได้แค่ 2.96:1 (ตก AA) — และมันคือ **ประโยคเดียวที่บอกว่าติดอะไรอยู่**
                       ข้อความที่อธิบายความผิดพลาดต้องเป็นสิ่งที่อ่านง่ายที่สุดในจอ ไม่ใช่ยากที่สุด
                       danger-ink บนพื้นเดียวกันได้ 9.36:1 · เฉดคงเดิม (แดงทั้งคู่) ตาม Hue-Preserving
                       ไอคอนกากบาทในปฏิทินยังเป็น text-danger ต่อไป — นั่นคือ "สี = ตัวตน" ของสถานะเต็ม
                       ซึ่ง DESIGN.md ยกเว้นไว้จากกฎคอนทราสต์ของข้อความ */
                    timeIssue.invalid ? 'text-danger-ink' : 'text-default-500'
                  }`}
                >
                  {timeIssue.message}
                </p>
              )}
            </div>
            {/* ตัวนับ "จองแล้ว n จาก m คิว" ย้ายไปอยู่ในกล่องช่วงเวลาด้านบนแล้ว — มันเป็นคุณสมบัติ
                ของ *ช่วงที่เลือก* จึงต้องอยู่ติดกับช่วงนั้น ไม่ใช่ลอยอยู่ท้ายกลุ่มฟอร์ม
                (เดิมอยู่ห่างจากช่วงที่มันพูดถึงจนอ่านเหมือนเป็นตัวเลขของทั้งวัน — HR16) */}
          </div>
        )}
      </div>
      </div>

      {/* ── แถบยืนยันติดขอบล่าง ──
          ปุ่มนี้คือที่เดียวที่ค่าจริงในฟอร์มถูกเปลี่ยน (จิ้มวันในปฏิทินแค่ preview)
          ไม่ใช้คำว่า "วันนี้" เพราะชนกับปุ่ม "วันนี้" บนหัวที่แปลว่ากระโดดไปวันปัจจุบัน
          — จอเดียวมีคำเดียวกันสองความหมายคืออ่านสลับกันได้ทันที จึงพูดวันที่ออกมาตรง ๆ */}
      <div className={`border-default-200 bg-card flex shrink-0 items-start gap-3 border-t px-4 pt-3 ${FOOTBAR_HEIGHT}`}>
        {/* ปุ่ม "ไปขั้นเลือกเวลา" — มีเฉพาะกล่องแคบ + โหมดระบุเวลา + ขั้นแรก
            render สองปุ่มเสมอแล้วสลับด้วยคลาส (ไม่ใช่ JS) เพราะ `@5xl:hidden` ต้องชนะได้
            โดยไม่ต้องรู้ความกว้างกล่องใน JS — idiom เดียวกับ DOW_SHORT/DOW_FULL ในไฟล์นี้
            ไม่เช็ค isFull: "เต็มทั้งวัน" ไม่มีความหมายในโหมดเวลา (ดู isFull) */}
        <button
          type="button"
          disabled={!pendingDate}
          onClick={() => pendingDate && setStep('time')}
          className={`btn bg-primary hover:bg-primary-hover min-h-11 w-full justify-center gap-2 py-3 font-semibold text-white @5xl:hidden ${
            twoStep && step === 'date' ? 'flex' : 'hidden'
          }`}
        >
          {pendingDate
            ? `เลือกเวลาของ ${formatDateTH(new Date(`${pendingDate}T00:00`))}`
            : 'แตะวันในปฏิทินก่อน'}
          {pendingDate && <Icon icon="chevron-right" className="size-4 shrink-0" aria-hidden="true" />}
        </button>
        <button
          type="button"
          /* 🛑 aria-disabled ไม่ใช่ disabled (critique/Sam): `disabled` ถอดปุ่มออกจาก tab order
             ผู้ใช้คีย์บอร์ด/screen reader จึงไล่ tab จนจบชีตแล้วไม่เจออะไรที่ท้ายจอเลย —
             ไม่มีชื่อ ไม่มีสถานะ ไม่มีเหตุผล. กดแล้วย้ายโฟกัสไปที่บรรทัดที่บอกว่าติดอะไรอยู่แทน
             (opacity/cursor ที่ `button:disabled` เคยให้ฟรี ต้องเขียนเองเพราะไม่ใช่ disabled แล้ว) */
          aria-disabled={confirmState.disabled || undefined}
          onClick={() => {
            if (confirmState.disabled) {
              document.getElementById(TIME_ISSUE_ID)?.scrollIntoView({ block: 'nearest' })
              return
            }
            if (!pendingDate) return
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
             aria-disabled:* เขียนเอง เพราะ `button:disabled` ใน custom/_buttons.css ไม่ยิงแล้ว
             truncate: `.btn` ไม่มี white-space:nowrap และ footbar สูงคงที่ 72px โตตามไม่ได้ —
               ป้าย "ยืนยัน 09 ส.ค. 2569 · 13:00–14:00" พอดีตัวที่ 320px แบบเฉียดฉิว พอผู้ใช้ซูม
               หรือใช้ default type ที่ใหญ่ขึ้นตามที่ PRODUCT.md สัญญากับผู้สูงวัย มันจะตก 2 บรรทัด
               แล้วล้นออกนอก footbar (docs/conventions/flex-header-truncation.md)
             @5xl:max-w-sm: ที่ 1100px ปุ่มเต็มความกว้างเป็นแผ่น bg-primary ~1068px ซึ่งกินสัดส่วน
               เกินกฎ One Voice (≤~10% ของจอ) — ม็อกอัพ cap ไว้ ~340px แล้วชิดขวา */
          className={`btn bg-primary hover:bg-primary-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-50 min-h-11 w-full justify-center py-3 font-semibold text-white @5xl:ms-auto @5xl:flex @5xl:max-w-sm ${
            byDay || step === 'time' ? 'flex' : 'hidden'
          }`}
        >
          <span className="truncate">{confirmState.label}</span>
        </button>
      </div>
    </div>
  )
}
