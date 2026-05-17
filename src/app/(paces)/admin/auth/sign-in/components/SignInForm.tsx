/**
 * SignInForm — admin username + password form
 *
 * Base: theme/paces/Admin/TS/src/app/auth/(basic)/sign-in/components/Form.tsx
 * Markup copy: form/label/input-group/button structure + className ทุกอัน
 * Swap: email field → username (type="text"), ลบ Remember me, ลบ Forgot password link
 * Logic: React Hook Form + Yup (convention frontend paces) แทน useState
 * signIn('admin-credentials', { redirect:false }) → push '/dashboard' on ok
 * Error: generic ภาษาไทย "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" — ห้ามแยก username/password
 *   เพราะ provider return null ทุก fail (ไม่บอกว่าผิดอะไร) เพื่อกัน user enumeration
 * /dashboard → proxy (/admin subdomain) rewrite เป็น /admin/dashboard อัตโนมัติ
 */
'use client'

import { yupResolver } from '@hookform/resolvers/yup'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import * as Yup from 'yup'

const schema = Yup.object({
  username: Yup.string().required('กรุณากรอกชื่อผู้ใช้'),
  password: Yup.string().required('กรุณากรอกรหัสผ่าน'),
})

type FormValues = Yup.InferType<typeof schema>

export default function SignInForm() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { username: '', password: '' },
  })

  const onSubmit = async ({ username, password }: FormValues) => {
    setServerError(null)
    const result = await signIn('admin-credentials', {
      username,
      password,
      redirect: false,
    })
    if (result?.ok) {
      // proxy rewrite /dashboard → /admin/dashboard บน admin subdomain อัตโนมัติ
      router.push('/dashboard')
      return
    }
    // generic error — ไม่บอกว่าผิด username หรือ password เพื่อกัน user enumeration
    setServerError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* username field — copy structure จาก theme Form.tsx (email field) */}
      <div className="mb-5">
        <label htmlFor="username" className="form-label">
          ชื่อผู้ใช้
          <span className="text-danger">*</span>
        </label>
        <div className="input-group">
          <input
            type="text"
            className="form-input"
            id="username"
            autoComplete="username"
            placeholder="ชื่อผู้ใช้"
            {...register('username')}
          />
        </div>
        {errors.username && (
          <p className="text-danger mt-1 text-sm">{errors.username.message}</p>
        )}
      </div>

      {/* password field — copy structure จาก theme Form.tsx */}
      <div className="mb-5">
        <label htmlFor="password" className="form-label">
          รหัสผ่าน
          <span className="text-danger">*</span>
        </label>
        <div className="input-group">
          <input
            type="password"
            className="form-input"
            id="password"
            autoComplete="current-password"
            placeholder="••••••••"
            {...register('password')}
          />
        </div>
        {errors.password && (
          <p className="text-danger mt-1 text-sm">{errors.password.message}</p>
        )}
      </div>

      {/* server error generic — ไม่แยก username/password เพราะ provider return null ทุก fail */}
      {serverError && (
        <p className="text-danger mb-4 text-center text-sm">{serverError}</p>
      )}

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
  )
}
