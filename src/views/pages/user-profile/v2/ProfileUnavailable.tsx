/**
 * ProfileUnavailable — หน้าร้านที่เจ้าของปิดการแสดงผลชั่วคราว (feature 00035, SRS TFR-004)
 *
 * ต่างจาก 404 ตรงที่ร้าน "มีอยู่จริง" แค่ผู้ขายสวิตช์ isPublished ปิดไว้เอง — ต้องคืน HTTP 200
 * ไม่ใช่ notFound() (RC-2-style: ไม่ใช่ business error ที่ควรมีสถานะ error) และห้ามปนกับเคส
 * "ไม่มี user/shop แถวนี้เลย" ซึ่งยังคงเป็น notFound() ปกติที่ page.tsx เช็คก่อนเข้าเงื่อนไขนี้เสมอ
 *
 * Base: src/app/(marketing)/o/_components/SmsErrorPage.tsx (โครง 100% — heading + body + ปุ่มเดียว
 *   ไม่มี icon, LinkButton wrapper) เดิม Base ของไฟล์นั้น:
 *   theme/vuexy/typescript-version/full-version/src/views/NotFound.tsx
 * ปรับ: เปลี่ยนแค่ copy (ข้อความ + ปุ่ม "กลับหน้าหลัก") ไม่ต้องปรับโครงเพิ่ม
 *
 * Server Component — parent (u/[username], b/[slug]) เป็น server component ที่ render ตรง ๆ
 * Font: inherit จาก (marketing)/layout.tsx (Anuphan) — ไม่ hardcode font
 */
import Typography from '@mui/material/Typography'

import { LinkButton } from '@/app/(marketing)/_components/mui-link'

export default function ProfileUnavailable() {
  return (
    <div className='flex items-center justify-center min-bs-[100dvh] relative p-6 overflow-x-hidden'>
      <div className='flex items-center flex-col text-center'>
        <div className='flex flex-col gap-2 is-[90vw] sm:is-[unset] mbe-6'>
          <Typography variant='h4' color='text.primary'>
            หน้านี้ปิดการแสดงผลชั่วคราว
          </Typography>
          <Typography color='text.secondary'>
            เจ้าของร้านปิดการมองเห็นหน้าร้านนี้ไว้ชั่วคราว ลองกลับมาดูใหม่ภายหลัง
          </Typography>
        </div>
        {/*
          LinkButton wrapper ใช้ 'use client' ภายใน mui-link.tsx เอง
          → component={NextLink} ไม่ข้าม RSC boundary เป็น prop
          (ตาม rsc-mui-navigation convention — ห้ามใช้ component={Link} ตรง ๆ ใน server comp)
        */}
        <LinkButton href='/' variant='contained'>
          กลับหน้าหลัก
        </LinkButton>
      </div>
    </div>
  )
}
