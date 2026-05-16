/**
 * Seller sign-in page — re-sourced from Paces (basic) sign-in template.
 *
 * Base: theme/paces/Admin/TS/src/app/auth/(basic)/sign-in/page.tsx
 *
 * Changes vs base:
 * - ตัด Google/GitHub OAuth grid + divider "Continue with Email"
 * - ตัด FacebookButton (เคยมีใน SafePay เวอร์ชันก่อน; component ยังอยู่เพราะใช้ที่อื่น)
 * - ตัด OAuthErrorToast (ไม่มี OAuth flow ในหน้านี้)
 * - ตัด image panel ซ้ายขวา (สองคอลัมน์) — ใช้ single-col card เหมือน base ต้นฉบับ
 * - ลบ inline style={{ backgroundImage }} — ใช้ Tailwind background utility แทน (P2 retro convention)
 * - UI copy ภาษาไทย
 */

import authCard from '@/assets/images/auth-card-bg.svg'
import AuthLogo from '@/components/AuthLogo'
import { currentYear, META_DATA } from '@/config/constants'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import SignInForm from './components/SignInForm'

export const metadata: Metadata = { title: 'เข้าสู่ระบบผู้ขาย' }

export default function SellerSignInPage() {
  return (
    <div className="flex min-h-screen items-center p-12.5">
      <div className="container">
        <div className="flex justify-center px-2.5">
          <div className="2xl:w-4/10 md:w-1/2 sm:w-2/3 w-full">
            {/* มุมตกแต่งพื้นหลัง — copy มาจาก base theme ตรง ๆ */}
            <div className="absolute end-0 top-0">
              <Image src={authCard} alt="auth-card-bg" />
            </div>
            <div className="absolute start-0 bottom-0 rotate-180">
              <Image src={authCard} alt="auth-card-bg" />
            </div>

            <div className="card p-7.5 rounded-2xl">
              <div className="mb-3 flex flex-col items-center justify-center text-center">
                <AuthLogo />
                <h4 className="font-bold text-base text-dark mt-5 mb-2">
                  ยินดีต้อนรับผู้ขาย
                </h4>
                <p className="text-default-400 mx-auto w-full lg:w-3/4 mb-4">
                  กรอกเบอร์โทรศัพท์เพื่อรับรหัส OTP และเข้าสู่ระบบผู้ขาย
                </p>
              </div>

              <SignInForm />

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
              &copy; {currentYear} {META_DATA.name} - by{' '}
              <span>{META_DATA.author}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
