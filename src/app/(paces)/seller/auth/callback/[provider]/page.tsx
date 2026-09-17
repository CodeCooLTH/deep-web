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

import BrandLoading from '@/components/paces/BrandLoading'
import type { Dictionary } from '@/i18n/dictionaries/th'
import { useT } from '@/i18n/LocaleProvider'
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

/**
 * ข้อความ error ตาม provider — คำอยู่ในระบบแปลภาษา ไม่ฝังลงไฟล์นี้
 *
 * 🛑 หน้านี้อยู่บนเส้นทางที่ทีมรีวิวของ Apple เดินผ่าน ⇒ คนที่ตั้งภาษาอังกฤษต้องไม่เห็นไทย
 * (ด่าน `boot-loading.test.ts` บังคับว่าไฟล์นี้ห้ามมีอักษรไทย)
 */
type CallbackErrors = Dictionary['authCallbackLoading']['error']

const providerErrorMessage = (provider: string, e: CallbackErrors): string => {
  switch (provider) {
    case 'apple':
      return e.apple
    case 'facebook':
      return e.facebook
    case 'line':
      return e.line
    case 'instagram':
      return e.instagram
    default:
      return e.generic
  }
}

/**
 * หน้าจอ loading — **ใช้ตัวเดียวกับจอตอนเปิดแอปครั้งแรก** (รวมเป็นหนึ่งเดียว 2026-09-17)
 *
 * 🛑 เดิมหน้านี้มีจอโหลดเป็นของตัวเอง (โลโก้เต็ม + สปินเนอร์แยกข้างล่าง + คำไทยตายตัว)
 * ซึ่งไม่เหมือนจอเปิดแอปเลย — หัวหน้าเห็นแล้วทักว่า "มันมีอยู่แล้วปะ ใช้แบบเดียวกันสิ"
 * ของสิ่งเดียวกันสองหน้าตา = Hard Rule 16 · และคำที่ฝังไว้ตรง ๆ ทำให้คนตั้งภาษาอังกฤษ
 * (รวมทีมรีวิวของ Apple) เห็นไทย
 *
 * แยกเป็นฟังก์ชันไว้เพราะใช้เป็น Suspense fallback ด้วย — ผู้ใช้เห็นภาพเดียวกันตลอดทาง
 */
function CallbackScreen() {
  const t = useT()
  return (
    <BrandLoading
      title={t.authCallbackLoading.title}
      subLabel={t.authCallbackLoading.subLabel}
      ariaLabel={t.appLoading.ariaLabel}
    />
  )
}

function OAuthCallbackRedirector() {
  const t = useT()
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
    pacesToast.error(providerErrorMessage(provider, t.authCallbackLoading.error))
    router.replace('/auth/sign-in')
  }, [status, router, provider, next, update, t])

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
