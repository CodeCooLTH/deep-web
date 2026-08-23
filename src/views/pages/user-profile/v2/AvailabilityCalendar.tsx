'use client'

/**
 * AvailabilityCalendar — แท็บ "ปฏิทิน" ของร้านที่พัก (Shop.vertical = LODGING)
 *
 * ทำไมเขียนใหม่ไม่ reuse BookingCalendar ของผู้ขาย: ตัวนั้นอยู่ฝั่ง Paces และแสดงรายละเอียด
 * การจองรายใบ (ชื่อผู้จอง สถานะ) ซึ่งเป็นข้อมูลที่ห้ามให้คนนอกเห็น หน้าสาธารณะต้องบอกแค่
 * "วันไหนยังจองได้" เท่านั้น ไม่บอกว่าใครจอง จองกี่ห้อง หรือจองเมื่อไหร่
 *
 * แสดงเป็นเดือน เลื่อนเดือนได้ในช่วงที่ server ส่งข้อมูลมาให้ ไม่ให้เลื่อนย้อนอดีตเพราะไม่มี
 * ประโยชน์กับคนที่กำลังจะจอง
 *
 * วันที่ผ่านไปแล้วแสดงเป็นสีจาง ไม่ใช่สีเดียวกับวันเต็ม เพราะสองอย่างนี้คนละความหมาย
 * (จองไม่ได้เพราะเลยมาแล้ว กับ จองไม่ได้เพราะมีคนจองไปแล้ว)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/@core (grid + typography scale)
 *   วาด grid เองเพราะ FullCalendar ของธีมหนักเกินความจำเป็นสำหรับ read-only view
 */
import { useState } from 'react'

import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'

import { Icon } from '@iconify/react'

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const MONTHS_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

export type AvailabilityData = {
  totalRooms: number
  /** 'YYYY-MM-01' ของเดือนแรกที่มีข้อมูล */
  startIso: string
  months: number
  /** 'YYYY-MM-DD' ของวันที่ห้องเต็มทุกห้อง */
  fullDates: string[]
}

export default function AvailabilityCalendar({ data }: { data: AvailabilityData }) {
  const [offset, setOffset] = useState(0)
  const full = new Set(data.fullDates)

  const [startY, startM] = data.startIso.split('-').map(Number)
  // เดือนที่กำลังแสดง — คิดใน UTC ให้ตรงกับ key ที่ server สร้าง (checkIn/checkOut เป็น @db.Date)
  const cursor = new Date(Date.UTC(startY, startM - 1 + offset, 1))
  const year = cursor.getUTCFullYear()
  const month = cursor.getUTCMonth()

  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const todayIso = new Date().toISOString().slice(0, 10)

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    /* กรอบการ์ดชุดเดียวกับ `.info-box` ของไฟล์อ้างอิง (ขอบ #ececf2 · มุมมน 14 (ปรับจาก 15 ให้เท่าการ์ดอื่นทั้งหน้า · user เคาะ 2026-08-23) · padding 17)
       — ปฏิทินเคยเป็นบล็อกลอยไม่มีขอบ ซึ่งพอทุกอย่างรอบตัวกลายเป็นการ์ดหมดแล้ว มันจะอ่านเป็น
       "ของที่หลุดออกมา" · ไฟล์อ้างอิงไม่มีหน้าห้องพัก จึงยกภาษาการออกแบบมาใช้แทนการลอก */
    <div className='rounded-[14px] border border-[#ececf2] p-4'>
      <div className='flex items-center justify-between mbe-3'>
        <IconButton size='small' disabled={offset === 0} onClick={() => setOffset((o) => o - 1)} aria-label='เดือนก่อนหน้า'>
          <Icon icon='lucide:chevron-left' width={18} />
        </IconButton>
        <Typography className='font-semibold'>
          {`${MONTHS_TH[month]} ${year + 543}`}
        </Typography>
        <IconButton
          size='small'
          disabled={offset >= data.months - 1}
          onClick={() => setOffset((o) => o + 1)}
          aria-label='เดือนถัดไป'
        >
          <Icon icon='lucide:chevron-right' width={18} />
        </IconButton>
      </div>

      <div className='grid grid-cols-7 gap-1 mbe-1'>
        {WEEKDAYS.map((w) => (
          <Typography key={w} variant='caption' color='text.disabled' className='text-center'>
            {w}
          </Typography>
        ))}
      </div>

      <div className='grid grid-cols-7 gap-1'>
        {cells.map((day, i) => {
          if (day == null) return <div key={`pad-${i}`} />
          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isPast = iso < todayIso
          const isFull = full.has(iso)

          return (
            <div
              key={iso}
              className={`aspect-square rounded-lg flex items-center justify-center text-[13px] tabular-nums ${
                isPast
                  ? 'text-[var(--mui-palette-text-disabled)] opacity-45'
                  : isFull
                    ? 'bg-error/10 text-error font-semibold line-through'
                    : 'bg-success/10 text-success font-semibold'
              }`}
              title={isPast ? 'ผ่านมาแล้ว' : isFull ? 'เต็ม' : 'ยังจองได้'}
            >
              {day}
            </div>
          )
        })}
      </div>

      <div className='flex items-center gap-4 mbs-4 flex-wrap'>
        <span className='flex items-center gap-1.5'>
          <span className='is-3 bs-3 rounded bg-success/25' />
          <Typography variant='caption' color='text.secondary'>ยังจองได้</Typography>
        </span>
        <span className='flex items-center gap-1.5'>
          <span className='is-3 bs-3 rounded bg-error/25' />
          <Typography variant='caption' color='text.secondary'>เต็ม</Typography>
        </span>
      </div>

      <Typography variant='caption' color='text.disabled' className='block mbs-3'>
        ปฏิทินแสดงเฉพาะวันที่ยังจองได้ ไม่แสดงข้อมูลผู้จอง
      </Typography>
    </div>
  )
}
