/**
 * Seller reset-pass form — re-sourced จาก Paces card reset-pass template.
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/reset-pass/page.tsx (inline form ใน base)
 *
 * Changes vs base:
 * - แยก form ออกมาเป็น Client Component แยกไฟล์ (pattern เดียวกับ sign-in)
 * - เปลี่ยน email field → phone field (SafePay ใช้ phone-OTP เสมอ)
 * - ตัด "Agree the Terms & Policy" checkbox ออก (Controller decision OQ-2 + spec S-P2-4)
 * - form state: react-hook-form + Yup (แทน plain HTML form ใน base)
 * - onSubmit: POST /api/otp/send → redirect /auth/verify-otp?mode=reset&phone=
 * - 429 → pacesToast.error (ตาม spec S-P2-4)
 * - UI copy ภาษาไทย
 */

'use client'

import { pacesToast } from '@/lib/paces-toast'
import { yupResolver } from '@hookform/resolvers/yup'
import { Icon } from '@iconify/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import * as Yup from 'yup'

const schema = Yup.object({
  phone: Yup.string()
    .matches(/^0[0-9]{9}$/, 'เบอร์ต้องขึ้นต้นด้วย 0 และมี 10 หลัก')
    .required('กรุณากรอกเบอร์โทร'),
})

type FormValues = Yup.InferType<typeof schema>

export default function ResetPassForm() {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { phone: '' },
  })

  const onSubmit = async ({ phone }: FormValues) => {
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact: phone, type: 'PHONE' }),
      })

      if (res.status === 429) {
        // rate limit — ผู้ใช้ส่งคำขอถี่เกินไป
        pacesToast.error('คุณส่งคำขอบ่อยเกินไป กรุณารอสักครู่')
        return
      }

      if (!res.ok) {
        // network/server error อื่น ๆ
        pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
        return
      }

      // phone ไม่มีในระบบ → otp/send ยัง ok (กัน phone oracle) → fail ตอน verify ตาม spec
      router.push(
        `/auth/verify-otp?mode=reset&phone=${encodeURIComponent(phone)}`
      )
    } catch {
      // network error (offline / fetch throw)
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="mb-5">
        <label htmlFor="phone" className="form-label">
          เบอร์โทรศัพท์
          <span className="text-danger">*</span>
        </label>
        {/* input-icon-group — Paces utility class จาก theme */}
        <div className="input-icon-group">
          <Icon icon="tabler:phone" className="input-icon" />
          <input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="08xxxxxxxx"
            className="form-input w-full"
            {...register('phone')}
          />
        </div>
        {errors.phone && (
          <p className="text-danger mt-1 text-sm">{errors.phone.message}</p>
        )}
      </div>

      <div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn bg-primary w-full py-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {isSubmitting ? 'กำลังส่ง...' : 'ส่งรหัส OTP'}
        </button>
      </div>
    </form>
  )
}
