'use client'

/**
 * PhoneVerifyPrompt — feature 00015 S-2, ครอบ decision PHONE_VERIFY_REQUIRED
 *
 * ทำไม: ผู้ซื้อกดลิงก์ออเดอร์จากแชทแล้วล็อกอินด้วย Facebook (ทางที่สะดวกที่สุดและเป็นทางที่
 * หน้า sign-in ชูเป็นหลัก) แต่ Facebook ไม่ให้เบอร์โทรมา บัญชีที่เพิ่งสร้างจึงไม่มีเบอร์เสมอ
 * ระบบเลยพิสูจน์ไม่ได้ว่าเป็นเจ้าของออเดอร์ ก่อนหน้านี้เคสนี้เป็นทางตัน (มีแต่ปุ่มออกจากระบบ)
 * หน้านี้คือทางไปต่อ — ยืนยันเบอร์ที่ใช้สั่งซื้อด้วย OTP แล้วผูกเข้ากับบัญชี
 *
 * ไม่แสดงใบ้เบอร์ของออเดอร์เลยแม้แต่หลักเดียว (ต่างจาก ClaimOtpPrompt ที่โชว์ masked ได้ เพราะ
 * ที่นั่นเบอร์เป็นของ session user เอง) — ที่นี่ผู้ใช้ยังไม่ได้พิสูจน์ตัวว่าเกี่ยวข้องกับออเดอร์
 * การใบ้เบอร์จะเท่ากับปล่อย PII ของผู้ซื้อให้ใครก็ตามที่ถือลิงก์ ผู้ใช้จึงต้องกรอกเบอร์เอง
 *
 * คำเตือนเบอร์ผูกถาวร: เบอร์เป็น immutable (ตั้งครั้งเดียว เปลี่ยนเองไม่ได้) จึงต้องให้ผู้ใช้
 * ติ๊กยืนยันก่อนถึงจะกดส่ง OTP ได้ — ตั้งใจให้ "หยุดอ่าน" ไม่ใช่ helper text จาง ๆ ที่ถูกมองข้าม
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/auth/AuthIllustrationWrapper.tsx (shell)
 *   + src/app/(marketing)/o/[token]/ClaimOtpPrompt.tsx (Card layout + OtpSlots + resend pattern)
 *   + theme/vuexy/typescript-version/full-version/src/components/dialogs/two-factor-auth/index.tsx (Alert + Button pattern)
 */
import { useState, type FormEvent } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Typography from '@mui/material/Typography'

import { signIn } from 'next-auth/react'
import { toast } from 'react-toastify'

import CustomTextField from '@core/components/mui/TextField'
import Logo from '@components/layout/shared/Logo'

import AuthIllustrationWrapper from '@/views/pages/auth/AuthIllustrationWrapper'
import OtpSlots from '@/app/(marketing)/_components/OtpSlots'
import { currentYear, META_DATA } from '@/config/constants'
import { MOBILE_PHONE_RE, MOBILE_RULE_TEXT } from '@/lib/phone'

type Stage = 'phone' | 'otp'

