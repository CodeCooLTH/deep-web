/**
 * Seller sign-in form — redesign P2 S-P2-1 (username+password แทน phone-OTP)
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/sign-in/components/Form.tsx
 * Field error style: theme/paces/Admin/TS/src/app/(admin)/form/validation/components/CustomValidation.tsx
 *
 * Changes vs base:
 * - เปลี่ยน email → username field (icon tabler:user)
 * - เปลี่ยน password label เป็นภาษาไทย + icon tabler:lock-password
 * - ตัด "Keep me signed in" checkbox (ตาม OQ-2 — ไม่มี remember-me)
 * - เพิ่ม Facebook button (w-full, icon bxl:facebook-circle) + dashed divider
 * - เพิ่ม link "ลืมรหัสผ่าน?" → /auth/reset-pass
 * - form state จัดการด้วย react-hook-form + Yup (แทน useState ของ base)
 * - onSubmit: signIn('seller-credentials') → ok router.push('/dashboard');
 *   fail → setError('root') inline แทน toast (generic กัน enumeration)
 * - loading state: "กำลังเข้าสู่ระบบ..." + disabled
 * - login error แสดง inline ใต้ submit (errors.root) ไม่ใช่ toast
 * - field error style: cn('form-input', errors.x && '!border-danger') + invalid-msg
 *
 * feature 00012 ext — เคารพ `?callbackUrl=`:
 *   เดิมทุกช่องทางเด้ง /dashboard ตายตัว ทำให้ผู้ถูกเชิญที่มาจาก /i/<slug> เสียบริบทคำเชิญทิ้ง
 *   (ลิงก์ "เข้าสู่ระบบด้วยวิธีอื่น" ส่ง callbackUrl มาแล้ว แต่ฟอร์มนี้ไม่เคยอ่าน) ตอนนี้ทั้ง
 *   credentials / Facebook / LINE / Instagram พากลับปลายทางเดิม โดย sanitize ผ่าน safeCallbackUrl
 *   กัน open-redirect (ค่าจาก query string = ผู้โจมตีแก้ได้)
 */

'use client'

import { Icon as BxIcon } from '@iconify/react'
import { yupResolver } from '@hookform/resolvers/yup'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import * as Yup from 'yup'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import type { Dictionary } from '@/i18n/dictionaries/th'
import { safeCallbackUrl } from '@/lib/safe-callback-url'
import { cn } from '@/utils/helpers'

/**
 * schema ต้องสร้างจาก dictionary ไม่ใช่ค่าคงที่ระดับ module (feature 00047)
 * ข้อความ validation เป็นสิ่งที่ผู้ใช้เห็นบนจอ จึงต้องเปลี่ยนตามภาษาเหมือนข้อความอื่นทุกตัว
 * ถ้าปล่อยไว้นอก component มันจะถูกผูกกับภาษาที่โหลดตอน bundle แล้วค้างเป็นไทยตลอดไป
 */
function makeSchema(t: Dictionary) {
  return Yup.object({
    username: Yup.string().min(3, t.auth.signIn.errUsernameMin).required(t.auth.signIn.errUsernameRequired),
    password: Yup.string().min(1, t.auth.signIn.errPasswordRequired).required(t.auth.signIn.errPasswordRequired),
  })
}

type FormValues = Yup.InferType<ReturnType<typeof makeSchema>>

