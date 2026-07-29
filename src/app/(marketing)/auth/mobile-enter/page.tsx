'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'

import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'

/**
 * Mobile session handoff — ปลายทางที่ WebView ของ Deep-App โหลดเพื่อ "เข้าสู่ระบบบนเว็บ"
 *
 * flow: แอป POST /api/app/session-handoff (Bearer) → ได้ ticket (60 วิ ใช้ครั้งเดียว)
 *   → เปิด WebView ที่ /auth/mobile-enter?ticket=…&next=/m/…
 *   → หน้านี้ signIn provider 'mobile-ticket' (auth.ts: เผา ticket ผ่าน burnMobileTicket
 *     → NextAuth ตั้ง session cookie ครบ flag ผ่าน jwt callback) → ไปต่อที่ next
 *
 * ใช้ redirect:false เพื่อคุม error UI เอง (ticket หมดอายุ/ถูกใช้แล้ว → แสดงข้อความ ไม่เด้งหน้า login เว็บ)
 * next ผ่าน allowlist กัน open-redirect (NextAuth เช็ค same-origin ให้อีกชั้น)
 */
export default function MobileEnterPage() {
  const params = useSearchParams()
  const [error, setError] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return // กัน StrictMode double-invoke เผา ticket ซ้ำ (ticket single-use)
    started.current = true

    const ticket = params.get('ticket')
    const rawNext = params.get('next') || '/dashboard'
    const next =
      rawNext.startsWith('/') && !rawNext.startsWith('//') && !/[\\\r\n]/.test(rawNext) ? rawNext : '/dashboard'

    if (!ticket) {
      setError(true)
      return
    }

    signIn('mobile-ticket', { ticket, redirect: false })
      .then((res) => {
        if (res?.ok) window.location.replace(next) // session ตั้งแล้ว → โหลด /m (cookie ติดไปด้วย)
        else setError(true)
      })
      .catch(() => setError(true))
  }, [params])

  return (
    <Box
      sx={{
        minBlockSize: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        p: 4,
        textAlign: 'center',
      }}
    >
      {error ? (
        <>
          <Typography variant='h6'>เข้าสู่ระบบไม่สำเร็จ</Typography>
          <Typography variant='body2' color='text.secondary'>
            ลิงก์เข้าสู่ระบบหมดอายุหรือถูกใช้ไปแล้ว กรุณาลองใหม่จากแอป
          </Typography>
          <Button variant='outlined' onClick={() => window.location.reload()} sx={{ mt: 1 }}>
            ลองอีกครั้ง
          </Button>
        </>
      ) : (
        <>
          <CircularProgress />
          <Typography variant='body2' color='text.secondary'>
            กำลังเข้าสู่ระบบ…
          </Typography>
        </>
      )}
    </Box>
  )
}
