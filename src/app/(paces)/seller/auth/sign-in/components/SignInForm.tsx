/**
 * Seller sign-in form — redesign P2 S-P2-1 (username+password แทน phone-OTP)
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/sign-in/components/Form.tsx
 *
 * Changes vs base:
 * - เปลี่ยน email → username field (icon tabler:user)
 * - เปลี่ยน password label เป็นภาษาไทย + icon tabler:lock-password
 * - ตัด "Keep me signed in" checkbox (ตาม OQ-2 — ไม่มี remember-me)
 * - เพิ่ม Facebook button (w-full, icon bxl:facebook-circle) + dashed divider
 * - เพิ่ม link "ลืมรหัสผ่าน?" → /auth/reset-pass
 * - form state จัดการด้วย react-hook-form + Yup (แทน useState ของ base)
 * - onSubmit: signIn('seller-credentials') → ok router.push('/dashboard');
 *   fail → pacesToast.error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง') (generic กัน enumeration)
 * - loading state: "กำลังเข้าสู่ระบบ..." + disabled
 * - error แสดงผ่าน pacesToast (Hard Rule 9 — ไม่ใช้ toast lib อื่นใน paces)
 */

'use client'

import { pacesToast } from '@/lib/paces-toast'
import { Icon as BxIcon } from '@iconify/react'
import { yupResolver } from '@hookform/resolvers/yup'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import * as Yup from 'yup'
import Icon from '@/components/wrappers/Icon'

const schema = Yup.object({
  username: Yup.string()
    .min(3, 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร')
    .required('กรุณากรอกชื่อผู้ใช้'),
  password: Yup.string()
    .min(1, 'กรุณากรอกรหัสผ่าน')
    .required('กรุณากรอกรหัสผ่าน'),
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
    defaultValues: { username: '', password: '' },
  })

  const handleFacebook = async () => {
    await signIn('facebook', { callbackUrl: '/dashboard' })
  }

  const onSubmit = async ({ username, password }: FormValues) => {
    const result = await signIn('seller-credentials', {
      username,
      password,
      redirect: false,
    })

    if (result?.ok) {
      router.push('/dashboard')
    } else {
      // generic error — ไม่บอก username/password อันไหนผิดเพื่อกัน enumeration
      pacesToast.error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    }
  }

  return (
    <>
      {/* ปุ่ม Facebook OAuth */}
      <button
        type="button"
        onClick={handleFacebook}
        className="btn border border-default-300 text-default-900 hover:border-default-400 hover:bg-default-50 w-full"
      >
        {/* BxIcon = raw Iconify เพราะ Facebook icon อยู่ใน boxicons set (bxl:)
            ขณะที่ Icon wrapper ของโปรเจกต์ fix prefix เป็น tabler: เท่านั้น */}
        <BxIcon
          icon="bxl:facebook-circle"
          width={18}
          height={18}
          className="me-2 flex-shrink-0"
          style={{ color: '#1877f2' }}
        />
        เข้าสู่ระบบด้วย Facebook
      </button>

      {/* dashed divider — copy structure จาก base theme ตรง ๆ */}
      <p className="relative my-5 text-center text-default-400 after:absolute after:start-0 after:end-0 after:top-2.75 after:h-0.75 after:border-t after:border-b after:border-dashed after:border-default-300">
        <span className="relative z-10 bg-card font-medium px-4">
          หรือเข้าด้วย username
        </span>
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* Username field */}
        <div className="mb-5">
          <label htmlFor="username" className="form-label">
            ชื่อผู้ใช้
            <span className="text-danger">*</span>
          </label>
          <div className="input-icon-group">
            {/* Icon wrapper ใส่ tabler: อัตโนมัติ → tabler:user */}
            <Icon icon="user" className="input-icon" />
            <input
              id="username"
              type="text"
              autoComplete="username"
              placeholder="your_username"
              className="form-input"
              {...register('username')}
            />
          </div>
          {errors.username && (
            <p className="text-danger mt-1 text-sm">{errors.username.message}</p>
          )}
        </div>

        {/* Password field */}
        <div className="mb-5">
          <label htmlFor="password" className="form-label">
            รหัสผ่าน
            <span className="text-danger">*</span>
          </label>
          <div className="input-icon-group">
            {/* Icon wrapper ใส่ tabler: อัตโนมัติ → tabler:lock-password */}
            <Icon icon="lock-password" className="input-icon" />
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className="form-input"
              {...register('password')}
            />
          </div>
          {errors.password && (
            <p className="text-danger mt-1 text-sm">{errors.password.message}</p>
          )}
        </div>

        {/* Row: ลืมรหัสผ่าน? */}
        <div className="mb-5 flex items-center justify-end">
          <Link
            href="/auth/reset-pass"
            className="text-default-400 underline underline-offset-4 text-sm"
          >
            ลืมรหัสผ่าน?
          </Link>
        </div>

        {/* Submit */}
        <div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn bg-primary w-full py-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </div>
      </form>
    </>
  )
}
