'use client'

/**
 * AppointmentMonthBoard — "ปฏิทินเดือน + รายการนัดของวันที่จิ้ม" แบบดูอย่างเดียว
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/new/components/AppointmentDateSheet.tsx
 *   (แถบเดือน + legend + ปฏิทิน + หัวรายการ + empty state — ยกทรงมาทั้งชุด ตัดขั้นเลือกเวลา
 *   กับปุ่มยืนยันออก) · ช่องวันและแถวรายการใช้ component ตัวเดียวกับชีตจริง ๆ ไม่ได้ก็อป
 * Base (การ์ด + ดรอปดาวน์เลือกคิว): src/app/(paces)/seller/(dashboard)/queues/components/AppointmentCalendar.tsx
 *
 * ใช้ที่: `/queues` บนมือถือ (<lg) — user สั่ง 2026-08-10 "เปิดหน้าคิวงานบน Mobile แสดงผล
 * เหมือนหน้านี้ (ชีตเลือกวันและเวลา) แต่ดูได้เฉย ๆ ก็ได้"
 *
 * ทำไมไม่ใช้ FullCalendar ชุดเดิมของ /queues บนมือถือ: ตารางเดือน 7 คอลัมน์ที่มีป้ายนัดอยู่ใน
 * ช่อง อ่านไม่ออกจริงบนจอ 390px (ป้ายถูกตัดเหลือ "ช่างสม") ของเดิมจึงสลับไป dayGridWeek ซึ่ง
 * เห็นทีละ 7 วันและยังไม่บอกภาพรวมเดือน — ทรง "ปฏิทินย่อ + รายการเต็มของวันที่จิ้ม" ให้ทั้ง
 * ภาพรวมและรายละเอียด และผู้ขายคุ้นอยู่แล้วเพราะเป็นจอเดียวกับตอนสร้างงาน
 *
 * IMPORTANT: หัวเรื่องเดือนวาดเอง ไม่ใช้ title ของ FullCalendar — FullCalendar แสดงปี ค.ศ.
 * ส่วนทั้งระบบต้องเป็น พ.ศ. ผ่าน src/lib/format-date.ts (docs/conventions/date-format.md)
 *
 * IMPORTANT: คำว่า "ที่นั่ง" (serviceSeat) เป็นกลไกภายใน ห้ามโผล่บนจอ — ผู้ใช้เห็นได้แค่
 * "จองแล้ว n จาก m คิว" (เหมือน AppointmentCalendar/AppointmentDateSheet)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import type { DatesSetArg } from '@fullcalendar/core'
import type { DateClickArg } from '@fullcalendar/interaction'
import Icon from '@/components/wrappers/Icon'
/* thaiDayKey = SSOT ของ "คีย์วันตามเวลาไทย" — ไฟล์นี้เคยประกาศ bangkokDayKey ของตัวเองซึ่งให้ผล
   เท่ากันเป๊ะแต่ **สร้าง Intl.DateTimeFormat ใหม่ทุกครั้งที่เรียก** (format-date.ts เขียนคอมเมนต์
   ไว้เองว่าการ construct formatter แพงกว่าการ format มาก จึง cache เป็น singleton) —
   ฟังก์ชันนี้ถูกเรียกต่อนัดต่อวันใน countByDay/dayItems ซึ่งรันใหม่ทุกครั้งที่จิ้มวัน (HR16) */
import { formatDateTH, formatMonthYearTH, formatWeekdayDateTH, thaiDayKey } from '@/lib/format-date'
import AppointmentDayCell from './AppointmentDayCell'
import AppointmentDayRows from './AppointmentDayRows'
import { localDateKey, type AppointmentBoardItem } from './types'

/** หัวคอลัมน์วัน — index = getDay() (0 = อาทิตย์ ตรงกับ firstDay={0} ของปฏิทิน) */
const DOW_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const DOW_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์']

const DAY_MS = 86_400_000

export type ResourceOption = { id: string; name: string; capacity: number }

type Props = {
  resources: ResourceOption[]
  /** ร้านรับนัดแบบรายวัน — ตัวตัดสินว่าจอนี้จะพูดคำว่า "เต็ม" ไหม (FR-RSV-13) */
  byDay: boolean
  /**
   * คำเรียกการสร้างรายการของร้านนี้ — มาจาก `ORDER_VOCAB` ผ่าน RSC (HR16)
   *
   * 🛑 ห้าม hardcode "สร้างงาน"/"จองคิว" ที่นี่: การกระทำเดียวกันในหน้าเดียวกันเคยมีสามคำ
   * (บอร์ดมือถือ "สร้างงาน" · ปฏิทินเดสก์ท็อป "จองคิว" · SSOT "สร้างการเข้ารับบริการ")
   */
  createLabelShort: string
}

