/**
 * Seller sign-in — desktop = card landscape เหมือน theme, mobile = ฟอร์มเต็มจอ
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/sign-in/page.tsx (ผ่าน AuthCardShell)
 *
 * Changes vs base:
 * - wrapper = AuthCardShell (shared)
 * - content ไทย: heading "ยินดีต้อนรับผู้ขาย" + subtitle
 * - ตัด Google/GitHub/Facebook OAuth + divider — ใช้ SignInForm (username+password)
 */

import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { sessionUserId } from '@/lib/session-user'
import { safeCallbackUrl } from '@/lib/safe-callback-url'
import AuthLogo from '@/components/AuthLogo'
import { shouldHideSignUp } from '@/lib/app-shell-server'
import { currentYear, META_DATA } from '@/config/constants'
import { getT } from '@/i18n/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import OAuthErrorNotice from './components/OAuthErrorNotice'
import SignInForm from './components/SignInForm'
import AuthCardShell from '../components/AuthCardShell'
import AuthLocaleSwitch from '../components/AuthLocaleSwitch'

/**
 * title ของแท็บต้องผันตามภาษาด้วย (feature 00047) — reviewer เห็นแถบแท็บเบราว์เซอร์ในคลิป
 * ต้องเป็น generateMetadata ไม่ใช่ `export const metadata` เพราะค่าคงที่คำนวณตอน build
 * ซึ่งยังไม่รู้ว่า request นี้เป็นภาษาอะไร
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t.auth.signIn.pageTitle }
}

export default async function SellerSignInPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  /**
   * 🛑 ล็อกอินอยู่แล้วต้องไม่เห็นฟอร์มล็อกอิน — ตาข่ายชั้นสองของบั๊ก 2026-09-17
   *
   * อาการ: ยืนยันกับ Apple สำเร็จ แต่ถูกส่งกลับมาหน้านี้ ⇒ ผู้ใช้เห็นฟอร์มล็อกอินทั้งที่
   * **session ถูกตั้งเรียบร้อยแล้ว** แล้วสรุปว่า "ล็อกอินไม่ได้" ทั้งที่เข้าได้แล้ว
   *
   * ต้นเหตุจริงแก้ที่ `callbacks.redirect` (ดู `src/lib/post-auth-redirect.ts`) — ด่านนี้
   * เป็นชั้นสองที่ครอบ **ทุกทาง** ที่พาคนล็อกอินแล้วมาโผล่ที่นี่ ไม่ใช่เฉพาะทาง OAuth
   * (`proxy.ts` ยกเว้น `/auth` จากด่านทุกด่าน จึงไม่มีใครกันให้เลยก่อนหน้านี้)
   *
   * เคารพ `?callbackUrl=` เหมือนฟอร์ม — คนที่ถูกเด้งมาจากหน้าที่ต้องล็อกอินจะได้กลับไปถูกที่
   */
  const session = await getServerSession(authOptions)
  if (sessionUserId(session)) {
    const params = await searchParams
    redirect(safeCallbackUrl(typeof params?.callbackUrl === 'string' ? params.callbackUrl : null))
  }

  /* ในแอป iOS ห้ามมีทางไปสมัครบัญชี — ส่งต่อให้ SignInForm ด้วย (ลิงก์ในผล OTP "ยังไม่มีบัญชี") */
  const hideSignUp = await shouldHideSignUp()

  const t = await getT()

  return (
    <AuthCardShell>
      {/* ตัวสลับภาษา (feature 00047, มติ D-I18N-6) — วางเป็นแถวของตัวเองก่อนโลโก้
          🛑 เฉพาะหน้านี้เท่านั้น ห้ามย้ายไป AuthCardShell เพราะ shell ใช้ร่วม 5 หน้า auth
          และ D-I18N-6 กำหนดขอบเขตไว้ที่หน้าเข้าสู่ระบบ (จุดที่ reviewer เริ่มเดินในคลิป) */}
      <AuthLocaleSwitch />

      <div className="mb-7.5 flex flex-col items-center justify-center text-center">
        <AuthLogo />
      </div>

      <div>
        <h4 className="font-bold mb-2 text-default-900 text-lg text-center">{t.auth.signIn.title}</h4>
        <p className="text-default-400 mb-4 mx-auto w-full text-center lg:w-3/4">{t.auth.signIn.subtitle}</p>

        {/* SignInForm อ่าน ?callbackUrl= ผ่าน useSearchParams — Suspense กัน hydration mismatch
            (pattern เดียวกับ verify-otp/page.tsx) */}
        <Suspense fallback={<p className="text-center text-default-400 py-8">{t.auth.signIn.loading}</p>}>
          {/* 🛑 ต้องอยู่ใน Suspense ก้อนเดียวกับฟอร์ม — ทั้งคู่อ่าน useSearchParams
              แยกออกไปข้างนอกจะบังคับให้ทั้งหน้ากลายเป็น dynamic โดยไม่ได้อะไรเพิ่ม */}
          <OAuthErrorNotice />
          <SignInForm hideSignUp={hideSignUp} />
        </Suspense>

        {/* 🛑 ในแอป iOS ซ่อนทางไปสมัคร — Apple สั่งให้ถอดการสมัครบัญชีธุรกิจออกจากแอป
            (Guideline 3.1.1, 2026-08-23) · ตัวหน้า `/auth/sign-up` redirect ทิ้งอยู่แล้ว
            แต่ต้องซ่อนลิงก์ด้วย ไม่งั้นผู้ใช้กดแล้วเด้งกลับที่เดิม = ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้น */}
        {!hideSignUp && (
          <p className="text-default-400 mt-7.5 text-center">
            {t.auth.signIn.noAccount}&nbsp;
            <Link
              href="/auth/sign-up"
              className="text-primary font-semibold underline underline-offset-4"
            >
              {t.auth.signIn.signUp}
            </Link>
          </p>
        )}
      </div>

      <p className="text-default-400 mt-7.5 text-center">
        &copy; {currentYear} {META_DATA.name}
      </p>
    </AuthCardShell>
  )
}
