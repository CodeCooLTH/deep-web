'use client'

/**
 * /register — เฟส 1 ลงทะเบียนผู้ขาย (เหมือน sign-up) สำหรับ FB user / user ที่ยังไม่มีเบอร์
 * เด้งจาก proxy เมื่อ token.needsRegistration (ไม่มีเบอร์)
 *
 * Base (layout): AuthCardShell · Base (field): SignUpForm.tsx (input-icon-group + invalid-msg)
 * Flow: ข้อมูลบัญชี (username + เบอร์; ชื่อจาก FB อัตโนมัติ) → ⚠️warning เบอร์ตั้งครั้งเดียว
 *   → OTP → success "เข้าสู่ระบบ" → /dashboard (proxy เด้งต่อ /onboarding ถ้ายังไม่ setup)
 * spec: docs/superpowers/specs/2026-06-17-fb-onboarding-flow-diagram.html
 */

import AuthCardShell from '../auth/components/AuthCardShell'
import AuthLogo from '@/components/AuthLogo'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import Swal from 'sweetalert2'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type Step = 'info' | 'warning' | 'otp' | 'success'
type Check = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid'

// chip "เข้าสู่ระบบด้วย X" — derive provider จาก username prefix (line/ig/fb) ของ OAuth user ที่เพิ่งสมัคร
// (ไม่ต้องเก็บ provider ใน JWT). LINE/IG สี brand = inline style (Hard Rule 6 exception); FB ใช้ token text-info เดิม
function loginProviderChip(username: string | undefined): { icon: string; label: string; iconClassName: string; iconStyle?: { color: string } } {
  const u = username ?? ''
  if (u.startsWith('line')) return { icon: 'brand-line', label: 'LINE', iconClassName: 'size-3.5', iconStyle: { color: '#06C755' } }
  if (u.startsWith('ig')) return { icon: 'brand-instagram', label: 'Instagram', iconClassName: 'size-3.5', iconStyle: { color: '#E1306C' } }
  return { icon: 'brand-facebook', label: 'Facebook', iconClassName: 'size-3.5 text-info' }
}