const ALL = ''

export default function AppointmentMonthBoard({ resources, byDay, createLabelShort }: Props) {
  const router = useRouter()
  const calRef = useRef<FullCalendar>(null)

  const [resourceId, setResourceId] = useState<string>(ALL)
  const [items, setItems] = useState<AppointmentBoardItem[]>([])
  const [loading, setLoading] = useState(false)
  /**
   * 🛑 ต้องแยก "โหลดล้ม" ออกจาก "ว่างจริง" — เดิมทั้งสองกรณีจบที่ `items = []` เหมือนกัน
   * แล้วครึ่งล่างขึ้น "ว่างทั้งวัน · ยังไม่มีใครจองคิวนี้" ในวันที่ลูกค้าจองไว้ 5 คิว
   * โดยสัญญาณเดียวที่บอกว่าล้มคือ toast ที่หายเองใน 3 วิ และไม่มีปุ่มลองใหม่
   * งานประจำวันของหน้านี้คือ "ดูว่าวันนี้มีใครเข้ามาบ้าง" — ตอบผิดครั้งเดียวคือเลิกเชื่อทั้งหน้า
   */
  const [loadError, setLoadError] = useState(false)
  /** โหลดรอบแรกจบหรือยัง — ก่อนจบห้ามพูดว่า "ว่าง" เพราะยังไม่รู้ */
  const [loaded, setLoaded] = useState(false)
  /** ตัวนับไว้สั่งโหลดซ้ำจากปุ่ม "ลองอีกครั้ง" (range/resourceId เท่าเดิมจึงต้องมี dep ตัวนี้) */
  const [reloadSeq, setReloadSeq] = useState(0)
  const [viewStart, setViewStart] = useState<Date | null>(null)
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  /** วันที่กำลังดูอยู่ — ตั้งต้นเป็นวันนี้ เพื่อไม่ให้ครึ่งล่างว่างเปล่าตั้งแต่เปิดหน้า */
  const [selectedKey, setSelectedKey] = useState<string>(() => localDateKey(new Date()))

  // ─── โหลดนัดของช่วงที่มองเห็น ──────────────────────────────────────────────
  useEffect(() => {
    if (!range) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setLoadError(false)
      /* 🛑 ต้องคืนเป็น "ยังไม่รู้" ทุกครั้งที่เปลี่ยนเดือน/เปลี่ยนคิว — เดิม `loaded` ตั้งเป็น true
         ครั้งเดียวแล้วไม่เคยกลับ ทำให้ระหว่างโหลดเดือนใหม่ ปฏิทินยังวาดจุดของ **เดือนก่อน**
         ทับอยู่และครึ่งล่างโชว์รายการเก่าเป็นของใหม่ · กรณีร้ายกว่าคือโหลดเดือนใหม่ล้ม แล้ว
         ครึ่งล่างขึ้น "โหลดไม่สำเร็จ" ขณะครึ่งบนยังโชว์จุดของเดือนเก่าอย่างมั่นใจ = จอเดียวขัดกันเอง */
      setLoaded(false)
      setItems([])
      try {
        const qs = new URLSearchParams({
          from: range.from,
          to: range.to,
          ...(resourceId ? { resourceId } : {}),
        })
        const res = await fetch(`/api/shops/current/appointments?${qs}`, { cache: 'no-store' })
        if (!res.ok) {
          // ไม่ยิง toast — บล็อก error ด้านล่างบอกครบกว่าและมีปุ่มลองใหม่ในตัว
          // สองอย่างโผล่พร้อมกันคือพูดเรื่องเดียวกันสองครั้งด้วยคนละคำ
          if (!cancelled) setLoadError(true)
          return
        }
        const json = (await res.json()) as { items: AppointmentBoardItem[] }
        if (!cancelled) {
          setItems(Array.isArray(json.items) ? json.items : [])
          setLoaded(true)
        }
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [range, resourceId, reloadSeq])

  const onDatesSet = useCallback((arg: DatesSetArg) => {
    setRange({ from: arg.start.toISOString(), to: arg.end.toISOString() })
    // ใช้กลางช่วงกันเดือนเพี้ยน — dayGridMonth คาบเกี่ยวปลายเดือนก่อนเสมอ
    setViewStart(new Date((arg.start.getTime() + arg.end.getTime()) / 2))
  }, [])

  /**
   * ความจุรวมของวันหนึ่ง = ผลรวม capacity ของคิวงานที่กำลังดูอยู่
   * กรองคิวเดียว → นับเฉพาะตัวนั้น (กติกาเดียวกับ AppointmentCalendar — user ตัดสิน 2026-07-31)
   */
  const totalCapacity = useMemo(
    () =>
      (resourceId ? resources.filter((r) => r.id === resourceId) : resources).reduce(
        (sum, r) => sum + r.capacity,
        0,
      ),
    [resources, resourceId],
  )

  /** จำนวนนัดต่อวัน — นัดข้ามวันนับเข้าทุกวันที่มันกิน (วันนั้นถือว่าคิวถูกใช้ไปแล้ว) */
  const countByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const it of items) {
      const start = new Date(it.start)
      const end = new Date(it.end)
      for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
        const k = thaiDayKey(new Date(t))
        map.set(k, (map.get(k) ?? 0) + 1)
        if (end.getTime() - t <= DAY_MS) break
      }
    }
    return map
  }, [items])

  /** นัดของวันที่จิ้มอยู่ เรียงตามเวลาเริ่ม */
  const dayItems = useMemo(
    () =>
      items
        .filter((it) => {
          const start = new Date(it.start)
          const end = new Date(it.end)
          for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
            if (thaiDayKey(new Date(t)) === selectedKey) return true
            if (end.getTime() - t <= DAY_MS) break
          }
          return false
        })
        .sort((a, b) => a.start.localeCompare(b.start)),
    [items, selectedKey],
  )

  /**
   * "เต็ม" มีความหมายเฉพาะโหมดรายวัน — โหมดระบุช่วงเวลาวัดความจุกันที่ "ช่วงที่ทับกัน"
   * ไม่ใช่จำนวนนัดทั้งวัน (ร้านรับพร้อมกัน 2 คิว ที่มีนัดสั้น ๆ 8 นัด ยังว่างอีกเยอะ)
   * เกณฑ์เดียวกับ AppointmentDateSheet.isFull
   */
  const isFull = useCallback(
    (key: string) => byDay && totalCapacity > 0 && (countByDay.get(key) ?? 0) >= totalCapacity,
    [byDay, totalCapacity, countByDay],
  )

  const onDateClick = useCallback((arg: DateClickArg) => {
    // ช่องของเดือนข้างเคียงไม่รับการเลือก — กดแล้วเดือนไม่เปลี่ยน จะกลายเป็นกดแล้วเงียบ
    if (arg.dayEl.classList.contains('fc-day-other')) return
    setSelectedKey(localDateKey(arg.date))
  }, [])

  const selectedCount = countByDay.get(selectedKey) ?? 0
  const selectedFull = isFull(selectedKey)
  const selectedDate = new Date(`${selectedKey}T00:00`)

  /**
   * สร้างงานของวันที่จิ้มอยู่ — ทางเข้าเดียวกับที่ปฏิทินเดิมมี (`/orders/new?appointmentDate=`)
   *
   * ย้ายจาก "ปุ่ม + ในช่องวัน" มาไว้ที่หัวรายการ: ช่องวันบนมือถือกว้าง ~48px การยัดปุ่มที่สอง
   * ลงไปข้างเลขวันได้ tap target ที่เล็กกว่าเกณฑ์และแย่งพื้นที่กับจุดบอกสถานะ — ที่หัวรายการ
   * ปุ่มมีที่พอจะมีข้อความกำกับด้วย ผู้ใช้จึงรู้ว่ามันจะสร้างของวันไหน
   */
  /**
   * 🛑 BR-RSV-18 — เลขความจุฝั่ง client **ห้ามกั้นการบันทึก** เป็นได้แค่คำเตือน
   *
   * เดิมที่นี่ `return` ทิ้งพร้อม toast เมื่อวันนั้น "เต็ม" ซึ่งขัดกฎที่ชีตพี่น้องประกาศไว้ตรงตัว
   * (AppointmentDateSheet: วันเต็มยังกดยืนยันได้) และเลขที่ใช้ตัดสินก็นับผิดหน่วยด้วย:
   *   - `countByDay` นับนัด **รวมทุกคิว** ส่วน `totalCapacity` เป็น **ผลรวมความจุทุกคิว**
   *     ร้าน 3 คิว × ความจุ 1 ที่มีนัด 3 ใบตกที่คิว A หมด จึงขึ้น "เต็ม" ทั้งที่ B/C ว่าง
   *   - `listAppointments` ตัดออกเฉพาะ CANCELLED → ใบที่ **ไม่มาตามนัด** ยังนับเป็นเต็ม
   *     ร้านคิวเดียวความจุ 1 จึงสร้างงานทดแทนในวันนั้นจากหน้านี้ไม่ได้เลย
   *
   * ตัวตัดสินจริงคือ EXCLUDE constraint ตอนบันทึก (allocateSeat วน seat ครอบ SAVEPOINT)
   * — ปล่อยให้ไปถึงตรงนั้น ส่วนสัญญาณเตือนที่ผู้ใช้เห็นคือกากบาทในช่องวันซึ่งวาดอยู่แล้ว
   * และคำว่า "จองแล้ว n จาก m คิว" ที่หัวรายการซึ่งเปลี่ยนเป็นสีเตือนเองเมื่อเต็ม
   */
  const onCreateForSelected = () => {
    router.push(`/orders/new?appointmentDate=${selectedKey}`)
  }

  return (
    <div className="card @container">
      {/* 🛑 ไม่มีหัวการ์ด "ปฏิทินคิว" — บนมือถือ SellerMobileHeader เขียนคำว่า "คิวงาน" อยู่แล้ว
          หัวการ์ดจึงเป็นหัวข้อที่สามซ้อนกันก่อนถึงปฏิทิน กินไปเกือบ 100px โดยไม่ได้บอกอะไรใหม่
          (user รายงาน 2026-08-11: "padding เยอะ ไม่เหมือนหน้าสร้างรายการ") — ชีตที่ผู้ใช้ยกมา
          เทียบก็ไม่มีชั้นนี้ ขึ้นแถบเดือนต่อจากหัวแผ่นเลย

          ดรอปดาวน์เลือกคิวยังต้องอยู่ (ร้านหลายคิวต้องดูแยกคิวได้บนเครื่องที่ใช้จริงทุกวัน)
          แต่ยืนเป็นแถวของตัวเองแทนการเป็นของแถมในหัวข้อ — และหายไปเลยเมื่อมีคิวเดียว
          เพราะดรอปดาวน์ที่มีตัวเลือกเดียวคือช่องว่างที่กดไม่ได้ */}
      {resources.length > 1 && (
        <div className="border-default-200 flex items-center gap-2 border-b border-dashed px-4 py-2.5">
          <select
            className="form-select w-full text-sm"
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
            aria-label="เลือกคิวงานที่จะดู"
          >
            <option value={ALL}>ทุกคิวงาน</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* แถบเดือน — วาดหัวเรื่อง พ.ศ. เอง (FullCalendar ให้ ค.ศ.)
          min-h-11/min-w-11 บนปุ่มไอคอน: `.btn.btn-icon` ของธีม = 37px ต่ำกว่าเกณฑ์ 44px
          ที่ PRODUCT.md ประกาศไว้ (WCAG 2.5.5) — ท่าเดียวกับ AppointmentDateSheet */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => calRef.current?.getApi().prev()}
          aria-label="เดือนก่อนหน้า"
          className="btn btn-icon text-default-800 hover:bg-default-100 min-h-11 min-w-11"
        >
          <Icon icon="chevron-left" className="size-4" />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <h4 className="text-dark truncate text-base font-semibold">
            {viewStart ? formatMonthYearTH(viewStart) : ''}
          </h4>
          {/* motion-reduce: กฎ blanket ใน safepay-overrides.css ย่นเวลา transition แต่ไม่ได้
              หยุด keyframe — ผู้ที่เปิด "ลดการเคลื่อนไหว" จะยังเจอวงหมุน (pattern เดียวกับ
              การ์ดคิวงานใน AppointmentBlock) */}
          {loading && (
            <Icon
              icon="loader-2"
              className="text-default-400 size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* กลาง ๆ ไม่ใช่ primary — น้ำเงินบนจอนี้สงวนไว้กับ "วันที่กำลังเลือก" (One Voice) */}
          <button
            type="button"
            onClick={() => {
              calRef.current?.getApi().today()
              setSelectedKey(localDateKey(new Date()))
            }}
            className="btn btn-sm border-default-300 text-default-800 hover:border-default-400 hover:bg-default-50 min-h-11 rounded-full border px-4"
          >
            วันนี้
          </button>
          <button
            type="button"
            onClick={() => calRef.current?.getApi().next()}
            aria-label="เดือนถัดไป"
            className="btn btn-icon text-default-800 hover:bg-default-100 min-h-11 min-w-11"
          >
            <Icon icon="chevron-right" className="size-4" />
          </button>
        </div>
      </div>

      {/* คำอธิบายสัญลักษณ์ — "ว่าง" ไม่ต้องมี swatch เพราะมันคือช่องที่ไม่มีอะไรเลย
          swatch ต้องเป็นสัญลักษณ์ตัวเดียวกับที่เห็นในช่องจริง ไม่งั้นเป็น legend ที่สอนผิด */}
      <div className="text-default-600 text-2xs flex shrink-0 items-center justify-center gap-4 px-4 pb-2">
        <span className="inline-flex items-center gap-1.5">
          {/* "นัด" ไม่ใช่ "คิว" — บรรทัดถัดกัน ("จองแล้ว n จาก m คิว") ใช้ คิว = ช่องความจุ
              ถ้าจุดนี้ก็เรียก "คิว" ผู้ขายจะเจอ "ทั้งวันมี 8 คิว" กับ "จองแล้ว 3 จาก 10 คิว"
              บนจอเดียวแล้วบวกกันไม่ลง · ไทล์ต้นทางบนหน้าแรกก็เรียกว่า "นัด" */}
          {/* swatch ต้องเป็นสัญลักษณ์เดียวกับที่เห็นในช่องจริงเป๊ะ ๆ (สี/ขนาด/รูปร่าง) —
              AppointmentDayCell เปลี่ยนจุดเป็น warning-ink 8px และวงแหวนเป็น default-400
              เพื่อผ่านเกณฑ์คอนทราสต์ non-text 3:1 legend จึงต้องตามไปด้วย ไม่งั้นกลายเป็น
              legend ที่สอนสัญลักษณ์ที่ไม่มีอยู่บนจอ */}
          <span className="bg-warning-ink size-2 rounded-full" aria-hidden="true" />
          มีนัดแล้ว
        </span>
        {byDay && (
          <span className="inline-flex items-center gap-1.5">
            <Icon icon="x" className="text-danger size-3.5" aria-hidden="true" />
            เต็ม
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          {/* rounded-sm ไม่ใช่ rounded-full — ช่อง "วันนี้" ในปฏิทินเป็นสี่เหลี่ยมมน (rounded-lg)
              swatch ที่เป็นวงกลมคือ legend ที่อธิบายสัญลักษณ์ที่ไม่มีอยู่จริงบนจอ
              (กฎนี้เขียนไว้เองในบล็อกนี้แล้ว แต่ตัวโค้ดยกมาจากชีตซึ่งผิดมาก่อน) */}
          <span className="border-default-400 size-2.5 rounded-sm border" aria-hidden="true" />
          วันนี้
        </span>
      </div>

      {/* appt-date-sheet = สโคป CSS ที่รื้อทรงตารางของ FullCalendar ออก (ดู _calendar.css)
          ขาดคลาสนี้เมื่อไหร่ ปฏิทินจะกลับไปเป็นตารางดิบทันที */}
      <div className="appt-date-sheet px-2 pb-2">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          height="auto"
          locale="th"
          firstDay={0}
          editable={false}
          selectable={false}
          datesSet={onDatesSet}
          dateClick={onDateClick}
          /* หัวคอลัมน์ย่อเมื่อกล่องแคบ — locale th ของ FullCalendar ให้ชื่อเต็มเสมอในมุมมองเดือน
             ซึ่งที่ 390px จะถูกยัดลงคอลัมน์ ~30px แล้วตัดเป็นตัวอักษรทีละตัว
             container query (@3xl) ไม่ใช่ md: เพราะการ์ดนี้ไม่ได้กว้างเท่าวิวพอร์ตเสมอไป */
          dayHeaderContent={(arg) => (
            <>
              <span className="@3xl:hidden">{DOW_SHORT[arg.date.getDay()]}</span>
              <span className="hidden @3xl:inline">{DOW_FULL[arg.date.getDay()]}</span>
            </>
          )}
          dayCellContent={(arg) => {
            const key = localDateKey(arg.date)
            return (
              <AppointmentDayCell
                date={arg.date}
                dayNumberText={arg.dayNumberText}
                isOther={arg.isOther}
                isToday={arg.isToday}
                used={countByDay.get(key) ?? 0}
                capacity={totalCapacity > 0 ? totalCapacity : null}
                byDay={byDay}
                full={isFull(key)}
                selected={selectedKey === key}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  setSelectedKey(key)
                }}
              />
            )
          }}
        />
      </div>

      {/* ── รายการนัดของวันที่จิ้มอยู่ ─────────────────────────────────────────
          พื้น bg-default-100 แยกครึ่งล่างออกจากปฏิทินด้วยพื้น ไม่ใช่ด้วยเส้นอย่างเดียว
          (ทรงเดียวกับชีต) · ไม่ cap ความสูง: หน้านี้เป็นหน้าเต็มที่เลื่อนได้อยู่แล้ว
          การ cap แล้วให้เลื่อนซ้อนในหน้าที่เลื่อนได้ = สองแกนเลื่อนทับกัน */}
      <div className="border-default-200 bg-default-100 flex flex-col border-t">
        {/* aria-live: การจิ้มวันเปลี่ยนแค่ "รายการข้างล่าง" ซึ่งอยู่คนละที่กับมือ/โฟกัส
            ผู้ใช้ screen reader จึงไม่มีทางรู้ผลของสิ่งที่เพิ่งทำ (WCAG 4.1.3) */}
        <div
          className="flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1 px-4 pt-3 pb-2"
          aria-live="polite"
          aria-atomic="true"
        >
          <h4 className="text-dark text-sm font-semibold">{formatWeekdayDateTH(selectedDate)}</h4>
          {/* ตัวหาร (capacity) พูดได้เฉพาะโหมดรายวัน — โหมดระบุช่วงเวลาเอาจำนวนนัดทั้งวันมา
              หารด้วยความจุไม่ได้ (จะได้ "จองแล้ว 8 จาก 2 คิว" ซึ่งอ่านไม่รู้เรื่อง) */}
          {byDay && totalCapacity > 0 ? (
            <span
              className={`ms-auto text-xs ${selectedFull ? 'text-warning-ink' : 'text-default-500'}`}
            >
              จองแล้ว {selectedCount} จาก {totalCapacity} คิว
            </span>
          ) : (
            selectedCount > 0 && (
              /* "ในวันนี้" อ่านได้ว่า today ทั้งที่หมายถึงวันที่จิ้มอยู่ — และจอนี้มีปุ่ม "วันนี้"
                 ที่แปลว่ากระโดดไปวันปัจจุบันอยู่ห่างไม่ถึงจอเดียว จึงขึ้นต้นด้วย "ทั้งวัน" */
              <span className="text-default-500 ms-auto text-xs">
                ทั้งวันมี {selectedCount} นัด
              </span>
            )
          )}
        </div>

        <div className="px-3 pb-3">
          {loadError ? (
            /* บล็อกค้างบนจอ ไม่ใช่ toast ที่หายเอง — และห้ามพูดว่า "ว่าง" เพราะเราไม่รู้ */
            <div className="border-danger/30 bg-danger/10 flex flex-col items-center gap-2 rounded-lg border px-6 py-6 text-center">
              <Icon icon="cloud-off" className="text-danger-ink size-6" aria-hidden="true" />
              {/* ชื่อต้องตรงกับหัวการ์ด ("ปฏิทินคิว") — ของสิ่งเดียวกันเคยมี 4 ชื่อบนจอเดียว */}
              <p className="text-default-800 text-sm font-semibold">โหลดปฏิทินคิวไม่สำเร็จ</p>
              {/* ไม่พูด "ลองอีกครั้ง" ซ้ำกับปุ่มที่อยู่ห่างลงไป 20px และเลี่ยง "วันนี้" กับ
                  น้ำเสียงแบบเอกสาร ("…หรือไม่") ที่ PRODUCT.md ตั้งเป็น anti-reference */}
              <p className="text-default-600 text-xs">ยังไม่รู้ว่าวันที่เลือกมีนัดกี่รายการ</p>
              <button
                type="button"
                onClick={() => setReloadSeq((n) => n + 1)}
                className="btn border-default-300 text-default-800 hover:bg-default-50 mt-1 min-h-11 rounded-full border px-4 text-sm"
              >
                ลองอีกครั้ง
              </button>
            </div>
          ) : !loaded ? (
            /* skeleton ไม่ใช่สปินเนอร์กลางเนื้อหา (operate.md) — และไม่ใช่ "ว่างทั้งวัน"
               ซึ่งเป็นคำตอบที่ผิดสำหรับคำถามเดียวที่หน้านี้มีอยู่เพื่อตอบ */
            <ul className="flex flex-col gap-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="bg-card flex items-start gap-3 rounded-lg p-3">
                  <span className="bg-default-200 block h-8 w-14 shrink-0 animate-pulse rounded motion-reduce:animate-none" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="bg-default-200 block h-3.5 w-2/5 animate-pulse rounded motion-reduce:animate-none" />
                    <span className="bg-default-200 block h-3 w-1/4 animate-pulse rounded motion-reduce:animate-none" />
                  </span>
                </li>
              ))}
            </ul>
          ) : dayItems.length === 0 ? (
            /* วันว่าง = ผลลัพธ์ที่ดีของจอนี้ (ยังรับงานได้) ไม่ใช่ความล้มเหลว — น้ำเสียงจึงไม่ใช่
               "ไม่พบข้อมูล" และไอคอนเป็นเทากลาง **ไม่ใช่เขียว** เพราะเขียวสงวนไว้กับสัญญาณ
               ความเชื่อใจที่ยืนยันแล้ว (Verified-Means-Green) ว่างไม่ใช่ trust signal */
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-6 text-center">
              <span className="bg-default-200 text-default-500 flex size-11 items-center justify-center rounded-full">
                <Icon icon="calendar-check" className="size-5" />
              </span>
              <p className="text-default-800 text-sm font-semibold">ว่างทั้งวัน</p>
              {/* 🛑 ห้ามใช้คำว่า "วันนี้" ที่นี่ — จอนี้มีปุ่ม "วันนี้" ที่แปลว่ากระโดดไปวัน
                  ปัจจุบัน และผู้ใช้จิ้มดูวันอื่นได้ (กฎนี้เขียนไว้เองที่ตัวนับข้างบนแล้ว)
                  หัวข้อวันที่อยู่เหนือขึ้นไปบอกวันอยู่แล้ว จึงไม่ต้องพูดซ้ำ
                  ชื่อคิวงานจริงดีกว่า "คิวนี้" และได้มาฟรีเพราะ resources เป็น prop อยู่แล้ว */}
              <p className="text-default-500 text-xs">
                {resourceId
                  ? `ยังไม่มีนัดของ ${resources.find((r) => r.id === resourceId)?.name ?? 'คิวงานนี้'}`
                  : 'ยังไม่มีนัดเข้ามา'}
              </p>
            </div>
          ) : (
            <AppointmentDayRows
              items={dayItems}
              // รวมทุกคิว = ต้องบอกว่าแถวไหนของคิวไหน · กรองคิวเดียวแล้วชื่อซ้ำทุกแถว = เสียงรบกวน
              showResourceName={!resourceId && resources.length > 1}
              onRowClick={(token) => router.push(`/orders/${token}`)}
            />
          )}
        </div>

        {/* ปุ่มสร้างงานของวันที่จิ้มอยู่ — ทางเข้าเดียวกับปุ่ม + ในช่องวันของปฏิทินเดิม
            เต็มความกว้างเพราะเป็น action เดียวของครึ่งล่าง และเป็นปุ่มทึบตัวเดียวในการ์ดนี้ */}
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={onCreateForSelected}
            /* `·` ถูก screen reader ข้ามเป็นความว่าง — ป้ายบนจอคงเดิม แต่ชื่อสำหรับ AT ต้องมี
               คำเชื่อมถึงจะรู้ว่าวันที่ต่อท้ายคืออะไร (ท่าเดียวกับที่ AppointmentDayRows ทำแล้ว) */
            aria-label={`${createLabelShort} สำหรับวันที่ ${formatDateTH(selectedDate)}`}
            className="btn bg-primary hover:bg-primary-hover min-h-11 w-full gap-1.5 text-white"
          >
            <Icon icon="plus" className="size-4" aria-hidden="true" />
            {createLabelShort} · {formatDateTH(selectedDate)}
          </button>
        </div>
      </div>
    </div>
  )
}
