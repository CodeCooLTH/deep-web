'use client'

// Base: ไม่มี theme match ตรง (Vuexy auth templates ไม่มีหน้า loading) — closest primitive:
// MUI CircularProgress + Logo (@components/layout/shared/Logo) + Typography
// ตาม pattern การใช้ Logo ใน theme/vuexy/typescript-version/full-version/src/views/pages/auth/LoginV1.tsx
// (Controller อนุมัติ design decision นี้แล้ว)

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { toast } from 'react-toastify'
import Logo from '@components/layout/shared/Logo'

// หน่วงขั้นต่ำก่อน redirect กันหน้ากะพริบเร็วเกินไปเมื่อ session พร้อมไวมาก
const MIN_DISPLAY_MS = 1500

const providerErrorMessage = (p: string): string => {
  switch (p) {
    case 'facebook': return 'เข้าสู่ระบบด้วย Facebook ไม่สำเร็จ กรุณาลองใหม่'
    case 'line': return 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่'
    case 'instagram': return 'เข้าสู่ระบบด้วย Instagram ไม่สำเร็จ กรุณาลองใหม่'
    default: return 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'
  }
}

export default function OAuthCallbackPage() {
  const { status } = useSession()
  const router = useRouter()
  const params = useParams()
  const provider = Array.isArray(params.provider) ? params.provider[0] : (params.provider ?? '')
  const mountedAt = useRef(Date.now())

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'authenticated') {
      // รอจนครบ MIN_DISPLAY_MS แล้วพาไปหน้าแรกของ buyer (ไม่ใช่ /dashboard)
      const wait = Math.max(0, MIN_DISPLAY_MS - (Date.now() - mountedAt.current))
      const t = setTimeout(() => router.replace('/'), wait)
      return () => clearTimeout(t)
    }
    // OAuth ไม่สำเร็จ — แจ้งเตือนแล้วพากลับหน้าเข้าสู่ระบบ
    toast.error(providerErrorMessage(provider))
    router.replace('/auth/sign-in')
  }, [status, router, provider])

  return (
    <div className='flex min-bs-[100dvh] flex-col items-center justify-center gap-6 p-6'>
      <Logo />
      <CircularProgress />
      <div className='flex flex-col items-center gap-1 text-center'>
        <Typography color='text.primary' className='font-medium'>กำลังเข้าสู่ระบบ…</Typography>
        <Typography color='text.secondary' className='text-sm'>กำลังตั้งค่าบัญชีของคุณ</Typography>
      </div>
    </div>
  )
}
