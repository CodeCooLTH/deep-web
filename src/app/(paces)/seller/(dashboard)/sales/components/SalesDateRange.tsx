/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(reports)/sales/page.tsx
 *
 * ตัวกรองช่วงเวลาของหน้า /sales — ขับด้วย URL (`?range=` + `start`/`end`) ให้ RSC ดึงข้อมูลใหม่
 * UI มาจาก DateRangeControl ตัวเดียวกับแท็บค่าใช้จ่าย
 *
 * 🛑 แก้ 2026-10-01 — ของเดิม `router.push('?from=..&to=..')` สร้าง query ใหม่ทั้งก้อน
 * ⇒ `?tab=` และพารามิเตอร์อื่นหายทุกครั้งที่เลือกวัน · ตอนนี้ seed จาก searchParams ปัจจุบันเสมอ
 * และลบ `from`/`to` (รูปแบบเก่า) ทิ้ง ไม่ให้สองชุดค้างขัดกันใน URL
 */
'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { DateRangePreset } from '@/lib/date-range'
import DateRangeControl from '../../_shared/DateRangeControl'

type Props = {
  range: DateRangePreset
  customDates: [string, string] | null
  /** ชื่อกลุ่มปุ่มสำหรับ screen reader (ไม่ส่ง = "ช่วงเวลา" ตามเดิม) */
  ariaLabel?: string
}

const SalesDateRange = ({ range, customDates, ariaLabel }: Props) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  // กด "กำหนดเอง" ยังไม่ต้องยิงหน้าใหม่ — รอเลือกวันครบสองวันก่อน (แค่เปิดปฏิทินขึ้นมา)
  const [localRange, setLocalRange] = useState<DateRangePreset>(range)
  // URL เปลี่ยนจากทางอื่น (ปุ่ม back / ลิงก์) → ตามค่าใน URL (แพตเทิร์น "เก็บ prop ก่อนหน้า" ของ React
  // แทน useEffect+setState ซึ่งทำให้ render สองรอบและโดน react-hooks/set-state-in-effect)
  const [prevRange, setPrevRange] = useState<DateRangePreset>(range)
  if (range !== prevRange) {
    setPrevRange(range)
    setLocalRange(range)
  }

  const go = (next: DateRangePreset, dates: [string, string] | null) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('from')
    params.delete('to')
    params.set('range', next)
    if (next === 'custom' && dates) {
      params.set('start', dates[0])
      params.set('end', dates[1])
    } else {
      params.delete('start')
      params.delete('end')
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  return (
    <DateRangeControl
      range={localRange}
      customDates={customDates}
      pending={pending}
      ariaLabel={ariaLabel}
      onRangeChange={(next) => {
        setLocalRange(next)
        if (next !== 'custom') go(next, null)
      }}
      onCustomChange={(dates) => {
        setLocalRange('custom')
        go('custom', dates)
      }}
    />
  )
}

export default SalesDateRange
