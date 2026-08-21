'use client'

// React Imports
import { useEffect, useRef, useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

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
import { MOBILE_PHONE_RE, MOBILE_RULE_TEXT } from '@/lib/phone'

const schema = Yup.object({
  phone: Yup.string()
    .matches(MOBILE_PHONE_RE, MOBILE_RULE_TEXT)
    .required('กรุณากรอกเบอร์โทร'),
  displayName: Yup.string()
    .min(2, 'อย่างน้อย 2 ตัวอักษร')
    .max(50, 'ไม่เกิน 50 ตัวอักษร')
    .required('กรุณากรอกชื่อที่แสดง'),
  username: Yup.string()
    .matches(/^[a-zA-Z0-9_]{3,30}$/, 'ใช้ a-z, 0-9, _ ได้ 3-30 ตัว')
    .required('กรุณาตั้งชื่อผู้ใช้'),
  password: Yup.string()
    .min(8, 'อย่างน้อย 8 ตัวอักษร')
    .matches(/[a-zA-Z]/, 'ต้องมีตัวอักษร')
    .matches(/[0-9]/, 'ต้องมีตัวเลข')
    .matches(/[\W_]/, 'ต้องมีอักขระพิเศษ')
    .required('กรุณากรอกรหัสผ่าน'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password')], 'รหัสผ่านไม่ตรงกัน')
    .required('กรุณายืนยันรหัสผ่าน'),
})

type FormValues = Yup.InferType<typeof schema>

type UsernameStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok' }
  | { state: 'error'; reason: 'taken' | 'reserved' | 'invalid' | 'network' }

const REASON_MESSAGE: Record<'taken' | 'reserved' | 'invalid' | 'network', string> = {
  taken: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว',
  reserved: 'ชื่อผู้ใช้นี้สงวนไว้',
  invalid: 'รูปแบบชื่อผู้ใช้ไม่ถูกต้อง',
  network: 'ตรวจสอบชื่อผู้ใช้ไม่สำเร็จ ลองใหม่อีกครั้ง',
}

export default function SignUpCard() {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { phone: '', displayName: '', username: '', password: '', confirmPassword: '' },
  })

  const username = watch('username')
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>({ state: 'idle' })
  const reqId = useRef(0)
  // eye-toggle แยก field รหัสผ่าน/ยืนยันรหัสผ่าน (ตาม RegisterV1.tsx)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    if (!username) {
      setUsernameStatus({ state: 'idle' })
      return
    }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      setUsernameStatus({ state: 'idle' })
      return
    }
    setUsernameStatus({ state: 'checking' })
    const t = setTimeout(async () => {
      const id = ++reqId.current
      try {
        const res = await fetch(`/api/users/check-username?u=${encodeURIComponent(username)}`)
        const data: { available: boolean; reason?: 'taken' | 'reserved' | 'invalid' } = await res.json()
        if (reqId.current !== id) return
        if (data.available) setUsernameStatus({ state: 'ok' })
        else setUsernameStatus({ state: 'error', reason: data.reason ?? 'invalid' })
      } catch {
        if (reqId.current !== id) return
        setUsernameStatus({ state: 'error', reason: 'network' })
      }
    }, 400)
    return () => clearTimeout(t)
  }, [username])

  const onSubmit = async (values: FormValues) => {
    if (usernameStatus.state !== 'ok') {
      if (usernameStatus.state === 'error') toast.error(REASON_MESSAGE[usernameStatus.reason])
      return
    }
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: values.phone, type: 'PHONE' }),
      })
      if (!res.ok) {
        toast.error('ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      // เก็บ password ใน sessionStorage — ไม่ผ่าน URL (กัน leak ใน history/log)
      sessionStorage.setItem('signupDraft', JSON.stringify({ password: values.password }))
      const params = new URLSearchParams({
        mode: 'signup',
        phone: values.phone,
        name: values.displayName,
        username: values.username,
      })
      router.push(`/auth/verify-otp?${params.toString()}`)
    } catch {
      toast.error('ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  const usernameHint = (() => {
    if (errors.username) return { text: errors.username.message, color: 'error' as const }
    if (usernameStatus.state === 'checking') return { text: 'กำลังตรวจสอบ…', color: 'textSecondary' as const }
    if (usernameStatus.state === 'ok') return { text: 'ใช้ชื่อนี้ได้', color: 'success' as const }
    if (usernameStatus.state === 'error') return { text: REASON_MESSAGE[usernameStatus.reason], color: 'error' as const }
    return null
  })()

  const submitDisabled =
    isSubmitting ||
    usernameStatus.state === 'checking' ||
    usernameStatus.state === 'error' ||
    (!!username && /^[a-zA-Z0-9_]{3,30}$/.test(username) && usernameStatus.state === 'idle')

  return (
    <div className='flex min-bs-[100dvh] justify-center items-center p-6'>
      <AuthIllustrationWrapper>
        <Card className='flex flex-col sm:is-[450px]'>
          <CardContent className='sm:!p-12'>
            <Link href='/' className='flex justify-center mbe-6'>
              <Logo />
            </Link>
            <div className='flex flex-col gap-1 mbe-6'>
              <Typography variant='h4'>{`เริ่มต้นใช้งาน ${META_DATA.name}`}</Typography>
              <Typography>กรอกข้อมูลด้านล่างเพื่อสร้างบัญชี</Typography>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} noValidate autoComplete='off' className='flex flex-col gap-6'>
              <CustomTextField
                fullWidth
                label='เบอร์โทรศัพท์'
                placeholder='08xxxxxxxx'
                type='tel'
                slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'tel' } }}
                error={!!errors.phone}
                helperText={errors.phone?.message}
                {...register('phone')}
              />
              <CustomTextField
                fullWidth
                label='ชื่อที่แสดง'
                placeholder='ชื่อ-นามสกุล หรือชื่อเล่น'
                error={!!errors.displayName}
                helperText={errors.displayName?.message}
                {...register('displayName')}
              />
              <div>
                <CustomTextField
                  fullWidth
                  label='ชื่อผู้ใช้ (username)'
                  placeholder='a-z, 0-9, _ เท่านั้น'
                  slotProps={{ htmlInput: { autoComplete: 'off' } }}
                  error={!!errors.username || usernameStatus.state === 'error'}
                  {...register('username')}
                />
                {usernameHint && (
                  <Typography
                    className='mt-1 text-sm'
                    color={
                      usernameHint.color === 'success'
                        ? 'success.main'
                        : usernameHint.color === 'error'
                          ? 'error.main'
                          : 'text.secondary'
                    }
                  >
                    {usernameHint.text}
                  </Typography>
                )}
              </div>
              <CustomTextField
                fullWidth
                label='รหัสผ่าน'
                placeholder='••••••••'
                type={showPassword ? 'text' : 'password'}
                slotProps={{
                  htmlInput: { autoComplete: 'new-password' },
                  input: {
                    endAdornment: (
                      <InputAdornment position='end'>
                        <IconButton
                          edge='end'
                          size='small'
                          onClick={() => setShowPassword(show => !show)}
                          onMouseDown={e => e.preventDefault()}
                          aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                        >
                          <i className={showPassword ? 'tabler-eye-off' : 'tabler-eye'} />
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
                error={!!errors.password}
                helperText={errors.password?.message ?? '≥8 ตัว มีตัวอักษร ตัวเลข และอักขระพิเศษ'}
                {...register('password')}
              />
              <CustomTextField
                fullWidth
                label='ยืนยันรหัสผ่าน'
                placeholder='••••••••'
                type={showConfirm ? 'text' : 'password'}
                slotProps={{
                  htmlInput: { autoComplete: 'new-password' },
                  input: {
                    endAdornment: (
                      <InputAdornment position='end'>
                        <IconButton
                          edge='end'
                          size='small'
                          onClick={() => setShowConfirm(show => !show)}
                          onMouseDown={e => e.preventDefault()}
                          aria-label={showConfirm ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                        >
                          <i className={showConfirm ? 'tabler-eye-off' : 'tabler-eye'} />
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
                error={!!errors.confirmPassword}
                helperText={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />
              <Button fullWidth variant='contained' type='submit' disabled={submitDisabled}>
                {isSubmitting ? 'กำลังส่งรหัส…' : 'สร้างบัญชีและรับรหัส OTP'}
              </Button>
              <div className='flex justify-center items-center flex-wrap gap-2'>
                <Typography>มีบัญชีอยู่แล้ว?</Typography>
                <Typography component={Link} href='/auth/sign-in' color='primary.main'>
                  เข้าสู่ระบบ
                </Typography>
              </div>
              <Divider className='gap-2 text-textPrimary'>หรือ</Divider>
              <div className='flex flex-col gap-3'>
                <Button
                  fullWidth
                  variant='outlined'
                  startIcon={<i className='tabler-brand-facebook-filled text-facebook' />}
                  onClick={() => signIn('facebook', { callbackUrl: '/' })}
                >
                  สมัครด้วย Facebook
                </Button>
                {/* LINE brand green #06C755 — brand asset exception, ใช้ Iconify ri:line-fill
                    เพราะ tabler CSS class ไม่มี LINE icon */}
                <Button
                  fullWidth
                  variant='outlined'
                  onClick={() => signIn('line', { callbackUrl: '/auth/callback/line' })}
                  startIcon={<Icon icon='ri:line-fill' width={20} height={20} style={{ color: '#06C755' }} />}
                >
                  สมัครด้วย LINE
                </Button>
                {/* IG flag-gated — ปิดไว้จนกว่า NEXT_PUBLIC_ENABLE_IG_LOGIN=true */}
                {process.env.NEXT_PUBLIC_ENABLE_IG_LOGIN === 'true' && (
                  <Button
                    fullWidth
                    variant='outlined'
                    onClick={() => signIn('instagram', { callbackUrl: '/auth/callback/instagram' })}
                    startIcon={<Icon icon='ri:instagram-fill' width={20} height={20} style={{ color: '#E1306C' }} />}
                  >
                    {/* Instagram brand pink #E1306C — brand asset exception (Hard Rule 6) */}
                    สมัครด้วย Instagram
                  </Button>
                )}
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
