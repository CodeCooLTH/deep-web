/**
 * VerifyOtpForm — client component จัดการ OTP input + countdown + submit
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/two-factor/page.tsx
 * (form + OTP boxes section; extracted เป็น client component เพราะต้องการ useSearchParams)
 *
 * สิ่งที่เพิ่มจาก theme:
 * - รับ mode (signup/signin/reset), phone, name, username, shopName จาก searchParams
 * - masked phone text-2xl font-bold text-center
 * - countdown 60s: >0 = text จาง; =0 = link ส่งอีกครั้ง
 * - mobile OTP: gap-1.5 / text-lg ให้ tap ได้ที่ 375px (OQ-4)
 * - mode=signup: อ่าน sessionStorage signupDraft → signIn('phone-otp') → clear draft → /dashboard
 * - mode=signin: signIn('phone-otp') เปล่า ๆ (ไม่มี draft ให้ carry เพราะไม่ได้สมัครใหม่) →
 *   callbackUrl. ทางเข้านี้มีไว้ให้บัญชีที่มีอยู่แล้วแต่ไม่มีรหัสผ่าน (สมัครด้วย OTP ล้วน)
 *   เข้าฝั่งผู้ขายได้ — ถ้ายังไม่มีร้าน layout จะพาไป /choose-shop ให้กด "เปิดร้านของฉัน" ต่อเอง
 * - mode=reset: ไม่ consume OTP ที่นี่ (กัน double-consume) — เก็บ {phone,otp} ใน sessionStorage resetDraft → /auth/new-pass
 * - pacesToast เท่านั้น (Hard Rule 9)
 */
'use client'

import { pacesToast } from '@/lib/paces-toast'
import { distributeOtpPaste, otpFocusIndexAfterPaste } from '@/lib/otp-paste'
import { safeCallbackUrl } from '@/lib/safe-callback-url'
import { cn } from '@/utils/helpers'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useCallback, useState, type FormEvent } from 'react'

