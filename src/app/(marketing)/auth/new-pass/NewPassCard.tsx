'use client'

// Base: theme/vuexy/typescript-version/full-version/src/views/pages/auth/ResetPasswordV1.tsx

import { useEffect, useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'

// Third-party Imports
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
  password: Yup.string()
    .min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
    .matches(/[a-zA-Z]/, 'ต้องมีตัวอักษร')
    .matches(/\d/, 'ต้องมีตัวเลข')
    .matches(/[\W_]/, 'ต้องมีอักขระพิเศษ')
    .required('กรุณากรอกรหัสผ่านใหม่'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password')], 'รหัสผ่านไม่ตรงกัน')
    .required('กรุณายืนยันรหัสผ่าน'),
})

type FormValues = Yup.InferType<typeof schema>
type ResetDraft = { phone: string; otp: string }

export default function NewPassCard() {
  const router = useRouter()
  const [draft, setDraft] = useState<ResetDraft | null>(null)
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  // อ่าน resetDraft จาก verify-otp (mode=reset) — ไม่มี/parse ไม่ได้ → เด้งกลับไปขอ OTP ใหม่
  useEffect(() => {
    const raw = sessionStorage.getItem('resetDraft')
    if (!raw) {
      router.replace('/auth/reset-pass')
      return
    }
    try {
      const parsed = JSON.parse(raw) as ResetDraft
      if (!parsed.phone || !parsed.otp) throw new Error('invalid')
      setDraft(parsed)
    } catch {
      sessionStorage.removeItem('resetDraft')
      router.replace('/auth/reset-pass')
    }
  }, [router])

  const onSubmit = async ({ password }: FormValues) => {
    if (!draft) return
    try {
      const res = await fetch('/api/account/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: draft.phone, otp: draft.otp, password }),
      })
      if (res.ok) {
        sessionStorage.removeItem('resetDraft')
        toast.success('ตั้งรหัสผ่านใหม่เรียบร้อย')
        router.push('/auth/sign-in')
        return
      }
      if (res.status === 400) {
        toast.error('รหัสผ่านไม่ผ่านเงื่อนไข')
        return
      }
      if (res.status === 401) {
        toast.error('รหัส OTP หมดอายุ กรุณาขอรหัสใหม่')
        sessionStorage.removeItem('resetDraft')
        router.push('/auth/reset-pass')
        return
      }
      if (res.status === 404) {
        toast.error('ไม่พบบัญชีที่ใช้เบอร์นี้')
        return
      }
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } catch {
      toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  // ยังไม่มี draft (กำลังเช็ค sessionStorage หรือกำลังจะ redirect) → ไม่ render form
  if (!draft) return null

  return (
    <div className='flex min-bs-[100dvh] justify-center items-center p-6'>
      <AuthIllustrationWrapper>
        <Card className='flex flex-col sm:is-[450px]'>
          <CardContent className='sm:!p-12'>
            <Link href='/' className='flex justify-center mbe-6'>
              <Logo />
            </Link>
            <div className='flex flex-col gap-1 mbe-6'>
              {/* ถอด emoji 🔑 ออก — เหตุผลเดียวกับหน้า reset-pass (DESIGN.md §Don't) */}
              <Typography variant='h4'>ตั้งรหัสผ่านใหม่</Typography>
              <Typography>ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ</Typography>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} noValidate autoComplete='off' className='flex flex-col gap-6'>
              <CustomTextField
                fullWidth
                label='รหัสผ่านใหม่'
                type={showPw ? 'text' : 'password'}
                placeholder='••••••••'
                slotProps={{
                  htmlInput: { autoComplete: 'new-password' },
                  input: {
                    endAdornment: (
                      <IconButton size='small' edge='end' onClick={() => setShowPw(s => !s)}>
                        <i className={showPw ? 'tabler-eye-off' : 'tabler-eye'} />
                      </IconButton>
                    ),
                  },
                }}
                error={!!errors.password}
                helperText={errors.password?.message ?? '≥8 ตัว มีตัวอักษร ตัวเลข และอักขระพิเศษ'}
                {...register('password')}
              />
              <CustomTextField
                fullWidth
                label='ยืนยันรหัสผ่านใหม่'
                type={showConfirm ? 'text' : 'password'}
                placeholder='••••••••'
                slotProps={{
                  htmlInput: { autoComplete: 'new-password' },
                  input: {
                    endAdornment: (
                      <IconButton size='small' edge='end' onClick={() => setShowConfirm(s => !s)}>
                        <i className={showConfirm ? 'tabler-eye-off' : 'tabler-eye'} />
                      </IconButton>
                    ),
                  },
                }}
                error={!!errors.confirmPassword}
                helperText={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />
              <Button fullWidth variant='contained' type='submit' disabled={isSubmitting || !draft}>
                {isSubmitting ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่าน'}
              </Button>
              <Typography className='flex justify-center items-center gap-1.5' color='primary.main' component={Link} href='/auth/sign-in'>
                <i className='tabler-chevron-left text-base' />
                กลับไปเข้าสู่ระบบ
              </Typography>
            </form>
            <Typography className='mt-7 text-center text-[13px]' color='text.disabled'>
              &copy; {currentYear} {META_DATA.name} — by {META_DATA.author}
            </Typography>
          </CardContent>
        </Card>
      </AuthIllustrationWrapper>
    </div>
  )
}
