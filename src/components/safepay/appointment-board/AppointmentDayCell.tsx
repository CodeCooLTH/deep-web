'use client'

/**
 * AppointmentDayCell — เนื้อในช่อง "หนึ่งวัน" ของปฏิทินนัดหมาย (ใช้เป็น dayCellContent ของ FullCalendar)
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/new/components/AppointmentDateSheet.tsx
 *   (dayCellContent เดิม — ยกมาทั้งก้อน ไม่ได้ออกแบบใหม่)
 *
 * ทำไมต้องแยกไฟล์: ช่องวันนี้มีกติกาที่สะสมมาหลายรอบและพังมาแล้วหลายแบบ — 3 สถานะต้องแยกกัน
 * ด้วย **รูปร่าง** ไม่ใช่สีอย่างเดียว (คนตาบอดสี) · เลขวันต้องอยู่ใน DOM เสมอแม้ตอนวาดกากบาท
 * (ไม่งั้น screen reader ได้ยิน "กากบาท" เรียงกันทั้งเดือน) · ป้ายเสียงต้องเป็น พ.ศ. ผ่าน
 * format-date · ช่องเดือนข้างเคียงห้ามรับโฟกัส. ถ้าปล่อยให้แต่ละจอก็อปไปเอง กติกาชุดนี้จะหาย
 * ไปทีละข้อโดยไม่มีอะไรฟ้อง (tsc/build/theme-guard มองไม่เห็น a11y เลยสักตัว)
 *
 * IMPORTANT: ต้องอยู่คู่กับสโคป CSS `.appt-date-sheet` ของฝั่งผู้เรียก ซึ่งรื้อทรงตารางของ
 * FullCalendar ออก (เส้นขอบทุกช่อง / แถวสูงไม่จำกัด / เลขวันชิดขวาบน) — ดู
 * src/assets/css/plugins/_calendar.css · ขาดคลาสนั้นเมื่อไหร่ ปฏิทินกลับเป็นตารางดิบทันที
 */

import Icon from '@/components/wrappers/Icon'
import { formatDateTH } from '@/lib/format-date'

export type AppointmentDayCellProps = {
  date: Date
  dayNumberText: string
  /** วันของเดือนข้างเคียง (FullCalendar `arg.isOther`) */
  isOther: boolean
  isToday: boolean
  /** จำนวนนัดที่คาบเกี่ยววันนี้ */
  used: number
  /**
   * ความจุที่ใช้บอก "เต็ม" — null/0 = ร้านไม่ได้ตั้ง จึงไม่มีคำว่าเต็ม
   *
   * ตัวหารนี้พูดได้เฉพาะโหมดรายวัน: โหมดระบุช่วงเวลาเอาจำนวนนัดทั้งวันมาหารด้วยความจุไม่ได้
   * (ร้านรับพร้อมกัน 2 คิว ที่มีนัดสั้น ๆ 8 นัดกระจายทั้งวัน ยังว่างอีกเยอะ)
   */
  capacity: number | null
  /** ร้านรับนัดแบบรายวัน (granularity DAY) — ตัวตัดสินว่าจะพูดเรื่อง "เต็ม" ไหม */
  byDay: boolean
  /** เต็มหรือยัง — **ต้องรับมาจากผู้เรียก** ห้ามคำนวณเองซ้ำ (ผู้เรียกใช้เกณฑ์เดียวกับปุ่มยืนยัน) */
  full: boolean
  /** วันที่กำลังดูอยู่ */
  selected: boolean
  /** ทางเข้าคีย์บอร์ด — ไม่ส่ง = ช่องยังกดด้วยเมาส์ได้ผ่าน dateClick แต่ไม่รับโฟกัส */
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void
}

