/**
 * NewPassForm — client component ตั้งรหัสผ่านใหม่หลัง reset OTP
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/new-pass/components/NewPassForm.tsx
 *
 * Changes vs base:
 * - ตัด email field (disabled) — ไม่ใช้ใน SafePay (phone-based)
 * - ตัด OTP 6-box — consume แล้วที่ verify-otp; phone+otp ส่งมาผ่าน sessionStorage
 *   (กัน double-consume OTP: verify-otp mode=reset ส่ง resetDraft ก่อน redirect — Controller note)
 * - ตัด Terms checkbox — ไม่มีใน flow reset password
 * - เพิ่ม react-hook-form + Yup validation
 * - onSubmit: POST /api/account/set-password {phone,otp,password} → toast + redirect
 * - error map: 400/401/404 → pacesToast.error (Hard Rule 9 — ไม่ใช้ toast lib อื่นใน paces)
 * - UI copy ภาษาไทย, icon tabler
 */

'use client'

import PasswordInputWithStrength from '@/components/PasswordInputWithStrength'
import { pacesToast } from '@/lib/paces-toast'
import { cn } from '@/utils/helpers'
import { yupResolver } from '@hookform/resolvers/yup'
import { Icon } from '@iconify/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import * as Yup from 'yup'

const schema = Yup.object({
  password: Yup.string()
    .min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
    .matches(/[a-zA-Z]/, 'ต้องมีตัวอักษร')
    .matches(/\d/, 'ต้องมีตัวเลข')
    .matches(/[\W_]/, 'ต้องมีอักขระพิเศษ')
    .required('กรุณากรอกรหัสผ่านใหม่'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password')], 'รหัสผ่านไม่ตรงกัน')
    .required('กรุณายืนยันรหัสผ่าน'),
})

type FormValues = Yup.InferType<typeof schema>

/** resetDraft เก็บ phone+otp ที่ verify-otp(mode=reset) set ก่อน redirect มาหน้านี้ */
type ResetDraft = { phone: string; otp: string }

export default function NewPassForm() {
  const router = useRouter()
  const [draft, setDraft] = useState<ResetDraft | null>(null)
  // password state แยกออกมาเพื่อส่งให้ PasswordInputWithStrength
  const [password, setPasswordState] = useState('')

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  // อ่าน resetDraft จาก sessionStorage เมื่อ mount (client-only)
  useEffect(() => {
    const raw = sessionStorage.getItem('resetDraft')
    if (!raw) {
      // ไม่มี draft → ส่งกลับ reset-pass (ผู้ใช้อาจเปิด URL โดยตรง)
      router.replace('/auth/reset-pass')
      return
    }
    try {
      const parsed = JSON.parse(raw) as ResetDraft
      if (!parsed.phone || !parsed.otp) throw new Error('invalid draft')
      setDraft(parsed)
    } catch {
      // draft เสีย → ส่งกลับ reset-pass
      sessionStorage.removeItem('resetDraft')
      router.replace('/auth/reset-pass')
    }
  }, [router])

  // sync password state → react-hook-form field เมื่อ PasswordInputWithStrength เปลี่ยน
  const handlePasswordChange = (value: string) => {
    setPasswordState(value)
    setValue('password', value, { shouldValidate: true })
  }

  const onSubmit = async ({ confirmPassword: _c, ...values }: FormValues) => {
    if (!draft) return
    try {
      const res = await fetch('/api/account/set-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: draft.phone, otp: draft.otp, password: values.password }),
      })

      if (res.ok) {
        // ล้าง draft ทันที — OTP ถูก consume แล้ว ใช้ซ้ำไม่ได้
        sessionStorage.removeItem('resetDraft')
        pacesToast.success('ตั้งรหัสผ่านใหม่เรียบร้อย')
        router.push('/auth/sign-in')
        return
      }

      // error map ตาม spec S-P2-5
      if (res.status === 400) {
        pacesToast.error('รหัสผ่านไม่ผ่านเงื่อนไข')
        return
      }
      if (res.status === 401) {
        // OTP หมดอายุ (single-use) — ส่งผู้ใช้กลับไปขอ OTP ใหม่
        pacesToast.error('รหัส OTP หมดอายุ กรุณาขอรหัสใหม่')
        sessionStorage.removeItem('resetDraft')
        router.push('/auth/reset-pass')
        return
      }
      if (res.status === 404) {
        pacesToast.error('ไม่พบบัญชีที่ใช้เบอร์นี้')
        return
      }
      // fallback — server error อื่น ๆ
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } catch {
      // network error (offline / fetch throw)
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  // รอ draft โหลด — ถ้าไม่มีให้ useEffect redirect ก่อน render form
  if (!draft) return null

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* password field — ใช้ PasswordInputWithStrength (strength bar + icon tabler:lock-password) */}
      <div className="mb-5" data-password="bar">
        <label htmlFor="password" className="form-label">
          รหัสผ่านใหม่
          <span className="text-danger">*</span>
        </label>
        <PasswordInputWithStrength
          id="password"
          name="password"
          password={password}
          setPassword={handlePasswordChange}
          showIcon
          placeholder="••••••••"
          hideHint
        />
        {/* hint ภาษาไทย — แสดงแทน hint อังกฤษ default ของ component (hideHint=true ปิดบรรทัดอังกฤษแล้ว) */}
        <p className="text-default-400 text-xs">
          ≥8 ตัว มีตัวอักษร ตัวเลข และอักขระพิเศษ
        </p>
        {errors.password && (
          <p className="invalid-msg mt-1 text-sm text-danger">{errors.password.message}</p>
        )}
      </div>

      {/* confirmPassword field — input-icon-group + tabler:lock-password (ตาม spec) */}
      <div className="mb-5">
        <label htmlFor="confirmPassword" className="form-label">
          ยืนยันรหัสผ่านใหม่
          <span className="text-danger">*</span>
        </label>
        <div className="input-icon-group">
          <Icon icon="tabler:lock-password" className="input-icon" />
          <input
            id="confirmPassword"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            className={cn('form-input w-full', errors.confirmPassword && '!border-danger')}
            {...register('confirmPassword')}
          />
        </div>
        {errors.confirmPassword && (
          <p className="invalid-msg mt-1 text-sm text-danger">{errors.confirmPassword.message}</p>
        )}
      </div>

      <div>
        <button
          type="submit"
          disabled={isSubmitting || !draft}
          className="btn bg-primary w-full py-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่าน'}
        </button>
      </div>

      <p className="text-default-400 mt-7.5 text-center">
        กลับไปที่&nbsp;
        <Link
          href="/auth/sign-in"
          className="text-primary font-semibold underline underline-offset-4"
        >
          เข้าสู่ระบบ
        </Link>
      </p>
    </form>
  )
}
