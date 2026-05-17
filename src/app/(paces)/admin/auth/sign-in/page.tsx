/**
 * Admin sign-in page — single-column card layout
 *
 * Base: theme/paces/Admin/TS/src/app/auth/(basic)/sign-in/page.tsx
 * Markup copy: outer flex/container/card + background image corners
 * Strip: Google/GitHub OAuth buttons, "Continue with Email" divider
 * Strip: split-image grid (ใช้ single-column card แทน)
 * Strip: OAuthErrorToast (ไม่มี OAuth flow แล้ว — admin ใช้ username+password เท่านั้น)
 * Strip: FacebookButton (ลบ OAuth flow ออกจาก admin ทั้งหมด)
 * Add: "บัญชีแอดมินสร้างโดยทีมงานเท่านั้น" note แทน sign-up link
 */
import authCard from '@/assets/images/auth-card-bg.svg'
import AuthLogo from '@/components/AuthLogo'
import { currentYear, META_DATA } from '@/config/constants'
import type { Metadata } from 'next'
import Image from 'next/image'
import SignInForm from './components/SignInForm'

export const metadata: Metadata = { title: 'เข้าสู่ระบบ Admin — Deep' }

export default function AdminSignInPage() {
  return (
    <div className="flex min-h-screen items-center p-12.5">
      <div className="container">
        <div className="flex justify-center px-2.5">
          <div className="2xl:w-4/10 md:w-1/2 sm:w-2/3 w-full">
            {/* มุมภาพประดับ — copy จาก theme (basic)/sign-in/page.tsx */}
            <div className="absolute end-0 top-0">
              <Image src={authCard} alt="auth-card-bg" />
            </div>
            <div className="absolute start-0 bottom-0 rotate-180">
              <Image src={authCard} alt="auth-card-bg" />
            </div>

            <div className="card p-7.5 rounded-2xl">
              <div className="mb-3 flex flex-col items-center justify-center text-center">
                <AuthLogo />
                <h4 className="font-bold text-base text-dark mt-5 mb-2">Deep Admin</h4>
                <p className="text-default-400 mx-auto w-full lg:w-3/4 mb-4">
                  เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านที่ทีมงานกำหนดให้
                </p>
              </div>

              <SignInForm />

              <p className="text-default-400 mt-7.5 text-center text-sm">
                บัญชีแอดมินสร้างโดยทีมงานเท่านั้น
              </p>
            </div>

            <p className="text-default-400 mt-7.5 text-center">
              &copy; {currentYear} {META_DATA.name} - by <span>{META_DATA.author}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
