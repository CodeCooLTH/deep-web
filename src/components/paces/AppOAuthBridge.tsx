'use client'

/**
 * สะพาน OAuth ผ่าน Custom Tab ของแอปผู้ขาย Android — แขวนครั้งเดียวที่ layout ชั้นนอกของผู้ขาย
 *
 * ทำ 2 งาน (สเปก `docs/superpowers/specs/2026-10-01-android-oauth-custom-tabs-design.md`):
 *
 * 1. **ในแท็บ (เบราว์เซอร์)** — ถ้าแท็บนี้ถูกเปิดจากแอป (มีคุกกี้ `deep_app_oauth`) และ OAuth จบแล้ว
 *    (หน้าปัจจุบันไม่ได้อยู่กลางสาย) ⇒ ขอตั๋วขากลับที่ผูกกับ nonce แล้วพากลับแอปด้วย `deepseller://`
 *    รวบไว้ที่เดียว ไม่ต้องไล่ใส่ทุกหน้าปลายทาง (/dashboard · /account · /settings/channels · หน้าข้อผิดพลาด)
 *
 * 2. **ใน WebView บน Android** — ดักคลิกลิงก์เชื่อมเพจ (`APP_OAUTH_CONNECT_PATHS`) ส่งให้แท็บแทน
 *    ลิงก์พวกนี้เป็น `<a href>` ธรรมดากระจายอยู่ 5 ที่ ดักที่นี่ = ไม่ต้องแก้ทีละที่ และลิงก์ใหม่ที่ชี้
 *    path เดียวกันก็ถูกดักไปด้วยเอง
 *
 * 🛑 ห้ามมีอักษรไทยในไฟล์นี้ — คำทั้งหมดผ่าน i18n
 */

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import BrandLoading from '@/components/paces/BrandLoading'
import { useT } from '@/i18n/LocaleProvider'
import {
  APP_OAUTH_CONNECT_PATHS,
  APP_OAUTH_COOKIE,
  buildAppReturnUrl,
  isAppOAuthInFlight,
  isValidNonce,
} from '@/lib/app-oauth'
import { isAndroidSellerApp, startAppOAuth } from '@/lib/app-oauth-client'
import { APP_UA_MARKER, SHELL_COOKIE_NAME } from '@/lib/app-shell'

function readCookie(name: string): string | null {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null
}

function expireCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`
}

export default function AppOAuthBridge() {
  const t = useT()
  const pathname = usePathname()
  const [returning, setReturning] = useState(false)
  const fired = useRef(false)

  /* ── 1. ในแท็บ: จบแล้วส่งกลับแอป ── */
  useEffect(() => {
    if (fired.current) return
    /* อยู่ในแอปเอง (WebView) ไม่ใช่แท็บ — ห้ามทำงาน ไม่งั้นแอปจะเปิดตัวเองซ้ำ */
    if (navigator.userAgent.includes(APP_UA_MARKER)) return
    const nonce = readCookie(APP_OAUTH_COOKIE)
    if (!isValidNonce(nonce) || isAppOAuthInFlight(pathname)) return
    fired.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์กับสถานะภายนอก (คุกกี้ของแท็บ) ต้องทับจอทันทีก่อนขอตั๋ว
    setReturning(true)

    const next = `${pathname}${window.location.search}`
    void (async () => {
      let ticket: string | null = null
      try {
        const res = await fetch('/api/seller/app-ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nonce }),
        })
        if (res.ok) ticket = ((await res.json()) as { ticket?: string | null }).ticket ?? null
      } catch {
        /* ไม่มีตั๋วก็ยังกลับแอป — WebView จะเห็นหน้าปลายทาง (หรือหน้าล็อกอิน) แทนการค้างในแท็บ */
      }
      /* ล้างก่อนออก — Chrome ของผู้ใช้ต้องกลับเป็นเว็บปกติ (deep_shell ค้าง = เว็บซ่อนการจ่ายเงินผิดที่) */
      expireCookie(APP_OAUTH_COOKIE)
      expireCookie(SHELL_COOKIE_NAME)
      window.location.replace(buildAppReturnUrl(ticket, next))
    })()
  }, [pathname])

  /* ── 2. ใน WebView Android: ลิงก์เชื่อมเพจออกไปแท็บ ── */
  useEffect(() => {
    if (!isAndroidSellerApp()) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      let path: string
      try {
        const u = new URL(a.href, window.location.href)
        if (u.origin !== window.location.origin) return
        path = u.pathname
      } catch {
        return
      }
      const hit = APP_OAUTH_CONNECT_PATHS.find((p) => p === path)
      if (!hit) return
      e.preventDefault()
      void startAppOAuth({ kind: 'connect', path: hit })
    }
    /* capture — ต้องได้ก่อน handler ของ Next <Link> ที่จะ navigate ใน WebView */
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  if (!returning) return null
  /* BrandLoading เป็น fixed เต็มจออยู่แล้ว — ทับหน้าปลายทางระหว่างขอตั๋ว ไม่ให้ผู้ใช้กดอะไรในแท็บ */
  return <BrandLoading title={t.appOAuth.returnTitle} subLabel={t.appOAuth.returnSubLabel} ariaLabel={t.appLoading.ariaLabel} />
}
