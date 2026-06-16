/**
 * Seller sign-in — redesign เป็น username+password (P2 S-P2-1)
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/sign-in/page.tsx
 *
 * Changes vs base:
 * - เปลี่ยน layout เป็น grid-cols-2: ซ้าย form / ขวา photo panel (hidden lg:block)
 *   ตามสเปก S-P2-6 (wrapper เหมือน card/sign-in ต้นฉบับ)
 * - ตัด Google + GitHub OAuth buttons → แทนด้วย Facebook button เดียว (w-full)
 * - divider ข้อความไทย "หรือเข้าด้วย username"
 * - header ไทย "ยินดีต้อนรับผู้ขาย"
 * - mobile-first: outer p-5 sm:p-8 lg:p-12.5, card-body p-6 sm:p-8 lg:p-12.5
 * - photo panel: assets/images/auth.jpg (hidden lg:block ตาม OQ-5)
 * - footer link → /auth/sign-up (seller route)
 */

import authCard from '@/assets/images/auth-card-bg.svg'
import authImg from '@/assets/images/auth.jpg'
import AuthLogo from '@/components/AuthLogo'
import { currentYear, META_DATA } from '@/config/constants'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import SignInForm from './components/SignInForm'

export const metadata: Metadata = { title: 'เข้าสู่ระบบผู้ขาย' }

export default function SellerSignInPage() {
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
                    <h4 className="mt-5 mb-2 text-base font-bold">
                      ยินดีต้อนรับผู้ขาย
                    </h4>
                    <p className="text-default-400 mx-auto w-full lg:w-3/4">
                      กรอกชื่อผู้ใช้และรหัสผ่านเพื่อเข้าสู่ระบบ
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

                  <p className="text-default-400 mt-4 text-center text-sm">
                    &copy; {currentYear} {META_DATA.name} - by{' '}
                    <span>{META_DATA.author}</span>
                  </p>
                </div>

                {/* ขวา: photo panel — hidden บน mobile, แสดงบน lg+ (OQ-5) */}
                <div
                  className="relative hidden h-full overflow-hidden rounded-e-2xl bg-cover bg-center object-cover lg:block"
                  style={{ backgroundImage: `url(${authImg.src})` }}
                >
                  {/* overlay gradient ให้ภาพดูมืดด้านล่าง — copy จาก base */}
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
