/**
 * Seller sign-up — desktop = card landscape เหมือน theme, mobile = ฟอร์มเต็มจอ
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/sign-in/page.tsx (ผ่าน AuthCardShell)
 *
 * Changes vs base:
 * - wrapper = AuthCardShell (shared)
 * - content ไทย: heading "สร้างบัญชีผู้ขาย" + subtitle
 * - ตัด Google/GitHub OAuth + divider — ใช้ SignUpForm (6 fields + Facebook)
 */

import AuthLogo from '@/components/AuthLogo'
import { currentYear, META_DATA } from '@/config/constants'
import type { Metadata } from 'next'
import Link from 'next/link'
import SignUpForm from './components/SignUpForm'
import AuthCardShell from '../components/AuthCardShell'

export const metadata: Metadata = { title: 'สมัครสมาชิกผู้ขาย' }

export default function SellerSignUpPage() {
  return (
    <AuthCardShell>
      <div className="mb-7.5 flex flex-col items-center justify-center text-center">
        <AuthLogo />
      </div>

      <div>
        <h4 className="font-bold mb-2 text-default-900 text-lg text-center">
          สร้างบัญชีผู้ขาย
        </h4>
        <p className="text-default-400 mb-4 mx-auto w-full text-center lg:w-3/4">
          เริ่มต้นขายบน Deep — กรอกข้อมูลร้านค้าของคุณ
        </p>

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

      <p className="text-default-400 mt-7.5 text-center">
        &copy; {currentYear} {META_DATA.name}
      </p>
    </AuthCardShell>
  )
}
