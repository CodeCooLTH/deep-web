'use client'

/**
 * ShopEvidence — หลักฐานของร้านใต้หัวโปรไฟล์บนหน้าออเดอร์ `/o/[token]` (ใช้ร่วมทั้ง 2 จอ)
 *
 * ตอบคำถาม 2 ข้อที่คนได้ลิงก์ออเดอร์จากแชทถามจริง ๆ ก่อนจะยอมกดอะไร:
 *   1. "ร้านนี้เคยขายจริงไหม" → ออเดอร์สำเร็จ + คะแนนรีวิว
 *   2. "นี่ร้านเดียวกับที่เพิ่งคุยด้วยไหม" → เพจที่ร้านเชื่อมไว้ผ่าน OAuth (ปลอมชื่อไม่ได้)
 *
 * 🛑 **ต้องเห็นทั้งก่อนและหลังล็อกอิน** (user 2026-08-11 "ต้องเห็นทั้งคู่ครับ") — เดิมบล็อกนี้
 * มีเฉพาะจอ guest ⇒ ผู้ซื้อที่ล็อกอินเสร็จ *เสีย* หลักฐานที่เพิ่งเห็นเมื่อ 10 วินาทีก่อนไป
 * ทั้งชุด ทั้งที่เป็นวินาทีที่กำลังจะกดปุ่มที่ย้อนไม่ได้
 *
 * 🛑 `null` ไม่ใช่ `0` — 0 แปลว่า "นับแล้วได้ศูนย์" ซึ่งเป็นข้อเท็จจริงที่ต้องบอก แต่เราเลือก
 * ไม่แสดงช่องนั้นเลยเมื่อยังไม่มีประวัติ (ไม่ประจานร้านใหม่ด้วยเลข 0 ตัวโต) เกณฑ์นี้ถูกตัดสิน
 * ที่ `page.tsx` แล้วทั้งสอง branch ด้วยเงื่อนไขเดียวกัน — ที่นี่แค่เคารพมัน
 *
 * ไม่ทำเป็นการ์ดแยกและไม่มี eyebrow: ไหลต่อในบล็อกหัวร้านเพื่อไม่ให้แข่งความสำคัญกับการ์ด
 * ออเดอร์ (DESIGN.md ระบุ "eyebrow เหนือทุก section" เป็น anti-reference ตรงตัว)
 *
 * Base: src/app/(marketing)/o/[token]/GuestOrderView.tsx (บล็อกสถิติเดิม)
 *   + src/views/pages/user-profile/v2/OfficialChannels.tsx (ChannelStrip — แถวช่องทางของหน้าโปรไฟล์)
 */
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

import { ChannelStrip, type OfficialChannel } from '@/views/pages/user-profile/v2/OfficialChannels'

export type ShopEvidenceData = {
  completedOrders: number | null
  avgRating: number | null
  reviewCount: number
  channels: OfficialChannel[]
}

/** เส้นคั่นบนของแต่ละแถบย่อย — ใช้ซ้ำ 2 ที่ในไฟล์นี้เท่านั้น ไม่ยกขึ้นเป็น token */
const dividedBlock = { mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' } as const

export default function ShopEvidence({ completedOrders, avgRating, reviewCount, channels }: ShopEvidenceData) {
  const hasStats = completedOrders != null || avgRating != null

  return (
    <>
      {hasStats && (
        <Box
          sx={{ display: 'flex', justifyContent: 'center', alignItems: 'stretch', gap: 3, ...dividedBlock }}
        >
          {completedOrders != null && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant='h6' sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>
                {completedOrders.toLocaleString('th-TH')}
              </Typography>
              <Typography variant='caption' color='text.secondary'>
                ออเดอร์สำเร็จ
              </Typography>
            </Box>
          )}
          {completedOrders != null && avgRating != null && <Divider orientation='vertical' flexItem />}
          {avgRating != null && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant='h6' sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>
                {avgRating}
              </Typography>
              <Typography variant='caption' color='text.secondary'>
                จาก {reviewCount.toLocaleString('th-TH')} รีวิว
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* ChannelStrip คืน null เองเมื่อไม่มีช่องทาง — แต่เส้นคั่นอยู่ที่ Box ข้างนอก
          ต้องเช็คที่นี่ด้วย ไม่งั้นได้เส้นคั่นลอยคั่นความว่างเปล่า */}
      {channels.length > 0 && (
        <Box sx={dividedBlock}>
          <ChannelStrip channels={channels} />
        </Box>
      )}
    </>
  )
}
