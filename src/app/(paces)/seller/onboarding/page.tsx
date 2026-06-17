'use client'

/**
 * /onboarding — หน้า onboarding บังคับ (เด้งจาก proxy เมื่อ needsOnboarding)
 *
 * Base (layout): AuthCardShell (ต่อเนื่องกับ sign-up — รูปขวา/form ซ้าย)
 * Base (step logic): src/app/(paces)/seller/(dashboard)/dashboard/components/OnboardingModal.tsx
 *
 * Steps: info (ข้อมูลร้าน+avatar) → warning (เบอร์ตั้งครั้งเดียว) → otp → slug → product
 * resume: มีเบอร์แล้ว (needsPhoneVerify=false) แต่ยังไม่มี slug → เริ่มที่ slug
 * spec: docs/superpowers/specs/2026-06-17-fb-onboarding-mandatory-page-design.md
 */

import AuthCardShell from '../auth/components/AuthCardShell'
import Icon from '@/components/wrappers/Icon'
import ChoiceSelect from '@/components/wrappers/ChoiceSelect'
import { pacesToast } from '@/lib/paces-toast'
import { SHOP_CATEGORY_LABELS, SHOP_CATEGORY_KEYS } from '@/lib/shop-categories'
import { isValidSlugFormat, isReservedSlug, normalizeSlug } from '@/lib/shop-slug'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

type Step = 'info' | 'warning' | 'otp' | 'slug' | 'product'
type Check = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid'

const CATEGORY_OPTIONS = SHOP_CATEGORY_KEYS.map((k) => ({ value: k, label: SHOP_CATEGORY_LABELS[k] }))

