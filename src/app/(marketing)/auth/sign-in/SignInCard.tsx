'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { yupResolver } from '@hookform/resolvers/yup'
import { Icon } from '@iconify/react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import * as Yup from 'yup'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import Logo from '@components/layout/shared/Logo'

// Styled Component Imports
import AuthIllustrationWrapper from '@/views/pages/auth/AuthIllustrationWrapper'

// Config Imports
import { currentYear, META_DATA } from '@/config/constants'

// Utils — กัน open-redirect ก่อนใช้ ?callbackUrl= (ดู Hard Rule รวมถึง OQ-2)
import { getSafeCallbackUrl } from '../_lib/safe-callback-url'

// Schema โหมดรหัสผ่าน (default)
const pwSchema = Yup.object({
  username: Yup.string().required('กรุณากรอกชื่อผู้ใช้'),
  password: Yup.string().required('กรุณากรอกรหัสผ่าน'),
})
type PwFormValues = Yup.InferType<typeof pwSchema>

// Schema โหมด OTP (toggle)
const phoneSchema = Yup.object({
  phone: Yup.string()
    .matches(/^0[0-9]{9}$/, 'เบอร์ต้องขึ้นต้นด้วย 0 และมี 10 หลัก')
    .required('กรุณากรอกเบอร์โทร'),
})
type PhoneFormValues = Yup.InferType<typeof phoneSchema>

