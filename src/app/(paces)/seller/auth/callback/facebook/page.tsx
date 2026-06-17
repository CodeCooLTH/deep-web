'use client'

/**
 * Facebook OAuth callback — หน้า loading หลัง FB auth สำเร็จ
 *
 * NextAuth (callbackUrl) เด้งมาที่นี่หลัง /api/auth/callback/facebook เซ็ต session เสร็จ
 * → รอ session authenticated → หน่วง spinner ขั้นต่ำ ~1.5s (UX) → /dashboard (เจอ OnboardingModal)
 * FB user ใหม่ไม่มีเบอร์/slug → needsOnboarding=true → onboarding เด้งที่ /dashboard
 *
 * Base (spinner): theme/paces/Admin/TS/src/app/(admin)/ui/spinners/page.tsx
 *   (border spinner: border-primary size-* animate-spin rounded-full border-3 border-t-transparent)
 */

import AuthLogo from '@/components/AuthLogo'
import { pacesToast } from '@/lib/paces-toast'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

// หน่วงขั้นต่ำให้ spinner โชว์ลื่น (อยู่ในช่วง 1-3s ที่ต้องการ)
const MIN_DISPLAY_MS = 1500

export default function FacebookCallbackPage() {
  const { status } = useSession()
  const router = useRouter()
  const mountedAt = useRef(Date.now())

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'authenticated') {
      const wait = Math.max(0, MIN_DISPLAY_MS - (Date.now() - mountedAt.current))
      const t = setTimeout(() => router.replace('/dashboard'), wait)
      return () => clearTimeout(t)
    }
    // unauthenticated — FB ไม่สำเร็จ / เปิดหน้านี้ตรง ๆ โดยไม่มี session
    pacesToast.error('เข้าสู่ระบบด้วย Facebook ไม่สำเร็จ กรุณาลองใหม่')
    router.replace('/auth/sign-in')
  }, [status, router])

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
