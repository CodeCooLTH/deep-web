/**
 * Seller verify-otp — desktop = card landscape เหมือน theme, mobile = ฟอร์มเต็มจอ
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/sign-in/page.tsx (ผ่าน AuthCardShell)
 *
 * Changes vs base:
 * - wrapper = AuthCardShell (shared)
 * - content ไทย: heading "ส่งรหัสแล้ว!" + subtitle
 * - VerifyOtpForm (client) ใน Suspense — กัน hydration mismatch จาก useSearchParams
 */

import AuthLogo from '@/components/AuthLogo'
import { currentYear, META_DATA } from '@/config/constants'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import VerifyOtpForm from './components/VerifyOtpForm'
import AuthCardShell from '../components/AuthCardShell'

export const metadata: Metadata = { title: 'ยืนยันรหัส OTP' }

export default function SellerVerifyOtpPage() {
  return (
    <AuthCardShell>
      <div className="mb-7.5 flex flex-col items-center justify-center text-center">
        <AuthLogo />
      </div>

      <div>
        <h4 className="font-bold mb-2 text-default-900 text-lg text-center">
          ส่งรหัสแล้ว!
        </h4>
        <p className="text-default-400 mb-4 mx-auto w-full text-center lg:w-72">
          เราส่งรหัส 6 หลักไปที่
        </p>

        {/* masked phone + form อ่าน searchParams ใน VerifyOtpForm (client) — Suspense กัน hydration mismatch */}
        <Suspense fallback={<p className="text-center text-default-400 py-8">กำลังโหลด...</p>}>
          <VerifyOtpForm />
        </Suspense>

        <p className="text-default-400 mt-7.5 text-center text-sm">
          กลับไปที่&nbsp;
          <Link
            href="/auth/sign-in"
            className="text-primary font-semibold underline underline-offset-3"
          >
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>

      <p className="text-default-400 mt-7.5 text-center">
        &copy; {currentYear} {META_DATA.name}
      </p>
    </AuthCardShell>
  )
}
