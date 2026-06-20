'use client'

// MUI Imports
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { yupResolver } from '@hookform/resolvers/yup'
import { Icon } from '@iconify/react'
import { signIn } from 'next-auth/react'
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

export default function SignInCard() {
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
      if (!res.ok) {
        toast.error('ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      router.push(`/auth/verify-otp?mode=signin&phone=${encodeURIComponent(phone)}`)
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
              <Typography>กรอกเบอร์โทรเพื่อรับรหัส OTP เข้าสู่ระบบ</Typography>
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
                {isSubmitting ? 'กำลังส่งรหัส…' : 'ส่งรหัส OTP'}
              </Button>
              <div className='flex justify-center items-center flex-wrap gap-2'>
                <Typography>ยังไม่มีบัญชี?</Typography>
                <Typography component={Link} href='/auth/sign-up' color='primary.main'>
                  สมัครสมาชิก
                </Typography>
              </div>
              <Divider className='gap-2 text-textPrimary'>หรือ</Divider>
              <div className='flex justify-center items-center gap-1.5'>
                <IconButton
                  className='text-facebook'
                  size='small'
                  onClick={() => signIn('facebook', { callbackUrl: '/' })}
                  aria-label='เข้าสู่ระบบด้วย Facebook'
                >
                  <i className='tabler-brand-facebook-filled' />
                </IconButton>
                {/* LINE brand green #06C755 — brand asset exception, ใช้ Iconify ri:line-fill
                    เพราะ tabler CSS class ไม่มี LINE icon */}
                <IconButton
                  size='small'
                  onClick={() => signIn('line', { callbackUrl: '/' })}
                  aria-label='เข้าสู่ระบบด้วย LINE'
                  sx={{ color: '#06C755' }}
                >
                  <Icon icon='ri:line-fill' width={20} height={20} />
                </IconButton>
                {/* IG flag-gated — ปิดไว้จนกว่า NEXT_PUBLIC_ENABLE_IG_LOGIN=true */}
                {process.env.NEXT_PUBLIC_ENABLE_IG_LOGIN === 'true' && (
                  <IconButton
                    size='small'
                    onClick={() => signIn('instagram', { callbackUrl: '/' })}
                    aria-label='เข้าสู่ระบบด้วย Instagram'
                    sx={{ color: '#E1306C' }}
                  >
                    {/* Instagram brand pink #E1306C — brand asset exception (Hard Rule 6) */}
                    <Icon icon='ri:instagram-fill' width={20} height={20} />
                  </IconButton>
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
