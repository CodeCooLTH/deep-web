'use client'

/**
 * AppointmentBlock — บล็อก "วันเข้าใช้บริการ" ในฟอร์มสร้างออเดอร์ (feature 00024, FR-RSV-03 + FR-RSV-12)
 *
 * Base: src/app/(paces)/seller/(dashboard)/bookings/components/BookingForm.tsx
 *   — pattern เดียวกัน: form-select เลือกคิวงาน + input วัน/เวลา + กล่องสรุปยอด
 *     ซึ่ง chase ต่อไปที่ theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/settings/page.tsx
 *     (field group: .form-label / .form-input / .form-select)
 *
 * Design Spec: safepay-ux ส่วน C
 *
 * IMPORTANT: บล็อกนี้ "ไม่บังคับกรอก" — ไม่เลือกคิวงาน = ไม่ส่ง appointment ไป backend เลย
 * ออเดอร์เดินเส้นทางเดิม 100% (BR-RSV-04) และร้านที่ใช้ฟีเจอร์นี้ไม่ได้จะไม่ render ไฟล์นี้เลย
 *
 * IMPORTANT: ตัวเลข "จองแล้ว n จาก m คิว" ใช้ **แสดงผลเท่านั้น** ห้ามใช้ตัดสินว่าจองได้/ไม่ได้
 * (BR-RSV-18) ระหว่างที่ผู้ใช้กรอกอยู่มีคนจองแทรกได้เสมอ ตัวตัดสินจริงคือ EXCLUDE constraint
 * ตอน POST /api/orders — UI จึงไม่ disable ปุ่มบันทึกแม้จะเห็นว่าเต็ม
 *
 * IMPORTANT: คำว่า "ที่นั่ง" (serviceSeat) เป็นกลไกภายใน ห้ามโผล่ในหน้าจอ
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, type Control, type FieldErrors, type UseFormSetValue } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import { formatTimeHM, formatDateTH } from '@/lib/format-date'
import AppointmentDateSheet from './AppointmentDateSheet'
import type { FormValues } from './OrderCreateForm'
import type { AppointmentGranularity } from '@/lib/appointments'

export type ServiceResourceOption = {
  id: string
  name: string
  durationMinutes: number | null
  capacity: number
  depositMode: string
  depositValue: string
}

type Props = {
  control: Control<FormValues>
  errors: FieldErrors<FormValues>
  setValue: UseFormSetValue<FormValues>
  resources: ServiceResourceOption[]
  /** FR-RSV-13 — DAY = ไม่ถามเวลา (จองทั้งวัน), TIME = ถามเวลาเริ่ม/สิ้นสุด */
  granularity: AppointmentGranularity
  /** ยอดรวมปัจจุบันของออเดอร์ — ใช้คำนวณมัดจำตั้งต้นและยอดคงเหลือ */
  total: number
  /**
   * prefix ของ element id — QuickForm (มือถือ) กับ CartPanel (เดสก์ท็อป) render พร้อมกัน
   * เสมอ (สลับด้วย CSS ไม่ใช่ React) ถ้าใช้ id ชุดเดียวกันจะซ้ำใน DOM แล้ว label
   * ผูกผิดช่อง — ต้องแยก prefix ต่อ instance
   */
  idPrefix: string
  /**
   * 'card' = การ์ดเต็มใบ (มือถือ) · 'embedded' = เนื้อในล้วน ไม่มีการ์ด/หัวเรื่อง
   * (เดสก์ท็อป อยู่ใน accordion ของ CartPanel ที่มีหัวเรื่องของตัวเองแล้ว)
   * pattern เดียวกับ CustomerSelectBlock variant="embedded"
   */
  variant?: 'card' | 'embedded'
  /** ค่าที่ผู้ใช้กรอกอยู่ (watch จาก form owner) */
  value: {
    resourceId?: string
    date?: string
    startTime?: string
    endTime?: string
    depositAmount?: number | null
  }
}

/** ช่วงเวลาที่ถูกจองแล้วของคิวงาน+วันนั้น (API.md §4.4 — 1 แถวต่อ 1 นัด ไม่ได้ aggregate) */
type BusySlot = { start: string; end: string }

