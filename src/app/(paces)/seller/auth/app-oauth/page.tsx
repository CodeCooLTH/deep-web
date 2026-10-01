'use client'

/**
 * จุดเริ่ม OAuth ใน Custom Tab (แอปผู้ขาย Android) — หน้านี้รันใน **เบราว์เซอร์** ไม่ใช่ WebView
 *
 * 1. เผาตั๋วขาไป (ถ้ามี) → แท็บได้ session เดียวกับ WebView (จำเป็นสำหรับเชื่อมบัญชี/เชื่อมเพจ)
 * 2. ตั้งคุกกี้ `deep_app_oauth=<nonce>` (ให้ AppOAuthBridge รู้ว่าต้องส่งกลับแอปตอนจบ)
 *    + `deep_shell=app` (แท็บแสดงหน้าเว็บเรา ต้องซ่อนการจ่ายเงินเหมือนในแอป — Google Payments policy)
 * 3. เริ่ม OAuth ตาม `go` (allow-list ใน lib/app-oauth.ts)
 *
 * สเปก `docs/superpowers/specs/2026-10-01-android-oauth-custom-tabs-design.md`
 * 🛑 ห้ามมีอักษรไทยในไฟล์นี้ — คำทั้งหมดผ่าน i18n (ทีมรีวิวตั้งภาษาอังกฤษ)
 *
 * Base (spinner): src/components/paces/BrandLoading.tsx (ตัวเดียวกับ /auth/callback/[provider])
 */

import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'

import BrandLoading from '@/components/paces/BrandLoading'
import { useT } from '@/i18n/LocaleProvider'
import {
  APP_OAUTH_COOKIE,
  APP_OAUTH_COOKIE_MAX_AGE,
  buildAppReturnUrl,
  isValidNonce,
  parseAppOAuthGo,
} from '@/lib/app-oauth'
import { SHELL_COOKIE_NAME } from '@/lib/app-shell'

function setTabCookie(name: string, value: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${APP_OAUTH_COOKIE_MAX_AGE}; SameSite=Lax${secure}`
}

function AppOAuthStart() {
  const t = useT()
  const params = useSearchParams()
  const [failed, setFailed] = useState(false)
  const started = useRef(false)
  /* ลิงก์เสีย (go นอก allow-list / ไม่มี nonce) รู้ได้ตั้งแต่ render — ไม่ต้องรอ effect */
  const go = parseAppOAuthGo(params.get('go'))
  const nonce = params.get('n')
  const invalid = !go || !isValidNonce(nonce)

  useEffect(() => {
    if (started.current || !go || !isValidNonce(nonce)) return
    started.current = true // StrictMode เรียกซ้ำ = เผาตั๋วซ้ำ (ใช้ได้ครั้งเดียว)
    const ticket = params.get('t')

    void (async () => {
      try {
        if (ticket) {
          const res = await signIn('mobile-ticket', { ticket, redirect: false })
          if (res?.ok) {
            /* ได้ session แล้ว — โหลดหน้านี้ใหม่โดยไม่มีตั๋ว (ท่าเดียวกับทางเข้าระบบทุกจุด: hard-navigate
               หลังล็อกอิน) รอบถัดไปเดินต่อด้วย session ของแท็บ และตั๋วที่ใช้แล้วไม่ค้างใน URL */
            const u = new URL(window.location.href)
            u.searchParams.delete('t')
            window.location.replace(u.toString())
            return
          }
          /* เชื่อมบัญชี/เชื่อมเพจต้องรู้ว่าเป็นใคร — ตั๋วใช้ไม่ได้ = ไปต่อไม่ได้ (ล็อกอินไม่ต้องใช้ตั๋ว) */
          if (go.kind !== 'signin') {
            setFailed(true)
            return
          }
        }

        setTabCookie(APP_OAUTH_COOKIE, nonce)
        setTabCookie(SHELL_COOKIE_NAME, 'app')

        if (go.kind === 'connect') {
          window.location.assign(go.path)
          return
        }
        if (go.kind === 'link') {
          const res = await fetch('/api/account/link/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: go.provider }),
          })
          if (!res.ok) {
            setFailed(true)
            return
          }
          await signIn(go.provider, { callbackUrl: '/account' })
          return
        }
        await signIn(go.provider, { callbackUrl: go.callbackUrl })
        /* ห้ามคืนสถานะหลัง signIn — มันตั้ง location แล้ว resolve ทันที (บทเรียน 2026-08-12) */
      } catch {
        setFailed(true)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go/nonce มาจาก params ตัวเดียวกัน (อ็อบเจกต์ go ใหม่ทุก render)
  }, [params])

  if (failed || invalid) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-semibold text-default-900">{t.appOAuth.failedTitle}</h1>
        <p className="text-sm text-default-500">{t.appOAuth.failedBody}</p>
        <a className="btn bg-primary mt-2 text-white" href={buildAppReturnUrl(null, '/dashboard')}>
          {t.appOAuth.backToApp}
        </a>
      </div>
    )
  }

  return <BrandLoading title={t.appOAuth.startTitle} subLabel={t.appOAuth.startSubLabel} ariaLabel={t.appLoading.ariaLabel} />
}

function Fallback() {
  const t = useT()
  return <BrandLoading title={t.appOAuth.startTitle} subLabel={t.appOAuth.startSubLabel} ariaLabel={t.appLoading.ariaLabel} />
}

export default function AppOAuthStartPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <AppOAuthStart />
    </Suspense>
  )
}
