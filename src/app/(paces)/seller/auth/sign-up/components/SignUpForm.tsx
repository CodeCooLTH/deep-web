/**
 * Seller sign-up form — redesign P2 S-P2-2
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/sign-up/components/SignUpForm.tsx
 *
 * Changes vs base:
 * - ไม่มี social/OAuth บนหน้านี้ — sign-up = กรอกเองล้วน (FB อยู่หน้า sign-in เท่านั้น)
 *   (ลบปุ่ม Facebook + dashed divider "หรือกรอกข้อมูล" ออกตามคำขอ user)
 * - ลบ Name/Email fields ของ base → แทนด้วย 6 fields ตามสเปก S-P2-2:
 *   1. displayName (tabler:user, Yup 2-50)
 *   2. category (ChoiceSelect controlled — src/components/wrappers/ChoiceSelect.tsx;
 *      error pattern: theme/paces/Admin/TS/src/app/(admin)/form/validation/components/CustomValidation.tsx)
 *   3. username (tabler:at, debounce 400ms → GET /api/users/check-username?u=)
 *   4. password (PasswordInputWithStrength + hint ไทย)
 *   5. confirmPassword (tabler:lock-password, oneOf password)
 *   6. phone (tabler:phone, tel, inputMode=numeric, MOBILE_PHONE_RE)
 * - consent checkbox "ยอมรับนโยบายความเป็นส่วนตัว" (required) — Base: theme auth/card/sign-up
 *   checkbox pattern (form-checkbox form-checkbox-light size-4.5). ลิงก์ → /privacy บน buyer domain
 *   ผ่าน resolveBuyerBaseUrl (seller subdomain rewrite /privacy → /seller/privacy = 404)
 * - submit flow: Yup + usernameStatus ok → check-phone (inline error) → sessionStorage signupDraft → OTP → router.push
 * - sessionStorage key 'signupDraft' = { password, category } (contract กับ verify-otp)
 * - shopName=displayName ส่งใน query string (placeholder ให้ P1 phone-otp สร้าง shop; แก้ได้ใน onboarding P3)
 * - password ไม่ปรากฏใน URL (เก็บใน sessionStorage เท่านั้น — OQ-1)
 * - field error ใช้ invalid-msg class + !border-danger ตาม CustomValidation pattern (HR7)
 * - phone ซ้ำ → setError inline แทน pacesToast (OQ-3)
 * - username submit-guard → return เงียบ, inline live-status แสดงอยู่แล้ว (OQ-2)
 */

'use client'

import PasswordInputWithStrength from '@/components/PasswordInputWithStrength'
import ChoiceSelect from '@/components/wrappers/ChoiceSelect'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { SHOP_CATEGORY_KEYS, SHOP_CATEGORY_LABELS } from '@/lib/shop-categories'
import { cn } from '@/utils/helpers'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import { yupResolver } from '@hookform/resolvers/yup'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import * as Yup from 'yup'
import { MOBILE_PHONE_RE, MOBILE_RULE_TEXT } from '@/lib/phone'

