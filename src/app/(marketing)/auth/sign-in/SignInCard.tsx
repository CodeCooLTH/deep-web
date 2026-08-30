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
    .matches(MOBILE_PHONE_RE, MOBILE_RULE_TEXT)
    .required('กรุณากรอกเบอร์โทร'),
})
type PhoneFormValues = Yup.InferType<typeof phoneSchema>

/** สรุปออเดอร์แบบ public-safe จาก getOrderSummaryForSignIn (ไม่มี PII ของคน) */
import OrderLinkShell, { type OrderLinkShopContext } from './OrderLinkShell'
import { MOBILE_PHONE_RE, MOBILE_RULE_TEXT } from '@/lib/phone'

export type SignInOrderContext = OrderLinkShopContext

export default function SignInCard({ orderContext = null }: { orderContext?: SignInOrderContext | null }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // callbackUrl ดิบจาก query — ยังไม่ sanitize ที่นี่ เพราะจุดใช้จริง (verify-otp / signIn OAuth)
  // จะเรียก getSafeCallbackUrl() อีกทีก่อน redirect เสมอ
  const rawCallbackUrl = searchParams.get('callbackUrl')
  // สำหรับปุ่ม OAuth (facebook/line/instagram) ที่ redirect ทันทีจากหน้านี้ ต้อง sanitize ณ จุดนี้เลย
  const safeCallbackUrl = getSafeCallbackUrl(rawCallbackUrl)

  // feature 00015 (Order Claim & Forced Login) FR-OCL-03: SMS-link ส่ง ?prefillPhone= มาช่วย
  // เลือกโหมด OTP ให้อัตโนมัติ + เติมเบอร์ล่วงหน้า (field ยังแก้ได้ — pre-fill ไม่ใช่ approval)
  // รูปแบบไม่ตรง MOBILE_PHONE_RE → เพิกเฉยเงียบ ๆ ตกกลับไปโหมด password ปกติ (ไม่ crash)
  const rawPrefillPhone = searchParams.get('prefillPhone')
  const prefillPhone = rawPrefillPhone && MOBILE_PHONE_RE.test(rawPrefillPhone) ? rawPrefillPhone : null

  // โหมด login:
  //   channels = หน้าเลือกช่องทาง (ใช้เฉพาะตอนมาจากลิงก์ออเดอร์) — ผู้ซื้อจากแชทส่วนใหญ่ยังไม่มี
  //     บัญชี Deep การเอาฟอร์ม username/password ขึ้นก่อนทำให้ดูเหมือนทางตัน จึงให้เลือกช่องทางก่อน
  //   password = default เดิมของหน้า sign-in ปกติ
  //   otp = ฟอร์มเบอร์โทร (default ถ้ามี prefillPhone ถูกต้อง — มาจาก SMS link)
  const [loginMode, setLoginMode] = useState<'channels' | 'password' | 'otp'>(
    prefillPhone ? 'otp' : orderContext ? 'channels' : 'password',
  )
  // toggle แสดง/ซ่อนรหัสผ่าน (eye icon) — consistent กับ sign-up/new-pass
  const [isPasswordShown, setIsPasswordShown] = useState(false)

  const pwForm = useForm<PwFormValues>({
    resolver: yupResolver(pwSchema),
    defaultValues: { username: '', password: '' },
  })

  const otpForm = useForm<PhoneFormValues>({
    resolver: yupResolver(phoneSchema),
    defaultValues: { phone: prefillPhone ?? '' },
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

  // เนื้อหาส่วนฟอร์ม/ปุ่ม — ใช้ร่วมกันทั้งเชลล์ปกติและเชลล์ลิงก์ออเดอร์ เพื่อไม่ให้ handler
  // การ login (OAuth / OTP / password) ถูก duplicate สองชุด
  const body = (
    <>
      <div className='flex flex-col gap-1 mbe-6'>
        <Typography variant='h4'>
          {orderContext ? 'ยืนยันตัวตนเพื่อดูคำสั่งซื้อ' : `ยินดีต้อนรับสู่ ${META_DATA.name}`}
        </Typography>
        <Typography>
          {loginMode === 'channels'
            ? 'เลือกช่องทางที่สะดวก ใช้เวลาไม่ถึงหนึ่งนาที'
            : loginMode === 'password'
              ? 'เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน'
              : 'กรอกเบอร์โทรเพื่อรับรหัส OTP เข้าสู่ระบบ'}
        </Typography>
      </div>

      {loginMode === 'channels' ? (
              /* หน้าเลือกช่องทาง — ทุกทางเข้าต้องอยู่เหนือ fold ใน in-app browser ของ Messenger
                 minBlockSize 46: ปุ่ม MUI ปกติสูง 38px ซึ่งต่ำกว่าเกณฑ์เป้าแตะ 44px (วัดจริงแล้ว)
                 ตัวเลขนี้จึงบังคับไว้ ไม่ปล่อยตาม default ของธีม */
              <div className='flex flex-col gap-2.5 [&_.MuiButton-root]:min-bs-[46px]'>
                {/* ── ทางหลัก: เบอร์โทร ──────────────────────────────────────────────
                    🛑 เดิม Facebook เป็นปุ่ม `contained` (ม่วงทึบ) ตัวเดียวในจอ ส่วนเบอร์โทร
                    เป็น `outlined` อันดับสาม — กลับหัวกับความจริงว่า **เบอร์เป็นทางเดียวที่จบใน
                    ขั้นตอนเดียว** เพราะมันคือสิ่งที่ผูกกับออเดอร์อยู่แล้ว (`PHONE_MATCH_AUTO_CLAIM`)
                    ส่วนโซเชียลดูเร็วกว่าตอนกดแต่พาไปเจอด่านเบอร์ทีหลังเสมอ — บน prod มี 6 ใน 10
                    บัญชีที่ไม่มีเบอร์ผูกเลย จึงเป็นเส้นทางหลัก ไม่ใช่ edge case
                    (มติ D-5 / FR-023 / BR-BOE-26 — safepay-ux Design Spec 2026-08-12)

                    ใช้ `size='large'` ของธีมแทนการ hardcode ความสูง: ปุ่มรองถูกยกพื้นเป็น 46px
                    ด้วย `min-bs` ข้างบนอยู่แล้ว การสร้าง "ลำดับชั้น" ต้องมาจาก token ที่ให้ทั้ง
                    ความสูง/ฟอนต์/radius ต่างกันอย่างมีที่มา ไม่ใช่เลขที่เดาเอง */}
                <Button
                  fullWidth
                  variant='contained'
                  size='large'
                  startIcon={<i className='tabler-device-mobile' />}
                  onClick={() => setLoginMode('otp')}
                >
                  เข้าสู่ระบบด้วยเบอร์โทร
                </Button>
                {/* บอกทั้งเงื่อนไข (ต้องเป็นเบอร์เดียวกับตอนสั่ง) และผลลัพธ์ (ทันที) — ตรงกับ
                    `resolveOrderAccess` จริง ไม่ overclaim ว่าทุกกรณีจะทันที */}
                <Typography variant='caption' color='text.secondary' className='text-center -mbs-1'>
                  เบอร์เดียวกับที่แจ้งร้านตอนสั่งซื้อ — เข้าดูคำสั่งซื้อได้ทันที
                </Typography>

                <Divider className='gap-2 text-textPrimary'>หรือ</Divider>

                {/* 🛑 เปิดเผยด่านเบอร์ **ก่อน** ผู้ใช้กด ไม่ใช่ปล่อยให้ไปเจอเองหลัง OAuth เสร็จ
                    ใช้คำว่า "อาจ" เพราะจริงแค่บางเคส (6/10 ไม่ใช่ 10/10) — ไม่ทำให้ทางเลือกอื่น
                    ดูแย่เกินจริง · text.secondary ไม่ใช่ text.disabled (2.30:1 ตก AA) */}
                <Typography
                  variant='caption'
                  color='text.secondary'
                  className='flex items-start gap-1.5 text-start'
                >
                  <i className='tabler-info-circle text-[16px] shrink-0 mbs-0.5' />
                  <span>ช่องทางด้านล่างอาจต้องยืนยันเบอร์เพิ่มอีกขั้น ถ้าบัญชียังไม่เคยผูกเบอร์ไว้</span>
                </Typography>

                <Button
                  fullWidth
                  variant='outlined'
                  color='secondary'
                  startIcon={<i className='tabler-brand-facebook-filled' />}
                  onClick={() => signIn('facebook', { callbackUrl: safeCallbackUrl })}
                >
                  ดำเนินการต่อด้วย Facebook
                </Button>
                {/* LINE brand green #06C755 — brand asset exception (Hard Rule 6) */}
                <Button
                  fullWidth
                  variant='outlined'
                  color='secondary'
                  startIcon={<Icon icon='ri:line-fill' width={20} height={20} style={{ color: '#06C755' }} />}
                  onClick={() => signIn('line', { callbackUrl: '/auth/callback/line' })}
                >
                  ดำเนินการต่อด้วย LINE
                </Button>
                {/* Instagram หายไปจากบล็อกนี้มาตลอด ทั้งที่มีอยู่ในบล็อก password/otp ด้านล่าง
                    (safepay-ux จับได้) — "ไม่ตัดทางไหนทิ้ง" ต้องจริงทั้งระบบ ไม่ใช่แค่บล็อกที่แก้ */}
                {process.env.NEXT_PUBLIC_ENABLE_IG_LOGIN === 'true' && (
                  <Button
                    fullWidth
                    variant='outlined'
                    color='secondary'
                    startIcon={<Icon icon='ri:instagram-fill' width={20} height={20} style={{ color: '#E1306C' }} />}
                    onClick={() => signIn('instagram', { callbackUrl: '/auth/callback/instagram' })}
                  >
                    {/* Instagram brand pink #E1306C — brand asset exception (Hard Rule 6) */}
                    ดำเนินการต่อด้วย Instagram
                  </Button>
                )}
                <Typography
                  component='button'
                  type='button'
                  onClick={() => setLoginMode('password')}
                  color='primary.main'
                  className='text-center mbs-3'
                  sx={{ background: 'none', border: 0, cursor: 'pointer' }}
                >
                  เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน
                </Typography>
              </div>
            ) : loginMode === 'password' ? (
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
                  {/* พื้นที่แตะ 44px — ลิงก์เดิมสูงตามตัวหนังสือ 20px (DESIGN.md §Do's) */}
                  <Typography
                    component={Link}
                    href='/auth/reset-pass'
                    color='primary.main'
                    className='text-[13px] inline-flex items-center min-bs-11'
                  >
                    ลืมรหัสผ่าน?
                  </Typography>
                </div>
                {pwForm.formState.errors.root && (
                  <Typography color='error.main' className='text-[13px] text-center'>
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
                  /* พื้นที่แตะ 44px — นี่คือ `<button>` จริง ไม่ใช่ข้อความ (สลับไปโหมด OTP) */
                  sx={{ background: 'none', border: 0, cursor: 'pointer', minBlockSize: 44 }}
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

            {/* ปุ่มกลับไปหน้าเลือกช่องทาง — เฉพาะตอนมาจากลิงก์ออเดอร์แล้วผู้ใช้กดเข้าฟอร์มใดฟอร์มหนึ่ง
                กัน dead-end: เลือกช่องทางผิดแล้วต้องย้อนกลับได้โดยไม่ต้องกด back ของเบราว์เซอร์
                (in-app browser ของ Messenger ปุ่ม back อยู่ไกลมือ) */}
            {orderContext && loginMode !== 'channels' && (
              <div className='flex justify-center mbs-6'>
                <Typography
                  component='button'
                  type='button'
                  onClick={() => setLoginMode('channels')}
                  color='primary.main'
                  sx={{ background: 'none', border: 0, cursor: 'pointer' }}
                >
                  เลือกช่องทางอื่น
                </Typography>
              </div>
            )}

            {/* signup link + divider + ปุ่ม social — ซ่อนในโหมด channels เพราะปุ่ม social เป็นเนื้อหาหลัก
                ของโหมดนั้นอยู่แล้ว (ไม่งั้นจะมีปุ่ม Facebook/LINE ซ้ำสองชุดในจอเดียว) */}
            <div className={`flex flex-col gap-6 mbs-6 ${loginMode === 'channels' ? 'hidden' : ''}`}>
              <div className='flex justify-center items-center flex-wrap gap-2'>
                <Typography>ยังไม่มีบัญชี?</Typography>
                <Typography component={Link} href='/auth/sign-up' color='primary.main' className='inline-flex items-center min-bs-11'>
                  สมัครสมาชิก
                </Typography>
              </div>
              <Divider className='gap-2 text-textPrimary'>หรือ</Divider>
              <div className='flex flex-col gap-3'>
                {/* color='secondary': ปุ่ม social ไม่ใช่ CTA หลักของหน้า — ปล่อยให้ม่วง primary
                    อยู่ที่ปุ่ม submit ปุ่มเดียว ตาม One Voice (ม่วง ≤10% ของพื้นที่) */}
                <Button
                  fullWidth
                  variant='outlined'
                  color='secondary'
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
                  color='secondary'
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
                    color='secondary'
                    startIcon={<Icon icon='ri:instagram-fill' width={20} height={20} style={{ color: '#E1306C' }} />}
                    onClick={() => signIn('instagram', { callbackUrl: '/auth/callback/instagram' })}
                  >
                    {/* Instagram brand pink #E1306C — brand asset exception (Hard Rule 6) */}
                    เข้าสู่ระบบด้วย Instagram
                  </Button>
                )}
              </div>
            </div>

      {/* บรรทัดความปลอดภัย — วางติดปุ่มโดยตั้งใจ เพราะจุดที่ผู้ใช้ลังเลคือตอนกำลังจะกด
          ไม่ใช่ตอนอ่านหัวหน้า (ดู research 2026-07-25 เรื่อง trust signal placement)
          text.secondary ไม่ใช่ text.disabled — ประโยคนี้มีหน้าที่ "ลดความกลัวก่อนกดปุ่ม"
          แต่เดิมเป็นตัวอักษรที่จางที่สุดในจอ (ink 0.4 ≈ 2.3:1 ตก AA) คือขัดกับงานของตัวเอง */}
      {orderContext && loginMode === 'channels' && (
        <Typography variant='caption' color='text.secondary' className='block text-center mbs-3'>
          ใช้ยืนยันว่าคุณเป็นเจ้าของคำสั่งซื้อเท่านั้น
        </Typography>
      )}

      {!orderContext && (
        <Typography className='mt-7 text-center text-[13px]' color='text.disabled'>
          &copy; {currentYear} {META_DATA.name} — by {META_DATA.author}
        </Typography>
      )}
    </>
  )

  // เชลล์ "หน้าร้าน" — ใช้เมื่อมาจากลิงก์คำสั่งซื้อ (ภาพร้านเป็นภาพนำก่อนขอให้ล็อกอิน)
  // compact: ขั้นที่เป็นฟอร์มยุบ hero ลงเพื่อคืนพื้นที่ให้ช่องกรอก
  if (orderContext) {
    return (
      <OrderLinkShell ctx={orderContext} compact={loginMode !== 'channels'}>
        {body}
      </OrderLinkShell>
    )
  }

  // เชลล์เดิมของหน้า sign-in ปกติ — ไม่เปลี่ยนแปลง
  return (
    <div className='flex min-bs-[100dvh] justify-center items-center p-6'>
      <AuthIllustrationWrapper>
        <Card className='flex flex-col sm:is-[450px]'>
          <CardContent className='sm:!p-12'>
            <Link href='/' className='flex justify-center items-center min-bs-11 mbe-6'>
              <Logo />
            </Link>
            {body}
          </CardContent>
        </Card>
      </AuthIllustrationWrapper>
    </div>
  )
}
