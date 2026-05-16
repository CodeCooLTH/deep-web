/**
 * Base: theme/paces/Admin/TS/src/app/auth/(basic)/sign-up/page.tsx
 *
 * Re-sourced จาก Paces (basic) sign-up template.
 * การเปลี่ยนแปลงจาก theme:
 *   - ลบ Google / GitHub OAuth buttons ออก (SafePay seller signup ใช้ OTP อย่างเดียว)
 *   - ลบ "Continue with Email" divider — ไม่ใช้ email; เปลี่ยนเป็น "สมัครผู้ขายด้วยเบอร์โทร"
 *   - ลบ FacebookButton (ไม่ให้ OAuth ในหน้า sign-up)
 *   - เปลี่ยน UI copy เป็นภาษาไทย
 *   - เปลี่ยน link "Login" ชี้ /seller/auth/sign-in
 */
import authCard from '@/assets/images/auth-card-bg.svg'
import AuthLogo from '@/components/AuthLogo'
import { currentYear, META_DATA } from '@/config/constants'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import SignUpForm from './components/SignUpForm'

export const metadata: Metadata = { title: 'สมัครผู้ขาย' }

const Page = () => {
  return (
    <div className="flex min-h-screen items-center p-12.5">
      <div className="container">
        <div className="flex justify-center px-2.5">
          <div className="2xl:w-4/10 md:w-1/2 sm:w-2/3 w-full">
            {/* มุมตกแต่ง — copy โดยตรงจาก theme (basic) sign-up */}
            <div className="absolute end-0 top-0">
              <Image src={authCard} alt="auth-card-bg" />
            </div>
            <div className="absolute start-0 bottom-0 rotate-180">
              <Image src={authCard} alt="auth-card-bg" />
            </div>

            <div className="card p-7.5 rounded-2xl">
              <div className="mb-3 flex flex-col items-center justify-center text-center">
                <AuthLogo />
                <p className="text-default-400 mx-auto mt-6 mb-4 w-full lg:w-3/4">
                  เริ่มต้นเป็นผู้ขายบน Deep — กรอกข้อมูลร้านค้าและเบอร์โทรของคุณ
                </p>
              </div>

              {/* OAuth buttons ถูกตัดออกตาม spec — SafePay seller sign-up ใช้ OTP เท่านั้น */}

              <SignUpForm />

              <p className="text-default-400 mt-7.5 text-center">
                มีบัญชีอยู่แล้ว?&nbsp;
                <Link
                  href="/auth/sign-in"
                  className="text-primary font-semibold underline underline-offset-4"
                >
                  เข้าสู่ระบบ
                </Link>
              </p>
            </div>

            <p className="text-default-400 mt-7.5 text-center text-sm">
              &copy; {currentYear} {META_DATA.name} - by <span>{META_DATA.author}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Page
