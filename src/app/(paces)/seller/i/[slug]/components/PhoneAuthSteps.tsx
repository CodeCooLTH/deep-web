'use client'

/**
 * PhoneAuthSteps — สมัคร/เข้าสู่ระบบด้วยเบอร์โทรแบบสั้น ในหน้ารับคำเชิญ /i/[slug]
 * (feature 00012 ext)
 *
 * ทำไมต้องมี: เดิมผู้ถูกเชิญที่ยังไม่มีบัญชีมีทางเดียวคือหน้า /auth/sign-up ซึ่งเป็นฟอร์ม
 * "เปิดร้าน" เต็มรูป (ชื่อร้าน + หมวดหมู่ร้าน + username + password) แล้วสร้าง Personal shop
 * ให้ทันที → ผู้ถูกเชิญงงว่าตัวเองมาเป็นพนักงานร้านคนอื่น "จะสร้างร้านทำไม"
 *
 * สำคัญที่สุดในไฟล์นี้: ตอน signIn('phone-otp') **ห้ามส่ง shopName** — provider ใน src/lib/auth.ts
 * สร้าง Shop ก็ต่อเมื่อ `credentials.mode === 'signup' && shopName` เท่านั้น เมื่อไม่ส่ง จะได้
 * User เปล่า ๆ ไม่มีร้าน ซึ่งทำให้ jwt callback คำนวณ `needsRegistration/needsOnboarding` เป็น
 * false (สูตร `!!personal && …` — ไม่มี Personal shop = ไม่บังคับ) proxy จึงไม่เด้งไป /onboarding
 * = ผู้ถูกเชิญเข้าร้านได้เลยโดยไม่ต้องมีร้านของตัวเอง (Lazy Personal shop ของ feature 00012)
 *
 * 3 ขั้น: เบอร์ → (ชื่อที่แสดง เฉพาะเบอร์ใหม่) → OTP
 * แยกทางด้วย `isNewUser` ที่ POST /api/otp/send คืนมาอยู่แล้ว จึงไม่ต้องเรียก /api/users/check-phone
 * เพิ่มอีก 1 รอบ (และ oracle นั้นถูก gate ด้วย rate-limit ของ otp/send อยู่แล้ว)
 *
 * Base: src/app/(paces)/seller/register/page.tsx — multi-step + ช่อง OTP 6 หลัก
 *   (`form-input h-11 w-11 p-0 text-center font-mono text-lg` + auto-focus/backspace + countdown 60s)
 *   + sendOtp/onOtp handler ยกโครงมาทั้งชุด
 * UX Spec: docs/superpowers/specs/2026-08-01-invite-admins-modal-and-accept-mockup.html §B2
 */

import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { MOBILE_PHONE_RE } from '@/lib/phone'

type Step = 'phone' | 'name' | 'otp'

interface PhoneAuthStepsProps {
  /** ชื่อร้านที่เชิญ — ใช้ย้ำบริบทระหว่างกรอกฟอร์ม */
  shopName: string
  /** กลับไปหน้าเลือกวิธีเข้าสู่ระบบ */
  onBack: () => void
}

/**
 * draft ใน sessionStorage — ผู้ใช้มือถือ "ต้อง" ออกจากเบราว์เซอร์ไปอ่าน SMS เสมอ และ iOS/Android
 * ฆ่า tab ที่อยู่เบื้องหลังได้ตลอด ถ้าเก็บ step/phone ไว้ใน React state ล้วน กลับมาจะเด้งไปขั้น 1
 * แล้วต้องขอ OTP ใหม่ — ซึ่งชน rate-limit 3 ครั้ง/10 นาทีต่อเบอร์ (NFR-2.7) จนติดตายทั้งที่ทำถูก
 * เก็บเฉพาะ phone/ชื่อ/ขั้นตอน — ไม่เก็บ OTP (ความลับ อายุสั้น พิมพ์ใหม่ถูกกว่าเสี่ยง)
 * key ผูก pattern เดียวกับ 'signupDraft' ของ SignUpForm.tsx
 */
const DRAFT_KEY = 'invitePhoneDraft'

interface Draft {
  step: Step
  phone: string
  displayName: string
}

function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<Draft>
    if (d.step !== 'phone' && d.step !== 'name' && d.step !== 'otp') return null
    return { step: d.step, phone: d.phone ?? '', displayName: d.displayName ?? '' }
  } catch {
    return null
  }
}