export default function OnboardingPage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const user = (session?.user ?? {}) as {
    displayName?: string; username?: string; avatar?: string | null
    needsPhoneVerify?: boolean; needsOnboarding?: boolean
  }

  const [step, setStep] = useState<Step>('info')
  const [ready, setReady] = useState(false)

  // step: info
  const [displayName, setDisplayName] = useState('')
  const [category, setCategory] = useState('')
  const [username, setUsername] = useState('')
  const [uStatus, setUStatus] = useState<Check>('idle')
  const [phone, setPhone] = useState('')
  const [infoLoading, setInfoLoading] = useState(false)
  const uDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // step: otp
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [countdown, setCountdown] = useState(0)
  const [otpLoading, setOtpLoading] = useState(false)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // step: slug
  const [slug, setSlug] = useState('')
  const [sStatus, setSStatus] = useState<Check>('idle')
  const [slugLoading, setSlugLoading] = useState(false)
  const sDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // step: product
  const [pName, setPName] = useState('')
  const [pPrice, setPPrice] = useState('')
  const [pLoading, setPLoading] = useState(false)

  // ─── init: prefill + resume step ───────────────────────────────────────────
  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') { router.replace('/auth/sign-in'); return }
    // onboarding ครบแล้ว → ออก (proxy ก็กันอยู่ แต่กันซ้ำ client-side)
    if (!user.needsOnboarding) { router.replace('/dashboard'); return }
    if (!ready) {
      setDisplayName(user.displayName ?? '')
      setUsername(user.username ?? '')
      // มีเบอร์แล้ว (เช่น seller signup ปกติ) → ข้ามไป slug
      setStep(user.needsPhoneVerify === false ? 'slug' : 'info')
      setReady(true)
    }
  }, [status, user, ready, router])

  useEffect(() => {
    if (countdown <= 0) return
    const t = setInterval(() => setCountdown((c) => c - 1), 1000)
    return () => clearInterval(t)
  }, [countdown])

  // ─── username live-check ────────────────────────────────────────────────────
  const onUsername = (v: string) => {
    const cleaned = v.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30)
    setUsername(cleaned)
    setUStatus('idle')
    if (uDebounce.current) clearTimeout(uDebounce.current)
    if (cleaned.length < 3) { setUStatus(cleaned ? 'invalid' : 'idle'); return }
    setUStatus('checking')
    uDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/check-username?u=${encodeURIComponent(cleaned)}`)
        const d = await res.json()
        setUStatus(d.available ? 'ok' : 'taken')
      } catch { setUStatus('idle') }
    }, 400)
  }

  // ─── step info → warning (save shop-info + เช็คเบอร์ซ้ำ) ──────────────────────
  const submitInfo = async () => {
    if (!displayName.trim()) return pacesToast.error('กรุณากรอกชื่อที่แสดง')
    if (!category) return pacesToast.error('กรุณาเลือกหมวดหมู่ร้านค้า')
    if (uStatus !== 'ok') return pacesToast.error('กรุณาตั้งชื่อผู้ใช้ที่ใช้ได้')
    if (!/^0[0-9]{9}$/.test(phone)) return pacesToast.error('กรุณากรอกเบอร์โทรให้ถูกต้อง')
    setInfoLoading(true)
    try {
      // เช็คเบอร์ซ้ำ
      const pRes = await fetch(`/api/users/check-phone?phone=${encodeURIComponent(phone)}`)
      const pData = await pRes.json().catch(() => ({}))
      if (pRes.ok && pData.available === false) {
        setInfoLoading(false)
        return pacesToast.error('เบอร์นี้มีบัญชีแล้ว')
      }
      // save displayName/username/category
      const res = await fetch('/api/account/shop-info', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim(), username, category }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setInfoLoading(false)
        return pacesToast.error(d.error ?? 'บันทึกไม่สำเร็จ')
      }
      setStep('warning')
    } catch { pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') }
    finally { setInfoLoading(false) }
  }

  // ─── warning → otp (ส่ง OTP) ─────────────────────────────────────────────────
  const sendOtp = async () => {
    setOtpLoading(true)
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: phone, type: 'PHONE' }),
      })
      if (res.ok) {
        setStep('otp'); setCountdown(60)
        setTimeout(() => otpRefs.current[0]?.focus(), 100)
      } else if (res.status === 429) pacesToast.error('ขอ OTP บ่อยเกินไป กรุณารอสักครู่')
      else pacesToast.error('ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่')
    } catch { pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') }
    finally { setOtpLoading(false) }
  }

  const onOtp = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1)
    const next = [...otp]; next[i] = d; setOtp(next)
    if (d && i < 5) otpRefs.current[i + 1]?.focus()
  }

  // ─── otp → slug (set-phone) ──────────────────────────────────────────────────
  const verifyOtp = async () => {
    const code = otp.join('')
    if (code.length !== 6) return pacesToast.error('กรุณากรอก OTP ให้ครบ 6 หลัก')
    setOtpLoading(true)
    try {
      const res = await fetch('/api/account/set-phone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp: code }),
      })
      if (res.ok) { setStep('slug') }
      else {
        const d = await res.json().catch(() => ({}))
        pacesToast.error(d.error ?? 'OTP ไม่ถูกต้อง กรุณาลองใหม่')
        setOtp(['', '', '', '', '', '']); setTimeout(() => otpRefs.current[0]?.focus(), 50)
      }
    } catch { pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') }
    finally { setOtpLoading(false) }
  }

  // ─── slug live-check ─────────────────────────────────────────────────────────
  const onSlug = (v: string) => {
    const cleaned = v.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setSlug(cleaned); setSStatus('idle')
    if (sDebounce.current) clearTimeout(sDebounce.current)
    const n = normalizeSlug(cleaned)
    if (!n || !isValidSlugFormat(n) || isReservedSlug(n)) { setSStatus(cleaned.length >= 3 ? 'invalid' : 'idle'); return }
    if (cleaned.length < 3) return
    setSStatus('checking')
    sDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shops/check-slug?slug=${encodeURIComponent(n)}`)
        const d = await res.json()
        setSStatus(d.available ? 'ok' : 'taken')
      } catch { setSStatus('idle') }
    }, 400)
  }

  // ─── slug → product ──────────────────────────────────────────────────────────
  const submitSlug = async () => {
    if (sStatus !== 'ok') return
    setSlugLoading(true)
    try {
      const res = await fetch('/api/shops/slug', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: normalizeSlug(slug), ...(category ? { category } : {}) }),
      })
      if (res.ok) setStep('product')
      else if (res.status === 409) { setSStatus('taken'); pacesToast.error('URL นี้มีคนใช้แล้ว') }
      else pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } catch { pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') }
    finally { setSlugLoading(false) }
  }

  // ─── finish (refresh session → needsOnboarding=false → /dashboard) ───────────
  const finish = useCallback(async () => {
    await update()
    router.replace('/dashboard')
  }, [update, router])

  const createProduct = async () => {
    if (!pName.trim()) return pacesToast.error('กรุณากรอกชื่อสินค้า')
    const price = Number(pPrice)
    if (!pPrice || isNaN(price) || price < 0.01) return pacesToast.error('กรุณากรอกราคา (ต่ำสุด ฿0.01)')
    setPLoading(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: pName.trim(), price, type: 'PHYSICAL' }),
      })
      if (res.ok) { pacesToast.success('สร้างสินค้าแรกเรียบร้อย!'); await finish() }
      else { const d = await res.json().catch(() => ({})); pacesToast.error(d.error ?? 'สร้างสินค้าไม่สำเร็จ') }
    } catch { pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') }
    finally { setPLoading(false) }
  }

  if (!ready) {
    return (
      <AuthCardShell>
        <div className="flex flex-1 items-center justify-center py-20">
          <div className="border-primary inline-block size-10 animate-spin rounded-full border-3 border-t-transparent" role="status" />
        </div>
      </AuthCardShell>
    )
  }

  return (
    <AuthCardShell>
      {/* avatar + provider (เฉพาะ step info) */}
      {step === 'info' && (
        <div className="mb-5 flex flex-col items-center">
          {user.avatar ? (
            <img src={user.avatar} alt="" className="size-16 rounded-full object-cover ring-2 ring-primary/20" />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary text-2xl font-bold">
              {(displayName || 'D').slice(0, 1)}
            </span>
          )}
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-default-100 px-3 py-1 text-xs text-default-500">
            <Icon icon="brand-facebook" className="size-3.5 text-info" /> เข้าสู่ระบบด้วย Facebook
          </span>
        </div>
      )}

      <div>
        {/* ─── STEP: ข้อมูลร้าน ─── */}
        {step === 'info' && (
          <>
            <h4 className="mb-1 text-center text-lg font-bold text-default-900">ตั้งค่าร้านของคุณ</h4>
            <p className="text-default-400 mb-5 text-center text-sm">กรอกข้อมูลร้านเพื่อเริ่มใช้งาน Deep</p>
            <div className="flex flex-col gap-4">
              <div>
                <label className="form-label">ชื่อที่แสดง <span className="text-danger">*</span></label>
                <input className="form-input" placeholder="ชื่อ-นามสกุล หรือชื่อเล่น" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} />
              </div>
              <div>
                <label className="form-label">หมวดหมู่ร้านค้า <span className="text-danger">*</span></label>
                <ChoiceSelect options={CATEGORY_OPTIONS} placeholder="-- เลือกหมวดหมู่ --" search={false} value={category} onChange={(v) => setCategory(v as string)} />
              </div>
              <div>
                <label className="form-label">ชื่อผู้ใช้ (username) <span className="text-danger">*</span></label>
                <input className="form-input" placeholder="a-z, 0-9, _ เท่านั้น" value={username} onChange={(e) => onUsername(e.target.value)} autoCapitalize="none" />
                {uStatus === 'ok' && <p className="mt-1 text-xs text-success">✓ ใช้ชื่อนี้ได้</p>}
                {uStatus === 'taken' && <p className="mt-1 text-xs text-danger">✕ มีคนใช้แล้ว</p>}
                {uStatus === 'invalid' && <p className="mt-1 text-xs text-danger">✕ a-z, 0-9, _ (3-30 ตัว)</p>}
                {uStatus === 'checking' && <p className="mt-1 text-xs text-default-500">กำลังตรวจสอบ...</p>}
              </div>
              <div>
                <label className="form-label">เบอร์โทรศัพท์ <span className="text-danger">*</span></label>
                <input className="form-input" type="tel" inputMode="numeric" placeholder="08xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} maxLength={10} />
              </div>
            </div>
            <button type="button" onClick={submitInfo} disabled={infoLoading} className="btn bg-primary text-white hover:bg-primary-hover mt-6 w-full disabled:opacity-50">
              {infoLoading ? 'กำลังบันทึก...' : 'ถัดไป →'}
            </button>
          </>
        )}

        {/* ─── STEP: warning เบอร์ ─── */}
        {step === 'warning' && (
          <>
            <div className="mb-4 flex justify-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-warning/15 text-warning text-3xl">
                <Icon icon="alert-triangle" />
              </span>
            </div>
            <h4 className="mb-1 text-center text-lg font-bold text-default-900">ยืนยันเบอร์โทรศัพท์</h4>
            <div className="mt-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-default-700">
              <p className="mb-1 font-semibold text-warning">โปรดตรวจสอบให้ดี</p>
              เบอร์นี้ใช้ <b>ตั้งได้ครั้งเดียว</b> และ <b>เปลี่ยนแปลงไม่ได้</b> เนื่องจากมีผลต่อ <b>ความน่าเชื่อถือ (Trust Score)</b> ของร้านคุณ
            </div>
            <div className="mt-4 text-center">
              <div className="text-sm text-default-500">เบอร์ที่จะยืนยัน</div>
              <div className="text-2xl font-bold tracking-wide text-default-900">{phone}</div>
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <button type="button" onClick={sendOtp} disabled={otpLoading} className="btn bg-primary text-white hover:bg-primary-hover w-full disabled:opacity-50">
                {otpLoading ? 'กำลังส่ง...' : 'ยืนยัน — ส่งรหัส OTP'}
              </button>
              <button type="button" onClick={() => setStep('info')} className="btn border border-default-300 text-default-700 w-full">← แก้ไขเบอร์</button>
            </div>
          </>
        )}

        {/* ─── STEP: OTP ─── */}
        {step === 'otp' && (
          <>
            <h4 className="mb-1 text-center text-lg font-bold text-default-900">ส่งรหัสแล้ว!</h4>
            <p className="text-default-400 mb-4 text-center text-sm">เราส่งรหัส 6 หลักไปที่ {'*'.repeat(6)}{phone.slice(-4)}</p>
            <div className="flex justify-center gap-2">
              {otp.map((d, i) => (
                <input key={i} ref={(el) => { otpRefs.current[i] = el }} type="text" inputMode="numeric" maxLength={1}
                  value={d} onChange={(e) => onOtp(i, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus() }}
                  className="form-input h-11 w-11 p-0 text-center font-mono text-lg" aria-label={`OTP หลักที่ ${i + 1}`} />
              ))}
            </div>
            <button type="button" onClick={verifyOtp} disabled={otpLoading || otp.join('').length !== 6} className="btn bg-primary text-white hover:bg-primary-hover mt-6 w-full disabled:opacity-50">
              {otpLoading ? 'กำลังยืนยัน...' : 'ยืนยัน OTP'}
            </button>
            {countdown > 0 ? (
              <p className="text-default-400 mt-3 text-center text-xs">ขอ OTP ใหม่ได้ใน {countdown} วินาที</p>
            ) : (
              <button type="button" onClick={sendOtp} className="mt-3 w-full text-center text-sm text-primary">ขอ OTP ใหม่</button>
            )}
          </>
        )}

        {/* ─── STEP: slug ─── */}
        {step === 'slug' && (
          <>
            <h4 className="mb-1 text-center text-lg font-bold text-default-900">ตั้ง URL ร้านของคุณ</h4>
            <p className="text-default-400 mb-5 text-center text-sm">ลูกค้าจะค้นหาร้านคุณผ่านลิงก์นี้</p>
            <label className="form-label">URL ร้านค้า <span className="text-danger">*</span></label>
            <input className="form-input" placeholder="yourshop" value={slug} onChange={(e) => onSlug(e.target.value)} maxLength={30} autoCapitalize="none" autoComplete="off" />
            {sStatus === 'ok' && <p className="mt-1 text-xs text-success">✓ URL นี้ว่างอยู่</p>}
            {sStatus === 'taken' && <p className="mt-1 text-xs text-danger">✕ มีคนใช้แล้ว</p>}
            {sStatus === 'invalid' && <p className="mt-1 text-xs text-danger">✕ a-z, 0-9, ขีดกลาง (3-30 ตัว)</p>}
            {slug && sStatus === 'ok' && <p className="mt-3 text-sm text-primary">deepthailand.app/<span className="font-mono">{slug}</span></p>}
            <button type="button" onClick={submitSlug} disabled={slugLoading || sStatus !== 'ok'} className="btn bg-primary text-white hover:bg-primary-hover mt-6 w-full disabled:opacity-50">
              {slugLoading ? 'กำลังบันทึก...' : 'ถัดไป →'}
            </button>
          </>
        )}

        {/* ─── STEP: product ─── */}
        {step === 'product' && (
          <>
            <h4 className="mb-1 text-center text-lg font-bold text-default-900">สร้างสินค้าแรกของคุณ</h4>
            <p className="text-default-400 mb-5 text-center text-sm">เพิ่มสินค้าชิ้นแรกเพื่อให้ลูกค้าเห็นร้าน</p>
            <div className="flex flex-col gap-4">
              <div>
                <label className="form-label">ชื่อสินค้า</label>
                <input className="form-input" placeholder="เช่น ข้าวหอมมะลิ" value={pName} onChange={(e) => setPName(e.target.value)} />
              </div>
              <div>
                <label className="form-label">ราคา</label>
                <div className="input-group">
                  <span className="input-group-text">฿</span>
                  <input className="form-input" type="number" min="0.01" step="0.01" placeholder="0.00" value={pPrice} onChange={(e) => setPPrice(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <button type="button" onClick={createProduct} disabled={pLoading} className="btn bg-primary text-white hover:bg-primary-hover w-full disabled:opacity-50">
                {pLoading ? 'กำลังสร้าง...' : 'สร้างสินค้าเลย'}
              </button>
              <button type="button" onClick={finish} disabled={pLoading} className="w-full text-center text-sm text-default-500 disabled:opacity-50">ข้ามไปก่อน เพิ่มทีหลังได้</button>
            </div>
          </>
        )}
      </div>

      <p className="text-default-400 mt-7.5 text-center text-xs">© {new Date().getFullYear()} Deep</p>
    </AuthCardShell>
  )
}
