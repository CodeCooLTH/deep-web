'use client'

/**
 * Lock screen สำหรับหน้า /o/[token] — multi-step OTP → signIn → account
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx
 *   - tier cover banner + frosted back + overlap avatar + verify badge + identity + trust chips
 *     คัดลอก pattern ตรงจาก OrderDetailMobile.tsx V1 (header เหมือนกันเป๊ะ → lock = หน้าเดียวกับ order detail)
 * OTP step pattern: VerifyOtpCard.tsx (OTPInput + Slot/FakeCaret + signIn('phone-otp',...) + resend)
 * Widgets adapted: unlock form card (CustomTextField + ink CTA) จัดกลางกรอบ + footer "ปกป้องการซื้อขายโดย Deep"
 * Layout: ใน MobileFrame (desktop = phone device, mobile = เต็มจอ) — แก้ปัญหา desktop ดูไม่เป็นมือถือ
 *
 * Redesign 2026-05-24 — V1 Profile-consistent (user: "ให้สอดคล้องกับ order details" + เอา cover banner กลับ)
 * OTP rewrite 2026-05-24 — T4+T5 (S-3, S-4, S-5, S-7, S-9):
 *   - Step 1 (phone): validate → POST /api/otp/send → รับ isNewUser → ไป Step 2
 *   - Step 2 (OTP + ชื่อ): OTPInput 6 หลัก + ช่อง "ชื่อ" เฉพาะ isNewUser; resend + countdown 60s
 *   - submit → signIn('phone-otp', {phone,otp,mode,displayName?,redirect:false}) → onSignedIn()
 *   - ไม่เรียก /api/otp/verify แยก (OTP ถูก consume ใน signIn)
 *
 * Props:
 *   orderHint: string — short token hint ("#xxxxxxxx")
 *   shop?: ShopPreview — ร้านค้าสำหรับ header (FR-UX-1 anti-scam)
 *   onSignedIn: () => void — callback หลัง signIn สำเร็จ (ใช้ router.refresh() ใน PublicOrderClient)
 *   prefilledPhone?: string — เบอร์ pre-fill (SMS-path account prompt)
 *   startAtOtpStep?: boolean — เริ่มที่ step 2 ทันที (SMS-path: pre-fill + trigger OTP send)
 */
import { useEffect, useState, useRef, type FormEvent } from 'react'

import Link from 'next/link'

import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'
import classnames from 'classnames'
import { OTPInput } from 'input-otp'
import type { SlotProps } from 'input-otp'
import { signIn } from 'next-auth/react'

import CustomTextField from '@core/components/mui/TextField'

import { getTierLabel, getTierColor, getTierCover } from '@/lib/trust-tier'

import styles from '@/libs/styles/inputOtp.module.css'

import MobileFrame from './MobileFrame'

// ── OTP input Slot + FakeCaret (ลอกจาก VerifyOtpCard.tsx เป๊ะ) ──────────────
const Slot = (props: SlotProps) => (
  <div className={classnames(styles.slot, { [styles.slotActive]: props.isActive })}>
    {props.char !== null && <div>{props.char}</div>}
    {props.hasFakeCaret && <FakeCaret />}
  </div>
)

const FakeCaret = () => (
  <div className={styles.fakeCaret}>
    <div className='w-px h-5 bg-textPrimary' />
  </div>
)

type ShopPreview = {
  shopName: string
  trustScore: number
  maxVerifyLevel: number
  username: string
  /** raw avatar URL — แสดงใน header; null = letter fallback */
  avatar: string | null
}

type Props = {
  /** Short order token hint (e.g. "#546cf3c0") */
  orderHint: string
  /** ข้อมูลร้านสำหรับ header — buyer เห็นร้านก่อนกรอกเบอร์ (FR-UX-1 anti-scam) */
  shop?: ShopPreview
  /** callback หลัง signIn สำเร็จ — PublicOrderClient ใช้ router.refresh() */
  onSignedIn: () => void
  /** เบอร์ pre-fill สำหรับ SMS-path account prompt */
  prefilledPhone?: string
  /**
   * เริ่มที่ step OTP ทันที (ใช้กับ prefilledPhone):
   * PhoneUnlock จะยิง /api/otp/send ครั้งแรกอัตโนมัติ + เรียน isNewUser
   */
  startAtOtpStep?: boolean
}