export default function PhoneAuthSteps({ shopName, onBack }: PhoneAuthStepsProps) {
  const router = useRouter()

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // กู้ draft ตอน mount — อ่านใน effect ไม่ใช่ initial state เพราะ sessionStorage ไม่มีบน server
  // (จะทำให้ HTML ที่ hydrate ไม่ตรงกัน)
  useEffect(() => {
    const d = readDraft()
    if (!d) return
    setPhone(d.phone)
    setDisplayName(d.displayName)
    setStep(d.step)
    if (d.step === 'otp') setTimeout(() => otpRefs.current[0]?.focus(), 100)
  }, [])

  // บันทึก draft ทุกครั้งที่ความคืบหน้าเปลี่ยน
  useEffect(() => {
    try {
      if (step === 'phone' && !phone) sessionStorage.removeItem(DRAFT_KEY)
      else sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, phone, displayName }))
    } catch {
      // sessionStorage ถูกปิด (โหมดส่วนตัวบางเบราว์เซอร์) — flow ยังทำงานได้ แค่ไม่กู้คืน
    }
  }, [step, phone, displayName])

  const clearDraft = () => {
    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      // ignore — ดูเหตุผลด้านบน
    }
  }

  // countdown ขอ OTP ใหม่ — เดินเฉพาะตอน >0
  useEffect(() => {
    if (countdown <= 0) return
    const t = setInterval(() => setCountdown((c) => (c <= 1 ? 0 : c - 1)), 1000)
    return () => clearInterval(t)
  }, [countdown])

  /** ส่ง OTP + ตัดสินใจว่าไปขั้นชื่อ (เบอร์ใหม่) หรือข้ามไปขั้น OTP เลย (มีบัญชีแล้ว) */
  const sendOtp = async (nextStep?: Step) => {
    if (!MOBILE_PHONE_RE.test(phone)) {
      pacesToast.error('กรุณากรอกเบอร์โทรให้ถูกต้อง')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: phone, type: 'PHONE' }),
      })
      if (!res.ok) {
        if (res.status === 429) pacesToast.error('ขอรหัสบ่อยเกินไป กรุณารอสักครู่')
        else pacesToast.error('ส่งรหัสไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      const data = (await res.json().catch(() => ({}))) as { isNewUser?: boolean }
      setCountdown(60)
      // nextStep ถูกส่งมาเฉพาะตอนกด "ขอรหัสใหม่" (อยู่ขั้น OTP อยู่แล้ว ไม่ต้องย้อนขั้น)
      // isNewUser === undefined (DB lookup ล้ม) → ถามชื่อไว้ก่อน: ถ้าเป็น user เดิม provider
      // จะเมิน displayName ที่ส่งไปเอง (ใช้เฉพาะตอน user.create) จึงไม่มีผลเสีย
      const target: Step = nextStep ?? (data.isNewUser === false ? 'otp' : 'name')
      setStep(target)
      if (target === 'otp') setTimeout(() => otpRefs.current[0]?.focus(), 100)
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  const goToOtp = () => {
    const name = displayName.trim()
    if (name.length < 2 || name.length > 50) {
      pacesToast.error('ชื่อที่แสดงต้องมี 2-50 ตัวอักษร')
      return
    }
    setStep('otp')
    setTimeout(() => otpRefs.current[0]?.focus(), 100)
  }

  const onOtpChange = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1)
    const next = [...otp]
    next[i] = d
    setOtp(next)
    if (d && i < 5) otpRefs.current[i + 1]?.focus()
  }

  const verify = async () => {
    const code = otp.join('')
    if (code.length !== 6) {
      pacesToast.error('กรุณากรอกรหัสให้ครบ 6 หลัก')
      return
    }
    setLoading(true)
    try {
      const result = await signIn('phone-otp', {
        phone,
        otp: code,
        mode: 'signup',
        displayName: displayName.trim(),
        // ห้ามส่ง shopName/category — ดูหมายเหตุหัวไฟล์ (ส่งแล้ว = สร้างร้านให้ผู้ถูกเชิญ)
        redirect: false,
      })
      if (result?.ok) {
        clearDraft()
        // RSC ของหน้า /i/[slug] อ่าน session ใหม่แล้ว render หน้ารับคำเชิญแทนฟอร์มนี้
        router.refresh()
        return
      }
      pacesToast.error('รหัสไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่')
      setOtp(['', '', '', '', '', ''])
      setTimeout(() => otpRefs.current[0]?.focus(), 50)
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  const stepIndex = step === 'phone' ? 0 : step === 'name' ? 1 : 2

  return (
    <div>
      {/* ย้อนกลับ — ขั้นแรกกลับไปหน้าเลือกวิธี, ขั้นถัดไปถอยทีละขั้น */}
      <button
        type="button"
        onClick={() => {
          if (step === 'phone') {
            clearDraft()
            onBack()
          }
          else if (step === 'name') setStep('phone')
          else setStep(displayName ? 'name' : 'phone')
        }}
        disabled={loading}
        className="text-default-500 hover:text-default-700 mb-4 inline-flex items-center gap-1.5 text-sm font-semibold disabled:opacity-60"
      >
        <Icon icon="chevron-left" className="rtl:rotate-180" aria-hidden="true" />
        {step === 'phone' ? 'กลับไปเลือกวิธีอื่น' : 'ย้อนกลับ'}
      </button>

      {/* ตัวบอกความคืบหน้า 3 ขั้น — ให้เห็นตั้งแต่แรกว่า flow สั้น */}
      <div className="mb-5 flex items-center gap-1.5" role="group" aria-label={`ขั้นตอนที่ ${stepIndex + 1} จาก 3`}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= stepIndex ? 'bg-primary' : 'bg-default-200'}`}
          />
        ))}
      </div>

      {step === 'phone' && (
        <>
          <h4 className="text-default-900 mb-1 text-lg font-bold">เข้าร่วมด้วยเบอร์โทรศัพท์</h4>
          <p className="text-default-500 mb-5 text-sm">
            เพื่อเข้าเป็นผู้ดูแลร้าน <span className="text-default-800 font-semibold">{shopName}</span>
          </p>

          <div className="mb-5">
            <label htmlFor="invite-phone" className="form-label">
              เบอร์โทรศัพท์<span className="text-danger">*</span>
            </label>
            <div className="input-icon-group">
              <Icon icon="phone" className="input-icon" />
              <input
                id="invite-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="08xxxxxxxx"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="form-input"
              />
            </div>
            <p className="text-default-400 mt-1.5 text-xs">
              เราจะส่งรหัส 6 หลักไปยังเบอร์นี้ ใช้ยืนยันตัวตนเท่านั้น
            </p>
          </div>

          <button
            type="button"
            onClick={() => sendOtp()}
            disabled={loading || phone.length !== 10}
            className="btn bg-primary w-full py-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="border-white me-2 inline-block size-4 animate-spin rounded-full border-2 border-t-transparent" />
                กำลังส่งรหัส...
              </>
            ) : (
              'ถัดไป'
            )}
          </button>
        </>
      )}

      {step === 'name' && (
        <>
          <h4 className="text-default-900 mb-1 text-lg font-bold">ตั้งชื่อที่แสดง</h4>
          <p className="text-default-500 mb-5 text-sm">
            ชื่อนี้จะแสดงในรายชื่อพนักงานของร้าน{' '}
            <span className="text-default-800 font-semibold">{shopName}</span>
          </p>

          <div className="mb-5">
            <label htmlFor="invite-display-name" className="form-label">
              ชื่อที่แสดง<span className="text-danger">*</span>
            </label>
            <div className="input-icon-group">
              <Icon icon="user" className="input-icon" />
              <input
                id="invite-display-name"
                type="text"
                autoComplete="name"
                placeholder="ชื่อ-นามสกุล หรือชื่อเล่น"
                maxLength={50}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="form-input"
              />
            </div>
            <p className="text-default-400 mt-1.5 text-xs">2-50 ตัวอักษร แก้ไขภายหลังได้ในหน้าตั้งค่า</p>
          </div>

          {/* ข้อความที่ตอบความสับสนเดิมตรง ๆ ("จะสร้างร้านทำไม") */}
          <div className="bg-success/15 text-success-ink mb-5 flex items-start gap-2 rounded-lg p-3 text-xs">
            <Icon icon="info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            <span>
              คุณกำลังเข้าร่วมในฐานะ<span className="font-semibold">ผู้ดูแล</span>ของร้านนี้ ไม่ต้องสร้างร้านของตัวเอง
            </span>
          </div>

          <button
            type="button"
            onClick={goToOtp}
            disabled={loading || displayName.trim().length < 2}
            className="btn bg-primary w-full py-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            ถัดไป
          </button>
        </>
      )}

      {step === 'otp' && (
        <>
          <h4 className="text-default-900 mb-1 text-center text-lg font-bold">กรอกรหัสยืนยัน</h4>
          <p className="text-default-500 mb-5 text-center text-sm">
            <span className="text-default-900 block text-base font-bold">
              {'*'.repeat(6)}
              {phone.slice(-4)}
            </span>
            ส่งรหัส 6 หลักไปแล้ว
          </p>

          <div className="flex justify-center gap-2">
            {otp.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  otpRefs.current[i] = el
                }}
                type="text"
                inputMode="numeric"
                // autofill รหัสจาก SMS — ใส่เฉพาะช่องแรก (ระบบปฏิบัติการเติมช่องเดียว
                // แล้ว onOtpChange กระจายต่อ); ช่องที่เหลือปิดไว้กัน autofill ซ้อน
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                value={d}
                onChange={(e) => onOtpChange(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus()
                }}
                className="form-input h-11 w-11 p-0 text-center font-mono text-lg"
                aria-label={`รหัสหลักที่ ${i + 1}`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={verify}
            disabled={loading || otp.join('').length !== 6}
            className="btn bg-primary mt-6 w-full py-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="border-white me-2 inline-block size-4 animate-spin rounded-full border-2 border-t-transparent" />
                กำลังยืนยัน...
              </>
            ) : (
              'ยืนยันและเข้าสู่ระบบ'
            )}
          </button>

          {countdown > 0 ? (
            <p className="text-default-400 mt-3 text-center text-xs">ขอรหัสใหม่ได้ใน {countdown} วินาที</p>
          ) : (
            <button
              type="button"
              onClick={() => sendOtp('otp')}
              disabled={loading}
              className="text-primary mt-3 w-full text-center text-sm font-semibold disabled:opacity-60"
            >
              ขอรหัสใหม่
            </button>
          )}
        </>
      )}
    </div>
  )
}
