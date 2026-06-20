'use client'

import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { pacesToast } from '@/lib/paces-toast'

export default function VerifyOtpForm() {
  const router = useRouter()
  const params = useSearchParams()

  const phone = params.get('phone') ?? ''
  const mode = (params.get('mode') ?? 'signin') as 'signin' | 'signup'
  const displayName = params.get('name') ?? ''
  const username = params.get('username') ?? ''

  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [resending, setResending] = useState(false)

  // Redirect if no phone context
  useEffect(() => {
    if (!phone) router.replace('/auth/sign-in')
  }, [phone, router])

  const masked = phone
    ? `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`
    : ''

  const handleDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 1)
    const next = [...digits]
    next[i] = clean
    setDigits(next)
    // auto-focus next input
    if (clean && i < 5) {
      const nextEl = document.getElementById(`otp-${i + 1}`) as HTMLInputElement | null
      nextEl?.focus()
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    const otp = digits.join('')
    if (otp.length !== 6) {
      setErrorMsg('กรุณากรอกรหัส 6 หลัก')
      return
    }
    setSubmitting(true)
    try {
      const result = await signIn('phone-otp', {
        phone,
        otp,
        mode,
        displayName,
        username,
        redirect: false,
      })
      if (result?.ok) {
        router.push('/')
        return
      }
      setErrorMsg('รหัสไม่ถูกต้องหรือหมดอายุ ลองอีกครั้ง')
    } catch {
      setErrorMsg('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  const onResend = async () => {
    if (!phone) return
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
      } else {
        pacesToast.error('ส่งรหัสใหม่ไม่สำเร็จ')
      }
    } catch {
      pacesToast.error('ส่งรหัสใหม่ไม่สำเร็จ')
    } finally {
      setResending(false)
    }
  }

  if (!phone) return null

  return (
    <>
      <div className="mb-6 text-center text-2xl font-bold">{masked}</div>

      <form onSubmit={onSubmit}>
        <div className="mb-5">
          <label className="form-label">
            กรอกรหัส 6 หลัก<span className="text-danger">*</span>
          </label>
          <div className="two-factor flex gap-2">
            {digits.map((d, i) => (
              <input
                key={i}
                id={`otp-${i}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleDigit(i, e.target.value)}
                className="form-input text-center"
                required
              />
            ))}
          </div>
          {errorMsg && (
            <p className="text-danger mt-2 text-sm text-center">{errorMsg}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="btn bg-primary w-full py-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {submitting ? 'กำลังยืนยัน...' : 'ยืนยัน'}
        </button>
      </form>

      <p className="text-default-400 mt-6 text-center text-sm">
        หากไม่ได้รับ SMS{' '}
        <button
          type="button"
          onClick={onResend}
          disabled={resending}
          className="text-primary hover:text-primary-hover font-semibold underline underline-offset-3 disabled:opacity-60"
        >
          {resending ? 'กำลังส่ง...' : 'ส่งอีกครั้ง'}
        </button>
      </p>
    </>
  )
}
