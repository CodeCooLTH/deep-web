'use client'

/**
 * QueuesCalendarSwitch — เลือก **mount ตัวเดียว** ระหว่างปฏิทินเดสก์ท็อปกับบอร์ดมือถือ
 *
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerCardSkeleton.tsx (โครง bg-default-300
 *   animate-pulse ในกล่อง .card) — ใช้เป็นที่กันเลย์เอาต์กระโดดระหว่างตัดสินความกว้าง
 *
 * 🛑 ทำไมต้องมีไฟล์นี้แทนการเขียน `lg:hidden` / `hidden lg:block` คู่กันในหน้า:
 *   `hidden` = `display:none` **ไม่ใช่ "ไม่ render"** — React ยัง mount ทั้งสองตัว effect ทุกตัว
 *   ยังทำงานครบ ผลที่วัดได้จริงบนมือถือคือ
 *     1. ยิง `GET /api/shops/current/appointments` **2 ครั้ง** ต่อการเปิดหน้า (ดีดัพไม่ได้ด้วย
 *        เพราะสองตัวตั้ง `firstDay` ต่างกัน ช่วง from/to จึงไม่เท่ากัน)
 *     2. โหลด `@fullcalendar/timegrid` + `list` ที่มือถือไม่ได้ใช้เลย
 *     3. **toast ผีตอนเน็ตล้ม** — บอร์ดตั้งใจไม่ยิง toast (มีบล็อก error พร้อมปุ่มลองใหม่แทน)
 *        แต่ปฏิทินเดสก์ท็อปที่ซ่อนอยู่ยิง `pacesToast.error` ออกมา ผู้ใช้จึงได้ทั้งสองอย่าง
 *        ซึ่งเป็นสิ่งที่คอมเมนต์ในบอร์ดเขียนไว้เองว่าจะเลี่ยง
 *   (พบโดย impeccable audit 2026-08-11 — ไม่มี gate ไหนของโปรเจกต์มองเห็นคลาสนี้)
 *
 * เส้นสลับคือ `lg` (1024) เส้นเดียวกับ seller shell ทั้งตัว — ห้ามใช้เลขอื่น
 */

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import AppointmentMonthBoard, {
  type ResourceOption,
} from '@/components/safepay/appointment-board/AppointmentMonthBoard'

/**
 * ปฏิทินเดสก์ท็อปโหลดแบบ dynamic + `ssr:false` — มือถือจะไม่ดึง chunk นี้เลย
 * (นี่คือส่วนที่ตัด timegrid/list ออกจาก bundle ของเครื่องที่ไม่ได้ใช้)
 */
const AppointmentCalendar = dynamic(() => import('./AppointmentCalendar'), {
  ssr: false,
  loading: () => <CalendarSkeleton />,
})

/** กันเลย์เอาต์กระโดด — สูงใกล้เคียงปฏิทินเดือนจริง (แถบเดือน + 6 แถว) */
function CalendarSkeleton() {
  return (
    <div className="card" aria-hidden="true">
      <div className="card-body">
        <div className="bg-default-300 mx-auto mb-4 h-5 w-40 animate-pulse rounded motion-reduce:animate-none" />
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 42 }).map((_, i) => (
            <div
              key={i}
              className="bg-default-300 h-10 animate-pulse rounded motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

type Props = {
  resources: ResourceOption[]
  byDay: boolean
  createLabelShort: string
}

export default function QueuesCalendarSwitch({ resources, byDay, createLabelShort }: Props) {
  /**
   * null = ยังไม่รู้ความกว้าง (เฟรมแรก/SSR) — ต้องเป็นสามสถานะ ไม่ใช่ boolean ที่เดาว่า false
   * ไม่งั้นเดสก์ท็อปจะ mount บอร์ดมือถือหนึ่งเฟรมแล้วสลับ ซึ่งยิง API ทิ้งไปหนึ่งครั้งพอดี
   * (คือบั๊กเดียวกับที่ไฟล์นี้มีไว้แก้)
   */
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const apply = () => setIsDesktop(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  if (isDesktop === null) return <CalendarSkeleton />

  return isDesktop ? (
    <AppointmentCalendar resources={resources} createLabelShort={createLabelShort} />
  ) : (
    <AppointmentMonthBoard
      resources={resources}
      byDay={byDay}
      createLabelShort={createLabelShort}
    />
  )
}
