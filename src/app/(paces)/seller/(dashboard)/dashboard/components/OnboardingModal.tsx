'use client'

/**
 * OnboardingModal — modal stepper เด้งบน /dashboard เมื่อ session.user.needsOnboarding = true.
 *
 * Base (modal shell/backdrop/controlled state):
 *   src/app/(paces)/seller/(dashboard)/orders/components/BulkActionBar.tsx → BulkSmsConfirmDialog
 *   (backdrop bg-dark/40 z-80, card, ✕, multi-phase state, footer ปุ่ม — ห้ามใช้ Preline hs-overlay)
 *
 * Base (step state pattern):
 *   theme/paces/Admin/TS/src/app/(admin)/form/wizard/components/WizardWithValidation.tsx
 *   (useState(currentStep) + next/back logic; dot-only visual ไม่ใช้ wizard strip)
 *
 * Base (chip/pill badge, dot):
 *   theme/paces/Admin/TS/src/app/(admin)/ui/badges/page.tsx
 *   (badge rounded-full border / bg-primary text-white สำหรับ selected)
 *
 * ทำไม controlled-React-state: Preline hs-overlay พังเมื่อ re-render (feedback_filterdropdown)
 * ทำไม dot-only stepper: wizard strip กว้างเกินใน modal (spec OQ-1)
 * ทำไม pacesToast: Hard Rule 9 — ใช้ toast lib เดียว (pacesToast) ใน (paces)/**
 */

import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { SHOP_CATEGORY_LABELS, SHOP_CATEGORY_KEYS, type ShopCategoryKey } from '@/lib/shop-categories'
import { isValidSlugFormat, isReservedSlug, normalizeSlug } from '@/lib/shop-slug'
import { signIn, useSession } from 'next-auth/react'
import { useCallback, useEffect, useRef, useState } from 'react'

// ─── types ────────────────────────────────────────────────────────────────────

interface OnboardingModalProps {
  needsOnboarding: boolean
  needsPhoneVerify: boolean
  displayName?: string
}

// step index — เริ่มจาก 0 = verify phone (เฉพาะ needsPhoneVerify), 1 = welcome, 2 = category, 3 = slug, 4 = first product
// ถ้าไม่ต้อง verify phone ให้เริ่มที่ step 1 (welcome) โดยตรง
type PhoneSubPhase = 'input' | 'otp'

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'reserved'

// ─── helpers ──────────────────────────────────────────────────────────────────

