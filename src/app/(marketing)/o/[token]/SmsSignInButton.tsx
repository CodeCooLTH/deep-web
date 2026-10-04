'use client'

/**
 * ปุ่มหลักของจอ guest เมื่อเปิดมาจากลิงก์ SMS — เข้าสู่ระบบด้วยโค้ดในลิงก์ ไม่ต้องกรอกเบอร์/OTP
 * 🛑 ทำแค่ sign-in + เปิดหน้าเต็ม **ไม่แตะสถานะออเดอร์** — ป้ายจึงเป็น `viewLabel` ("ดู…")
 * ห้ามใช้ป้าย "ยืนยัน…" (การยืนยันรับของคือหลักฐานที่ Trust Score ใช้ ต้องเป็นการกดบนหน้าเต็มเท่านั้น)
 *
 * Base: ปุ่ม CTA ล่างจอของ GuestOrderView.tsx (variant/size/minHeight เดียวกัน — สลับแค่ action)
 *
 * provider `sms-link` เผาโค้ด (one-time) + สร้าง/หาบัญชีและลูกค้าจากเบอร์นั้น + ผูกออเดอร์
 * ล้มเหลว (ลิงก์ถูกใช้ไปแล้ว/หมดอายุ) → ไปหน้าเข้าสู่ระบบปกติ ไม่ทิ้งให้ค้าง
 */
import { useState } from 'react'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { signIn } from 'next-auth/react'
import { toast } from 'react-toastify'

type Props = { code: string; publicToken: string; height: number; children: React.ReactNode }

export default function SmsSignInButton({ code, publicToken, height, children }: Props) {
  const [busy, setBusy] = useState(false)
  const back = `/o/${publicToken}`

  const go = async () => {
    setBusy(true)
    try {
      const res = await signIn('sms-link', { code, redirect: false })
      // ทั้งสองทางเป็นการเปลี่ยนหน้าเต็ม — ไม่คืน busy (กันกดซ้ำระหว่างเปลี่ยนหน้า)
      window.location.href = res?.ok
        ? back
        : `/auth/sign-in?smsExpired=1&callbackUrl=${encodeURIComponent(back)}`
    } catch {
      // เครือข่ายหลุด/throw = ยังไม่ได้ไปไหน (โค้ดยังไม่ถูกเผา) → ให้กดใหม่ได้ ไม่ค้าง spinner
      setBusy(false)
      toast.error('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    }
  }

  return (
    <Button
      fullWidth
      variant='contained'
      size='large'
      onClick={go}
      disabled={busy}
      aria-busy={busy}
      sx={{ minHeight: height }}
      startIcon={busy ? <CircularProgress size={18} color='inherit' /> : undefined}
    >
      {children}
    </Button>
  )
}
