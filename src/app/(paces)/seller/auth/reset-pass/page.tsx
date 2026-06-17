/**
 * Seller reset-pass — desktop = card landscape เหมือน theme, mobile = ฟอร์มเต็มจอ
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/sign-in/page.tsx (ผ่าน AuthCardShell)
 *
 * Changes vs base:
 * - wrapper = AuthCardShell (shared)
 * - content ไทย: heading "ลืมรหัสผ่าน?" + subtitle (กรอกเบอร์โทร)
 * - ใช้ ResetPassForm (phone field) — ส่ง OTP เพื่อรีเซ็ตรหัส
 */

import AuthLogo from '@/components/AuthLogo'
import { currentYear, META_DATA } from '@/config/constants'
import type { Metadata } from 'next'
import Link from 'next/link'
import ResetPassForm from './components/ResetPassForm'
import AuthCardShell from '../components/AuthCardShell'

export const metadata: Metadata = { title: 'ลืมรหัสผ่าน' }

export default function SellerResetPassPage() {
  return (
    <AuthCardShell>
      <div className="mb-7.5 flex flex-col items-center justify-center text-center">
        <AuthLogo />
      </div>

      <div>
        <h4 className="font-bold mb-2 text-default-900 text-lg text-center">
          ลืมรหัสผ่าน?
        </h4>
        <p className="text-default-400 mb-4 mx-auto w-full text-center lg:w-72">
          กรอกเบอร์โทรที่ลงทะเบียนไว้ เราจะส่งรหัส OTP ให้คุณ
        </p>

        <ResetPassForm />

        <p className="text-default-400 mt-7.5 text-center">
          กลับไปที่&nbsp;
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