export default function RegisterPage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const user = (session?.user ?? {}) as {
    displayName?: string; username?: string; avatar?: string | null; needsPhoneVerify?: boolean
  }

  const [step, setStep] = useState<Step>('info')
  const [ready, setReady] = useState(false)

  const [username, setUsername] = useState('')
  const [uStatus, setUStatus] = useState<Check>('idle')
  const [phone, setPhone] = useState('')
  const [infoLoading, setInfoLoading] = useState(false)
  const uDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [countdown, setCountdown] = useState(0)
  const [otpLoading, setOtpLoading] = useState(false)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') { router.replace('/auth/sign-in'); return }
    if (user.needsPhoneVerify === false) { router.replace('/dashboard'); return }
    // sanitize prefill: LINE/IG username (เช่น lineU9d... — มีตัวพิมพ์ใหญ่/ยาว >30) ต้องผ่านกติกา a-z0-9_ 3-30
    if (!ready) { setUsername((user.username ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30)); setReady(true) }
  }, [status, user, ready, router])

  useEffect(() => {
    if (countdown <= 0) return
    const t = setInterval(() => setCountdown((c) => c - 1), 1000)
    return () => clearInterval(t)
  }, [countdown])

  const onUsername = (v: string) => {
    const cleaned = v.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30)
    setUsername(cleaned); setUStatus('idle')
    if (uDebounce.current) clearTimeout(uDebounce.current)
    if (cleaned.length < 3) { setUStatus(cleaned ? 'invalid' : 'idle'); return }
    setUStatus('checking')
    uDebounce.current = setTimeout(async () => {
      try { const res = await fetch(`/api/users/check-username?u=${encodeURIComponent(cleaned)}`); const d = await res.json(); setUStatus(d.available ? 'ok' : 'taken') }
      catch { setUStatus('idle') }
    }, 400)
  }

  // info → warning: save username + สร้าง shop (ชื่อร้าน = ชื่อจาก FB), เช็คเบอร์ซ้ำ
  const submitInfo = async () => {
    if (uStatus !== 'ok') return pacesToast.error('กรุณาตั้งชื่อผู้ใช้ที่ใช้ได้')
    if (!/^0[0-9]{9}$/.test(phone)) return pacesToast.error('กรุณากรอกเบอร์โทรให้ถูกต้อง')
    setInfoLoading(true)
    try {
      const pRes = await fetch(`/api/users/check-phone?phone=${encodeURIComponent(phone)}`)
      const pData = await pRes.json().catch(() => ({}))
      if (pRes.ok && pData.available === false) { setInfoLoading(false); return pacesToast.error('เบอร์นี้มีบัญชีแล้ว') }
      const res = await fetch('/api/account/shop-info', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: (user.displayName || 'ร้านค้า').trim(), username }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setInfoLoading(false); return pacesToast.error(d.error ?? 'บันทึกไม่สำเร็จ') }
      setStep('warning')
    } catch { pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') } finally { setInfoLoading(false) }
  }

  const sendOtp = async () => {
    setOtpLoading(true)
    try {
      const res = await fetch('/api/otp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact: phone, type: 'PHONE' }) })
      if (res.ok) { setStep('otp'); setCountdown(60); setTimeout(() => otpRefs.current[0]?.focus(), 100) }
      else if (res.status === 429) pacesToast.error('ขอ OTP บ่อยเกินไป กรุณารอสักครู่')
      else pacesToast.error('ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่')
    } catch { pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') } finally { setOtpLoading(false) }
  }

  const onOtp = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1); const next = [...otp]; next[i] = d; setOtp(next)
    if (d && i < 5) otpRefs.current[i + 1]?.focus()
  }

  const verifyOtp = async () => {
    const code = otp.join('')
    if (code.length !== 6) return pacesToast.error('กรุณากรอก OTP ให้ครบ 6 หลัก')
    setOtpLoading(true)
    try {
      const res = await fetch('/api/account/set-phone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, otp: code }) })
      if (res.ok) {
        setStep('success')
        await update()
        setTimeout(() => router.replace('/dashboard'), 1400)
      } else {
        const d = await res.json().catch(() => ({})); pacesToast.error(d.error ?? 'OTP ไม่ถูกต้อง กรุณาลองใหม่')
        setOtp(['', '', '', '', '', '']); setTimeout(() => otpRefs.current[0]?.focus(), 50)
      }
    } catch { pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่') } finally { setOtpLoading(false) }
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
      <div className="mb-6 flex justify-center">
        <AuthLogo />
      </div>

      {step === 'info' && (
        <div className="mb-5 flex flex-col items-center">
          {user.avatar ? (
            <img src={user.avatar} alt="" className="size-16 rounded-full object-cover ring-2 ring-primary/20" />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary text-2xl font-bold">{(user.displayName || 'D').slice(0, 1)}</span>
          )}
          {(() => {
            const p = loginProviderChip(user.username)
            return (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-default-100 px-3 py-1 text-xs text-default-500">
                <Icon icon={p.icon} className={p.iconClassName} style={p.iconStyle} /> เข้าสู่ระบบด้วย {p.label}
              </span>
            )
          })()}
        </div>
      )}

      <div>
        {step === 'info' && (
          <>
            <h4 className="mb-1 text-center text-lg font-bold text-default-900">สร้างบัญชีผู้ขาย</h4>
            <p className="text-default-400 mb-5 text-center text-sm">
              {user.displayName ? `สวัสดี ${user.displayName} — ` : ''}ตั้งชื่อผู้ใช้และยืนยันเบอร์เพื่อเริ่มใช้งาน
            </p>
            <div className="flex flex-col gap-5">
              <div>
                <label className="form-label">ชื่อผู้ใช้ (username)<span className="text-danger">*</span></label>
                <div className="input-icon-group">
                  <Icon icon="at" className="input-icon" />
                  <input className="form-input" placeholder="a-z, 0-9, _ เท่านั้น" value={username} onChange={(e) => onUsername(e.target.value)} autoCapitalize="none" />
                </div>
                {uStatus === 'ok' && <p className="invalid-msg mt-1 text-sm text-success">ใช้ชื่อนี้ได้</p>}
                {uStatus === 'taken' && <p className="invalid-msg mt-1 text-sm text-danger">ชื่อผู้ใช้นี้มีคนใช้แล้ว</p>}
                {uStatus === 'invalid' && <p className="invalid-msg mt-1 text-sm text-danger">ใช้ a-z, 0-9, _ ได้ 3-30 ตัว</p>}
                {uStatus === 'checking' && <p className="invalid-msg mt-1 text-sm text-default-400">กำลังตรวจสอบ...</p>}
              </div>
              <div>
                <label className="form-label">เบอร์โทรศัพท์<span className="text-danger">*</span></label>
                <div className="input-icon-group">
                  <Icon icon="phone" className="input-icon" />
                  <input className="form-input" type="tel" inputMode="numeric" placeholder="08xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} maxLength={10} />
                </div>
              </div>
            </div>
            <button type="button" onClick={submitInfo} disabled={infoLoading} className="btn bg-primary text-white hover:bg-primary-hover mt-6 w-full disabled:opacity-50">{infoLoading ? 'กำลังบันทึก...' : 'ถัดไป →'}</button>
            {/* ยกเลิก — เปลี่ยนใจไม่สร้างบัญชี → ออกจากระบบ กลับหน้า sign-in (Swal confirm กันกดพลาด) */}
            <button type="button" onClick={async () => {
              const r = await Swal.fire({
                icon: 'warning',
                title: 'ยกเลิกการสร้างบัญชี?',
                text: 'คุณจะออกจากระบบและกลับไปหน้าเข้าสู่ระบบ',
                showCancelButton: true,
                confirmButtonText: 'ใช่ ยกเลิก',
                cancelButtonText: 'ไม่ใช่',
                buttonsStyling: false,
                customClass: { confirmButton: 'btn bg-danger text-white hover:bg-danger-hover me-2', cancelButton: 'btn bg-light text-dark hover:bg-light-hover' },
              })
              if (r.isConfirmed) signOut({ callbackUrl: '/auth/sign-in' })
            }} className="btn border border-default-300 text-default-700 hover:bg-default-50 mt-2 w-full">ยกเลิก</button>
          </>
        )}

        {step === 'warning' && (
          <>
            <div className="mb-4 flex justify-center"><span className="flex size-16 items-center justify-center rounded-full bg-warning/15 text-warning text-3xl"><Icon icon="alert-triangle" /></span></div>
            <h4 className="mb-1 text-center text-lg font-bold text-default-900">ยืนยันเบอร์โทรศัพท์</h4>
            <div className="mt-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-default-700">
              <p className="mb-1 font-semibold text-warning">โปรดตรวจสอบให้ดี</p>
              เบอร์นี้ใช้ <b>ตั้งได้ครั้งเดียว</b> และ <b>เปลี่ยนแปลงไม่ได้</b> เนื่องจากมีผลต่อ <b>ความน่าเชื่อถือ (Trust Score)</b> ของร้านคุณ
            </div>
            <div className="mt-4 text-center"><div className="text-sm text-default-500">เบอร์ที่จะยืนยัน</div><div className="text-2xl font-bold tracking-wide text-default-900">{phone}</div></div>
            <div className="mt-6 flex flex-col gap-2">
              <button type="button" onClick={sendOtp} disabled={otpLoading} className="btn bg-primary text-white hover:bg-primary-hover w-full disabled:opacity-50">{otpLoading ? 'กำลังส่ง...' : 'ยืนยัน — ส่งรหัส OTP'}</button>
              <button type="button" onClick={() => setStep('info')} className="btn border border-default-300 text-default-700 w-full">← แก้ไขเบอร์</button>
            </div>
          </>
        )}

        {step === 'otp' && (
          <>
            <h4 className="mb-1 text-center text-lg font-bold text-default-900">ส่งรหัสแล้ว!</h4>
            <p className="text-default-400 mb-4 text-center text-sm">เราส่งรหัส 6 หลักไปที่ {'*'.repeat(6)}{phone.slice(-4)}</p>
            <div className="flex justify-center gap-2">
              {otp.map((d, i) => (
                <input key={i} ref={(el) => { otpRefs.current[i] = el }} type="text" inputMode="numeric" maxLength={1} value={d}
                  onChange={(e) => onOtp(i, e.target.value)} onKeyDown={(e) => { if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus() }}
                  className="form-input h-11 w-11 p-0 text-center font-mono text-lg" aria-label={`OTP หลักที่ ${i + 1}`} />
              ))}
            </div>
            <button type="button" onClick={verifyOtp} disabled={otpLoading || otp.join('').length !== 6} className="btn bg-primary text-white hover:bg-primary-hover mt-6 w-full disabled:opacity-50">{otpLoading ? 'กำลังยืนยัน...' : 'ยืนยัน OTP'}</button>
            {countdown > 0 ? <p className="text-default-400 mt-3 text-center text-xs">ขอ OTP ใหม่ได้ใน {countdown} วินาที</p> : <button type="button" onClick={sendOtp} className="mt-3 w-full text-center text-sm text-primary">ขอ OTP ใหม่</button>}
          </>
        )}

        {step === 'success' && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-success/15 text-success text-4xl">🎉</span>
            <div><h4 className="text-lg font-bold text-default-900">เข้าสู่ระบบสำเร็จ!</h4><p className="text-default-500 text-sm mt-1">กำลังเข้าสู่ระบบ...</p></div>
            <div className="border-primary inline-block size-8 animate-spin rounded-full border-3 border-t-transparent" role="status" />
          </div>
        )}
      </div>

      {step !== 'success' && <p className="text-default-400 mt-7.5 text-center text-xs">© {new Date().getFullYear()} Deep</p>}
    </AuthCardShell>
  )
}
