'use client'

/**
 * ClaimOtpPrompt — Screen 2 (UX-Design-Spec §Screen 2), covers FR-OCL-06 (OTP_CLAIM_REQUIRED)
 *
 * ทำไม: buyer login อยู่แล้วด้วยเบอร์ที่ตรงกับ order.buyerContact แต่ไม่ได้เพิ่ง signIn ด้วย
 * phone-otp (นอก skip-window ตาม TD-002) → ต้องยืนยัน OTP อีกครั้งก่อน guaranteeOrderLink
 * (SDS §4.5). `phone` prop = เบอร์ของ session user เอง (ไม่ใช่ order PII ของคนอื่น — page.tsx
 * ส่งมาได้อย่างปลอดภัย) ใช้ยิง /api/otp/send; UI แสดงเฉพาะ masked ไม่ให้เห็นเบอร์เต็ม
 *
 * Flow: initial (ปุ่ม "ส่งรหัส OTP") → otp (OtpSlots 6 หลัก) → POST /api/orders/[token]/claim
 * → 200 → toast.success + router.refresh() (page.tsx re-eval resolveOrderAccess → OWNER_MATCH)
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/auth/AuthIllustrationWrapper.tsx (shell)
 *   + src/app/(marketing)/auth/verify-otp/VerifyOtpCard.tsx (Card layout + OTP submit/resend pattern
 *     ผ่าน shared OtpSlots — D5/Q5)
 *   + theme/vuexy/typescript-version/full-version/src/components/dialogs/two-factor-auth/index.tsx (Button pattern)
 */
import { useState, type FormEvent } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

import { toast } from 'react-toastify'

import Logo from '@components/layout/shared/Logo'

import AuthIllustrationWrapper from '@/views/pages/auth/AuthIllustrationWrapper'
import OtpSlots from '@/app/(marketing)/_components/OtpSlots'
import { currentYear, META_DATA } from '@/config/constants'

type Props = {
  /** publicToken ของ order — ใช้เรียก POST /api/orders/[token]/claim */
  token: string
  /** เบอร์เต็มของ session user เอง (ไม่ใช่ order PII ของคนอื่น) — ใช้ยิง /api/otp/send เท่านั้น ไม่แสดงผล */
  phone: string
  /** เบอร์ masked สำหรับแสดงผล (server เตรียมไว้แล้ว) */
  maskedPhone: string
}

type Stage = 'initial' | 'otp'

export default function ClaimOtpPrompt({ token, phone, maskedPhone }: Props) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('initial')
  const [otp, setOtp] = useState('')
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSend = async () => {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: phone, type: 'phone' }),
      })
      if (res.status === 429) {
        toast.warning('ขอ OTP บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่')
        return
      }
      if (!res.ok) {
        toast.error('ส่งรหัส OTP ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
        return
      }
      setOtp('')
      setStage('otp')
    } catch {
      toast.error('ส่งรหัส OTP ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (otp.length !== 6) {
      setError('กรุณากรอกรหัส OTP 6 หลัก')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/orders/${token}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp }),
      })
      if (res.ok) {
        toast.success('ยืนยันสำเร็จ')
        router.refresh()
        return
      }
      setError('รหัส OTP ไม่ถูกต้องหรือหมดอายุ')
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className='flex min-bs-[100dvh] justify-center items-center p-6'>
      <AuthIllustrationWrapper>
        <Card className='flex flex-col sm:is-[450px]'>
          <CardContent className='sm:!p-12'>
            {/* 🛑 ตราแบรนด์ต้องเป็นลิงก์ ไม่ใช่รูปเฉย ๆ — `Logo.tsx` ไม่มี `href` ในตัวเอง
                จอนี้ไม่มีทางออกไปหน้าอื่นเลยนอกจากตรงนี้ (ไม่มีปุ่ม ไม่มีเมนู มีแต่ช่อง OTP)
                ก่อนหน้านี้พึ่ง header ของ `FrontLayout` ที่ถูกถอดออกในคอมมิตเดียวกันนี้
                ⇒ ถ้าไม่ทำพร้อมกัน ผู้ซื้อที่มาถึงจอนี้แล้วไม่อยากกรอก OTP จะติดตายทั้งจอ
                ซึ่งคือบั๊กเดิมที่ layout ตัวนั้นถูกสร้างมาแก้พอดี (FR-019) */}
            <div className='flex justify-center mbe-6'>
              <Link href='/' aria-label='กลับหน้าแรก' className='inline-flex'>
                <Logo />
              </Link>
            </div>
            <div className='flex flex-col gap-1 mbe-6 text-center'>
              <Typography variant='h4'>ยืนยันตัวตนเพื่อเข้าถึงออเดอร์นี้</Typography>
              <Typography>
                ออเดอร์นี้ผูกกับเบอร์{' '}
                <Typography component='span' className='font-medium' color='text.primary'>
                  {maskedPhone}
                </Typography>
              </Typography>
            </div>

            {stage === 'initial' ? (
              <Button fullWidth variant='contained' onClick={handleSend} disabled={sending}>
                {sending ? 'กำลังส่ง…' : 'ส่งรหัส OTP'}
              </Button>
            ) : (
              <form onSubmit={handleSubmit} noValidate autoComplete='off' className='flex flex-col gap-6'>
                <div className='flex flex-col gap-2'>
                  <Typography>กรอกรหัส OTP 6 หลัก</Typography>
                  <OtpSlots value={otp} onChange={setOtp} />
                </div>

                {error && (
                  <Typography color='error.main' className='text-center text-sm'>
                    {error}
                  </Typography>
                )}

                <Button fullWidth variant='contained' type='submit' disabled={submitting}>
                  {submitting ? 'กำลังยืนยัน…' : 'ยืนยัน'}
                </Button>

                <div className='flex justify-center items-center flex-wrap gap-2'>
                  <Typography>ไม่ได้รับรหัส?</Typography>
                  <Typography
                    component='button'
                    type='button'
                    onClick={handleSend}
                    color='primary.main'
                    sx={{
                      background: 'none',
                      border: 0,
                      padding: 0,
                      cursor: sending ? 'default' : 'pointer',
                      opacity: sending ? 0.6 : 1,
                    }}
                    disabled={sending}
                  >
                    {sending ? 'กำลังส่ง…' : 'ส่งอีกครั้ง'}
                  </Typography>
                </div>
              </form>
            )}

            <Typography className='mt-7 text-center text-sm' color='text.disabled'>
              &copy; {currentYear} {META_DATA.name} — by {META_DATA.author}
            </Typography>
          </CardContent>
        </Card>
      </AuthIllustrationWrapper>
    </div>
  )
}