const RESEND_SECONDS = 60

export default function PhoneUnlock({
  orderHint,
  shop,
  onSignedIn,
  prefilledPhone,
  startAtOtpStep,
}: Props) {
  // ── step 1: phone ──────────────────────────────────────────────────────────
  const [phone, setPhone] = useState(prefilledPhone ?? '')
  const [step1Error, setStep1Error] = useState<string | null>(null)
  const [step1Loading, setStep1Loading] = useState(false)

  // ── step 2: OTP + name ────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(startAtOtpStep && prefilledPhone ? 2 : 1)
  const [isNewUser, setIsNewUser] = useState(true) // default true = defensive show ชื่อ
  const [otp, setOtp] = useState('')
  const [name, setName] = useState('')
  const [step2Error, setStep2Error] = useState<string | null>(null)
  const [step2Loading, setStep2Loading] = useState(false)

  // ── resend countdown ──────────────────────────────────────────────────────
  const [countdown, setCountdown] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCountdown = () => {
    setCountdown(RESEND_SECONDS)
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current) }, [])

  // ── startAtOtpStep: ยิง /api/otp/send อัตโนมัติเมื่อ mount ด้วย prefilledPhone ──
  const autoSentRef = useRef(false)
  useEffect(() => {
    if (!startAtOtpStep || !prefilledPhone || autoSentRef.current) return
    autoSentRef.current = true
    void sendOtp(prefilledPhone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── helper: POST /api/otp/send ────────────────────────────────────────────
  const sendOtp = async (targetPhone: string): Promise<boolean> => {
    const res = await fetch('/api/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact: targetPhone, type: 'phone' }),
    })
    if (res.status === 429) return false
    if (!res.ok) return false
    const data = await res.json().catch(() => ({}))
    // isNewUser: ถ้า API ไม่คืน (DB error) → ใช้ true defensive (แสดงช่องชื่อ)
    setIsNewUser(typeof data.isNewUser === 'boolean' ? data.isNewUser : true)
    return true
  }

  // ── Step 1 submit ─────────────────────────────────────────────────────────
  const handleStep1Submit = async (e: FormEvent) => {
    e.preventDefault()
    setStep1Error(null)

    if (!/^0[0-9]{9}$/.test(phone)) {
      setStep1Error('เบอร์ต้องขึ้นต้นด้วย 0 และมี 10 หลัก')
      return
    }

    setStep1Loading(true)
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: phone, type: 'phone' }),
      })
      if (res.status === 429) {
        setStep1Error('ขอ OTP บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่')
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setStep1Error(data?.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
        return
      }
      const data = await res.json().catch(() => ({}))
      setIsNewUser(typeof data.isNewUser === 'boolean' ? data.isNewUser : true)
      setOtp('')
      setName('')
      setStep2Error(null)
      startCountdown()
      setStep(2)
    } finally {
      setStep1Loading(false)
    }
  }

  // ── Step 2 resend ─────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (countdown > 0) return
    const ok = await sendOtp(phone)
    if (ok) {
      setOtp('')
      setStep2Error(null)
      startCountdown()
    } else {
      setStep2Error('ขอ OTP บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่')
    }
  }

  // ── Step 2 submit ─────────────────────────────────────────────────────────
  const handleStep2Submit = async (e: FormEvent) => {
    e.preventDefault()
    setStep2Error(null)

    if (otp.length !== 6) {
      setStep2Error('กรุณากรอกรหัส OTP 6 หลัก')
      return
    }
    if (isNewUser && !name.trim()) {
      setStep2Error('กรุณากรอกชื่อของคุณ')
      return
    }

    setStep2Loading(true)
    try {
      const res = await signIn('phone-otp', {
        phone,
        otp,
        mode: isNewUser ? 'signup' : 'signin',
        ...(isNewUser ? { displayName: name.trim() } : {}),
        redirect: false,
      })
      if (res?.ok) {
        onSignedIn()
        return
      }
      setStep2Error('รหัส OTP ไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่')
    } catch {
      setStep2Error('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setStep2Loading(false)
    }
  }

  // ── tier helpers (SSOT) ────────────────────────────────────────────────────
  const tierLabel = shop ? getTierLabel(shop.trustScore) : ''
  const tierColor = shop ? getTierColor(shop.trustScore) : 'default'
  const tierCover = shop ? getTierCover(shop.trustScore) : ''
  const avatarLetter = shop ? shop.shopName.slice(0, 1) : ''

  const chipSx = { fontSize: '10.5px', fontWeight: 700, height: 22, borderRadius: 999, '& .MuiChip-label': { px: '9px' } }

  // ── step 2 submit disable guard ───────────────────────────────────────────
  // disabled เมื่อ: otp ไม่ครบ 6 หลัก หรือ isNewUser+ชื่อว่าง หรือ loading
  const step2Disabled = step2Loading || otp.length !== 6 || (isNewUser && !name.trim())

  return (
    // header เหมือน order detail V1 + ฟอร์มเต็มแผ่นขาว — ในกรอบ MobileFrame (desktop = phone device)
    <MobileFrame bg='#fff'>
      {/* ── header (banner + overlap avatar + identity) — เฉพาะเมื่อมีข้อมูลร้าน ── */}
      {shop && (
        <>
          {/* 1. Tier cover banner + frosted back — pattern ตรงจาก OrderDetailMobile V1 */}
          <Box
            sx={{
              height: 130,
              flexShrink: 0,
              position: 'relative',
              overflow: 'hidden',
              backgroundImage: `url(${tierCover})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              bgcolor: '#E2E8F0',
            }}
          >
            <Link href='/' style={{ textDecoration: 'none' }}>
              <IconButton
                aria-label='กลับหน้าหลัก'
                title='กลับหน้าหลัก'
                sx={{
                  position: 'absolute',
                  top: 13,
                  left: 13,
                  zIndex: 3,
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  bgcolor: 'rgba(255,255,255,0.92)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.6)',
                  boxShadow: '0 2px 6px rgba(0,0,0,.12)',
                  color: '#0F172A',
                  '&:hover': { bgcolor: 'rgba(255,255,255,1)' },
                }}
              >
                <Icon icon='tabler-arrow-left' fontSize={18} />
              </IconButton>
            </Link>
          </Box>

          {/* 2. Hero: overlap avatar + identity — pattern ตรงจาก OrderDetailMobile V1 */}
          <Box sx={{ bgcolor: '#fff', mt: '-40px', pb: '12px', textAlign: 'center', flexShrink: 0 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', position: 'relative', mt: '-40px', mb: '8px' }}>
              <Box sx={{ position: 'relative', width: 78, height: 78 }}>
                <Avatar
                  src={shop.avatar ?? undefined}
                  alt={shop.shopName}
                  sx={{
                    width: 78,
                    height: 78,
                    borderRadius: '50%',
                    border: '4px solid #fff',
                    boxShadow: '0 6px 14px rgba(15,23,42,.16)',
                    fontSize: '1.75rem',
                    fontWeight: 800,
                    bgcolor: '#E2E8F0',
                    color: '#475569',
                  }}
                >
                  {avatarLetter}
                </Avatar>
                {shop.maxVerifyLevel >= 1 && (
                  <Box
                    component='span'
                    title='ยืนยันแล้ว'
                    sx={{
                      position: 'absolute',
                      bottom: 1,
                      right: 1,
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      bgcolor: '#1D9BF0',
                      color: 'white',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: '11px',
                      fontWeight: 900,
                      border: '3px solid white',
                      boxShadow: '0 1px 4px rgba(29,155,240,.4)',
                    }}
                  >
                    ✓
                  </Box>
                )}
              </Box>
            </Box>

            <Link href={`/u/${shop.username}`} style={{ textDecoration: 'none' }}>
              <Typography
                component='span'
                sx={{
                  display: 'block',
                  fontSize: 18,
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: '#0F172A',
                  lineHeight: 1.2,
                }}
              >
                {shop.shopName}
              </Typography>
            </Link>

            <Typography sx={{ fontSize: 12, color: '#64748B', mt: '2px' }}>@{shop.username}</Typography>

            <Box sx={{ display: 'flex', gap: '5px', justifyContent: 'center', mt: '7px', flexWrap: 'wrap', px: 2 }}>
              {shop.maxVerifyLevel >= 1 && (
                <Chip size='small' label='✓ ยืนยันแล้ว' sx={{ ...chipSx, bgcolor: '#E5F4FE', color: '#0C7DC2' }} />
              )}
              <Chip size='small' color={tierColor} label={tierLabel} sx={chipSx} />
              <Chip size='small' label={`Trust ${shop.trustScore}`} sx={{ ...chipSx, bgcolor: '#EEF2F7', color: '#334155' }} />
            </Box>
          </Box>
        </>
      )}

      {/* ── mid: ฟอร์ม step 1 หรือ step 2 — flex:1 จัดกึ่งกลางพื้นที่ที่เหลือ ── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', px: '28px' }}>

        {/* ━━━━━━━━━━━━━━━ STEP 1: กรอกเบอร์ ━━━━━━━━━━━━━━━ */}
        {step === 1 && (
          <>
            <Typography sx={{ textAlign: 'center', fontSize: 17, fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
              ยืนยันตัวตนเพื่อดูคำสั่งซื้อ
            </Typography>
            <Typography sx={{ textAlign: 'center', fontSize: 13, color: '#64748B', mt: '4px', mb: '22px' }}>
              กรอกเบอร์โทรที่ใช้ติดต่อกับร้านนี้
            </Typography>

            <form onSubmit={handleStep1Submit} noValidate autoComplete='off'>
              <CustomTextField
                autoFocus
                fullWidth
                label='เบอร์โทรศัพท์'
                placeholder='08xxxxxxxx'
                type='tel'
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'tel', maxLength: 10 } }}
                error={!!step1Error}
                helperText={step1Error ?? `สำหรับคำสั่งซื้อ ${orderHint}`}
              />
              {/* ink CTA — #0F172A เหมือน CTA ของ order detail V1 */}
              <Button
                type='submit'
                fullWidth
                disabled={step1Loading || phone.length !== 10}
                startIcon={step1Loading ? <CircularProgress size={18} color='inherit' /> : undefined}
                sx={{
                  mt: '18px',
                  minHeight: 48,
                  bgcolor: '#0F172A',
                  color: '#fff',
                  borderRadius: '13px',
                  fontSize: 14.5,
                  fontWeight: 800,
                  textTransform: 'none',
                  '&:hover': { bgcolor: '#1E293B' },
                  '&.Mui-disabled': { bgcolor: '#CBD5E1', color: '#fff' },
                }}
              >
                {step1Loading ? 'กำลังส่ง OTP…' : 'รับรหัส OTP'}
              </Button>
            </form>
          </>
        )}

        {/* ━━━━━━━━━━━━━━━ STEP 2: OTP + ชื่อ (ถ้า isNewUser) ━━━━━━━━━━━━━━━ */}
        {step === 2 && (
          <>
            <Typography sx={{ textAlign: 'center', fontSize: 17, fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
              {isNewUser ? 'สร้างบัญชีเพื่อดูคำสั่งซื้อ' : 'ยืนยัน OTP เพื่อเข้าสู่ระบบ'}
            </Typography>
            <Typography sx={{ textAlign: 'center', fontSize: 13, color: '#64748B', mt: '4px', mb: '22px' }}>
              ส่งรหัส 6 หลักไปยัง{' '}
              <Box component='span' sx={{ fontWeight: 700, color: '#0F172A' }}>
                {phone}
              </Box>
            </Typography>

            <form onSubmit={handleStep2Submit} noValidate autoComplete='off'>
              {/* OTP input — pattern ตรงจาก VerifyOtpCard.tsx */}
              <Box sx={{ mb: isNewUser ? '20px' : '0' }}>
                <Typography sx={{ fontSize: 13, color: '#475569', mb: '10px' }}>
                  รหัส OTP 6 หลัก
                </Typography>
                <OTPInput
                  onChange={setOtp}
                  value={otp}
                  maxLength={6}
                  autoFocus
                  containerClassName='flex items-center'
                  render={({ slots }) => (
                    <div className='flex items-center justify-between w-full gap-2'>
                      {slots.slice(0, 6).map((slot, idx) => (
                        <Slot key={idx} {...slot} />
                      ))}
                    </div>
                  )}
                />
              </Box>

              {/* ช่องชื่อ — แสดงเฉพาะ isNewUser (สร้างบัญชีครั้งแรก) */}
              {isNewUser && (
                <CustomTextField
                  fullWidth
                  label='ชื่อของคุณ'
                  placeholder='ระบุชื่อที่ต้องการใช้'
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  slotProps={{ htmlInput: { autoComplete: 'name', maxLength: 60 } }}
                  error={!!step2Error && !name.trim()}
                  helperText='ชื่อนี้จะแสดงในประวัติการซื้อ'
                />
              )}

              {/* error message */}
              {step2Error && (
                <Typography sx={{ fontSize: 13, color: 'error.main', textAlign: 'center', mt: '10px' }}>
                  {step2Error}
                </Typography>
              )}

              {/* CTA submit */}
              <Button
                type='submit'
                fullWidth
                disabled={step2Disabled}
                startIcon={step2Loading ? <CircularProgress size={18} color='inherit' /> : undefined}
                sx={{
                  mt: '18px',
                  minHeight: 48,
                  bgcolor: '#0F172A',
                  color: '#fff',
                  borderRadius: '13px',
                  fontSize: 14.5,
                  fontWeight: 800,
                  textTransform: 'none',
                  '&:hover': { bgcolor: '#1E293B' },
                  '&.Mui-disabled': { bgcolor: '#CBD5E1', color: '#fff' },
                }}
              >
                {step2Loading ? 'กำลังยืนยัน…' : isNewUser ? 'สร้างบัญชีและดูคำสั่งซื้อ' : 'เข้าดูคำสั่งซื้อ'}
              </Button>

              {/* resend + countdown */}
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', mt: '14px' }}>
                <Typography sx={{ fontSize: 13, color: '#64748B' }}>ไม่ได้รับ SMS?</Typography>
                <Typography
                  component='button'
                  type='button'
                  onClick={handleResend}
                  sx={{
                    fontSize: 13,
                    color: countdown > 0 ? '#94A3B8' : '#818CF8',
                    fontWeight: 600,
                    background: 'none',
                    border: 0,
                    padding: 0,
                    cursor: countdown > 0 ? 'default' : 'pointer',
                  }}
                >
                  {countdown > 0 ? `ส่งอีกครั้งใน ${countdown}s` : 'ส่งอีกครั้ง'}
                </Typography>
              </Box>

              {/* กลับ step 1 */}
              <Box sx={{ textAlign: 'center', mt: '10px' }}>
                <Typography
                  component='button'
                  type='button'
                  onClick={() => { setStep(1); setStep2Error(null) }}
                  sx={{
                    fontSize: 12,
                    color: '#94A3B8',
                    background: 'none',
                    border: 0,
                    padding: 0,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    textUnderlineOffset: '2px',
                  }}
                >
                  แก้ไขเบอร์โทร
                </Typography>
              </Box>
            </form>
          </>
        )}
      </Box>

      {/* ── footer ก้นกรอบ — ปกป้องการซื้อขายโดย Deep ── */}
      <Box sx={{ p: '20px', textAlign: 'center', flexShrink: 0 }}>
        <Typography
          sx={{
            fontSize: 10.5,
            color: '#94A3B8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
          }}
        >
          <Icon icon='tabler-shield-check' style={{ color: '#818CF8', fontSize: 12 }} />
          ปกป้องการซื้อขายโดย Deep
        </Typography>
      </Box>
    </MobileFrame>
  )
}
