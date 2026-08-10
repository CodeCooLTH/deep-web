'use client'

/**
 * PublicServiceList — แท็บ "บริการ" ของร้านประเภทสินค้าและบริการ (Shop.vertical = SERVICE_QUEUE, feat 00028)
 *
 * Base: src/views/pages/user-profile/v2/PublicRoomList.tsx (ทั้งไฟล์) — grid 2 คอลัมน์บนมือถือ,
 *   การ์ดไม่มีรูป: ServiceResource ไม่มี field รูปในสคีมา (ไม่ใช่ loading state แต่เป็นการออกแบบที่
 *   ตั้งใจว่าประเภทนี้ไม่มีรูป) กล่องไอคอนวงกลมแสดงเสมอแทนที่ toFileUrl+fallback ของต้นแบบ
 *
 * icon กล่องแทนรูป = tabler:armchair (Controller ตัดสินแทนไอคอนที่ ux เสนอแต่ยังไม่เคยใช้ในโปรเจกต์
 * — Hard Rule 12 ห้ามเดา icon ใหม่) badge ระยะเวลา/มัดจำ = ข้อความล้วน ไม่มี icon ตาม UX spec §B
 */
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

// HR16: คำเรียกระยะเวลาต้องมาจาก SSOT เดียวกับฝั่งผู้ขาย — ผู้ซื้อกับผู้ขายพูดถึงบริการชิ้นเดียวกัน
// (ฟังก์ชันบริสุทธิ์ ไม่ลาก dependency ของ (paces) เข้ามาใน bundle ของ buyer)
import { formatDurationTH } from '@/lib/appointments'

export type PublicService = {
  id: string
  name: string
  durationMinutes: number | null
  depositMode: string
  depositValue: string
}

/** ป้ายมัดจำ — ไม่แสดงบรรทัดเลยถ้ามัดจำ 0/ยังไม่ตั้งค่า (ไม่ใช่ error state — UX spec §B edge states) */
function depositLabel(mode: string, value: string): string | null {
  const n = Number(value)
  if (!n || n <= 0) return null
  return mode === 'PERCENT' ? `มัดจำ ${n}%` : `มัดจำ ฿${n.toLocaleString('th-TH')}`
}

export default function PublicServiceList({ services }: { services: PublicService[] }) {
  return (
    <div className='grid grid-cols-2 gap-4'>
      {services.map((s) => {
        const deposit = depositLabel(s.depositMode, s.depositValue)
        // rounded 8px = ขั้น "การ์ดและแผง" ของ shape ramp ฝั่ง buyer (DESIGN.md §Shapes)
        /* การ์ดใช้ MUI `Card variant='outlined'` ไม่ใช่ `<div className='rounded-lg border'>` —
           ได้ผิวเดียวกันเป๊ะ (ขอบ 1px ไม่มีเงา) แต่ขอบ/พื้นมาจาก palette ของธีมแทนที่จะเป็น utility
           ที่บังเอิญตรง และเป็น primitive ตัวเดียวกับที่หน้าอื่นทั้งระบบใช้
           (Hard Rule 1 — safepay-ux audit 2026-08-10 พบว่าโฟลเดอร์ v2/ ประกอบการ์ดเองทุกใบ) */
        return (
          <Card key={s.id} variant='outlined' sx={{ borderRadius: '8px', overflow: 'hidden' }}>
            <div className='bs-[130px] bg-[var(--mui-palette-action-hover)] flex items-center justify-center text-[var(--mui-palette-text-disabled)]'>
              <Icon icon='tabler:armchair' width={26} />
            </div>
            <div className='p-3'>
              <Typography className='font-semibold text-sm line-clamp-2' sx={{ lineHeight: 1.4 }}>
                {s.name}
              </Typography>
              {s.durationMinutes != null && (
                <Typography variant='caption' color='text.disabled' className='block mbs-1'>
                  {`ประมาณ ${formatDurationTH(s.durationMinutes)}`}
                </Typography>
              )}
              {deposit && (
                <Typography className='font-extrabold mbs-1.5 tabular-nums' variant='body2'>
                  {deposit}
                </Typography>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