/** dot indicator สำหรับ stepper (active / ผ่านแล้ว / ยังไม่ถึง) */
function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex justify-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`size-2 rounded-full transition-colors ${
            i === current
              ? 'bg-primary'
              : i < current
                ? 'bg-primary/50'
                : 'bg-default-300'
          }`}
        />
      ))}
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export default function OnboardingModal({
  needsOnboarding,
  needsPhoneVerify,
  displayName,
}: OnboardingModalProps) {
  const { update: updateSession } = useSession()
  const [open, setOpen] = useState(needsOnboarding)
  const [dismissed, setDismissed] = useState(false)

  // คำนวณ step เริ่มต้น: ถ้าต้อง verify phone → step 0, ถ้าไม่ → step 1 (welcome)
  const firstStep = needsPhoneVerify ? 0 : 1
  const [currentStep, setCurrentStep] = useState(firstStep)

  // totalDots = step ที่แสดง (0=phone/1=welcome/2=cat/3=slug/4=product → รวม 5 ถ้ามี phone, 4 ถ้าไม่มี)
  // ใช้ index dot เทียบกับ step จริง (step 0 = phone จะถูกแสดงถ้า needsPhoneVerify)
  const totalDots = needsPhoneVerify ? 5 : 4

  // ─── step 0: phone verify sub-phase ──────────────────────────────────────
  const [phoneSubPhase, setPhoneSubPhase] = useState<PhoneSubPhase>('input')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [countdown, setCountdown] = useState(0)
  const [phoneLoading, setPhoneLoading] = useState(false)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // countdown timer สำหรับ OTP
  useEffect(() => {
    if (countdown <= 0) return
    const t = setInterval(() => setCountdown((c) => c - 1), 1000)
    return () => clearInterval(t)
  }, [countdown])

  // ─── step 2: category ────────────────────────────────────────────────────
  const [category, setCategory] = useState<ShopCategoryKey | null>(null)

  // ─── step 3: slug ────────────────────────────────────────────────────────
  const [slug, setSlug] = useState('')
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [slugLoading, setSlugLoading] = useState(false)

  // ─── step 4: first product ───────────────────────────────────────────────
  const [productName, setProductName] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [productImage, setProductImage] = useState<File | null>(null)
  const [productLoading, setProductLoading] = useState(false)

  // ─── dismiss ─────────────────────────────────────────────────────────────
  // ✕ หรือ backdrop click → ปิด (เด้งซ้ำรอบ navigation ถัดไปเพราะ needsOnboarding ยังเป็น true)
  // slug step (3) + phone step (0) ปิดยาก — ไม่ควรปิดกลางกระบวนการสำคัญ
  const canDismiss = currentStep !== 0 && currentStep !== 3

  const dismiss = useCallback(() => {
    if (!canDismiss) return
    setDismissed(true)
    setOpen(false)
  }, [canDismiss])

  // Escape key
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, dismiss])

  // ─── finish: update session + ปิด modal ──────────────────────────────────
  const finish = useCallback(async () => {
    // refresh session → session callback re-compute needsOnboarding=false (spec OQ-2)
    await updateSession()
    setOpen(false)
  }, [updateSession])

  // ─── step navigation ──────────────────────────────────────────────────────
  const next = () => setCurrentStep((s) => s + 1)
  const back = () => setCurrentStep((s) => s - 1)

  // ─── step 0 handlers: phone verify ───────────────────────────────────────

  const handleSendOtp = async () => {
    if (!phone || !/^0[0-9]{9}$/.test(phone)) {
      pacesToast.error('กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง (0xxxxxxxxx)')
      return
    }
    setPhoneLoading(true)
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: phone, type: 'PHONE' }),
      })
      if (res.ok) {
        setPhoneSubPhase('otp')
        setCountdown(60)
        // focus กล่อง OTP แรก
        setTimeout(() => otpRefs.current[0]?.focus(), 100)
      } else if (res.status === 429) {
        pacesToast.error('ขอ OTP บ่อยเกินไป กรุณารอสักครู่')
      } else {
        pacesToast.error('ไม่สามารถส่ง OTP ได้ กรุณาลองใหม่')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setPhoneLoading(false)
    }
  }

  const handleOtpInput = (idx: number, value: string) => {
    // รับเฉพาะตัวเลข
    const digit = value.replace(/\D/g, '').slice(-1)
    const newOtp = [...otp]
    newOtp[idx] = digit
    setOtp(newOtp)
    // เลื่อน focus ไป box ถัดไป
    if (digit && idx < 5) {
      otpRefs.current[idx + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setOtp(pasted.split(''))
      setTimeout(() => otpRefs.current[5]?.focus(), 50)
    }
    e.preventDefault()
  }

  const handleVerifyOtp = async () => {
    const code = otp.join('')
    if (code.length !== 6) {
      pacesToast.error('กรุณากรอก OTP ให้ครบ 6 หลัก')
      return
    }
    setPhoneLoading(true)
    try {
      const result = await signIn('phone-otp', {
        phone,
        otp: code,
        mode: 'signin',
        redirect: false,
      })
      if (result?.ok) {
        next()
      } else {
        pacesToast.error('OTP ไม่ถูกต้อง กรุณาลองใหม่')
        setOtp(['', '', '', '', '', ''])
        setTimeout(() => otpRefs.current[0]?.focus(), 50)
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setPhoneLoading(false)
    }
  }

  // ─── step 3 handler: slug check ──────────────────────────────────────────

  const checkSlug = useCallback(async (value: string) => {
    const normalized = normalizeSlug(value)
    if (!normalized) {
      setSlugStatus('idle')
      return
    }
    if (!isValidSlugFormat(normalized)) {
      setSlugStatus('invalid')
      return
    }
    if (isReservedSlug(normalized)) {
      setSlugStatus('reserved')
      return
    }
    setSlugStatus('checking')
    try {
      const res = await fetch(`/api/shops/check-slug?slug=${encodeURIComponent(normalized)}`)
      const data: { available: boolean; reason?: string } = await res.json()
      if (data.available) {
        setSlugStatus('available')
      } else {
        setSlugStatus(data.reason === 'taken' ? 'taken' : data.reason === 'reserved' ? 'reserved' : 'invalid')
      }
    } catch {
      setSlugStatus('idle')
    }
  }, [])

  const handleSlugChange = (value: string) => {
    // normalize เฉพาะ lowercase, ห้ามใส่ _ (spec: a-z0-9-)
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setSlug(cleaned)
    setSlugStatus('idle')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (cleaned.length >= 3) {
      debounceRef.current = setTimeout(() => checkSlug(cleaned), 400)
    }
  }

  const handleSetSlug = async () => {
    if (slugStatus !== 'available') return
    setSlugLoading(true)
    try {
      const res = await fetch('/api/shops/slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: normalizeSlug(slug), ...(category ? { category } : {}) }),
      })
      if (res.ok) {
        next()
      } else if (res.status === 409) {
        setSlugStatus('taken')
        pacesToast.error('URL นี้มีคนใช้แล้ว กรุณาเลือก URL อื่น')
      } else {
        pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSlugLoading(false)
    }
  }

  // ─── step 4 handler: first product ───────────────────────────────────────

  const handleCreateProduct = async () => {
    if (!productName.trim()) {
      pacesToast.error('กรุณากรอกชื่อสินค้า')
      return
    }
    const priceNum = Number(productPrice)
    if (!productPrice || isNaN(priceNum) || priceNum < 0.01) {
      pacesToast.error('กรุณากรอกราคาสินค้า (ต่ำสุด ฿0.01)')
      return
    }
    setProductLoading(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: productName.trim(), price: priceNum, type: 'PHYSICAL' }),
      })
      if (res.ok) {
        pacesToast.success('สร้างสินค้าแรกเรียบร้อย!')
        await finish()
      } else {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(data?.error ?? 'ไม่สามารถสร้างสินค้าได้ กรุณาลองใหม่')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setProductLoading(false)
    }
  }

  // ─── slug status helpers ──────────────────────────────────────────────────

  const slugStatusText: Record<SlugStatus, string | null> = {
    idle: null,
    checking: 'กำลังตรวจสอบ...',
    available: '✓ URL นี้ว่างอยู่',
    taken: '✕ มีคนใช้แล้ว',
    invalid: '✕ รูปแบบไม่ถูกต้อง (a-z, 0-9, ขีดกลาง 3-30 ตัว)',
    reserved: '✕ ไม่สามารถใช้ URL นี้ได้',
  }

  const slugStatusClass: Record<SlugStatus, string> = {
    idle: '',
    checking: 'text-default-500',
    available: 'text-success',
    taken: 'text-danger',
    invalid: 'text-danger',
    reserved: 'text-danger',
  }

  // dot index ที่แสดงต่อ step (เฉลี่ยกับว่ามี phone step ไหม)
  // step 0=phone(dot0), 1=welcome(dot0 ถ้าไม่มี phone/dot1 ถ้ามี), 2=cat, 3=slug, 4=product
  const dotIndex = needsPhoneVerify ? currentStep : currentStep - 1

  if (!open || dismissed) return null

  return (
    /* backdrop — pattern จาก BulkSmsConfirmDialog (bg-dark/40 z-80 fixed full) */
    <div
      className="size-full fixed top-0 start-0 z-80 overflow-x-hidden overflow-y-auto bg-dark/40 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboardingModalLabel"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss()
      }}
    >
      {/* card — w-[calc(100%-24px)] max-w-sm เป็น exception Paces (ตาม spec mobile requirement, comment กำกับ) */}
      <div className="w-[calc(100%-24px)] max-w-sm mx-auto flex items-center ease-in-out transition-all duration-200">
        {/* w-[calc(100%-24px)] max-w-sm = mobile-safe sizing จาก spec (กัน card ชิดขอบจอ 375px) — ไม่มี Paces token สำหรับ modal width */}
        <div className="w-full flex flex-col card pointer-events-auto">

          {/* ─── Header: dots + ✕ ─────────────────────────────────────────── */}
          <div className="card-header p-4 flex items-center">
            {/* ย้อนกลับ — ซ่อน step welcome(1) และ phone(0) */}
            {currentStep >= 2 ? (
              <button
                type="button"
                onClick={back}
                className="btn text-default-600 hover:text-primary inline-flex items-center gap-1 text-sm"
                aria-label="ย้อนกลับ"
              >
                <Icon icon="arrow-left" className="size-4" />
                ย้อนกลับ
              </button>
            ) : (
              <div className="w-20" /* spacer เพื่อ center dots */ />
            )}

            {/* dots — centered */}
            <div className="flex-1 flex justify-center">
              <StepDots total={totalDots} current={dotIndex} />
            </div>

            {/* ✕ ปิด — ซ่อนเมื่อ canDismiss=false */}
            <div className="w-20 flex justify-end">
              {canDismiss && (
                <button
                  type="button"
                  aria-label="ปิด"
                  onClick={dismiss}
                >
                  <Icon icon="x" className="text-2xl align-middle text-default-600" />
                </button>
              )}
            </div>
          </div>

          {/* ─── Body ─────────────────────────────────────────────────────── */}
          {/* card-body overflow-y-auto max-h-[85dvh] = กัน keyboard overlap บน mobile (spec) — exception ที่ Paces ไม่มี token */}
          <div className="card-body overflow-y-auto max-h-[85dvh]">

            {/* ── Step 0: Verify Phone ── */}
            {currentStep === 0 && (
              <div className="flex flex-col items-center gap-4">
                <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon icon="phone" className="text-3xl" />
                </span>
                <div className="text-center">
                  <h3 id="onboardingModalLabel" className="font-semibold text-default-800 text-base">
                    ยืนยันเบอร์โทรศัพท์
                  </h3>
                  <p className="mt-1 text-sm text-default-500">
                    เชื่อมบัญชี Facebook ของคุณกับเบอร์โทร เพื่อรับการยืนยันตัวตน
                  </p>
                </div>

                {phoneSubPhase === 'input' && (
                  <div className="w-full flex flex-col gap-3">
                    <div>
                      <label className="form-label" htmlFor="onboarding-phone">เบอร์โทรศัพท์</label>
                      <input
                        id="onboarding-phone"
                        type="tel"
                        className="form-input"
                        placeholder="0xxxxxxxxx"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        maxLength={10}
                        disabled={phoneLoading}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={phoneLoading || phone.length !== 10}
                      onClick={handleSendOtp}
                      className="btn bg-primary text-white hover:bg-primary-hover w-full inline-flex items-center justify-center gap-2 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {phoneLoading
                        ? <><Icon icon="loader-2" className="size-4 animate-spin" />กำลังส่ง...</>
                        : 'ขอ OTP'
                      }
                    </button>
                  </div>
                )}

                {phoneSubPhase === 'otp' && (
                  <div className="w-full flex flex-col gap-3">
                    <p className="text-center text-sm text-default-600">
                      ส่ง OTP ไปที่ <span className="font-medium text-default-800">{phone}</span>
                    </p>
                    {/* 6 OTP boxes */}
                    <div className="flex justify-center gap-2">
                      {otp.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={(el) => { otpRefs.current[idx] = el }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpInput(idx, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                          onPaste={idx === 0 ? handleOtpPaste : undefined}
                          className="form-input-sm w-10 text-center font-mono text-lg"
                          disabled={phoneLoading}
                          aria-label={`OTP หลักที่ ${idx + 1}`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={phoneLoading || otp.join('').length !== 6}
                      onClick={handleVerifyOtp}
                      className="btn bg-primary text-white hover:bg-primary-hover w-full inline-flex items-center justify-center gap-2 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {phoneLoading
                        ? <><Icon icon="loader-2" className="size-4 animate-spin" />กำลังยืนยัน...</>
                        : 'ยืนยัน OTP'
                      }
                    </button>
                    {countdown > 0 ? (
                      <p className="text-center text-xs text-default-500">
                        ขอ OTP ใหม่ได้ใน {countdown} วินาที
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setPhoneSubPhase('input'); setOtp(['', '', '', '', '', '']) }}
                        className="text-sm text-primary text-center w-full"
                      >
                        ขอ OTP ใหม่
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Step 1: Welcome ── */}
            {currentStep === 1 && (
              <div className="flex flex-col items-center gap-4">
                <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon icon="rocket" className="text-3xl" />
                </span>
                <div className="text-center">
                  <h3 id="onboardingModalLabel" className="font-semibold text-default-800 text-base">
                    ยินดีต้อนรับสู่ Deep{displayName ? `, ${displayName}` : ''}!
                  </h3>
                  <p className="mt-1 text-sm text-default-500">
                    เริ่มต้นร้านของคุณใน 4 ขั้นตอนง่ายๆ
                  </p>
                </div>

                {/* 3 mini-card — Base: badge/card primitive */}
                <div className="grid grid-cols-3 gap-2 w-full">
                  {[
                    { icon: 'shield-check', title: 'Trust Score', desc: 'สร้างความน่าเชื่อถือจากการขายจริง' },
                    { icon: 'user-check', title: 'ยืนยันตัวตน', desc: 'ปลอดภัย ซื้อขายอุ่นใจ' },
                    { icon: 'shopping-bag', title: 'เริ่มขายได้ทันที', desc: 'สร้างสินค้าแรกใน 1 นาที' },
                  ].map((item) => (
                    <div key={item.icon} className="card border border-dashed border-default-300 p-3 text-center">
                      <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto mb-1.5">
                        <Icon icon={item.icon} className="size-4" />
                      </span>
                      <p className="text-xs font-semibold text-default-700 leading-tight">{item.title}</p>
                      <p className="text-2xs text-default-500 leading-tight mt-0.5">{item.desc}</p>
                    </div>
                  ))}
                </div>

                {/* footer CTA */}
                <div className="w-full flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={next}
                    className="btn bg-primary text-white hover:bg-primary-hover w-full"
                  >
                    ลุยเลย →
                  </button>
                  <button
                    type="button"
                    onClick={dismiss}
                    className="text-sm text-default-500 w-full text-center"
                  >
                    ข้ามไปก่อน
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: Category Chips ── */}
            {currentStep === 2 && (
              <div className="flex flex-col gap-4">
                <div className="text-center">
                  <h3 className="font-semibold text-default-800 text-base">เลือกหมวดหมู่ร้านของคุณ</h3>
                  <p className="mt-1 text-sm text-default-500">เลือก 1 หมวดที่ตรงกับสินค้าของคุณมากที่สุด</p>
                </div>

                {/* chip grid — Base: badge rounded-full pill จาก theme/paces/.../ui/badges/page.tsx */}
                <div className="flex flex-wrap gap-2">
                  {SHOP_CATEGORY_KEYS.map((key) => {
                    const isSelected = category === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setCategory(isSelected ? null : key)}
                        className={
                          isSelected
                            ? 'badge bg-primary text-white border border-primary rounded-full inline-flex items-center gap-1 cursor-pointer'
                            : 'badge border border-default-300 text-default-700 rounded-full cursor-pointer hover:border-primary hover:text-primary'
                        }
                      >
                        {isSelected && <Icon icon="check" className="size-3" />}
                        {SHOP_CATEGORY_LABELS[key]}
                      </button>
                    )
                  })}
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={next}
                    className="btn bg-primary text-white hover:bg-primary-hover w-full"
                  >
                    ถัดไป →
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    className="text-sm text-default-500 w-full text-center"
                  >
                    ข้าม
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Slug (บังคับ) ── */}
            {currentStep === 3 && (
              <div className="flex flex-col gap-4">
                <div className="text-center">
                  <h3 className="font-semibold text-default-800 text-base">ตั้ง URL ร้านของคุณ</h3>
                  <p className="mt-1 text-sm text-default-500">
                    ลูกค้าจะค้นหาร้านคุณผ่านลิงก์นี้
                  </p>
                </div>

                <div>
                  <label className="form-label" htmlFor="onboarding-slug">URL ร้านค้า</label>
                  <input
                    id="onboarding-slug"
                    type="text"
                    className={`form-input ${slugStatus === 'available' ? 'is-valid' : ['taken', 'invalid', 'reserved'].includes(slugStatus) ? 'is-invalid' : ''}`}
                    placeholder="yourshop"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    disabled={slugLoading}
                    maxLength={30}
                    autoComplete="off"
                    autoCapitalize="none"
                  />
                  {/* inline slug status */}
                  {slugStatus !== 'idle' && slugStatusText[slugStatus] && (
                    <p className={`mt-1 text-xs ${slugStatusClass[slugStatus]}`}>
                      {slugStatus === 'checking' && (
                        <Icon icon="loader-2" className="size-3 animate-spin inline me-1" />
                      )}
                      {slugStatusText[slugStatus]}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-default-400">ใช้ a-z, 0-9, ขีดกลาง 3-30 ตัว</p>
                </div>

                {/* preview URL — path ใช้ font-mono (spec) */}
                {slug && slugStatus === 'available' && (
                  <p className="text-sm text-primary">
                    deepthailand.app/<span className="font-mono">{slug}</span>
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSetSlug}
                  disabled={slugLoading || slugStatus !== 'available'}
                  className="btn bg-primary text-white hover:bg-primary-hover w-full inline-flex items-center justify-center gap-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  {slugLoading
                    ? <><Icon icon="loader-2" className="size-4 animate-spin" />กำลังบันทึก...</>
                    : 'ถัดไป →'
                  }
                </button>
                {/* ไม่มีปุ่มข้าม — slug บังคับ (spec) */}
              </div>
            )}

            {/* ── Step 4: First Product (ข้ามได้) ── */}
            {currentStep === 4 && (
              <div className="flex flex-col gap-4">
                <div className="text-center">
                  <h3 className="font-semibold text-default-800 text-base">สร้างสินค้าแรกของคุณ</h3>
                  <p className="mt-1 text-sm text-default-500">
                    เพิ่มสินค้าชิ้นแรกเพื่อให้ลูกค้าเห็นร้านของคุณ
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <div>
                    <label className="form-label" htmlFor="onboarding-product-name">ชื่อสินค้า</label>
                    <input
                      id="onboarding-product-name"
                      type="text"
                      className="form-input"
                      placeholder="เช่น เสื้อยืดโอเวอร์ไซส์"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      disabled={productLoading}
                    />
                  </div>

                  {/* ราคา — input-group ฿ prefix (Base: Paces form primitive) */}
                  <div>
                    <label className="form-label" htmlFor="onboarding-product-price">ราคา</label>
                    <div className="input-group">
                      <span className="input-group-text">฿</span>
                      <input
                        id="onboarding-product-price"
                        type="number"
                        min="0.01"
                        step="0.01"
                        className="form-input"
                        placeholder="0.00"
                        value={productPrice}
                        onChange={(e) => setProductPrice(e.target.value)}
                        disabled={productLoading}
                      />
                    </div>
                  </div>

                  {/* รูปสินค้า (optional) — Base: AddCategoryModal file input pattern */}
                  <div>
                    <label className="form-label" htmlFor="onboarding-product-image">
                      รูปสินค้า <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
                    </label>
                    <input
                      id="onboarding-product-image"
                      type="file"
                      accept="image/*"
                      className="block w-full border border-default-300 rounded disabled:opacity-50 disabled:pointer-events-none file:bg-default-100 file:border-0 file:me-4 file:py-2 file:px-3"
                      onChange={(e) => setProductImage(e.target.files?.[0] ?? null)}
                      disabled={productLoading}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleCreateProduct}
                    disabled={productLoading}
                    className="btn bg-primary text-white hover:bg-primary-hover w-full inline-flex items-center justify-center gap-2 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {productLoading
                      ? <><Icon icon="loader-2" className="size-4 animate-spin" />กำลังสร้าง...</>
                      : 'สร้างสินค้าเลย'
                    }
                  </button>
                  <button
                    type="button"
                    onClick={finish}
                    disabled={productLoading}
                    className="text-sm text-default-500 w-full text-center disabled:opacity-50"
                  >
                    ข้ามไปก่อน เพิ่มทีหลังได้
                  </button>
                </div>
              </div>
            )}

          </div>
          {/* ── end card-body ── */}

        </div>
      </div>
    </div>
  )
}
