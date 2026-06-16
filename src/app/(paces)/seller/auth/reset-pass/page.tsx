/**
 * Seller reset-pass page — re-sourced จาก Paces card reset-pass template.
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/reset-pass/page.tsx
 *
 * Changes vs base:
 * - layout สองคอลัมน์ (grid-cols-1 lg:grid-cols-2): ซ้าย form / ขวา photo `hidden lg:block` — คง structure base ไว้
 * - ตัด Terms & Policy checkbox ออก (Controller decision spec S-P2-4)
 * - เปลี่ยน email → phone field (แยกออกไปใน ResetPassForm client component)
 * - header ไทย "ลืมรหัสผ่าน?" + subtitle ภาษาไทย
 * - link "กลับไปที่ เข้าสู่ระบบ" → /auth/sign-in
 * - mobile-first: outer p-5 sm:p-8 lg:p-12.5, card-body p-6 sm:p-8 lg:p-12.5
 * - photo panel: style={{ backgroundImage }} คงไว้เหมือน base (inline style จำเป็นสำหรับ dynamic bg-image)
 * - Paces primitive: .card, .card-body ห้าม arbitrary value
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
    <div className="flex min-h-screen items-center p-5 sm:p-8 lg:p-12.5">
      <div className="container">
        <div className="flex justify-center">
          <div className="xl:w-5/6 w-full">
            {/* มุมตกแต่งพื้นหลัง — copy มาจาก base theme ตรง ๆ */}
            <div className="absolute end-0 top-0">
              <Image src={authCard} alt="auth-card-bg" />
            </div>
            <div className="absolute start-0 bottom-0 rotate-180">
              <Image src={authCard} alt="auth-card-bg" />
            </div>

            <div className="card rounded-2xl">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                {/* ซ้าย: form panel */}
                <div className="card-body relative p-6 sm:p-8 lg:p-12.5">
                  <div className="mb-7.5 flex flex-col items-center justify-center text-center">
                    <AuthLogo />
                    <h4 className="text-default-900 mt-7.5 mb-2 text-base font-bold">
                      ลืมรหัสผ่าน?
                    </h4>
                    <p className="text-default-400 mx-auto w-full lg:w-3/4">
                      กรอกเบอร์โทรที่ลงทะเบียนไว้ เราจะส่งรหัส OTP ให้คุณ
                    </p>
                  </div>

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

                  <p className="text-default-400 mt-7.5 text-center">
                    &copy; {currentYear} {META_DATA.name} - by{' '}
                    <span>{META_DATA.author}</span>
                  </p>
                </div>

                {/* ขวา: photo panel — hidden บน mobile, แสดงเฉพาะ lg+ ตาม OQ-5 */}
                {/* inline style จำเป็น — backgroundImage ต้องการ dynamic URL จาก next/image src */}
                <div
                  className="relative hidden h-full overflow-hidden rounded-e-2xl bg-cover bg-center object-cover lg:block"
                  style={{ backgroundImage: `url(${authImg.src})` }}
                >
                  <div className="absolute inset-0 flex items-end justify-center rounded-e-sm p-9 [background:linear-gradient(to_top,#313a46,rgba(49,58,70,.8),rgba(49,58,70,.5))]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
