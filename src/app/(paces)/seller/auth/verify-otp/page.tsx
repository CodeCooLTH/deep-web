/**
 * Seller — ยืนยัน OTP (verify-otp)
 *
 * Base: theme/paces/Admin/TS/src/app/auth/(basic)/two-factor/page.tsx
 *
 * เปลี่ยนจาก: layout สองคอลัมน์พร้อม image panel (hand-composed)
 * เป็น: (basic) card เดียว กลางจอ พร้อม corner decorators จาก theme
 *
 * ปรับ:
 * - ตัด image panel (div ด้านขวา) ออก — ใช้ (basic) variant เสมอตาม page-sourcing.md
 * - ตัด inline style backgroundImage → ไม่จำเป็นเพราะ image panel ถูกตัดออกแล้ว
 * - copy เป็นไทย: "ส่งรหัสไปที่เบอร์โทรของคุณ"
 * - เก็บ VerifyOtpForm wiring ทั้งหมด (Suspense boundary คงเดิม)
 */

import authCard from '@/assets/images/auth-card-bg.svg'
import AuthLogo from '@/components/AuthLogo'
import { currentYear, META_DATA } from '@/config/constants'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import VerifyOtpForm from './components/VerifyOtpForm'

export const metadata: Metadata = { title: 'ยืนยันรหัส OTP' }

export default function SellerVerifyOtpPage() {
  return (
    <div className="flex min-h-screen items-center p-12.5">
      <div className="container">
        <div className="flex justify-center px-2.5">
          <div className="2xl:w-4/10 md:w-1/2 sm:w-2/3 w-full">
            {/* corner decorators — มาจาก (basic) two-factor template โดยตรง */}
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
                  ส่งรหัสไปที่เบอร์โทรของคุณ
                </p>
              </div>

              {/* แสดงเบอร์ที่ mask ไว้ — VerifyOtpForm จัดการ state เอง */}
              <Suspense fallback={<p className="text-center text-default-400">กำลังโหลด...</p>}>
                <VerifyOtpForm />
              </Suspense>

              <p className="text-default-400 mt-9 text-center">
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
              &copy; {currentYear} {META_DATA.name} - by <span>{META_DATA.author}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
