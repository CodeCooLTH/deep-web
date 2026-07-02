'use client'

// React Imports
import { useEffect, useState, type FormEvent } from 'react'

// Next Imports
import { useRouter, useSearchParams } from 'next/navigation'

// MUI Imports
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'

// Third-party Imports
import classnames from 'classnames'
import { OTPInput } from 'input-otp'
import type { SlotProps } from 'input-otp'
import { signIn } from 'next-auth/react'
import { toast } from 'react-toastify'

// Component Imports
import Logo from '@components/layout/shared/Logo'

// Styled Component Imports
import AuthIllustrationWrapper from '@/views/pages/auth/AuthIllustrationWrapper'

// Style Imports
import styles from '@/libs/styles/inputOtp.module.css'

// Config Imports
import { currentYear, META_DATA } from '@/config/constants'

// Utils — กัน open-redirect ก่อนใช้ ?callbackUrl= ที่ carry มาจาก sign-in/sign-up (OQ-2)
import { getSafeCallbackUrl } from '../_lib/safe-callback-url'

const Slot = (props: SlotProps) => {
  return (
    <div className={classnames(styles.slot, { [styles.slotActive]: props.isActive })}>
      {props.char !== null && <div>{props.char}</div>}
      {props.hasFakeCaret && <FakeCaret />}
    </div>
  )
}

const FakeCaret = () => {
  return (
    <div className={styles.fakeCaret}>
      <div className='w-px h-5 bg-textPrimary' />
    </div>
  )
}

export default function VerifyOtpCard() {
  const router = useRouter()
  const params = useSearchParams()

  const phone = params.get('phone') ?? ''
  const mode = (params.get('mode') ?? 'signin') as 'signin' | 'signup' | 'reset'
  const displayName = params.get('name') ?? ''
  const username = params.get('username') ?? ''
  const safeCallbackUrl = getSafeCallbackUrl(params.get('callbackUrl'))

  const [otp, setOtp] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    if (!phone) router.replace('/auth/sign-in')
  }, [phone, router])

  const masked = phone
    ? `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`
    : ''

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    if (otp.length !== 6) {
      setErrorMsg('กรุณากรอกรหัส 6 หลัก')
      return
    }
    setSubmitting(true)
    try {
      if (mode === 'reset') {
        // ไม่ consume OTP ที่นี่ (กัน double-consume) — set-password คือที่ verify จริง
        sessionStorage.setItem('resetDraft', JSON.stringify({ phone, otp }))
        router.push('/auth/new-pass')
        return
      }
      // signin / signup
      let password = ''
      if (mode === 'signup') {
        try {
          const raw = sessionStorage.getItem('signupDraft')
          if (raw) password = (JSON.parse(raw) as { password?: string }).password ?? ''
        } catch {
          /* draft เสีย → signup ต่อโดยไม่มี password (ตั้งภายหลัง reset) */
        }
      }
      const result = await signIn('phone-otp', {
        phone,
        otp,
        mode,
        displayName,
        username,
        password,
        redirect: false,
      })
      if (result?.ok) {
        if (mode === 'signup') sessionStorage.removeItem('signupDraft')
        router.push(safeCallbackUrl)
        return
      }
      setErrorMsg('รหัสไม่ถูกต้องหรือหมดอายุ ลองอีกครั้ง')
    } catch {
      setErrorMsg('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  const onResend = async () => {
    if (!phone) return
    setResending(true)
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: phone, type: 'PHONE' }),
      })
      if (res.ok) {
        toast.success('ส่งรหัสใหม่แล้ว')
        setOtp('')
        setErrorMsg(null)
      } else {
        toast.error('ส่งรหัสใหม่ไม่สำเร็จ')
      }
    } catch {
      toast.error('ส่งรหัสใหม่ไม่สำเร็จ')
    } finally {
      setResending(false)
    }
  }

  if (!phone) return null

  return (
    <div className='flex min-bs-[100dvh] justify-center items-center p-6'>
      <AuthIllustrationWrapper>
        <Card className='flex flex-col sm:is-[450px]'>
          <CardContent className='sm:!p-12'>
            <div className='flex justify-center mbe-6'>
              <Logo />
            </div>
            <div className='flex flex-col gap-1 mbe-6'>
              <Typography variant='h4'>ยืนยันรหัส OTP</Typography>
              <Typography>
                {mode === 'reset' ? 'ยืนยัน OTP เพื่อรีเซ็ตรหัสผ่าน' : 'กรอกรหัส 6 หลักที่ส่งไปยังเบอร์ของคุณ'}
              </Typography>
              <Typography className='font-medium' color='text.primary'>
                {masked}
              </Typography>
            </div>
            <form onSubmit={onSubmit} noValidate autoComplete='off' className='flex flex-col gap-6'>
              <div className='flex flex-col gap-2'>
                <Typography>กรอกรหัสความปลอดภัย 6 หลัก</Typography>
                <OTPInput
                  onChange={setOtp}
                  value={otp}
                  maxLength={6}
                  autoFocus
                  containerClassName='flex items-center'
                  render={({ slots }) => (
                    <div className='flex items-center justify-between w-full gap-4'>
                      {slots.slice(0, 6).map((slot, idx) => (
                        <Slot key={idx} {...slot} />
                      ))}
                    </div>
                  )}
                />
              </div>

              {errorMsg && (
                <Typography color='error.main' className='text-center text-sm'>
                  {errorMsg}
                </Typography>
              )}

              <Button fullWidth variant='contained' type='submit' disabled={submitting}>
                {submitting ? 'กำลังยืนยัน…' : 'ยืนยัน'}
              </Button>

              <div className='flex justify-center items-center flex-wrap gap-2'>
                <Typography>ไม่ได้รับ SMS?</Typography>
                <Typography
                  component='button'
                  type='button'
                  onClick={onResend}
                  color='primary.main'
                  sx={{
                    background: 'none',
                    border: 0,
                    padding: 0,
                    cursor: resending ? 'default' : 'pointer',
                    opacity: resending ? 0.6 : 1,
                  }}
                  disabled={resending}
                >
                  {resending ? 'กำลังส่ง…' : 'ส่งอีกครั้ง'}
                </Typography>
              </div>
            </form>

            <Typography className='mt-7 text-center text-sm' color='text.disabled'>
              &copy; {currentYear} {META_DATA.name} — by {META_DATA.author}
            </Typography>
          </CardContent>
        </Card>
      </AuthIllustrationWrapper>
    </div>
  )
}