export default function VerifyOtpForm() {
  const router = useRouter()
  const params = useSearchParams()

  const phone = params.get('phone') ?? ''
  const mode = (params.get('mode') ?? 'signup') as 'signup' | 'signin' | 'reset'
  // ปลายทางหลังล็อกอินสำเร็จ (mode=signin) — มาจาก query string จึงต้อง sanitize (open-redirect)
  const callbackUrl = safeCallbackUrl(params.get('callbackUrl'))
  const name = params.get('name') ?? ''
  const username = params.get('username') ?? ''
  // shopName ส่งมาจาก sign-up ผ่าน query — ใช้เฉพาะ mode=signup
  const shopName = params.get('shopName') ?? ''

  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  // countdown 60 วินาที — เริ่มทันที (mount)
  const [countdown, setCountdown] = useState(60)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Redirect ถ้าไม่มี phone context เลย
  useEffect(() => {
    if (!phone) router.replace('/auth/sign-in')
  }, [phone, router])

  // countdown tick — เริ่มตั้งแต่ mount; หยุดเมื่อถึง 0
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // masked phone: ****6789
  const masked = phone
    ? `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`
    : ''

  const handleDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 1)
    const next = [...digits]
    next[i] = clean
    setDigits(next)
    // auto-focus ช่องถัดไป
    if (clean && i < 5) {
      const nextEl = document.getElementById(`otp-${i + 1}`) as HTMLInputElement | null
      nextEl?.focus()
    }
  }

  /**
   * วางรหัสทั้งชุดลงช่องไหนก็ได้ → กระจายเข้าทุกช่อง
   *
   * 🛑 ช่องละหลักแบบนี้ "กลืน" การวางโดยปริยาย: `maxLength={1}` ทำให้เบราว์เซอร์ตัดเหลือตัวแรก
   * ตัวเดียวเงียบ ๆ ผู้ใช้ที่ก็อปรหัสจากแบนเนอร์ SMS มาวาง (ท่าปกติของคนที่พิมพ์บนคีย์บอร์ด
   * มือถือไม่ถนัด — ตัวเลขอยู่คนละแป้น) จะเห็นแค่หลักเดียวโผล่ แล้วอ่านว่า "ระบบพัง"
   * ไม่ใช่ "ฉันทำผิด" — และไม่มี error ให้ใครเห็นเพราะไม่มีอะไรผิดในทางเทคนิคเลย
   */
  const handlePaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text')
    if (!/\d/.test(pasted)) return
    e.preventDefault()
    setDigits(distributeOtpPaste(digits, i, pasted))
    const target = document.getElementById(
      `otp-${otpFocusIndexAfterPaste(i, pasted)}`,
    ) as HTMLInputElement | null
    target?.focus()
  }

  // handle backspace — ถอยกลับช่องก่อนหน้า
  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      const prevEl = document.getElementById(`otp-${i - 1}`) as HTMLInputElement | null
      prevEl?.focus()
    }
  }

  const otp = digits.join('')
  const otpComplete = otp.length === 6

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!otpComplete) {
        setErrorMsg('กรุณากรอกรหัส 6 หลัก')
        return
      }
      setErrorMsg(null)
      setSubmitting(true)

      try {
        if (mode === 'signup') {
          // อ่าน draft ที่ sign-up ฝากไว้ — password/category ไม่เดินทางใน URL
          let password = ''
          let category = ''
          try {
            const raw = sessionStorage.getItem('signupDraft')
            if (raw) {
              const draft = JSON.parse(raw) as { password?: string; category?: string }
              password = draft.password ?? ''
              category = draft.category ?? ''
            }
          } catch {
            // sessionStorage parse fail → ดำเนินการต่อโดยไม่มี draft (server จะ reject ถ้าจำเป็น)
          }

          const result = await signIn('phone-otp', {
            phone,
            otp,
            mode: 'signup',
            displayName: name,
            username,
            shopName,
            password,
            category,
            redirect: false,
          })

          if (result?.ok) {
            // clear draft ทันทีหลัง signIn สำเร็จ — password หมดอายุใช้งาน
            sessionStorage.removeItem('signupDraft')
            router.push('/dashboard')
            return
          }

          setErrorMsg('รหัสไม่ถูกต้องหรือหมดอายุ ลองอีกครั้ง')
          setDigits(['', '', '', '', '', ''])
        } else if (mode === 'signin') {
          // เข้าบัญชีเดิม — ไม่ส่ง displayName/username/shopName/password ไปเลย
          // (ค่าพวกนั้นมีผลเฉพาะตอน provider สร้างบัญชีใหม่ ส่งไปก็ถูกเมินและชวนให้เข้าใจผิด)
          const result = await signIn('phone-otp', {
            phone,
            otp,
            mode: 'signin',
            redirect: false,
          })

          if (result?.ok) {
            router.push(callbackUrl)
            return
          }

          setErrorMsg('รหัสไม่ถูกต้องหรือหมดอายุ ลองอีกครั้ง')
          setDigits(['', '', '', '', '', ''])
        } else {
          // mode=reset — ห้าม consume OTP ที่นี่ (กัน double-consume)
          // set-password (/auth/new-pass) เป็นที่ verifyOtp จริงที่เดียว
          // otp ไม่อยู่ใน URL เพื่อกัน leak ผ่าน Referer/history
          sessionStorage.setItem('resetDraft', JSON.stringify({ phone, otp }))
          router.push('/auth/new-pass')
        }
      } catch {
        setErrorMsg('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
      } finally {
        setSubmitting(false)
      }
    },
    [mode, otpComplete, otp, phone, name, username, shopName, callbackUrl, router]
  )

  const onResend = useCallback(async () => {
    if (!phone || resending) return
    setResending(true)
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: phone, type: 'PHONE' }),
      })
      if (res.ok) {
        pacesToast.success('ส่งรหัสใหม่แล้ว')
        setDigits(['', '', '', '', '', ''])
        setErrorMsg(null)
        // reset countdown
        setCountdown(60)
        if (intervalRef.current) clearInterval(intervalRef.current)
        intervalRef.current = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              if (intervalRef.current) clearInterval(intervalRef.current)
              return 0
            }
            return prev - 1
          })
        }, 1000)
      } else {
        pacesToast.error('ส่งรหัสใหม่ไม่สำเร็จ กรุณาลองอีกครั้ง')
      }
    } catch {
      pacesToast.error('ส่งรหัสใหม่ไม่สำเร็จ กรุณาลองอีกครั้ง')
    } finally {
      setResending(false)
    }
  }, [phone, resending])

  if (!phone) return null

  return (
    <>
      {/* masked phone — text-2xl font-bold text-center ตาม spec S-P2-3 */}
      <div
        className={cn(
          'text-center text-2xl font-bold text-default-900',
          mode === 'signin' ? 'mb-2' : 'mb-6',
        )}
      >
        {masked}
      </div>

      {/* mode=signin มาจากคนที่เพิ่งเจอว่า "เบอร์นี้มีบัญชีแล้ว" — ต้องยืนยันตรงนี้ว่าเรากำลังพา
          เข้าบัญชีเดิม ไม่ใช่กำลังสมัครใหม่ ไม่งั้นจอนี้หน้าตาเหมือนตอนสมัครทุกประการ */}
      {mode === 'signin' && (
        <p className="text-default-500 mb-6 text-center text-sm">เข้าสู่ระบบเข้าบัญชีเดิมของคุณ</p>
      )}

      <form onSubmit={onSubmit}>
        <div className="mb-5">
          <label className="form-label">
            กรอกรหัส 6 หลัก<span className="text-danger">*</span>
          </label>
          {/* OTP boxes: gap-1.5/text-lg บน mobile ให้ tap ได้ที่ 375px (OQ-4) */}
          <div className="two-factor flex gap-1.5 sm:gap-2">
            {digits.map((d, i) => (
              <input
                key={i}
                id={`otp-${i}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleDigit(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={(e) => handlePaste(i, e)}
                className={cn('form-input text-center text-lg sm:text-base', errorMsg && '!border-danger')}
                autoFocus={i === 0}
                autoComplete="one-time-code"
              />
            ))}
          </div>
          {errorMsg && (
            <p className="invalid-msg mt-2 text-sm text-danger text-center">{errorMsg}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || !otpComplete}
          className="btn bg-primary w-full py-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {submitting ? 'กำลังยืนยัน...' : 'ยืนยันรหัส'}
        </button>
      </form>

      {/* countdown / resend section */}
      <p className="text-default-400 mt-6 text-center text-sm">
        {countdown > 0 ? (
          // จาง + ไม่ click ได้ — แค่ข้อความแจ้งเวลา
          <span>ยังไม่ได้รับ SMS? ส่งใหม่ใน {countdown} วินาที</span>
        ) : (
          // countdown หมด → แสดง link ส่งอีกครั้ง
          <button
            type="button"
            onClick={onResend}
            disabled={resending}
            className="text-primary font-semibold underline underline-offset-3 disabled:opacity-60"
          >
            {resending ? 'กำลังส่ง...' : 'ส่งอีกครั้ง'}
          </button>
        )}
      </p>
    </>
  )
}