/** "YYYY-MM-DD" ของวันนี้ตามเครื่องผู้ใช้ — ห้ามใช้ toISOString() เพราะจะเพี้ยนเป็น UTC */
function todayLocalDate(): string {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** รวม "YYYY-MM-DD" + "HH:mm" เป็น Date ตามเวลาเครื่อง (ผู้ใช้คิดเป็นเวลาไทยอยู่แล้ว) */
function combine(date: string, time: string): Date | null {
  if (!date || !time) return null
  const d = new Date(`${date}T${time}`)
  return isNaN(d.getTime()) ? null : d
}

/** บวกนาทีแล้วคืนเป็น "HH:mm" */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return ''
  const total = h * 60 + m + minutes
  const hh = `${Math.floor((total / 60) % 24)}`.padStart(2, '0')
  const mm = `${total % 60}`.padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * บล็อกนี้ mount พร้อมกันสองใบ (QuickForm มือถือ / CartPanel เดสก์ท็อป — สลับด้วย CSS)
 * ถ้าปล่อยไว้ ทุกครั้งที่เปลี่ยนคิวงานหรือวันจะยิง availability ซ้ำสองรอบ
 * จึงแชร์ promise ที่กำลังบินอยู่ของ URL เดียวกัน แล้วทิ้งทันทีที่จบ
 * (ไม่ใช่ cache ผลลัพธ์ — ยังต้องได้คิวสดทุกครั้งที่ผู้ใช้เปลี่ยนค่า)
 */
const inFlightBusy = new Map<string, Promise<unknown>>()

function fetchBusy(url: string): Promise<any> {
  const hit = inFlightBusy.get(url)
  if (hit) return hit
  const p = fetch(url, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
    .finally(() => inFlightBusy.delete(url))
  inFlightBusy.set(url, p)
  return p
}

export default function AppointmentBlock({
  control,
  errors,
  setValue,
  resources,
  granularity,
  idPrefix,
  variant = 'card',
  total,
  value,
}: Props) {
  const byDay = granularity === 'DAY'
  const [busy, setBusy] = useState<BusySlot[]>([])
  const [loadingBusy, setLoadingBusy] = useState(false)
  const [busyFailed, setBusyFailed] = useState(false)
  // จำว่าผู้ใช้เคยพิมพ์เวลาสิ้นสุดเองหรือยัง — ถ้าเคย ห้าม auto-fill ทับ
  const endTouched = useRef(false)

  const selected = resources.find((r) => r.id === value.resourceId) ?? null
  /** ปฏิทินเต็มจอเลือกวันนัด (user สั่ง 2026-08-07) */
  const [dateSheetOpen, setDateSheetOpen] = useState(false)
  /**
   * คิวงานที่เพิ่งกดในคลิกนี้ — ใช้ป้อนปฏิทิน**เท่านั้น** ไม่แตะตรรกะอื่นของฟอร์ม
   *
   * ปฏิทินถูกสั่งเปิดในคลิกเดียวกับที่เลือกคิวงาน แต่ resourceId/capacity ที่มันได้เดินทาง
   * มาจาก useWatch ของ OrderCreateForm ซึ่งอัปเดตแบบ async (หลักฐาน lag ของ pattern
   * เดียวกัน: OrderCreateForm.tsx:456-459 pendingAppend guard) เฟรมแรกจึงอาจได้ค่าเก่า
   * แล้วปฏิทินโหลดความว่างของคิวผิดตัว หรือไม่โหลดเลย
   *
   * ตั้งใจไม่เอาไป fallback ให้ `selected` ด้วย — `selected` เป็นตัวคุมว่าฟิลด์วันที่/เวลา/
   * มัดจำจะโผล่ไหม ถ้าให้ค่าที่จำไว้เองมามีสิทธิ์ตรงนั้น กด "ล้างวันนัด" แล้วฟิลด์จะไม่ยอมหาย
   */
  const [pickedForSheet, setPickedForSheet] = useState<ServiceResourceOption | null>(null)
  const sheetResource = selected ?? pickedForSheet

  // ── โหลดคิวที่ถูกจองแล้วของคิวงาน+วันที่เลือก (ครั้งเดียวต่อ resource+วัน) ──
  useEffect(() => {
    if (!value.resourceId || !value.date) {
      setBusy([])
      return
    }
    let cancelled = false
    const from = new Date(`${value.date}T00:00`)
    const to = new Date(from.getTime() + 86_400_000)
    setLoadingBusy(true)
    setBusyFailed(false)
    fetchBusy(
      `/api/shops/current/service-resources/availability?resourceId=${value.resourceId}&from=${from.toISOString()}&to=${to.toISOString()}`,
    )
      .then((d) => {
        if (cancelled) return
        setBusy(Array.isArray(d?.busy) ? d.busy : [])
      })
      .catch(() => {
        if (!cancelled) setBusyFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoadingBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [value.resourceId, value.date])

  // ── จำนวนคิวที่ถูกจองแล้ว ณ เวลาเริ่มที่เลือก (คำนวณสด ไม่ fetch ใหม่) ──
  const bookedNow = useMemo(() => {
    if (!value.date) return null
    // โหมดรายวัน: นับนัดที่คาบเกี่ยวกับวันนั้นทั้งวัน (ไม่มีเวลาเริ่มให้อ้างอิง)
    if (byDay) {
      const dayStart = new Date(`${value.date}T00:00`).getTime()
      const dayEnd = dayStart + 86_400_000
      return busy.filter((b) => {
        const bs = new Date(b.start).getTime()
        const be = new Date(b.end).getTime()
        return bs < dayEnd && dayStart < be
      }).length
    }
    if (!value.startTime) return null
    const start = combine(value.date, value.startTime)
    if (!start) return null
    const t = start.getTime()
    return busy.filter((b) => {
      const bs = new Date(b.start).getTime()
      const be = new Date(b.end).getTime()
      return bs <= t && t < be
    }).length
  }, [busy, byDay, value.date, value.startTime])

  // ── มัดจำตั้งต้นจากคิวงาน (BR-RSV-46/47) — ผู้ใช้แก้ทับได้ ──
  const suggestedDeposit = useMemo(() => {
    if (!selected) return 0
    const v = Number(selected.depositValue) || 0
    if (v <= 0) return 0
    const raw = selected.depositMode === 'PERCENT' ? (total * v) / 100 : v
    return Math.min(Math.round(raw * 100) / 100, total)
  }, [selected, total])

  // เลือกคิวงานใหม่ → เติมค่าตั้งต้นให้ครบ แล้วเปิดโอกาส auto-fill เวลาสิ้นสุดอีกครั้ง
  useEffect(() => {
    if (!value.resourceId) return
    endTouched.current = false
    if (!value.date) setValue('appointment.date', todayLocalDate())
    setValue('appointment.depositAmount', suggestedDeposit)
    // ตั้งใจ dep แค่ resourceId — ไม่ให้ยอดมัดจำถูกเขียนทับทุกครั้งที่ยอดรวมขยับ
    // (ผู้ใช้อาจแก้ยอดมัดจำเองไปแล้ว)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.resourceId])

  const past = useMemo(() => {
    if (!value.date) return false
    // โหมดรายวัน: นับว่าย้อนหลังเมื่อ "ทั้งวันนั้น" ผ่านไปแล้ว ไม่ใช่เทียบนาที
    if (byDay) return new Date(`${value.date}T00:00`).getTime() + 86_400_000 <= Date.now()
    const start = value.startTime ? combine(value.date, value.startTime) : null
    return start ? start.getTime() < Date.now() : false
  }, [byDay, value.date, value.startTime])

  const remaining = Math.max(0, total - Number(value.depositAmount ?? 0))

  if (resources.length === 0) return null

  const fields = (
    <div className="flex flex-col gap-4">
        {/* มีวันที่แล้วแต่ยังไม่เลือกคิวงาน = ออเดอร์นี้จะไม่มีนัดติดไป (BR-RSV-04)
            เกิดบ่อยสุดตอนมาจากปฏิทิน ซึ่งส่งมาแค่วันที่ ไม่รู้ว่าผู้ใช้ตั้งใจคิวงานไหน
            ต้องบอกให้รู้ ไม่ใช่ปล่อยให้บันทึกแล้วงงว่าทำไมปฏิทินยังว่าง
            ตั้งใจไม่บล็อกการบันทึก — แค่บอกผลที่จะตามมา (pattern เดียวกับกล่องเตือนวันย้อนหลัง) */}
        {value.date && !value.resourceId && (
          <div className="bg-warning/10 border-warning/30 rounded-lg border p-3">
            <p className="text-default-800 text-sm font-medium">ยังไม่ได้เลือกคิวงาน</p>
            <p className="text-default-600 mt-1 text-sm">
              เลือกคิวงานด้านล่างก่อน ไม่งั้นออเดอร์นี้จะถูกบันทึกเป็นออเดอร์ปกติที่ไม่มีวันนัด
            </p>
          </div>
        )}

        {/* คิวงาน — การ์ดจิ้มได้แทน form-select (user สั่ง 2026-08-07: "อยากให้เป็น Card
            รายการที่เข้านัดได้ จะได้จิ้มง่าย ๆ และเมื่อจิ้มแล้วก็ให้ auto open modal ปฏิทินเลย")
            Base (ภาษาการออกแบบ): ./ProductGrid.tsx — การ์ด role=button + ring-2 ring-primary
              เมื่อถูกเลือก; และ dashboard/components/BestSellerStrip.tsx สำหรับ idiom
              "เหลือรายการเดียว = เต็มแถว ไม่ใช่การ์ดแคบลอยมุมซ้าย"

            ยกมาแค่ *ภาษาการออกแบบ* ไม่ใช่ทรง: ตัดรูป/ราคา/badge สต็อกทิ้งทั้งหมด เพราะ
            ServiceResourceOption ไม่มี field รูปให้แสดง (การ์ดที่มีกล่องรูปเทาว่างคือบทเรียน
            ที่ BestSellerStrip บันทึกไว้แล้ว) และ **ไม่ทำเป็นแถบเลื่อนแนวนอนแบบ BestSellerStrip**
            เพราะอันนั้นเป็น carousel โปรโมชัน แต่อันนี้เป็นฟิลด์ฟอร์ม — ซ่อนคิวงานไว้นอกจอ
            แล้วผู้ขายอาจไม่รู้ว่ามีช่างคนอื่นว่างอยู่

            grid-cols-2 คงที่ ห้ามผูก viewport breakpoint: บล็อกนี้ mount พร้อมกัน 2 ใบ
            (QuickForm มือถือ / CartPanel accordion เดสก์ท็อป ~400px) sm:/md: จะทำให้ใบใน
            accordion แคบแตกคอลัมน์ตามความกว้างจอ ไม่ใช่ตามความกว้างกล่องจริง */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span id={`${idPrefix}-appt-resource-label`} className="form-label mb-0">รับนัดโดย</span>
            {/* ทางออกจาก "ตั้งวันนัดแล้ว" กลับไป "ไม่ตั้งวันนัด" — แทน <option value=""> เดิม
                ที่หายไปพร้อม dropdown. ต้องเป็นปุ่มแยกที่อยู่ตำแหน่งเดิมเสมอ ไม่ใช่ให้จิ้ม
                การ์ดที่เลือกอยู่แล้วเพื่อ deselect เพราะ tap นั้นถูกใช้เปิดปฏิทินแก้วันไปแล้ว
                (tap เดียวทำ 2 อย่างตามสถานะ = เดาไม่ถูกว่าจะได้อะไร) */}
            {selected && (
              <button
                type="button"
                onClick={() => {
                  setPickedForSheet(null)
                  setValue('appointment.resourceId', undefined)
                  setValue('appointment.date', undefined)
                  setValue('appointment.startTime', undefined)
                  setValue('appointment.endTime', undefined)
                  setValue('appointment.depositAmount', null)
                }}
                className="btn btn-sm text-default-500 hover:text-danger"
              >
                <Icon icon="x" className="size-4" />
                ล้างวันนัด
              </button>
            )}
          </div>
          <Controller
            control={control}
            name="appointment.resourceId"
            render={({ field }) => (
              <div
                role="group"
                aria-labelledby={`${idPrefix}-appt-resource-label`}
                className={resources.length === 1 ? 'grid gap-2' : 'grid grid-cols-2 gap-2'}
              >
                {resources.map((r) => {
                  const active = field.value === r.id
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={active}
                      aria-label={
                        active
                          ? `${r.name} เลือกอยู่ แตะเพื่อแก้วันนัด`
                          : `เลือก ${r.name} รับพร้อมกัน ${r.capacity} คิว`
                      }
                      onClick={() => {
                        // จิ้มการ์ดที่เลือกอยู่แล้ว = เปิดปฏิทินแก้วัน (ไม่ deselect — ดูคอมเมนต์ปุ่มล้าง)
                        if (!active) field.onChange(r.id)
                        // จำตัวที่เพิ่งกดไว้ป้อนปฏิทิน ไม่รอ useWatch (ดูคอมเมนต์ pickedForSheet)
                        setPickedForSheet(r)
                        // เปิดปฏิทินทันทีในจังหวะเดียวกับที่เลือก ไม่รอ effect
                        // (user สั่ง: "เมื่อจิ้มแล้ว ก็ให้ auto open modal ปฏิทินเลย")
                        setDateSheetOpen(true)
                      }}
                      className={`flex min-h-16 items-center gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                        active
                          ? 'border-primary ring-primary bg-primary/5 ring-2'
                          : 'border-default-200 hover:border-default-300'
                      }`}
                    >
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                          active ? 'bg-primary/15 text-primary' : 'bg-default-100 text-default-500'
                        }`}
                      >
                        <Icon icon="users" className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-dark block truncate text-sm font-medium">{r.name}</span>
                        <span className="text-default-500 block text-xs">รับพร้อมกัน {r.capacity} คิว</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          />
        </div>

        {/* ฟิลด์ที่เหลือโผล่ต่อเมื่อเลือกคิวงานแล้ว — ไม่เลือก = ไม่ต้องเห็นอะไรเพิ่ม */}
        {selected && (
          <>
            <div>
              <label htmlFor={`${idPrefix}-appt-date`} className="form-label">วันที่นัด</label>
              {/* ปุ่มเปิดปฏิทินเต็มจอแทน <input type="date"> (user สั่ง 2026-08-07) — ช่องเดิม
                  บอกได้แค่ "วันนี้คือวันอะไร" ผู้ขายต้องเดาเองว่าวันไหนคิวว่างแล้วไปรู้ตอนกด
                  บันทึกไม่ผ่าน. ปฏิทินย้อมวันที่มีคิว/เต็มให้เห็นทั้งเดือนก่อนเลือก
                  ยังเป็นปุ่มไม่ใช่ input จริง — ค่าเก็บใน react-hook-form เหมือนเดิมทุกอย่าง */}
              <Controller
                control={control}
                name="appointment.date"
                render={({ field }) => (
                  <button
                    id={`${idPrefix}-appt-date`}
                    type="button"
                    onClick={() => setDateSheetOpen(true)}
                    className="form-input flex w-full items-center justify-between gap-2 text-start"
                  >
                    <span className={field.value ? 'text-dark' : 'text-default-400'}>
                      {field.value ? formatDateTH(`${field.value}T00:00`) : 'เลือกวันนัด'}
                    </span>
                    <Icon icon="calendar-event" className="size-4 shrink-0 text-default-400" />
                  </button>
                )}
              />
            </div>

            {/* คิวที่มีอยู่แล้วในวันนั้น — ช่วยให้เลือกเวลาได้โดยไม่ต้องเดา */}
            {!byDay && busy.length > 0 && (
              <div>
                <p className="text-default-500 mb-1.5 text-sm">คิวที่มีอยู่แล้ววันนี้</p>
                <div className="flex flex-wrap gap-1.5">
                  {busy.map((b, i) => (
                    <span key={`${b.start}-${i}`} className="badge bg-default-100 text-default-600">
                      {formatTimeHM(b.start)}–{formatTimeHM(b.end)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {!byDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${idPrefix}-appt-start`} className="form-label">เวลาเริ่ม</label>
                <Controller
                  control={control}
                  name="appointment.startTime"
                  render={({ field }) => (
                    <input
                      id={`${idPrefix}-appt-start`}
                      type="time"
                      className="form-input"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => {
                        field.onChange(e)
                        // auto-fill เวลาสิ้นสุดจากระยะเวลามาตรฐาน เว้นแต่ผู้ใช้พิมพ์เองไปแล้ว
                        if (
                          selected.durationMinutes &&
                          !endTouched.current &&
                          e.target.value
                        ) {
                          setValue(
                            'appointment.endTime',
                            addMinutes(e.target.value, selected.durationMinutes),
                          )
                        }
                      }}
                    />
                  )}
                />
              </div>
              <div>
                <label htmlFor={`${idPrefix}-appt-end`} className="form-label">เวลาสิ้นสุด</label>
                <Controller
                  control={control}
                  name="appointment.endTime"
                  render={({ field }) => (
                    <input
                      id={`${idPrefix}-appt-end`}
                      type="time"
                      className="form-input"
                      min={value.startTime ?? undefined}
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => {
                        endTouched.current = true
                        field.onChange(e)
                      }}
                    />
                  )}
                />
              </div>
            </div>
            )}
            {errors.appointment?.endTime && (
              <p className="text-danger text-sm">{errors.appointment.endTime.message}</p>
            )}

            {/* ตัวเลขคิวสด — แสดงผลอย่างเดียว ไม่บล็อกการบันทึก */}
            {(byDay ? !!value.date : !!value.startTime) && (
              <div className="text-sm">
                {loadingBusy ? (
                  <span className="text-default-400 inline-flex items-center gap-1.5">
                    <Icon icon="tabler:loader-2" className="size-4 animate-spin" />
                    กำลังตรวจสอบคิว
                  </span>
                ) : busyFailed ? (
                  <span className="text-default-400">ตรวจสอบคิวไม่สำเร็จ กรอกต่อได้ตามปกติ</span>
                ) : bookedNow !== null && bookedNow >= selected.capacity ? (
                  <span className="text-warning-ink">
                    เต็มแล้ว {bookedNow} จาก {selected.capacity} คิว {byDay ? 'ในวันนี้' : 'ในช่วงเวลานี้'} — เลือก{byDay ? 'วัน' : 'เวลา'}อื่นหรือบันทึกไว้ก่อนก็ได้ ระบบจะแจ้งถ้าจองไม่ได้จริง
                  </span>
                ) : bookedNow !== null ? (
                  <span className="text-info-ink">
                    จองแล้ว {bookedNow} จาก {selected.capacity} คิว {byDay ? 'ในวันนี้' : 'ในช่วงเวลานี้'}
                  </span>
                ) : null}
              </div>
            )}

            {/* นัดย้อนหลังทำได้ แต่ต้องเห็นคำเตือนก่อนบันทึก (FR-RSV-03) */}
            {past && (
              <div className="bg-warning/10 border-warning/30 rounded-lg border p-3">
                <p className="text-default-800 text-sm font-medium">{byDay ? 'วันนัดนี้ผ่านไปแล้ว' : 'เวลานัดนี้ผ่านไปแล้ว'}</p>
                <p className="text-default-600 mt-1 text-sm">
                  บันทึกได้ตามปกติถ้าตั้งใจบันทึกย้อนหลัง — ตรวจอีกครั้งก่อนบันทึก
                </p>
              </div>
            )}

            {/* ── มัดจำ (FR-RSV-12) ── */}
            <div>
              <label htmlFor={`${idPrefix}-appt-deposit`} className="form-label">มัดจำที่เก็บ</label>
              <div className="flex items-center gap-2">
                <Controller
                  control={control}
                  name="appointment.depositAmount"
                  render={({ field }) => (
                    <input
                      id={`${idPrefix}-appt-deposit`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      className="form-input"
                      {...field}
                      value={field.value ?? 0}
                    />
                  )}
                />
                <span className="text-default-500 shrink-0">บาท</span>
              </div>
              <p className="text-default-500 mt-1 text-sm">
                {Number(value.depositAmount ?? 0) > 0
                  ? `ลูกค้าจ่ายหน้างานอีก ฿${remaining.toLocaleString('th-TH')}`
                  : 'ไม่เก็บมัดจำ ลูกค้าจ่ายทั้งหมดหน้างาน'}
              </p>
            </div>
          </>
      )}

      {/* อยู่ใน fields เพื่อให้ render ทั้งสองทาง (การ์ด และ embedded ใน accordion ของ CartPanel)
          — ตัวชีตเป็น fixed inset-0 อยู่แล้ว ตำแหน่งใน DOM จึงไม่มีผลกับการวาง */}
      <AppointmentDateSheet
        open={dateSheetOpen}
        // sheetResource ไม่ใช่ selected — ค่าที่เพิ่งกดต้องชนะ useWatch ที่ยังตามไม่ทัน
        // ไม่งั้นปฏิทินเปิดมาโหลดความว่างของคิวงานตัวเก่า (ดูคอมเมนต์ pickedForSheet)
        resourceId={sheetResource?.id}
        resourceName={sheetResource?.name}
        // ความจุมาจาก resource ที่เลือกอยู่แล้วในฟอร์ม — sheet ไม่ต้องไปถาม API ซ้ำ
        resourceCapacity={sheetResource?.capacity}
        value={value.date}
        onSelect={(d) => setValue('appointment.date', d)}
        onClose={() => setDateSheetOpen(false)}
      />
    </div>
  )

  // embedded = อยู่ใน accordion ของ CartPanel ซึ่งมีหัวเรื่องของตัวเองแล้ว
  // ถ้าห่อการ์ดซ้ำจะกลายเป็นการ์ดซ้อนการ์ด (anti-slop) และดันความสูงแผงขวาจนปุ่มหลุดจอ
  if (variant === 'embedded') return <div className="px-4 pb-4">{fields}</div>

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">วันเข้าใช้บริการ</h4>
        <p className="text-default-500 mt-0.5 text-sm">ไม่บังคับ — ข้ามได้ถ้าลูกค้ายังไม่ระบุวัน</p>
      </div>
      <div className="card-body">{fields}</div>
    </div>
  )
}
