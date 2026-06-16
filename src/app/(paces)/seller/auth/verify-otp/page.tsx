/**
 * Seller verify-otp — responsive: desktop = card boxed กลางจอ, mobile = ฟอร์มเต็มจอ
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/sign-in/page.tsx
 *
 * Changes vs base:
 * - wrapper ใหม่: outer md:flex/center/bg-default-100 + inner card grid-cols-2 md:rounded-2xl
 *   → mobile: grid-cols-1 min-h-screen rounded-none (เต็มจอ); desktop: max-w-4xl card กลางจอ
 * - content ไทย: heading "ส่งรหัสแล้ว!" + subtitle "เราส่งรหัส 6 หลักไปที่"
 * - ใช้ VerifyOtpForm (client component) ใน Suspense boundary
 *   (VerifyOtpForm แสดง masked phone + form จาก searchParams)
 * - คง Suspense wrapper รอบ VerifyOtpForm — กัน hydration mismatch จาก useSearchParams
 * - footer copyright: © {currentYear} {META_DATA.name}
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

export const metadata: Metadata = { title: 'ยืนยันรหัส OTP' }

export default function SellerVerifyOtpPage() {
  return (
    /* outer: mobile = ไม่มีผล (min-h-screen ที่ card); desktop = flex center บนพื้น bg-default-100 */
    <div className="min-h-screen md:flex md:items-center md:justify-center md:bg-default-100 md:p-6 lg:p-10">
      {/* card: mobile = เต็มจอ rounded-none; desktop = boxed max-w-4xl rounded-2xl shadow-lg */}
      <div className="card relative grid min-h-screen w-full grid-cols-1 overflow-hidden rounded-none md:min-h-0 md:max-w-4xl md:grid-cols-2 md:rounded-2xl md:shadow-lg">

        {/* form panel — mobile เต็มจอ / desktop คอลัมน์ซ้าย */}
        <div className="relative flex flex-col justify-between p-6 sm:p-10 md:p-12.5">
          {/* มุมตกแต่งพื้นหลัง — copy ตรงจาก card/sign-in theme */}
          <div className="absolute end-0 top-0">
            <Image src={authCard} alt="auth-card-bg" className="w-45" />
          </div>

          <div className="mb-7.5 flex flex-col items-center justify-center text-center">
            <AuthLogo />
          </div>

          <div>
            <h4 className="font-bold mb-2 text-default-900 text-lg text-center">
              ส่งรหัสแล้ว!
            </h4>
            <p className="text-default-400 mb-4 mx-auto w-full text-center lg:w-72">
              เราส่งรหัส 6 หลักไปที่
            </p>

            {/*
             * masked phone + form อ่าน searchParams ใน VerifyOtpForm (client)
             * Suspense กัน hydration mismatch จาก useSearchParams
             */}
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
          </div>

          <p className="text-default-400 mt-7.5 text-center">
            &copy; {currentYear} {META_DATA.name}
          </p>
        </div>

        {/* image panel — เฉพาะ desktop (md+) */}
        <div
          className="relative hidden bg-cover bg-center md:block"
          style={{ backgroundImage: `url("${authImg.src}")` }}
        >
          {/* gradient overlay — bg-linear-to-t เป็น Tailwind utility ของ theme ไม่ใช่ arbitrary */}
          <div className="absolute inset-0 bg-linear-to-t from-zinc-800 via-zinc-800/80 to-zinc-800/50" />
        </div>

      </div>
    </div>
  )
}