export default function PhoneVerifyPrompt({ token }: { token: string }) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('phone')
  const [phone, setPhone] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [otp, setOtp] = useState('')
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // ข้อความอธิบายยาวสำหรับเคสที่ไปต่อในหน้านี้ไม่ได้ (บัญชีต้นทางมีข้อมูลแล้ว ฯลฯ)
  const [blocked, setBlocked] = useState<string | null>(null)
  // ticket เชื่อมบัญชี — มีค่าเมื่อเบอร์ที่ยืนยันเป็นของบัญชีเดิมที่เคยสมัครไว้ (S-5)
  const [linkTicket, setLinkTicket] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)

  const phoneValid = MOBILE_PHONE_RE.test(phone)

  const handleSend = async () => {
    setError(null)
    if (!phoneValid) {
      setError(MOBILE_RULE_TEXT)
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: phone, type: 'PHONE' }),
      })
      if (res.status === 429) {
        toast.warning('ขอรหัส OTP บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่')
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

  // ย้าย provider ที่ล็อกอินอยู่ไปผูกกับบัญชีเดิม แล้ว signIn ซ้ำเพื่อให้ session กลายเป็น
  // บัญชีเดิม (JWT ปัจจุบันยังชี้บัญชีที่เพิ่งถูกย้าย provider ออกไป จึงต้อง re-auth เสมอ)
  const handleLink = async () => {
    if (!linkTicket) return
    setLinking(true)
    setError(null)
    try {
      const res = await fetch(`/api/orders/${token}/link-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket: linkTicket }),
      })
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; provider?: string; error?: string; code?: string }
        | null

      if (res.ok && data?.provider) {
        await signIn(data.provider, { callbackUrl: `/o/${token}` })
        return
      }
      if (data?.code === 'SOURCE_HAS_DATA') {
        setLinkTicket(null)
        setBlocked(
          'บัญชีที่คุณใช้อยู่มีประวัติการใช้งานแล้ว จึงเชื่อมอัตโนมัติไม่ได้ กรุณาติดต่อแอดมินเพื่อรวมบัญชีให้',
        )
        return
      }
      if (data?.code === 'ALREADY_LINKED') {
        setLinkTicket(null)
        setBlocked(
          'บัญชีเดิมของคุณเชื่อมช่องทางนี้ไว้อยู่แล้ว กรุณาออกจากระบบแล้วเข้าสู่ระบบด้วยบัญชีเดิมโดยตรง',
        )
        return
      }
      setError(data?.error ?? 'เชื่อมบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setLinking(false)
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
      const res = await fetch(`/api/orders/${token}/verify-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      })
      if (res.ok) {
        toast.success('ยืนยันสำเร็จ')
        // page.tsx จะ re-eval resolveOrderAccess ใหม่ → คราวนี้ได้ OWNER_MATCH
        router.refresh()
        return
      }
      const data = (await res.json().catch(() => null)) as
        | { error?: string; code?: string; linkTicket?: string }
        | null

      // เบอร์นี้เป็นของบัญชีเดิมที่เคยสมัครไว้ → เสนอเชื่อมบัญชีให้เลย (S-5)
      // linkTicket = ผลการพิสูจน์ OTP ที่เพิ่งผ่าน ส่งต่อข้ามคำขอโดยไม่ต้องขอ OTP ซ้ำ
      if (data?.code === 'ACCOUNT_EXISTS' && data.linkTicket) {
        setLinkTicket(data.linkTicket)
        return
      }
      if (data?.code === 'ACCOUNT_EXISTS') {
        setBlocked(
          'เบอร์นี้มีบัญชีอยู่แล้ว — ออกจากระบบแล้วเข้าสู่ระบบใหม่ด้วยเบอร์นี้และรหัส OTP จากนั้นเปิดลิงก์คำสั่งซื้ออีกครั้ง',
        )
        return
      }
      if (data?.code === 'ACCOUNT_HAS_OTHER_PHONE') {
        setBlocked(
          'บัญชีที่คุณใช้อยู่ผูกกับเบอร์อื่นไว้แล้ว และเบอร์เปลี่ยนไม่ได้ — ออกจากระบบแล้วเข้าสู่ระบบด้วยเบอร์ที่ใช้สั่งซื้อแทน',
        )
        return
      }
      setError(data?.error ?? 'ยืนยันไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
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
            {/* 🛑 ตราแบรนด์ต้องเป็นลิงก์ — เหตุผลเดียวกับ `ClaimOtpPrompt.tsx` เป๊ะ:
                จอนี้ไม่มีทางออกอื่นเลย และ header ของ `FrontLayout` ที่เคยเป็นทางออกถูกถอด
                ออกในคอมมิตเดียวกันนี้ (`Logo.tsx` ไม่มี `href` ในตัว) */}
            <div className='flex justify-center mbe-6'>
              <Link href='/' aria-label='กลับหน้าแรก' className='inline-flex'>
                <Logo />
              </Link>
            </div>
            <div className='flex flex-col gap-1 mbe-6 text-center'>
              <Typography variant='h4'>ยืนยันเบอร์ที่ใช้สั่งซื้อ</Typography>
              <Typography>กรอกเบอร์โทรที่แจ้งไว้กับร้าน เพื่อยืนยันว่าคุณเป็นเจ้าของคำสั่งซื้อนี้</Typography>
            </div>

            {linkTicket ? (
              /* เบอร์ตรงกับบัญชีเดิมที่เคยสมัครไว้ — เสนอเชื่อมให้จบในปุ่มเดียว
                 ต้องอธิบายให้ชัดว่าเชื่อมแล้วได้อะไร ไม่ใช่แค่บอกว่ามีบัญชีอยู่แล้ว */
              <div className='flex flex-col gap-6'>
                <Alert severity='info'>
                  <Typography className='font-medium' color='text.primary'>
                    เบอร์นี้เคยสมัคร {META_DATA.name} ไว้แล้ว
                  </Typography>
                  <Typography variant='body2'>
                    เชื่อมบัญชีที่คุณเพิ่งเข้าสู่ระบบเข้ากับบัญชีเดิมได้เลย
                    ประวัติการสั่งซื้อและคะแนนความน่าเชื่อถือทั้งหมดจะอยู่ที่เดียวกัน
                    ครั้งต่อไปเข้าสู่ระบบด้วยช่องทางไหนก็ได้
                  </Typography>
                </Alert>

                {error && (
                  <Typography color='error.main' className='text-center text-sm'>
                    {error}
                  </Typography>
                )}

                <Button fullWidth variant='contained' onClick={handleLink} disabled={linking}>
                  {linking ? 'กำลังเชื่อมบัญชี…' : 'เชื่อมกับบัญชีเดิม'}
                </Button>

                <Typography
                  component='button'
                  type='button'
                  onClick={() => {
                    setLinkTicket(null)
                    setStage('phone')
                  }}
                  color='text.secondary'
                  className='text-center text-sm'
                  sx={{ background: 'none', border: 0, cursor: 'pointer' }}
                >
                  ใช้เบอร์อื่นแทน
                </Typography>
              </div>
            ) : blocked ? (
              <div className='flex flex-col gap-6'>
                <Alert severity='warning'>{blocked}</Alert>
                <Button fullWidth variant='contained' onClick={() => router.refresh()}>
                  ลองอีกครั้ง
                </Button>
              </div>
            ) : stage === 'phone' ? (
              <div className='flex flex-col gap-6'>
                <CustomTextField
                  autoFocus
                  fullWidth
                  label='เบอร์โทรศัพท์'
                  placeholder='08xxxxxxxx'
                  type='tel'
                  value={phone}
                  onChange={e => setPhone(e.target.value.trim())}
                  slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'tel', maxLength: 10 } }}
                  error={!!error}
                  helperText={error ?? undefined}
                />

                {/* คำเตือนเบอร์ผูกถาวร — ต้องติ๊กก่อนถึงส่ง OTP ได้ (เบอร์เป็น immutable) */}
                <Alert severity='warning'>
                  <Typography className='font-medium' color='text.primary'>
                    เบอร์นี้จะผูกกับบัญชีถาวร เปลี่ยนเองภายหลังไม่ได้
                  </Typography>
                  <Typography variant='body2'>
                    กรุณาตรวจสอบให้แน่ใจว่าเป็นเบอร์ที่คุณใช้สั่งซื้อกับร้านจริง
                  </Typography>
                </Alert>

                <FormControlLabel
                  control={
                    <Checkbox checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />
                  }
                  label='ตรวจสอบแล้ว เบอร์นี้ถูกต้อง'
                />

                <Button
                  fullWidth
                  variant='contained'
                  onClick={handleSend}
                  disabled={sending || !acknowledged || !phoneValid}
                >
                  {sending ? 'กำลังส่ง…' : 'ส่งรหัส OTP'}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate autoComplete='off' className='flex flex-col gap-6'>
                <div className='flex flex-col gap-2'>
                  <Typography>{`กรอกรหัส 6 หลักที่ส่งไปยัง ${phone}`}</Typography>
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
                  <Typography
                    component='button'
                    type='button'
                    onClick={() => {
                      setStage('phone')
                      setError(null)
                    }}
                    color='primary.main'
                    sx={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                  >
                    แก้เบอร์
                  </Typography>
                  <Typography color='text.secondary'>|</Typography>
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
                    {sending ? 'กำลังส่ง…' : 'ส่งรหัสอีกครั้ง'}
                  </Typography>
                </div>
              </form>
            )}

            {/* text.secondary ไม่ใช่ text.disabled — 0.4 ได้ 2.30:1 ตก AA (audit 2026-08-11) */}
            <Typography className='mt-7 text-center text-sm' color='text.secondary'>
              &copy; {currentYear} {META_DATA.name} — by {META_DATA.author}
            </Typography>
          </CardContent>
        </Card>
      </AuthIllustrationWrapper>
    </div>
  )
}
