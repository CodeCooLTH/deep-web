'use client'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/auth/ForgotPasswordV1.tsx
// ปรับ: Email field → เบอร์โทร (buyer login ด้วยเบอร์), ส่ง OTP จริงผ่าน /api/otp/send
// แล้ว push ต่อ verify-otp?mode=reset ก่อนตั้งรหัสผ่านใหม่ (แทน "Send Reset Link" แบบ email เดิม)

import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { yupResolver } from '@hookform/resolvers/yup'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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

const schema = Yup.object({
  phone: Yup.string()
    .matches(/^0[0-9]{9}$/, 'เบอร์ต้องขึ้นต้นด้วย 0 และมี 10 หลัก')
    .required('กรุณากรอกเบอร์โทร'),
})

type FormValues = Yup.InferType<typeof schema>

export default function ResetPassCard() {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { phone: '' },
  })

  const onSubmit = async ({ phone }: FormValues) => {
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: phone, type: 'PHONE' }),
      })
      if (res.status === 429) {
        toast.error('คุณส่งคำขอบ่อยเกินไป กรุณารอสักครู่')
        return
      }
      if (!res.ok) {
        toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
        return
      }
      // ไม่ leak phone oracle — otp/send ok เสมอ, fail จริงตอน set-password
      router.push(`/auth/verify-otp?mode=reset&phone=${encodeURIComponent(phone)}`)
    } catch {
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
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
              <Typography variant='h4'>ลืมรหัสผ่าน? 🔒</Typography>
              <Typography>กรอกเบอร์โทรเพื่อรับรหัส OTP สำหรับตั้งรหัสผ่านใหม่</Typography>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} noValidate autoComplete='off' className='flex flex-col gap-6'>
              <CustomTextField
                autoFocus
                fullWidth
                label='เบอร์โทรศัพท์'
                placeholder='08xxxxxxxx'
                type='tel'
                slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'tel' } }}
                error={!!errors.phone}
                helperText={errors.phone?.message}
                {...register('phone')}
              />
              <Button fullWidth variant='contained' type='submit' disabled={isSubmitting}>
                {isSubmitting ? 'กำลังส่ง…' : 'ส่งรหัส OTP'}
              </Button>
              <Typography
                className='flex justify-center items-center gap-1.5'
                color='primary.main'
                component={Link}
                href='/auth/sign-in'
              >
                <i className='tabler-chevron-left text-base' />
                กลับไปเข้าสู่ระบบ
              </Typography>
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
