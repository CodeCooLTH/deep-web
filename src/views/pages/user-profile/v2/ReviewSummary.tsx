'use client'

/**
 * ReviewSummary — หัวแท็บรีวิว (mockup 2026-07-26, user ขอให้โชว์ว่าได้เรตเท่าไหร่)
 *
 * ทำไมไม่โชว์แค่ค่าเฉลี่ย: 4.9 ที่มาจากรีวิว 5 ดาวล้วน กับ 4.9 ที่มาจาก 5 ดาวจำนวนมากปนกับ
 * 1 ดาวสองสามใบ มีความหมายคนละอย่างสำหรับคนที่กำลังจะโอนเงิน แท่งกระจายจึงไม่ใช่ของประดับ
 * แต่เป็นข้อมูลที่เปลี่ยนการตัดสินใจได้ และเป็นสิ่งที่แพลตฟอร์มซึ่งเลือกซ่อนมักถูกตั้งคำถาม
 *
 * 🛑 Base: comment เดิมอ้าง "rating block" ใน `views/pages/user-profile` ของธีม ซึ่ง **ไม่มีอยู่จริง**
 * (grep ทั้งโฟลเดอร์แล้วมีแต่ teams/projects/connections/UserProfileHeader) และอ้างว่าเลี่ยง
 * `LinearProgress` เพื่อคุมความสูงแท่ง — พบตอน safepay-ux audit HR1 2026-08-10
 *
 * ตอนนี้ใช้ MUI `LinearProgress` จริงแล้ว: ความสูงคุมได้ด้วย `sx` ตั้งแต่แรก (ไม่เคยเป็นเหตุผลที่
 * ต้องเขียน div เอง) และได้ `role="progressbar"` + `aria-valuenow` ติดมาด้วย ซึ่งเป็นสิ่งที่
 * แท่งที่ประกอบจาก `<span>` ให้ไม่ได้เลย — บนบล็อกที่ทั้งบล็อกมีไว้ให้คนอ่านสัดส่วน
 *
 * Base: @mui/material/LinearProgress (variant determinate)
 */
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

export type RatingBucket = { star: number; count: number }

export default function ReviewSummary({
  avgRating,
  reviewCount,
  distribution,
}: {
  avgRating: number
  reviewCount: number
  distribution: RatingBucket[]
}) {
  const max = Math.max(1, ...distribution.map((d) => d.count))

  return (
    <div className='flex items-center gap-5 pbe-4 border-be mbe-2'>
      <div className='text-center shrink-0 min-is-[92px]'>
        <div className='text-[42px] font-extrabold tabular-nums leading-none' style={{ letterSpacing: '-0.035em' }}>
          {avgRating}
        </div>
        {/* ดาวต้องเป็นทึบ/โปร่งเพื่อสื่อคะแนน — lucide:star เป็นไอคอนเส้นล้วน ถ้าใช้ตัวเดียวกัน
            ทั้งเต็มและว่างจะได้ดาวโครงห้าดวงเหมือนกันหมด อ่านคะแนนไม่ได้เลย (เจอตอน QA จริง)
            จึงใช้ tabler ที่มีคู่ filled/outline ครบ */}
        <div className='flex justify-center gap-0.5 mbs-1 text-warning'>
          {[1, 2, 3, 4, 5].map((i) => (
            <Icon
              key={i}
              icon={i <= Math.round(avgRating) ? 'tabler:star-filled' : 'tabler:star'}
              width={13}
              className={i <= Math.round(avgRating) ? '' : 'opacity-35'}
            />
          ))}
        </div>
        <Typography variant='caption' color='text.disabled' className='block mbs-1 tabular-nums'>
          {`จาก ${reviewCount} รีวิว`}
        </Typography>
      </div>

      <div className='flex-1 min-is-0 flex flex-col gap-1.5'>
        {distribution.map((d) => (
          <div key={d.star} className='flex items-center gap-2 text-xs'>
            <span className='is-2.5 text-end tabular-nums text-[var(--mui-palette-text-disabled)]'>{d.star}</span>
            <LinearProgress
              variant='determinate'
              value={Math.round((d.count / max) * 100)}
              aria-label={`${d.star} ดาว — ${d.count} รีวิว`}
              className='flex-1 min-is-0'
              sx={{
                blockSize: 7,
                borderRadius: 1,
                backgroundColor: 'var(--mui-palette-action-hover)',
                '& .MuiLinearProgress-bar': { borderRadius: 1, backgroundColor: 'warning.main' },
              }}
            />
            <span className='is-6 text-end tabular-nums text-[var(--mui-palette-text-disabled)]'>{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
