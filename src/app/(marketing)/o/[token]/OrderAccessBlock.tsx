'use client'

/**
 * OrderAccessBlock — แสดงเมื่อ logged-in user มีเบอร์ที่ไม่ตรงกับ order.buyerContact
 *
 * ทำไม (security must-fix): page.tsx ต้อง early-return component นี้ **ก่อน** สร้าง
 * PublicOrderData → ไม่ส่ง order detail ใด ๆ ลง RSC flight (กัน PII leak ไปยัง user ผิดคน).
 * ข้อความ generic — ไม่ยืนยันรายละเอียด order (ลด oracle; token อยู่ใน URL อยู่แล้ว).
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx
 *   (ใช้ MobileFrame + โทน V1 เดียวกับ lock screen)
 */
import Link from 'next/link'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'
import { signOut } from 'next-auth/react'

import MobileFrame from './MobileFrame'

export default function OrderAccessBlock() {
  return (
    <MobileFrame bg='#fff'>
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          px: '32px',
          gap: '14px',
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            bgcolor: '#F1F5F9',
            display: 'grid',
            placeItems: 'center',
            color: '#94A3B8',
          }}
        >
          <Icon icon='tabler-lock-exclamation' fontSize={30} />
        </Box>
        <Typography sx={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>
          คำสั่งซื้อนี้ไม่ได้ผูกกับบัญชีนี้
        </Typography>
        <Typography sx={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
          บัญชีที่คุณเข้าสู่ระบบอยู่ใช้เบอร์โทรคนละเบอร์กับคำสั่งซื้อนี้ — ออกจากระบบแล้วยืนยันด้วยเบอร์ที่ใช้สั่งซื้อ
        </Typography>

        <Button
          fullWidth
          onClick={() => signOut({ callbackUrl: window.location.pathname })}
          sx={{
            mt: '6px',
            minHeight: 48,
            bgcolor: '#0F172A',
            color: '#fff',
            borderRadius: '13px',
            fontSize: 14.5,
            fontWeight: 800,
            textTransform: 'none',
            '&:hover': { bgcolor: '#1E293B' },
          }}
        >
          ออกจากระบบ แล้วใช้เบอร์อื่น
        </Button>
        <Link href='/' style={{ textDecoration: 'none' }}>
          <Typography sx={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>กลับหน้าหลัก</Typography>
        </Link>
      </Box>
    </MobileFrame>
  )
}
