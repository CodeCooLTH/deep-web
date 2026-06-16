/**
 * Seller — ยืนยัน OTP (verify-otp)
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/two-factor/page.tsx
 *
 * ปรับจาก theme:
 * - เปลี่ยนจาก (basic) single-column → card/two-factor สองคอลัมน์ (form ซ้าย + photo ขวา hidden lg:block)
 * - content ไทยตาม S-P2-3 spec: header "ส่งรหัสแล้ว!" + subtitle + masked phone
 * - ย้าย form section ออกเป็น VerifyOtpForm (client component) ที่รับ mode/phone จาก searchParams
 * - mobile padding: p-5 sm:p-8 lg:p-12.5 (card-body) ตาม mobile-first rule spec
 * - ตัด copyright block ออก (ย้ายออกนอก card ตาม theme)
 */

import authCard from '@/assets/images/auth-card-bg.svg'
import authImg from '@/assets/images/auth.jpg'
import AuthLogo from '@/components/AuthLogo'
import { currentYear, META_DATA } from '@/config/constants'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import VerifyOtpForm from './components/VerifyOtpForm'

export const metadata: Metadata = { title: 'ยืนยันรหัส OTP | Deep ผู้ขาย' }

export default function SellerVerifyOtpPage() {
  return (
    <div className="flex min-h-screen items-center p-5 sm:p-8 lg:p-12.5">
      <div className="container">
        <div className="flex justify-center">
          <div className="xl:w-5/6 w-full">
            {/* corner decorators — copy ตรงจาก theme card/two-factor */}
            <div className="absolute end-0 top-0">
              <Image src={authCard} alt="auth-card-bg" />
            </div>
            <div className="absolute start-0 bottom-0 rotate-180">
              <Image src={authCard} alt="auth-card-bg" />
            </div>

            <div className="card rounded-2xl">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                {/* ฝั่งซ้าย: form */}
                <div className="card-body relative p-5 sm:p-8 lg:p-12.5">
                  <div className="mb-7.5 flex flex-col items-center justify-center text-center">
                    <AuthLogo />
                    <h4 className="text-default-900 mt-7.5 mb-3 text-base font-bold">
                      ส่งรหัสแล้ว!
                    </h4>
                    <p className="text-default-400 mx-auto mb-2">
                      เราส่งรหัส 6 หลักไปที่
                    </p>
                    {/*
                     * masked phone แสดงใน VerifyOtpForm เพราะต้องอ่าน searchParams (client)
                     * Suspense boundary กัน hydration mismatch จาก useSearchParams
                     */}
                  </div>

                  <Suspense
                    fallback={
                      <p className="text-center text-default-400 py-8">กำลังโหลด...</p>
                    }
                  >
                    <VerifyOtpForm />
                  </Suspense>

                  <p className="text-default-400 mt-7.5 text-center text-sm">
                    กลับไปที่&nbsp;
                    <Link
                      href="/auth/sign-in"
                      className="text-primary font-semibold underline underline-offset-3"
                    >
                      เข้าสู่ระบบ
                    </Link>
                  </p>

                  <p className="text-default-400 mt-7.5 text-center text-sm">
                    &copy; {currentYear} {META_DATA.name} - by{' '}
                    <span>{META_DATA.author}</span>
                  </p>
                </div>

                {/* ฝั่งขวา: photo panel — hidden บน mobile ตาม spec OQ-5 */}
                <div
                  className="relative hidden h-full overflow-hidden rounded-e-2xl bg-cover bg-center object-cover lg:block"
                  style={{ backgroundImage: `url(${authImg.src})` }}
                >
                  {/*
                   * gradient overlay — copy ตรงจาก theme card/two-factor line 80
                   * จำเป็น: Paces ไม่มี utility token สำหรับ multi-stop photo overlay
                   * (ห้ามใช้ #hex/arbitrary ที่อื่น — กฎ Hard Rule 7 ยกเว้นนี้เพราะ theme เอง)
                   */}
                  <div className="absolute inset-0 flex items-end justify-center rounded-e-sm p-9 [background:linear-gradient(to_top,#313a46,rgba(49,58,70,.8),rgba(49,58,70,.5))]"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
