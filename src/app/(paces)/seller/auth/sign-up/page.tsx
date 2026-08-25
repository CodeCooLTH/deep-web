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
import { shouldHideSignUp } from '@/lib/app-shell-server'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'สมัครสมาชิกผู้ขาย' }

/**
 * 🛑 ในแอป iOS หน้านี้ต้องไม่มีอยู่ (Guideline 3.1.1 — Apple สั่ง 2026-08-23)
 *
 * *"Remove the account registration features for business and organizations"*
 * ฟอร์มนี้มีช่อง **หมวดหมู่ร้านค้า** = สมัครในนามกิจการ ซึ่งเป็นสิ่งที่ Apple ชี้ตรง ๆ
 *
 * ปิดที่ **ตัวหน้า** ไม่ใช่แค่ซ่อนลิงก์ — ลิงก์ที่ซ่อนกันได้แค่คนที่เดินตามปุ่ม
 * ส่วนคนตรวจของ Apple พิมพ์ URL ตรงเข้ามาได้ (และ deep link จาก SMS/แชทก็พาเข้ามาได้)
 * ⇒ ด่านต้องอยู่ที่ปลายทาง ไม่ใช่ที่ทางเดิน (`rule-must-be-enforced-not-described.md`)
 *
 * `redirect` ไม่ใช่ `notFound()` — คนที่มาถึงหน้านี้ตั้งใจจะ "เข้าใช้งาน" การพาไปหน้าล็อกอิน
 * คือคำตอบที่ใช้ได้จริง ส่วน 404 คือทางตัน (เขามีบัญชีอยู่แล้วก็ได้)
 *
 * 🛑 ต่างจาก `/register` และ `/onboarding` ที่ **ห้าม redirect** เพราะ `proxy.ts` บังคับให้ไป
 * ที่นั่นเอง (redirect ออก = วนลูป) — หน้านี้ไม่มีใครบังคับ จึง redirect ได้
 */
export default async function SellerSignUpPage() {
  if (await shouldHideSignUp()) redirect('/auth/sign-in')

  return (
    <AuthCardShell>
      <div className="mb-7.5 flex flex-col items-center justify-center text-center">
        <AuthLogo />
      </div>

      <div>
        <h4 className="font-bold mb-2 text-default-900 text-base text-center">
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
