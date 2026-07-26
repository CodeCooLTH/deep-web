'use client'

/**
 * ReviewList — รายการรีวิวใต้สรุปคะแนน (แท็บรีวิวของหน้าร้านสาธารณะ)
 *
 * ทำไมไม่ใช้ RecentReviews เดิม: ตัวนั้นห่อ Card พร้อมหัวข้อ "รีวิวล่าสุด" และคะแนนเฉลี่ยของ
 * ตัวเอง ซึ่งซ้อนกับ ReviewSummary ที่อยู่เหนือมันในแท็บเดียวกัน (เห็นตอนเปิดหน้าจริง) และใช้
 * formatDateTime ที่เป็นรูปแบบของฝั่งผู้ขาย ไม่ใช่รูปแบบไทยของฝั่งผู้ซื้อ
 *
 * ที่นี่จึงเหลือเฉพาะตัวรายการ ไม่มีหัวข้อซ้ำ และใช้ formatDateTH ตาม convention ฝั่ง buyer
 * (docs/conventions/date-format.md — ห้ามเรียก toLocaleDateString เอง)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile
 *   (stacked divider list) — ตัด Card wrapper ออกเพราะอยู่ใน tab panel ที่มีกรอบอยู่แล้ว
 */
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { formatDateTH } from '@/lib/format-date'

export type ReviewListItem = {
  id: string
  rating: number
  comment: string | null
  createdAtIso: string
}

export default function ReviewList({ items }: { items: ReviewListItem[] }) {
  if (items.length === 0) return null

  return (
    <div className='flex flex-col'>
      {items.map((r) => (
        <div key={r.id} className='plb-3.5 border-be last:border-be-0'>
          <div className='flex items-center justify-between gap-3 mbe-1.5'>
            <span className='flex gap-0.5 text-warning'>
              {[1, 2, 3, 4, 5].map((i) => (
                <Icon
                  key={i}
                  icon={i <= r.rating ? 'tabler:star-filled' : 'tabler:star'}
                  width={13}
                  className={i <= r.rating ? '' : 'opacity-35'}
                />
              ))}
            </span>
            <Typography variant='caption' color='text.disabled'>
              {formatDateTH(r.createdAtIso)}
            </Typography>
          </div>
          {r.comment && (
            <Typography variant='body2' color='text.secondary'>
              {r.comment}
            </Typography>
          )}
        </div>
      ))}
    </div>
  )
}
