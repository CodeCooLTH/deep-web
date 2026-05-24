'use client'

/**
 * MobileFrame — กรอบ "มือถือ" สำหรับ buyer pages (lock screen + order detail)
 *
 * ทำไม: หน้า buyer เป็น mobile-first (กว้าง 420px). บน desktop คอลัมน์แคบลอยกลางจอขาว
 *       → ดูไม่ออกว่าเป็นมือถือ + เหลือพื้นที่ว่างข้าง/ล่าง (user feedback 2026-05-24).
 *       MobileFrame ทำให้:
 *       - **desktop (md+):** เนื้อหาอยู่ในกรอบ phone (มุมโค้ง + เงา) กลางจอ บนพื้นเทา #E5E9F0
 *         → ดูเป็น "จอมือถือ" ชัดเจน เหมือน mockup; device เป็น scroll container ภายในกรอบ
 *       - **mobile (xs):** เต็มจอ (full-bleed, ไม่มีกรอบ) — page scroll ปกติ
 *
 * ใช้ร่วมทั้ง PhoneUnlock + OrderDetailMobile เพื่อ desktop presentation สอดคล้องกัน
 * (ไม่กระโดดตอน unlock). device เป็น position:relative + flex column ให้ child จัด layout
 * (mid flex:1, footer ก้นจอ, fixed/sticky bar เกาะ device ได้)
 */
import type { ReactNode } from 'react'

import Box from '@mui/material/Box'

type Props = {
  children: ReactNode
  /** สีพื้นของ "จอ" — lock screen #FBFCFE, order detail #F3F5F8 */
  bg?: string
}

export default function MobileFrame({ children, bg = '#FBFCFE' }: Props) {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: { xs: 'stretch', md: 'center' },
        // desktop: พื้นเทารอบกรอบ; mobile: พื้นเดียวกับจอ (full-bleed)
        bgcolor: { xs: bg, md: '#E5E9F0' },
        p: { xs: 0, md: '24px' },
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 420,
          bgcolor: bg,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          // mobile: เต็มจอ scroll ที่ page; desktop: กรอบสูงคงที่ scroll ภายใน
          minHeight: { xs: '100dvh', md: 0 },
          height: { xs: 'auto', md: 'min(880px, calc(100dvh - 48px))' },
          borderRadius: { xs: 0, md: '24px' },
          overflowY: { xs: 'visible', md: 'auto' },
          boxShadow: { xs: 'none', md: '0 24px 50px rgba(15,23,42,.16)' },
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
