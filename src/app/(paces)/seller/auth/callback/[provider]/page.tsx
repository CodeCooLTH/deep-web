'use client'

/**
 * OAuth callback — หน้า loading หลัง provider auth สำเร็จ (dynamic route รองรับทุก provider)
 *
 * NextAuth (callbackUrl) เด้งมาที่นี่หลัง /api/auth/callback/{provider} เซ็ต session เสร็จ
 * → รอ session authenticated → หน่วง spinner ขั้นต่ำ ~1.5s (UX) → ปลายทาง
 * user ใหม่ไม่มีเบอร์/slug → needsOnboarding=true → proxy force-redirect → /onboarding
 *
 * ปลายทาง = `?next=` (sanitize ผ่าน safeCallbackUrl) ถ้าไม่ส่งมาก็ /dashboard ตามเดิม —
 * feature 00012 ext: ผู้ถูกเชิญที่ login ด้วย LINE/IG จาก /i/<slug> ต้องถูกพากลับหน้าคำเชิญ
 * ไม่ใช่ /dashboard (ซึ่งทำให้คำเชิญหายไปเฉย ๆ)
 *
 * รองรับ: facebook, line, instagram (และ provider ใหม่ในอนาคต)
 * NOTE: FB callbackUrl เดิม (/auth/callback/facebook) ยังทำงานได้ผ่าน [provider] segment นี้
 *
 * Base (spinner): theme/paces/Admin/TS/src/app/(admin)/ui/spinners/page.tsx
 *   (border spinner: border-primary size-* animate-spin rounded-full border-3 border-t-transparent)
 */

import AuthLogo from '@/components/AuthLogo'
import { pacesToast } from '@/lib/paces-toast'
import { safeCallbackUrl } from '@/lib/safe-callback-url'
import { useSession } from 'next-auth/react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef } from 'react'

// หน่วงขั้นต่ำให้ spinner โชว์ลื่น (อยู่ในช่วง 1-3s ที่ต้องการ)
const MIN_DISPLAY_MS = 1500

/**
 * 🛑 `unauthenticated` ครั้งแรก **ไม่ใช่คำตอบสุดท้าย** — ต้องถามซ้ำก่อนยอมแพ้
 *
 * บั๊กจริง (หัวหน้าเจอ 2026-09-17): ออกจากระบบ → ล็อกอิน Apple → ยืนยันสำเร็จ แต่ไม่ไปไหน
 * ต้องกดใหม่ · ติดตั้งใหม่ครั้งแรกไม่เป็น
 *
 * กลไก: `signOut` เพิ่งสั่งลบคุกกี้ `next-auth.session-token` แล้ว callback ตั้งคุกกี้
 * **ชื่อเดียวกัน** ทันที ⇒ ใน WebView คำขอ `/api/auth/session` ที่ยิงทันทีอาจยังไม่เห็นคุกกี้
 * ⇒ ได้ `unauthenticated` ทั้งที่ล็อกอินสำเร็จแล้วจริง ๆ
 *
 * ถามซ้ำอีก 2 ครั้งห่างกัน 700ms ก่อนตัดสินว่าล้มเหลว — ผู้ใช้เห็นแค่สปินเนอร์ที่มีอยู่แล้ว
 * (ยาวขึ้นอย่างมาก 1.4 วิ) แลกกับการไม่เตะคนที่ล็อกอินสำเร็จกลับหน้าล็อกอิน
 *
 * 🛑 ต้องมีเพดาน ห้ามวนไม่รู้จบ — คนที่เปิดหน้านี้ตรง ๆ โดยไม่มี session ต้องได้คำตอบ
 */
const SESSION_RETRY_COUNT = 2
const SESSION_RETRY_DELAY_MS = 700

// ข้อความ error ตาม provider — ให้ UX แตกต่างกันตาม brand
const providerErrorMessage = (provider: string): string => {
  switch (provider) {
    case 'facebook':
      return 'เข้าสู่ระบบด้วย Facebook ไม่สำเร็จ กรุณาลองใหม่'
    case 'line':
      return 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่'
    case 'instagram':
      return 'เข้าสู่ระบบด้วย Instagram ไม่สำเร็จ กรุณาลองใหม่'
    /* Apple เข้ามาใช้หน้านี้ตั้งแต่ 2026-09-17 — ไม่มี case = ได้ข้อความกลาง ๆ ที่ไม่บอกว่าเจ้าไหน */
    case 'apple':
      return 'เข้าสู่ระบบด้วย Apple ไม่สำเร็จ กรุณาลองใหม่'
    default:
      return 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่'
  }
}

/** หน้าจอ loading — แยกออกมาเพื่อใช้เป็น Suspense fallback ได้ด้วย (ผู้ใช้เห็นภาพเดียวกันตลอด) */
function CallbackScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-default-100">
      <div className="mb-2">
        <AuthLogo />
      </div>

      {/* Border spinner — Base: theme ui/spinners (primary, size-10) */}
      <div
        className="border-primary inline-block size-10 animate-spin rounded-full border-3 border-t-transparent"
        role="status"
        aria-label="กำลังโหลด"
      >
        <span className="sr-only">กำลังโหลด...</span>
      </div>

      <div className="flex flex-col items-center gap-1.5 text-center">
        <p className="text-default-600 text-sm font-medium">กำลังเข้าสู่ระบบ...</p>
        <p className="text-default-400 text-xs">กำลังตั้งค่าบัญชีของคุณ</p>
      </div>
    </div>
  )
}

function OAuthCallbackRedirector() {
  const { status, update } = useSession()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  // params.provider = string | string[] — Next dynamic route
  const provider = Array.isArray(params.provider) ? params.provider[0] : (params.provider ?? '')
  // ปลายทางหลัง session พร้อม — sanitize เพราะ ?next= มาจาก URL ที่แก้ได้
  const next = safeCallbackUrl(searchParams.get('next'))
  const mountedAt = useRef(Date.now())
  /* นับครั้งที่ถามซ้ำแล้ว — ref ไม่ใช่ state เพราะไม่ต้องให้จอ re-render เพราะตัวเลขนี้ */
  const retriesLeft = useRef(SESSION_RETRY_COUNT)

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'authenticated') {
      const wait = Math.max(0, MIN_DISPLAY_MS - (Date.now() - mountedAt.current))
      const t = setTimeout(() => router.replace(next), wait)
      return () => clearTimeout(t)
    }

    /* ยังไม่เห็น session — อาจเป็นเพราะคุกกี้ยังไม่ลงตัว ไม่ใช่เพราะล็อกอินไม่ผ่าน (ดูหัวไฟล์) */
    if (retriesLeft.current > 0) {
      retriesLeft.current -= 1
      const t = setTimeout(() => void update(), SESSION_RETRY_DELAY_MS)
      return () => clearTimeout(t)
    }

    // ถามครบแล้วยังไม่มี — provider ไม่สำเร็จ / เปิดหน้านี้ตรง ๆ โดยไม่มี session
    pacesToast.error(providerErrorMessage(provider))
    router.replace('/auth/sign-in')
  }, [status, router, provider, next, update])

  return <CallbackScreen />
}

export default function OAuthCallbackPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense (pattern เดียวกับ auth/verify-otp/page.tsx)
  return (
    <Suspense fallback={<CallbackScreen />}>
      <OAuthCallbackRedirector />
    </Suspense>
  )
}