export default function AppointmentDayCell({
  date,
  dayNumberText,
  isOther,
  isToday,
  used,
  capacity,
  byDay,
  full,
  selected,
  onKeyDown,
}: AppointmentDayCellProps) {
  const tone = selected
    ? 'bg-primary text-white'
    : isOther
      ? 'text-default-400 opacity-55'
      : isToday
        /* border-default-400 ไม่ใช่ -300 — วงแหวน "วันนี้" เป็นตัวบอกเดียวว่าช่องไหนคือวันนี้
           (ไม่มีข้อความ/ไอคอนสำรอง และ --fc-today-bg-color ถูกตั้งเป็น transparent) แต่
           default-300 บนพื้นการ์ดวัดได้ 1.22:1 ทั้งโหมดสว่างและมืด ต่ำกว่าเกณฑ์ non-text 3:1
           มาก · default-400 = เฉดเดิมที่เข้มขึ้น (ไม่ได้สลับเฉด — contrast-fix-keeps-hue.md) */
        ? 'text-default-800 border-default-400 hover:bg-default-100 border'
        : 'text-default-800 hover:bg-default-100'

  /**
   * ช่องของเดือนข้างเคียงไม่รับโฟกัส — ถ้าปล่อยให้ Tab ไปหยุดได้ จะกลายเป็นจุดที่กดแล้วไม่มี
   * อะไรเกิดขึ้น (WCAG 2.4.3) และเพิ่มจุดแวะให้คีย์บอร์ดอีก 7-14 จุดต่อเดือนโดยไม่ได้อะไรกลับมา
   */
  const pickable = !isOther

  const dayLabel = pickable
    ? [
        formatDateTH(date),
        full
          ? 'เต็มแล้ว'
          : used > 0
            ? byDay && capacity != null && capacity > 0
              ? `จองแล้ว ${used} จาก ${capacity} คิว`
              : `มี ${used} นัด`
            : 'ยังไม่มีคิว',
        isToday ? 'วันนี้' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined

  return (
    <div
      /* aria-pressed บอกว่า "วันนี้คือวันที่กำลังดูอยู่" ซึ่งเป็นสถานะสลับได้ ไม่ใช่การนำทาง
         ring-offset-1 จำเป็นเพราะช่องที่เลือกอยู่พื้นเป็น bg-primary — ring สีเดียวกันบนพื้น
         สีเดียวกันคือขอบโฟกัสที่มองไม่เห็น (WCAG 2.4.7) */
      role={pickable ? 'button' : undefined}
      tabIndex={pickable && onKeyDown ? 0 : undefined}
      aria-pressed={pickable ? selected : undefined}
      aria-label={dayLabel}
      onKeyDown={pickable ? onKeyDown : undefined}
      className={`flex min-h-11.5 w-full flex-col items-center justify-center gap-1 rounded-lg focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none @3xl:min-h-13 ${tone}`}
    >
      {full ? (
        <>
          <span className="sr-only">{dayNumberText} เต็ม</span>
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
            {dayNumberText}
          </span>
          {/* จุดว่างโปร่งใสยังต้องอยู่ ไม่งั้นเลขวันของช่องที่มีคิวกับไม่มีคิวจะไม่ตรงแนวกัน */}
          <span
            /* จุดนี้คือ *ทั้งหมด* ของสิ่งที่ปฏิทินบอกว่า "วันนี้มีนัด" — bg-warning บนพื้นการ์ด
               วัดได้ 1.66:1 (เกณฑ์ non-text 3:1) คือให้ของที่เล็กที่สุดบนจอแบกข้อมูลสำคัญที่สุด
               ใช้ warning-ink (เฉดเดิมที่เข้มขึ้น = 8.94:1) + ขยายเป็น 8px ชดเชยพื้นที่
               บนช่องที่เลือกอยู่ (พื้น primary) ยังเป็นขาวเหมือนเดิม */
            className={`size-2 rounded-full ${
              used > 0 ? (selected ? 'bg-white' : 'bg-warning-ink') : 'bg-transparent'
            }`}
            aria-hidden="true"
          />
        </>
      )}
    </div>
  )
}
