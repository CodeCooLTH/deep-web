/**
 * SmsErrorPage — uniform error สำหรับทุก failure path ของ SMS short-code consume
 *
 * RC-2 (uniform error / no-oracle): ทุก failure mode ต้องแสดง heading + body เดียวกัน
 * ห้ามแยก message ตาม reason (not-found / expired / used / phone-mismatch /
 * order-mismatch / rate-limited) — กัน enumeration oracle
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/NotFound.tsx
 * ปรับ: content เป็นภาษาไทย, ตัด mode/image-variant/MaskImg ออก (ไม่มี deps),
 *       ปุ่มใช้ LinkButton wrapper (RSC context — ห้าม component={Link} ตาม convention)
 *
 * Server Component — ไม่มี 'use client' เพราะ parent page.tsx เป็น server component
 * ที่ render component นี้โดยตรง (ไม่ข้าม serialization boundary)
 * Font: inherit จาก (marketing)/layout.tsx (Anuphan CSS variable) — ไม่ hardcode font
 */
import Typography from '@mui/material/Typography'

import { LinkButton } from '@/app/(marketing)/_components/mui-link'

export default function SmsErrorPage() {
  return (
    <div className='flex items-center justify-center min-bs-[100dvh] relative p-6 overflow-x-hidden'>
      <div className='flex items-center flex-col text-center'>
        <div className='flex flex-col gap-2 is-[90vw] sm:is-[unset] mbe-6'>
          {/* ไม่แสดง 404 code — หน้านี้ไม่ใช่ HTTP 404; เป็น business error */}
          <Typography variant='h4' color='text.primary'>
            ลิงก์ไม่ถูกต้องหรือหมดอายุ
          </Typography>
          <Typography color='text.secondary'>
            ลิงก์นี้ใช้ไม่ได้แล้วหรืออาจหมดอายุ กรุณาติดต่อร้านค้าเพื่อขอลิงก์ใหม่
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
