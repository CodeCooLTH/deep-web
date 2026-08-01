/**
 * Seller sign-in — desktop = card landscape เหมือน theme, mobile = ฟอร์มเต็มจอ
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/sign-in/page.tsx (ผ่าน AuthCardShell)
 *
 * Changes vs base:
 * - wrapper = AuthCardShell (shared)
 * - content ไทย: heading "ยินดีต้อนรับผู้ขาย" + subtitle
 * - ตัด Google/GitHub/Facebook OAuth + divider — ใช้ SignInForm (username+password)
 */

import AuthLogo from '@/components/AuthLogo'
import { currentYear, META_DATA } from '@/config/constants'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import SignInForm from './components/SignInForm'
import AuthCardShell from '../components/AuthCardShell'

export const metadata: Metadata = { title: 'เข้าสู่ระบบผู้ขาย' }

export default function SellerSignInPage() {
  return (
    <AuthCardShell>
      <div className="mb-7.5 flex flex-col items-center justify-center text-center">
        <AuthLogo />
      </div>

      <div>
        <h4 className="font-bold mb-2 text-default-900 text-lg text-center">
          ยินดีต้อนรับผู้ขาย
        </h4>
        <p className="text-default-400 mb-4 mx-auto w-full text-center lg:w-3/4">
          กรอกชื่อผู้ใช้และรหัสผ่านเพื่อเข้าสู่ระบบ
        </p>

        {/* SignInForm อ่าน ?callbackUrl= ผ่าน useSearchParams — Suspense กัน hydration mismatch
            (pattern เดียวกับ verify-otp/page.tsx) */}
        <Suspense fallback={<p className="text-center text-default-400 py-8">กำลังโหลด...</p>}>
          <SignInForm />
        </Suspense>

        <p className="text-default-400 mt-7.5 text-center">
          ยังไม่มีบัญชี?&nbsp;
          <Link
            href="/auth/sign-up"
            className="text-primary font-semibold underline underline-offset-4"
          >
            สมัครสมาชิก
          </Link>
        </p>
      </div>

      <p className="text-default-400 mt-7.5 text-center">
        &copy; {currentYear} {META_DATA.name}
      </p>
    </AuthCardShell>
  )
}
