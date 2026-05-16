/**
 * Seller sign-in form — re-sourced from Paces (basic) sign-in Form component.
 *
 * Base: theme/paces/Admin/TS/src/app/auth/(basic)/sign-in/components/Form.tsx
 *
 * Changes vs base:
 * - เปลี่ยน email+password fields เป็น phone field เดียว (SafePay phone-OTP flow)
 * - ลบ "Keep me signed in" checkbox + "Forgot Password" link (ไม่มี password ใน OTP flow)
 * - form state จัดการด้วย react-hook-form + Yup (แทน useState ของ base)
 * - onSubmit: POST /api/otp/send → redirect ไป /seller/auth/verify-otp (auth wiring เดิม)
 * - error แสดงผ่าน react-toastify (แทน inline error ของ base)
 * - ปุ่ม submit ใช้ Preline btn class เหมือน base แต่ข้อความภาษาไทย
 */

'use client'

import { yupResolver } from '@hookform/resolvers/yup'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import * as Yup from 'yup'

const schema = Yup.object({
  phone: Yup.string()
    .matches(/^0[0-9]{9}$/, 'เบอร์ต้องขึ้นต้นด้วย 0 และมี 10 หลัก')
    .required('กรุณากรอกเบอร์โทร'),
})

type FormValues = Yup.InferType<typeof schema>

export default function SignInForm() {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: phone, type: 'PHONE' }),
      })
      if (!res.ok) {
        toast.error('ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      // redirect ไปหน้า verify-otp พร้อม mode=signin และ phone param
      router.push(
        `/auth/verify-otp?mode=signin&phone=${encodeURIComponent(phone)}`
      )
    } catch {
      toast.error('ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="mb-5">
        <label htmlFor="phone" className="form-label">
          เบอร์โทรศัพท์
          <span className="text-danger">*</span>
        </label>
        <div className="input-group">
          <input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="08xxxxxxxx"
            className="form-input"
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
          {isSubmitting ? 'กำลังส่งรหัส...' : 'ส่งรหัส OTP'}
        </button>
      </div>
    </form>
  )
}
