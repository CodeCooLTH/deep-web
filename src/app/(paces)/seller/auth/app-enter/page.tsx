'use client'

/**
 * ขากลับจาก Custom Tab (แอปผู้ขาย Android) — หน้านี้รันใน **WebView**
 *
 * native ได้ `deepseller://oauth?t=…&next=…` แล้วโหลดหน้านี้ ⇒ แลกตั๋วเป็น session ของ WebView
 * โดยส่ง nonce ที่เก็บไว้ใน localStorage ตอนเปิดแท็บ (ตั๋วขากลับผูกกับ nonce — ใครดัก URL
 * `deepseller://` ได้ก็แลกไม่ได้) แล้วไปหน้าปลายทาง
 *
 * ไม่มีตั๋ว (ล็อกอินในแท็บไม่สำเร็จ) = ไปหน้าปลายทางตรง ๆ ให้ผู้ใช้เห็นข้อผิดพลาดที่หน้านั้นแสดง
 *
 * สเปก `docs/superpowers/specs/2026-10-01-android-oauth-custom-tabs-design.md`
 * 🛑 ห้ามมีอักษรไทยในไฟล์นี้ — คำทั้งหมดผ่าน i18n
 *
 * Base (spinner): src/components/paces/BrandLoading.tsx (ตัวเดียวกับ /auth/callback/[provider])
 */

import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'

import BrandLoading from '@/components/paces/BrandLoading'
import { useT } from '@/i18n/LocaleProvider'
import { APP_OAUTH_NONCE_KEY, sanitizeInternalPath } from '@/lib/app-oauth'

function readAndClearNonce(): string | null {
  try {
    const n = window.localStorage.getItem(APP_OAUTH_NONCE_KEY)
    window.localStorage.removeItem(APP_OAUTH_NONCE_KEY)
    return n
  } catch {
    return null
  }
}

function AppEnter() {
  const t = useT()
  const params = useSearchParams()
  const [failed, setFailed] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return // ตั๋วใช้ได้ครั้งเดียว — StrictMode เรียกซ้ำ = เผาทิ้งฟรี
    started.current = true

    const ticket = params.get('t')
    const next = sanitizeInternalPath(params.get('next')) ?? '/dashboard'
    if (!ticket) {
      window.location.replace(next)
      return
    }

    const nonce = readAndClearNonce()
    signIn('mobile-ticket', { ticket, nonce: nonce ?? '', redirect: false })
      .then((res) => {
        /* โหลดทั้งหน้า ไม่ใช่ router.push — layout ฝั่ง server ต้องอ่าน session ใหม่ (เมนู/ร้านที่เปิดอยู่) */
        if (res?.ok) window.location.replace(next)
        else setFailed(true)
      })
      .catch(() => setFailed(true))
  }, [params])

  if (failed) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-semibold text-default-900">{t.appOAuth.failedTitle}</h1>
        <p className="text-sm text-default-500">{t.appOAuth.failedBody}</p>
        <a className="btn bg-primary mt-2 text-white" href="/auth/sign-in">
          {t.appOAuth.backToSignIn}
        </a>
      </div>
    )
  }

  return <BrandLoading title={t.appOAuth.enterTitle} subLabel={t.appOAuth.enterSubLabel} ariaLabel={t.appLoading.ariaLabel} />
}

function Fallback() {
  const t = useT()
  return <BrandLoading title={t.appOAuth.enterTitle} subLabel={t.appOAuth.enterSubLabel} ariaLabel={t.appLoading.ariaLabel} />
}

export default function AppEnterPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <AppEnter />
    </Suspense>
  )
}