export default function SignInForm() {
  const t = useT()
  const schema = useMemo(() => makeSchema(t), [t])
  const router = useRouter()
  const searchParams = useSearchParams()
  // ปลายทางหลัง login — มาจาก query string จึงต้อง sanitize ทุกครั้ง (open-redirect)
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'))
  const [showPw, setShowPw] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { username: '', password: '' },
  })

  /**
   * Sign in with Apple — App Store Guideline 4.8 (rejection 2026-08-04)
   *
   * Apple บังคับว่าถ้ามีล็อกอินของเจ้าอื่น (Facebook/LINE) ต้องมีตัวเลือกที่เก็บข้อมูลแค่ชื่อ+อีเมล
   * และให้ผู้ใช้ซ่อนอีเมลจริงได้ ให้เลือกด้วย — ไม่มี = ตีกลับทั้ง build
   *
   * ชี้ตรงปลายทางเหมือน Facebook (ไม่ผ่านหน้า loading กลาง) — Apple ส่งกลับแบบ form_post
   * ซึ่งผ่าน callback ของ NextAuth ที่ตั้ง session cookie ให้ก่อน redirect อยู่แล้ว
   */
  const handleApple = async () => {
    await signIn('apple', { callbackUrl })
  }

  const handleFacebook = async () => {
    // ชี้ตรงปลายทาง (ไม่ผ่านหน้า loading กลาง /auth/callback/facebook) เพื่อลด redirect chain
    // — NextAuth set session cookie ก่อน 302, proxy อ่าน JWT เด้ง onboarding/register ถูกอยู่แล้ว.
    //   redirect chain สั้นลงช่วยลด phishing-heuristic false-positive ของ Safe Browsing (2026-06-20)
    await signIn('facebook', { callbackUrl })
  }

  const handleLine = async () => {
    // LINE/IG ยังผ่านหน้า loading กลางเพื่อรอ session ให้นิ่งก่อน (ต่างจาก FB) — ส่งปลายทางจริง
    // ต่อไปทาง ?next= ให้หน้านั้น redirect ต่อ แทนที่จะจบตายตัวที่ /dashboard
    await signIn('line', { callbackUrl: `/auth/callback/line?next=${encodeURIComponent(callbackUrl)}` })
  }

  const handleInstagram = async () => {
    await signIn('instagram', {
      callbackUrl: `/auth/callback/instagram?next=${encodeURIComponent(callbackUrl)}`,
    })
  }

  const onSubmit = async ({ username, password }: FormValues) => {
    const result = await signIn('seller-credentials', {
      username,
      password,
      redirect: false,
    })

    if (result?.ok) {
      router.push(callbackUrl)
    } else {
      // generic error — ไม่บอก username/password อันไหนผิดเพื่อกัน enumeration
      // ทั้ง 2 field ขึ้น border แดงโดยไม่โชว์ text ซ้อน; ข้อความรวมอยู่ที่ errors.root
      setError('username', { type: 'server', message: '' })
      setError('password', { type: 'server', message: '' })
      setError('root', { message: t.auth.signIn.errInvalidCredentials })
    }
  }

  return (
    <>
      {/* กลุ่มปุ่ม Social Login — stack แนวตั้ง */}
      <div className="flex flex-col gap-3">
        {/* ปุ่ม Sign in with Apple — วางบนสุดของกลุ่ม
            🛑 Apple บังคับให้อยู่ "ระดับเดียวกัน" กับล็อกอินเจ้าอื่น (Guideline 4.8) ห้ามซ่อนไว้
            หลังลิงก์ "ตัวเลือกอื่น" หรือทำให้เล็กกว่าปุ่มอื่น — วางบนสุดจึงชัดเจนที่สุดว่าไม่ได้ลดชั้น
            โลโก้ Apple ต้องเป็นสีดำบนพื้นขาวตาม Human Interface Guidelines (brand asset —
            carve-out จาก Paces token ตาม Hard Rule 6 เหมือน Facebook/LINE ด้านล่าง) */}
        <button
          type="button"
          onClick={handleApple}
          className="btn border border-default-300 text-default-900 hover:border-default-400 hover:bg-default-50 w-full"
        >
          <BxIcon
            icon="bxl:apple"
            width={18}
            height={18}
            className="me-2 flex-shrink-0"
            style={{ color: '#000000' }} // brand asset Apple — carve-out จาก Paces token (Hard Rule 6)
          />
          {t.auth.signIn.withApple}
        </button>

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
            style={{ color: '#1877f2' }} // brand asset Facebook — carve-out จาก Paces token (Hard Rule 6)
          />
          {t.auth.signIn.withFacebook}
        </button>

        {/* ปุ่ม LINE OAuth — mirror structure เดียวกับ FB */}
        <button
          type="button"
          onClick={handleLine}
          className="btn border border-default-300 text-default-900 hover:border-default-400 hover:bg-default-50 w-full"
        >
          {/* LINE brand green #06C755 — brand asset exception จาก Paces token (Hard Rule 6) */}
          <BxIcon
            icon="ri:line-fill"
            width={18}
            height={18}
            className="me-2 flex-shrink-0"
            style={{ color: '#06C755' }} // brand asset LINE — carve-out จาก Paces token (Hard Rule 6)
          />
          {t.auth.signIn.withLine}
        </button>

        {/* ปุ่ม Instagram OAuth — flag-off by default (NEXT_PUBLIC_ENABLE_IG_LOGIN) */}
        {process.env.NEXT_PUBLIC_ENABLE_IG_LOGIN === 'true' && (
          <button
            type="button"
            onClick={handleInstagram}
            className="btn border border-default-300 text-default-900 hover:border-default-400 hover:bg-default-50 w-full"
          >
            {/* Instagram brand pink #E1306C — brand asset exception จาก Paces token (Hard Rule 6) */}
            <BxIcon
              icon="ri:instagram-fill"
              width={18}
              height={18}
              className="me-2 flex-shrink-0"
              style={{ color: '#E1306C' }} // brand asset Instagram — carve-out จาก Paces token (Hard Rule 6)
            />
            {t.auth.signIn.withInstagram}
          </button>
        )}
      </div>

      {/* dashed divider — copy structure จาก base theme ตรง ๆ */}
      <p className="relative my-5 text-center text-default-400 after:absolute after:start-0 after:end-0 after:top-2.75 after:h-0.75 after:border-t after:border-b after:border-dashed after:border-default-300">
        <span className="relative z-10 bg-card font-medium px-4">
          {t.auth.signIn.orUsername}
        </span>
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* Username field */}
        <div className="mb-5">
          <label htmlFor="username" className="form-label">
            {t.auth.signIn.usernameLabel}
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
              className={cn('form-input', errors.username && '!border-danger')}
              {...register('username')}
            />
          </div>
          {errors.username && errors.username.message && (
            <p className="invalid-msg mt-1 text-sm text-danger">{errors.username.message}</p>
          )}
        </div>

        {/* Password field */}
        <div className="mb-5">
          <label htmlFor="password" className="form-label">
            {t.auth.signIn.passwordLabel}
            <span className="text-danger">*</span>
          </label>
          <div className="input-icon-group relative">
            {/* Icon wrapper ใส่ tabler: อัตโนมัติ → tabler:lock-password */}
            <Icon icon="lock-password" className="input-icon" />
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              className={cn('form-input pe-10', errors.password && '!border-danger')}
              {...register('password')}
            />
            {/* eye toggle — React state ไม่ใช่ Preline data-hs-toggle-password (robust กว่า) */}
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? t.auth.signIn.hidePassword : t.auth.signIn.showPassword}
              className="absolute inset-y-0 end-0 flex min-w-11 items-center justify-center text-default-500 hover:text-default-700"
            >
              <Icon icon={showPw ? 'eye-off' : 'eye'} className="text-base" />
            </button>
          </div>
          {errors.password && errors.password.message && (
            <p className="invalid-msg mt-1 text-sm text-danger">{errors.password.message}</p>
          )}
        </div>

        {/* Row: ลืมรหัสผ่าน? */}
        <div className="mb-5 flex items-center justify-end">
          <Link
            href="/auth/reset-pass"
            className="text-default-400 underline underline-offset-4 text-sm"
          >
            {t.auth.signIn.forgotPassword}
          </Link>
        </div>

        {/* Login error inline — แสดงเมื่อ credential ผิด (errors.root จาก setError) */}
        {errors.root && (
          <div className="mb-4">
            <p className="invalid-msg text-sm text-danger">{errors.root.message}</p>
          </div>
        )}

        {/* Submit */}
        <div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn bg-primary w-full py-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {isSubmitting ? t.auth.signIn.submitting : t.auth.signIn.submit}
          </button>
        </div>
      </form>
    </>
  )
}