export default function SignInCard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // callbackUrl ดิบจาก query — ยังไม่ sanitize ที่นี่ เพราะจุดใช้จริง (verify-otp / signIn OAuth)
  // จะเรียก getSafeCallbackUrl() อีกทีก่อน redirect เสมอ
  const rawCallbackUrl = searchParams.get('callbackUrl')
  // สำหรับปุ่ม OAuth (facebook/line/instagram) ที่ redirect ทันทีจากหน้านี้ ต้อง sanitize ณ จุดนี้เลย
  const safeCallbackUrl = getSafeCallbackUrl(rawCallbackUrl)

  // โหมด login: password = default, otp = toggle กลับไปฟอร์มเบอร์โทรเดิม
  const [loginMode, setLoginMode] = useState<'password' | 'otp'>('password')
  // toggle แสดง/ซ่อนรหัสผ่าน (eye icon) — consistent กับ sign-up/new-pass
  const [isPasswordShown, setIsPasswordShown] = useState(false)

  const pwForm = useForm<PwFormValues>({
    resolver: yupResolver(pwSchema),
    defaultValues: { username: '', password: '' },
  })

  const otpForm = useForm<PhoneFormValues>({
    resolver: yupResolver(phoneSchema),
    defaultValues: { phone: '' },
  })

  const onPasswordSubmit = async ({ username, password }: PwFormValues) => {
    try {
      const res = await signIn('buyer-credentials', { username, password, redirect: false })
      if (res?.ok) {
        router.push(safeCallbackUrl)
        return
      }
      // error รวม — ไม่บอกว่า username หรือ password ผิด (กัน user enumeration)
      pwForm.setError('username', { type: 'server', message: '' })
      pwForm.setError('password', { type: 'server', message: '' })
      pwForm.setError('root', { message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' })
    } catch {
      // network error — กันปุ่มค้าง disabled (isSubmitting) เมื่อ signIn throw
      pwForm.setError('root', { message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
    }
  }

  const onOtpSubmit = async ({ phone }: PhoneFormValues) => {
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: phone, type: 'PHONE' }),
      })
      if (!res.ok) {
        toast.error('ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      const params = new URLSearchParams({ mode: 'signin', phone })
      if (rawCallbackUrl) params.set('callbackUrl', rawCallbackUrl)
      router.push(`/auth/verify-otp?${params.toString()}`)
    } catch {
      toast.error('ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  return (
    <div className='flex min-bs-[100dvh] justify-center items-center p-6'>
      <AuthIllustrationWrapper>
        <Card className='flex flex-col sm:is-[450px]'>
          <CardContent className='sm:!p-12'>
            <Link href='/' className='flex justify-center mbe-6'>
              <Logo />
            </Link>
            <div className='flex flex-col gap-1 mbe-6'>
              <Typography variant='h4'>{`ยินดีต้อนรับสู่ ${META_DATA.name} 👋`}</Typography>
              <Typography>
                {loginMode === 'password' ? 'เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน' : 'กรอกเบอร์โทรเพื่อรับรหัส OTP เข้าสู่ระบบ'}
              </Typography>
            </div>

            {loginMode === 'password' ? (
              <form
                onSubmit={pwForm.handleSubmit(onPasswordSubmit)}
                noValidate
                autoComplete='off'
                className='flex flex-col gap-6'
              >
                <CustomTextField
                  autoFocus
                  fullWidth
                  label='ชื่อผู้ใช้'
                  placeholder='your_username'
                  slotProps={{ htmlInput: { autoComplete: 'username' } }}
                  error={!!pwForm.formState.errors.username}
                  {...pwForm.register('username')}
                />
                <CustomTextField
                  fullWidth
                  label='รหัสผ่าน'
                  placeholder='••••••••'
                  type={isPasswordShown ? 'text' : 'password'}
                  slotProps={{
                    htmlInput: { autoComplete: 'current-password' },
                    input: {
                      endAdornment: (
                        <InputAdornment position='end'>
                          <IconButton
                            edge='end'
                            onClick={() => setIsPasswordShown(show => !show)}
                            onMouseDown={e => e.preventDefault()}
                            aria-label={isPasswordShown ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                          >
                            <i className={isPasswordShown ? 'tabler-eye-off' : 'tabler-eye'} />
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                  error={!!pwForm.formState.errors.password}
                  {...pwForm.register('password')}
                />
                <div className='flex justify-end'>
                  <Typography component={Link} href='/auth/reset-pass' color='primary.main' className='text-sm'>
                    ลืมรหัสผ่าน?
                  </Typography>
                </div>
                {pwForm.formState.errors.root && (
                  <Typography color='error.main' className='text-sm text-center'>
                    {pwForm.formState.errors.root.message}
                  </Typography>
                )}
                <Button fullWidth variant='contained' type='submit' disabled={pwForm.formState.isSubmitting}>
                  {pwForm.formState.isSubmitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
                </Button>
                <Typography
                  component='button'
                  type='button'
                  onClick={() => setLoginMode('otp')}
                  color='primary.main'
                  className='text-center'
                  sx={{ background: 'none', border: 0, cursor: 'pointer' }}
                >
                  เข้าสู่ระบบด้วยรหัส OTP แทน
                </Typography>
              </form>
            ) : (
              <form
                onSubmit={otpForm.handleSubmit(onOtpSubmit)}
                noValidate
                autoComplete='off'
                className='flex flex-col gap-6'
              >
                <CustomTextField
                  autoFocus
                  fullWidth
                  label='เบอร์โทรศัพท์'
                  placeholder='08xxxxxxxx'
                  type='tel'
                  slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'tel' } }}
                  error={!!otpForm.formState.errors.phone}
                  helperText={otpForm.formState.errors.phone?.message}
                  {...otpForm.register('phone')}
                />
                <Button fullWidth variant='contained' type='submit' disabled={otpForm.formState.isSubmitting}>
                  {otpForm.formState.isSubmitting ? 'กำลังส่งรหัส…' : 'ส่งรหัส OTP'}
                </Button>
                <Typography
                  component='button'
                  type='button'
                  onClick={() => setLoginMode('password')}
                  color='primary.main'
                  className='text-center'
                  sx={{ background: 'none', border: 0, cursor: 'pointer' }}
                >
                  เข้าสู่ระบบด้วยรหัสผ่านแทน
                </Typography>
              </form>
            )}

            {/* signup link + divider + ปุ่ม social — ใช้ร่วมกันทั้ง 2 โหมด (ไม่ใช่ส่วนหนึ่งของ form submit) */}
            <div className='flex flex-col gap-6 mbs-6'>
              <div className='flex justify-center items-center flex-wrap gap-2'>
                <Typography>ยังไม่มีบัญชี?</Typography>
                <Typography component={Link} href='/auth/sign-up' color='primary.main'>
                  สมัครสมาชิก
                </Typography>
              </div>
              <Divider className='gap-2 text-textPrimary'>หรือ</Divider>
              <div className='flex flex-col gap-3'>
                <Button
                  fullWidth
                  variant='outlined'
                  startIcon={<i className='tabler-brand-facebook-filled text-facebook' />}
                  onClick={() => signIn('facebook', { callbackUrl: safeCallbackUrl })}
                >
                  เข้าสู่ระบบด้วย Facebook
                </Button>
                {/* LINE brand green #06C755 — brand asset exception, ใช้ Iconify ri:line-fill
                    เพราะ tabler CSS class ไม่มี LINE icon */}
                <Button
                  fullWidth
                  variant='outlined'
                  startIcon={<Icon icon='ri:line-fill' width={20} height={20} style={{ color: '#06C755' }} />}
                  onClick={() => signIn('line', { callbackUrl: '/auth/callback/line' })}
                >
                  เข้าสู่ระบบด้วย LINE
                </Button>
                {/* IG flag-gated — ปิดไว้จนกว่า NEXT_PUBLIC_ENABLE_IG_LOGIN=true */}
                {process.env.NEXT_PUBLIC_ENABLE_IG_LOGIN === 'true' && (
                  <Button
                    fullWidth
                    variant='outlined'
                    startIcon={<Icon icon='ri:instagram-fill' width={20} height={20} style={{ color: '#E1306C' }} />}
                    onClick={() => signIn('instagram', { callbackUrl: '/auth/callback/instagram' })}
                  >
                    {/* Instagram brand pink #E1306C — brand asset exception (Hard Rule 6) */}
                    เข้าสู่ระบบด้วย Instagram
                  </Button>
                )}
              </div>
            </div>

            <Typography className='mt-7 text-center text-sm' color='text.disabled'>
              &copy; {currentYear} {META_DATA.name} — by {META_DATA.author}
            </Typography>
          </CardContent>
        </Card>
      </AuthIllustrationWrapper>
    </div>
  )
}
