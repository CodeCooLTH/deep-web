/**
 * Seller new-pass — desktop = card landscape เหมือน theme, mobile = ฟอร์มเต็มจอ
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/sign-in/page.tsx (ผ่าน AuthCardShell)
 *
 * Changes vs base:
 * - wrapper = AuthCardShell (shared)
 * - content ไทย: heading "ตั้งรหัสผ่านใหม่" + subtitle
 * - NewPassForm อ่าน resetDraft จาก sessionStorage (กัน OTP ใน URL); link อยู่ใน form
 */

import AuthLogo from '@/components/AuthLogo'
import { currentYear, META_DATA } from '@/config/constants'
import type { Metadata } from 'next'
import NewPassForm from './components/NewPassForm'
import AuthCardShell from '../components/AuthCardShell'

export const metadata: Metadata = { title: 'ตั้งรหัสผ่านใหม่' }

export default function SellerNewPassPage() {
  return (
    <AuthCardShell>
      <div className="mb-7.5 flex flex-col items-center justify-center text-center">
        <AuthLogo />
      </div>

      <div>
        <h4 className="font-bold mb-2 text-default-900 text-lg text-center">
          ตั้งรหัสผ่านใหม่
        </h4>
        <p className="text-default-400 mb-4 mx-auto w-full text-center lg:w-3/4">
          กรอกรหัสผ่านใหม่ของคุณ
        </p>

        {/* NewPassForm อ่าน resetDraft จาก sessionStorage (กัน OTP ใน URL) */}
        <NewPassForm />
      </div>

      <p className="text-default-400 mt-7.5 text-center">
        &copy; {currentYear} {META_DATA.name}
      </p>
    </AuthCardShell>
  )
}
