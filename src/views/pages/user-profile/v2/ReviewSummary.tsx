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
    /* `.review-summary` ของไฟล์อ้างอิง: กริด 170px + 1fr · gap 30 · เส้นคั่นล่าง
       ≤650px ยุบเป็น 110px + 1fr · gap 12 (ตัวเลขจากไฟล์ตรง ๆ) */
    <div className='grid items-center border-be [grid-template-columns:170px_1fr] gap-[30px] plb-[6px] pbe-[22px] max-[650px]:[grid-template-columns:110px_1fr] max-[650px]:gap-3'>
      <div className='text-center'>
        <div className='text-[32px] font-extrabold tabular-nums leading-none' style={{ letterSpacing: '-0.035em' }}>
          {/* ทศนิยม 1 ตำแหน่งเสมอ (user 2026-08-11) — "5" กับ "4.9" สลับกันแล้วเลขกระโดดกว้าง */}
          {avgRating.toFixed(1)}
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
        <Typography variant='caption' color='text.secondary' className='block mbs-1 text-[11px] tabular-nums'>
          {`จาก ${reviewCount} รีวิว`}
        </Typography>
      </div>

      <div className='min-is-0'>
        {distribution.map((d) => (
          <div
            key={d.star}
            className='grid items-center gap-[9px] plb-[3.5px] text-[11px] text-[#8a8894] [grid-template-columns:40px_1fr_25px]'
          >
            <span className='text-end tabular-nums'>{`${d.star} ดาว`}</span>
            <LinearProgress
              variant='determinate'
              value={Math.round((d.count / max) * 100)}
              aria-label={`${d.star} ดาว — ${d.count} รีวิว`}
              className='flex-1 min-is-0'
              sx={{
                blockSize: 7,
                borderRadius: '99px',
                backgroundColor: '#f0f0f3',
                '& .MuiLinearProgress-bar': { borderRadius: '99px', backgroundColor: 'warning.main' },
              }}
            />
            <span className='text-end tabular-nums'>{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
