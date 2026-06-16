/**
 * Seller reset-pass — P2 rework: card → split layout (mobile เต็มจอ)
 *
 * Base: theme/paces/Admin/TS/src/app/auth/split/reset-pass/page.tsx
 *
 * Changes vs base:
 * - content ไทย: heading "ลืมรหัสผ่าน?" + subtitle (กรอกเบอร์โทร)
 * - ตัด email field + Terms checkbox — ใช้ ResetPassForm (phone field) แทน
 * - link "กลับไปที่ เข้าสู่ระบบ" → /auth/sign-in (seller route ไม่มี prefix)
 * - footer copyright: © {currentYear} {META_DATA.name}
 * - คง split structure (form panel md:min-w-106 / photo panel hidden md:block)
 */

import authCard from '@/assets/images/auth-card-bg.svg'
import authImg from '@/assets/images/auth.jpg'
import AuthLogo from '@/components/AuthLogo'
import { currentYear, META_DATA } from '@/config/constants'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import ResetPassForm from './components/ResetPassForm'

export const metadata: Metadata = { title: 'ลืมรหัสผ่าน' }

export default function SellerResetPassPage() {
  return (
    <div className="min-h-screen">
      <div className="flex h-full w-full">
        {/* form panel: mobile เต็มจอ / desktop column กว้างคงที่ */}
        <div className="min-w-full md:min-w-106 md:max-w-118">
          <div className="card relative flex min-h-screen flex-col justify-between rounded-none p-6 sm:p-10 md:p-12.5">
            {/* มุมตกแต่งพื้นหลัง — copy ตรงจาก split/reset-pass theme line 18-20 */}
            <div className="absolute end-0 top-0">
              <Image src={authCard} alt="auth-card-bg" className="w-45" />
            </div>

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
          </div>
        </div>

        {/* image panel: ซ่อน mobile, โผล่ md+ */}
        <div className="hidden w-full md:block">
          <div
            className="relative h-full overflow-hidden bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url("${authImg.src}")` }}
          >
            {/* gradient overlay — Tailwind utility จาก split theme, ไม่ใช่ arbitrary */}
            <div className="from-zinc-800 via-zinc-800/80 to-zinc-800/50 absolute inset-0 bg-linear-to-t p-9" />
          </div>
        </div>
      </div>
    </div>
  )
}
