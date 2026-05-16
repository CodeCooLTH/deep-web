/**
 * Base: theme/paces/Admin/TS/src/app/auth/(basic)/sign-up/components/SignUpForm.tsx
 *
 * Re-sourced จาก Paces (basic) SignUpForm.
 * การเปลี่ยนแปลงจาก theme:
 *   - ลบ PasswordInputWithStrength (SafePay ไม่ใช้ password)
 *   - ลบ terms & policy checkbox (ไม่มีใน SafePay MVP)
 *   - เปลี่ยน email input → phone (tel) input
 *   - เพิ่ม shopName field — ชื่อร้านค้าที่ผู้ใช้ตั้งเอง ส่งต่อไป verify-otp → auth.ts
 *     เพื่อสร้าง Shop ทันทีที่ signup (task #9 — ไม่ใช้ fallback "ร้านของ {displayName}" อีกต่อไปสำหรับ signup path)
 *   - เพิ่ม username field พร้อม debounce check-username API
 *   - Yup + react-hook-form (ตาม convention — Yup + @hookform/resolvers สำหรับ frontend form)
 *   - submit: POST /api/otp/send แล้ว redirect ไป /seller/auth/verify-otp พร้อม params
 */
'use client'

import { yupResolver } from '@hookform/resolvers/yup'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'
import * as Yup from 'yup'

const schema = Yup.object({
  phone: Yup.string()
    .matches(/^0[0-9]{9}$/, 'เบอร์ต้องขึ้นต้นด้วย 0 และมี 10 หลัก')
    .required('กรุณากรอกเบอร์โทร'),
  displayName: Yup.string()
    .min(2, 'อย่างน้อย 2 ตัวอักษร')
    .max(50, 'ไม่เกิน 50 ตัวอักษร')
    .required('กรุณากรอกชื่อที่แสดง'),
  username: Yup.string()
    .matches(/^[a-zA-Z0-9_]{3,30}$/, 'ใช้ a-z, 0-9, _ ได้ 3-30 ตัว')
    .required('กรุณาตั้งชื่อผู้ใช้'),
  shopName: Yup.string()
    .trim()
    .min(1, 'กรุณากรอกชื่อร้านค้า')
    .max(100, 'ชื่อร้านค้าไม่เกิน 100 ตัวอักษร')
    .required('กรุณากรอกชื่อร้านค้า'),
})

type FormValues = Yup.InferType<typeof schema>

type UsernameStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok' }
  | { state: 'error'; reason: 'taken' | 'reserved' | 'invalid' | 'network' }

const REASON_MESSAGE: Record<'taken' | 'reserved' | 'invalid' | 'network', string> = {
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
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { phone: '', displayName: '', username: '', shopName: '' },
  })

  const username = watch('username')
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>({ state: 'idle' })
  const reqId = useRef(0)

  // Debounce check-username — ตรวจสอบชื่อผู้ใช้ซ้ำกับ API ทุก 400ms
  useEffect(() => {
    if (!username) {
      setUsernameStatus({ state: 'idle' })
      return
    }
    // client regex pre-check — ไม่ยิง API สำหรับ input ที่ชัดเจนว่าไม่ valid
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
    // บล็อก submit ถ้า username ยังไม่ผ่าน check
    if (usernameStatus.state !== 'ok') {
      if (usernameStatus.state === 'error') {
        toast.error(REASON_MESSAGE[usernameStatus.reason])
      }
      return
    }
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: values.phone, type: 'PHONE' }),
      })
      if (!res.ok) {
        toast.error('ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      const params = new URLSearchParams({
        mode: 'signup',
        phone: values.phone,
        name: values.displayName,
        username: values.username,
        shopName: values.shopName,
      })
      router.push(`/seller/auth/verify-otp?${params.toString()}`)
    } catch {
      toast.error('ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* เบอร์โทร — แทน email จาก theme */}
      <div className="mb-5">
        <label htmlFor="phone" className="form-label">
          เบอร์โทรศัพท์<span className="text-danger">*</span>
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

      {/* ชื่อที่แสดง */}
      <div className="mb-5">
        <label htmlFor="displayName" className="form-label">
          ชื่อที่แสดง<span className="text-danger">*</span>
        </label>
        <div className="input-group">
          <input
            id="displayName"
            type="text"
            placeholder="ชื่อ-นามสกุล หรือชื่อเล่น"
            className="form-input"
            {...register('displayName')}
          />
        </div>
        {errors.displayName && (
          <p className="text-danger mt-1 text-sm">{errors.displayName.message}</p>
        )}
      </div>

      {/* username พร้อม debounce check */}
      <div className="mb-5">
        <label htmlFor="username" className="form-label">
          ชื่อผู้ใช้ (username)<span className="text-danger">*</span>
        </label>
        <div className="input-group">
          <input
            id="username"
            type="text"
            autoComplete="off"
            placeholder="a-z, 0-9, _ เท่านั้น"
            className="form-input"
            {...register('username')}
          />
        </div>
        {errors.username && (
          <p className="text-danger mt-1 text-sm">{errors.username.message}</p>
        )}
        {!errors.username && usernameStatus.state === 'checking' && (
          <p className="text-default-400 mt-1 text-sm">กำลังตรวจสอบ...</p>
        )}
        {!errors.username && usernameStatus.state === 'ok' && (
          <p className="text-success mt-1 text-sm">ใช้ชื่อนี้ได้</p>
        )}
        {!errors.username && usernameStatus.state === 'error' && (
          <p className="text-danger mt-1 text-sm">{REASON_MESSAGE[usernameStatus.reason]}</p>
        )}
      </div>

      {/* ชื่อร้านค้า — ส่งต่อ verify-otp → auth.ts เพื่อสร้าง Shop ด้วยชื่อที่ผู้ใช้ตั้ง */}
      <div className="mb-6">
        <label htmlFor="shopName" className="form-label">
          ชื่อร้านค้า<span className="text-danger">*</span>
        </label>
        <div className="input-group">
          <input
            id="shopName"
            type="text"
            placeholder="ชื่อร้านที่แสดงต่อลูกค้า"
            className="form-input"
            {...register('shopName')}
          />
        </div>
        {errors.shopName && (
          <p className="text-danger mt-1 text-sm">{errors.shopName.message}</p>
        )}
      </div>

      <div>
        <button
          type="submit"
          disabled={
            isSubmitting ||
            usernameStatus.state === 'checking' ||
            usernameStatus.state === 'error' ||
            (!!username && /^[a-zA-Z0-9_]{3,30}$/.test(username) && usernameStatus.state === 'idle')
          }
          className="btn bg-primary w-full py-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {isSubmitting ? 'กำลังส่งรหัส...' : 'สร้างบัญชีและรับรหัส OTP'}
        </button>
      </div>
    </form>
  )
}
