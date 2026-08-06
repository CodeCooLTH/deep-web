/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(reports)/sales/page.tsx
 *
 * Client component สำหรับ date-range picker — แยกออกมาเพื่อให้ page.tsx เป็น RSC ได้.
 * Flatpickr เก็บไว้เพราะมัน drive real date filtering ผ่าน ?from=&to= searchParams
 * (ไม่ใช่ decoration — ถ้าตัดออกจะไม่มีทางเลือก date range).
 * Date ที่ส่งออกเป็น ISO YYYY-MM-DD เสมอ (ตาม Date→ISO boundary rule).
 */
'use client'

import Flatpickr from '@/components/wrappers/Flatpickr'
import Icon from '@/components/wrappers/Icon'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'
import { thaiDayKey } from '@/lib/format-date'

type Props = {
  from: string // YYYY-MM-DD
  to: string   // YYYY-MM-DD
}

const SalesDateRange = ({ from, to }: Props) => {
  const router = useRouter()
  const defaultDate = [from, to]

  const handleChange = (selectedDates: Date[]) => {
    if (selectedDates.length === 2) {
      // ใช้ thaiDayKey แทน toISOString().slice(0,10) — Flatpickr คืน Date เที่ยงคืนตาม local time
      // ของเบราว์เซอร์ผู้ขาย (เวลาไทย) ถ้าแปลงผ่าน UTC จะตกไปเป็นวันก่อนหน้า
      const f = thaiDayKey(selectedDates[0])
      const t = thaiDayKey(selectedDates[1])
      router.push(`?from=${f}&to=${t}`)
    }
  }

  return (
    <div className="input-icon-group">
      <Icon icon="calendar" className="input-icon" />
      <Flatpickr
        className="form-input"
        style={{ minWidth: 240 }}
        options={{
          dateFormat: 'd M, Y',
          mode: 'range',
          defaultDate,
        }}
        onChange={handleChange}
      />
    </div>
  )
}

export default SalesDateRange
