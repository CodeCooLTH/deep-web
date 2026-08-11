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
        : /* 🛑 วันที่ไม่มีงาน "จางลง" เพื่อให้วันที่มีงานเด่นขึ้นเอง (user 2026-08-11:
             "เน้นเด่น ๆ เฉพาะที่มีรายการ ส่วนวันไหนไม่มีก็จาง ๆ จะได้ focus สายตา")
             ต้นเหตุที่กวาดตาแล้วหาไม่เจอ ไม่ใช่ "จุดเล็กไป" แต่คือ 28 ช่องที่ไม่มีงาน
             ดังเท่ากับ 3 ช่องที่มีงาน — แก้ที่พื้นหลังเสียง ไม่ใช่ที่ตัวสัญญาณ

             🛑 ห้ามเปลี่ยนเป็น opacity ต่ำ ๆ: การกดวันว่างเพื่อจองงานใหม่ยังเป็นงานปกติ
             text-default-400 (#627189) บนพื้นการ์ด = 4.96:1 ผ่านเกณฑ์ข้อความ 4.5:1
             ส่วน opacity-55 แบบที่ isOther ใช้ = ~2.4:1 ซึ่งยอมได้เพราะช่องนั้นกดไม่ได้เลย

             ต้องเป็น 3 ระดับ ไม่ใช่ 2 (มีงาน / ว่างในเดือนนี้ / เดือนอื่น) ไม่งั้นวันว่าง
             กับวันของเดือนข้างเคียงจะดูเหมือนกัน แล้วขอบเขตของเดือนหายไปทั้งตาราง
             — isToday ไม่ถูกหรี่ตาม เพราะเป็นจุดอ้างอิงของทั้งปฏิทินและมีวงแหวนเป็นตัวบอกอยู่แล้ว

             ไม่เขียน font-semibold ตรงนี้: น้ำหนักคุมที่ span เลขวันด้านล่าง เพราะค่าที่ประกาศ
             บน element ชนะค่าที่สืบทอดมาจากแม่เสมอ — เขียนที่นี่จะกลายเป็นคำสั่งลวงที่ไม่มีผล */
          used > 0
          ? 'text-default-900 hover:bg-default-100'
          : 'text-default-400 hover:bg-default-100'

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
          {/* ป้าย "เต็ม" ในตัวช่องเอง — จำเป็นตั้งแต่ถอดแถว legend ออก (2026-08-11)
              กากบาทลอย ๆ ไม่มีคำอธิบายอยู่ที่ไหนบนจอแล้ว ผู้ใช้ครั้งแรกเดาความหมายไม่ออก
              🛑 ทำไม "เต็ม" มีป้ายแต่ "มีงาน" ไม่มี — ไม่สมมาตรโดยตั้งใจ: เต็ม = บล็อกการกระทำ
              (จองวันนั้นไม่ได้) ตีความผิดแล้วเสียงาน ส่วน "มีงาน" เป็นแค่สัญญาณให้กวาดตา
              พื้นที่พอ: ไอคอน 20 + gap 4 + ตัวอักษร 11 = 35px ในช่องสูง 46px */}
          <span
            className={`text-2xs leading-none ${selected ? 'text-white' : 'text-danger'}`}
            aria-hidden="true"
          >
            เต็ม
          </span>
        </>
      ) : (
        <>
          {/* 🛑 น้ำหนักต้องประกาศตรงที่ span นี้ ไม่ใช่ปล่อยให้สืบทอดจาก `tone` ที่ div แม่ —
              ค่าที่ประกาศบน element ชนะค่าที่สืบทอดเสมอ เขียน font-semibold ไว้ที่แม่จะเป็น
              dead code เงียบ ๆ (เลขวันหนาเท่าเดิม) โดยไม่มี gate ไหนฟ้อง
              used > 0 → หนาขึ้นคู่กับสีที่เข้มขึ้น = "วันนี้มีงาน" อ่านออกตั้งแต่กวาดตา */}
          <span
            className={`text-sm leading-none ${selected || used > 0 ? 'font-semibold' : 'font-medium'}`}
          >
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
