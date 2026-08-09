'use client'

/**
 * PublicRoomList — แท็บ "บ้านพัก" ของร้านประเภทที่พัก (Shop.vertical = LODGING, feat 00017)
 *
 * ทำไมไม่ reuse RoomList เดิม: ตัวนั้นอยู่ฝั่งผู้ขายซึ่งใช้ธีม Paces และมีปุ่มจัดการห้อง
 * ข้ามฝั่งมาใช้กับหน้าผู้ซื้อที่เป็น Vuexy ไม่ได้ (คนละระบบดีไซน์ ห้ามปนกันตาม Hard Rule 1)
 * ที่นี่แสดงเฉพาะสิ่งที่ผู้เข้าชมต้องรู้เพื่อตัดสินใจ คือรูป ชื่อ ความจุ และราคาต่อคืน
 *
 * Base: src/views/pages/user-profile/profile/index.tsx (การ์ดสินค้า grid 2 คอลัมน์บนมือถือ)
 *   ให้แท็บบ้านพักกับแท็บสินค้าอยู่ในภาษาเดียวกัน
 */
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { toFileUrl } from '@/lib/file-url'

export type PublicRoom = {
  id: string
  name: string
  capacity: number | null
  basePrice: number
  imageUrl: string | null
}

export default function PublicRoomList({ rooms }: { rooms: PublicRoom[] }) {
  return (
    <div className='grid grid-cols-2 gap-4'>
      {rooms.map((r) => {
        const img = toFileUrl(r.imageUrl)
        // rounded-lg (8px) = ขั้น "การ์ดและแผง" ของ shape ramp ฝั่ง buyer (DESIGN.md §Shapes)
        // เดิม rounded-xl (12px) ไม่อยู่บน ramp — sync กับ PageBlocksSection ที่อ้างไฟล์นี้เป็น Base
        return (
          <div key={r.id} className='rounded-lg overflow-hidden border'>
            <div className='bs-[130px] bg-[var(--mui-palette-action-hover)] flex items-center justify-center text-[var(--mui-palette-text-disabled)]'>
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element -- รูปจาก storage หลากโดเมน
                <img src={img} alt={r.name} className='is-full bs-full object-cover' />
              ) : (
                <Icon icon='lucide:image' width={26} />
              )}
            </div>
            <div className='p-3'>
              <Typography className='font-semibold text-sm' sx={{ lineHeight: 1.4 }}>
                {r.name}
              </Typography>
              {r.capacity != null && (
                <Typography variant='caption' color='text.disabled' className='flex items-center gap-1 mbs-1'>
                  <Icon icon='lucide:users' width={13} />
                  {`พักได้ ${r.capacity} คน`}
                </Typography>
              )}
              <Typography className='font-extrabold mbs-1.5 tabular-nums'>
                {`฿${r.basePrice.toLocaleString('th-TH')}`}
                <Typography component='span' variant='caption' color='text.disabled' className='font-normal'>
                  {' / คืน'}
                </Typography>
              </Typography>
            </div>
          </div>
        )
      })}
    </div>
  )
}