// --- Yup Schema ---
const schema = Yup.object({
  displayName: Yup.string()
    .min(2, 'อย่างน้อย 2 ตัวอักษร')
    .max(50, 'ไม่เกิน 50 ตัวอักษร')
    .required('กรุณากรอกชื่อที่แสดง'),
  category: Yup.string()
    .oneOf(SHOP_CATEGORY_KEYS as unknown as string[], 'กรุณาเลือกหมวดหมู่')
    .required('กรุณาเลือกหมวดหมู่'),
  username: Yup.string()
    .matches(/^[a-zA-Z0-9_]{3,30}$/, 'ใช้ a-z, 0-9, _ ได้ 3-30 ตัว')
    .required('กรุณาตั้งชื่อผู้ใช้'),
  password: Yup.string()
    .min(8, 'อย่างน้อย 8 ตัวอักษร')
    .matches(/[a-zA-Z]/, 'ต้องมีตัวอักษร')
    .matches(/[0-9]/, 'ต้องมีตัวเลข')
    .matches(/[\W_]/, 'ต้องมีอักขระพิเศษ')
    .required('กรุณากรอกรหัสผ่าน'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password')], 'รหัสผ่านไม่ตรงกัน')
    .required('กรุณายืนยันรหัสผ่าน'),
  phone: Yup.string()
    .matches(MOBILE_PHONE_RE, MOBILE_RULE_TEXT)
    .required('กรุณากรอกเบอร์โทร'),
  acceptTerms: Yup.boolean()
    .oneOf([true], 'กรุณายอมรับนโยบายความเป็นส่วนตัวก่อนสมัคร')
    .required('กรุณายอมรับนโยบายความเป็นส่วนตัวก่อนสมัคร'),
})

type FormValues = Yup.InferType<typeof schema>

// --- Username dedupe status ---
type UsernameStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok' }
  | { state: 'error'; reason: 'taken' | 'reserved' | 'invalid' | 'network' }

const USERNAME_STATUS_MSG: Record<'taken' | 'reserved' | 'invalid' | 'network', string> = {
  taken: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว',
  reserved: 'ชื่อผู้ใช้นี้สงวนไว้',
  invalid: 'รูปแบบชื่อผู้ใช้ไม่ถูกต้อง',
  network: 'ตรวจสอบชื่อผู้ใช้ไม่สำเร็จ ลองใหม่อีกครั้ง',
}

export default function SignUpForm() {
  const router = useRouter()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      displayName: '',
      category: '',
      username: '',
      password: '',
      confirmPassword: '',
      phone: '',
      acceptTerms: false,
    },
  })

  // eye toggle สำหรับ confirmPassword — password field ใช้ PasswordInputWithStrength (มี toggle ในตัวแล้ว)
  const [showConfirm, setShowConfirm] = useState(false)

  // privacy link → buyer domain (seller subdomain rewrite /privacy → 404 จึงต้อง resolveBuyerBaseUrl)
  // init '/privacy' กัน hydration mismatch (server ไม่มี window) แล้ว update เป็น absolute ใน effect
  const [privacyUrl, setPrivacyUrl] = useState('/privacy')
  useEffect(() => {
    setPrivacyUrl(`${resolveBuyerBaseUrl()}/privacy`)
  }, [])

  // PasswordInputWithStrength ต้องการ controlled state
  const [password, setPassword] = useState('')
  const { onChange: rhfPasswordOnChange, ...rhfPasswordRest } = register('password')

  const username = watch('username')
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>({ state: 'idle' })
  const reqId = useRef(0)

  // Debounce check-username 400ms — reuse logic จากไฟล์เดิม
  useEffect(() => {
    if (!username) {
      setUsernameStatus({ state: 'idle' })
      return
    }
    // client-side pre-check ก่อนยิง API กันรอบ network ที่ชัดเจนว่าไม่ valid
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      setUsernameStatus({ state: 'idle' })
      return
    }
    setUsernameStatus({ state: 'checking' })
    const t = setTimeout(async () => {
      const id = ++reqId.current
      try {
        const res = await fetch(`/api/users/check-username?u=${encodeURIComponent(username)}`)
        const data: { available: boolean; reason?: 'taken' | 'reserved' | 'invalid' } =
          await res.json()
        if (reqId.current !== id) return
        if (data.available) {
          setUsernameStatus({ state: 'ok' })
        } else {
          setUsernameStatus({ state: 'error', reason: data.reason ?? 'invalid' })
        }
      } catch {
        if (reqId.current !== id) return
        setUsernameStatus({ state: 'error', reason: 'network' })
      }
    }, 400)
    return () => clearTimeout(t)
  }, [username])

  const onSubmit = async (values: FormValues) => {
    // OQ-2: บล็อก submit ถ้า username ยังไม่ผ่าน live check — ไม่ต้อง toast เพราะ inline live-status แสดงอยู่แล้ว
    if (usernameStatus.state !== 'ok') {
      return
    }

    try {
      // ตรวจสอบเบอร์ซ้ำก่อน OTP — กัน user ที่มีบัญชีอยู่แล้วใช้ flow signup ต่อ
      const phoneCheckRes = await fetch(
        `/api/users/check-phone?phone=${encodeURIComponent(values.phone)}`
      )
      if (phoneCheckRes.ok) {
        const phoneData: { available: boolean } = await phoneCheckRes.json()
        if (!phoneData.available) {
          // OQ-3: แสดง error inline ใต้ field แทน toast — ผู้ใช้เห็นทันทีโดยไม่ต้องหา notification
          setError('phone', { message: 'เบอร์นี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่าน' })
          return
        }
      }

      // ส่ง OTP ไปยังเบอร์โทร
      const otpRes = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: values.phone, type: 'PHONE' }),
      })

      if (!otpRes.ok) {
        const errData = await otpRes.json().catch(() => ({}))
        if (otpRes.status === 429) {
          pacesToast.error('คุณส่งคำขอบ่อยเกินไป กรุณารอสักครู่')
        } else {
          pacesToast.error(errData?.message ?? 'ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่')
        }
        return
      }

      // เก็บ password + category ใน sessionStorage — ไม่ใส่ใน URL (OQ-1 กัน password หลุดใน history/log)
      // contract กับ verify-otp: อ่าน signupDraft แล้ว clear ทันทีหลัง signIn
      sessionStorage.setItem(
        'signupDraft',
        JSON.stringify({ password: values.password, category: values.category })
      )

      // shopName=displayName — placeholder ให้ P1 phone-otp auth.ts สร้าง Shop;
      // ผู้ใช้แก้ชื่อร้าน/URL จริงใน onboarding P3
      const params = new URLSearchParams({
        mode: 'signup',
        phone: values.phone,
        name: values.displayName,
        username: values.username,
        shopName: values.displayName,
      })
      router.push(`/auth/verify-otp?${params.toString()}`)
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  // submit disabled เมื่อ: กำลัง submit / username กำลังตรวจสอบ / username error
  const isSubmitDisabled =
    isSubmitting ||
    usernameStatus.state === 'checking' ||
    usernameStatus.state === 'error'

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* 1. ชื่อที่แสดง */}
        <div className="mb-5">
          <label htmlFor="displayName" className="form-label">
            ชื่อที่แสดง<span className="text-danger">*</span>
          </label>
          <div className="input-icon-group">
            <Icon icon="user" className="input-icon" />
            <input
              id="displayName"
              type="text"
              autoComplete="name"
              placeholder="ชื่อ-นามสกุล หรือชื่อเล่น"
              className={cn('form-input', errors.displayName && '!border-danger')}
              {...register('displayName')}
            />
          </div>
          {errors.displayName && (
            <p className="invalid-msg mt-1 text-sm text-danger">{errors.displayName.message}</p>
          )}
        </div>

        {/* 2. หมวดหมู่ร้านค้า — ChoiceSelect controlled (watch+setValue ไม่ใช้ register โดยตรง)
            Base: src/components/wrappers/ChoiceSelect.tsx (Choices.js wrapper)
            ref pattern: theme/paces/Admin/TS/src/app/(admin)/form/select/components/ChoiceSelect.tsx
            error border: !border-danger ตาม theme/paces/.../form/validation/components/CustomValidation.tsx */}
        <div className="mb-5">
          <label htmlFor="category" className="form-label">
            หมวดหมู่ร้านค้า<span className="text-danger">*</span>
          </label>
          <ChoiceSelect
            id="category"
            name="category"
            placeholder="-- เลือกหมวดหมู่ --"
            search={false}
            sorting={false}
            value={watch('category')}
            onChange={(v) => setValue('category', v as string, { shouldValidate: true })}
            options={SHOP_CATEGORY_KEYS.map((k) => ({ value: k, label: SHOP_CATEGORY_LABELS[k] }))}
            className={cn('form-input w-full', errors.category && '!border-danger')}
          />
          {errors.category && (
            <p className="invalid-msg mt-1 text-sm text-danger">{errors.category.message}</p>
          )}
        </div>

        {/* 3. username พร้อม debounce live-dedupe check */}
        <div className="mb-5">
          <label htmlFor="username" className="form-label">
            ชื่อผู้ใช้ (username)<span className="text-danger">*</span>
          </label>
          <div className="input-icon-group">
            <Icon icon="at" className="input-icon" />
            <input
              id="username"
              type="text"
              autoComplete="off"
              placeholder="a-z, 0-9, _ เท่านั้น"
              className={cn('form-input', errors.username && '!border-danger')}
              {...register('username')}
            />
          </div>
          {errors.username && (
            <p className="invalid-msg mt-1 text-sm text-danger">{errors.username.message}</p>
          )}
          {!errors.username && usernameStatus.state === 'checking' && (
            <p className="invalid-msg mt-1 text-sm text-default-400">กำลังตรวจสอบ...</p>
          )}
          {!errors.username && usernameStatus.state === 'ok' && (
            <p className="invalid-msg mt-1 text-sm text-success">ใช้ชื่อนี้ได้</p>
          )}
          {!errors.username && usernameStatus.state === 'error' && (
            <p className="invalid-msg mt-1 text-sm text-danger">{USERNAME_STATUS_MSG[usernameStatus.reason]}</p>
          )}
        </div>

        {/* 4. รหัสผ่าน — PasswordInputWithStrength (controlled) + hint ภาษาไทย */}
        <div className="mb-5">
          <label htmlFor="password" className="form-label">
            รหัสผ่าน<span className="text-danger">*</span>
          </label>
          {/* PasswordInputWithStrength ต้องการ controlled value ผ่าน password/setPassword;
              sync กับ react-hook-form ผ่าน onChange manual เพื่อให้ Yup validate ได้ */}
          <PasswordInputWithStrength
            id="password"
            name={rhfPasswordRest.name}
            password={password}
            setPassword={(val) => {
              setPassword(val)
              // trigger rhf onChange เพื่อให้ Yup validate ทันที
              rhfPasswordOnChange({ target: { name: 'password', value: val } } as React.ChangeEvent<HTMLInputElement>)
            }}
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

        {/* 5. ยืนยันรหัสผ่าน */}
        <div className="mb-5">
          <label htmlFor="confirmPassword" className="form-label">
            ยืนยันรหัสผ่าน<span className="text-danger">*</span>
          </label>
          <div className="input-icon-group relative">
            <Icon icon="lock-password" className="input-icon" />
            <input
              id="confirmPassword"
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              className={cn('form-input pe-10', errors.confirmPassword && '!border-danger')}
              {...register('confirmPassword')}
            />
            {/* eye toggle — Paces primitive: absolute ใน relative group, text-default token */}
            <button
              type="button"
              onClick={() => setShowConfirm((s) => !s)}
              aria-label={showConfirm ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              className="absolute inset-y-0 end-0 flex min-w-11 items-center justify-center text-default-500 hover:text-default-700"
            >
              <Icon icon={showConfirm ? 'eye-off' : 'eye'} className="text-base" />
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="invalid-msg mt-1 text-sm text-danger">{errors.confirmPassword.message}</p>
          )}
        </div>

        {/* 6. เบอร์โทรศัพท์ */}
        <div className="mb-6">
          <label htmlFor="phone" className="form-label">
            เบอร์โทรศัพท์<span className="text-danger">*</span>
          </label>
          <div className="input-icon-group">
            <Icon icon="phone" className="input-icon" />
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="08xxxxxxxx"
              className={cn('form-input', errors.phone && '!border-danger')}
              {...register('phone')}
            />
          </div>
          {errors.phone && (
            <p className="invalid-msg mt-1 text-sm text-danger">{errors.phone.message}</p>
          )}
        </div>

        {/* ยอมรับนโยบายความเป็นส่วนตัว — required (Base: theme auth/card/sign-up checkbox pattern) */}
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <input
              id="acceptTerms"
              type="checkbox"
              className="form-checkbox form-checkbox-light size-4.5"
              {...register('acceptTerms')}
            />
            <label htmlFor="acceptTerms" className="form-check-label">
              ฉันยอมรับ&nbsp;
              <a
                href={privacyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-medium underline underline-offset-4"
              >
                นโยบายความเป็นส่วนตัว
              </a>
            </label>
          </div>
          {errors.acceptTerms && (
            <p className="invalid-msg mt-1 text-sm text-danger">{errors.acceptTerms.message}</p>
          )}
        </div>

        {/* Submit */}
        <div>
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="btn bg-primary w-full py-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {isSubmitting ? 'กำลังส่งรหัส OTP...' : 'สมัครสมาชิก'}
          </button>
        </div>
      </form>
  )
}
