'use client'

/**
 * AppSetupBlockedNotice — จอที่ขึ้นแทน **ฟอร์มลงทะเบียน** เมื่อเปิดจากในแอป iOS
 *
 * ## ที่มา — Apple Guideline 3.1.1 (2026-08-23)
 *
 * *"The app includes an account registration feature for businesses and organizations, which
 * is considered access to external mechanisms for purchases or subscriptions to be used in
 * the app. Next Steps: **Remove the account registration features for business and
 * organizations**"*
 *
 * "features" เป็นพหูพจน์ และในระบบเรามี **3 ทาง** ที่พาไปกรอกฟอร์มลงทะเบียนกิจการ:
 *   1. `/auth/sign-up`  — ฟอร์ม "สร้างบัญชีผู้ขาย" (มีช่อง *หมวดหมู่ร้านค้า*) ← ตัวที่ Apple แนบรูปมา
 *   2. `/register`      — บังคับหลังล็อกอินด้วย Apple/Facebook/LINE ที่ยังไม่มีเบอร์
 *   3. `/onboarding`    — บังคับเมื่อร้านยังไม่มี slug (ประเภทร้าน/หมวดหมู่/URL/ที่อยู่)
 *
 * ข้อ 1 ปิดด้วย `redirect()` ได้ · **ข้อ 2–3 ปิดแบบนั้นไม่ได้** เพราะ `proxy.ts` เป็นคนบังคับ
 * ให้มาที่นี่ ⇒ redirect ออก = **วนลูปไม่รู้จบ** จึงต้องเป็นจอที่ *แสดงแทนฟอร์ม*
 *
 * ## 🛑 ทำไมไม่มีปุ่ม/ลิงก์ไปเว็บ
 *
 * Apple เขียนเองว่าการลงทะเบียนถือเป็น *"access to external mechanisms"* ⇒ ปุ่มที่พาไป
 * ลงทะเบียนบนเว็บก็คือ "ทางเข้าไปกลไกภายนอก" อีกแบบ · ใช้กติกาเดียวกับเรื่องจ่ายเงินที่เรา
 * ยึดอยู่แล้ว: **ไม่มีลิงก์ไปหน้าเหล่านั้นทุกชนิด รวมลิงก์ไปเว็บของเราเอง**
 *
 * ## 🛑 ทำไมต้องมีปุ่มออกจากระบบ
 *
 * ถ้าไม่มี ผู้ใช้จะติดอยู่กับจอนี้ถาวร — `proxy.ts` บังคับกลับมาที่นี่ทุกเส้นทาง
 * จอที่ออกไปไหนไม่ได้เลยคือบั๊กตาม Guideline 2.1 อีกข้อ (แลกข้อหนึ่งด้วยอีกข้อ)
 *
 * ## 🛑 ทำไมต้องใช้ `useT()` ไม่ฝังไทยตายตัว
 *
 * นี่คือจอที่ **คนตรวจของ Apple จะเห็น** ถ้าเขากด "Sign in with Apple" (ซึ่งเขาทำแน่ — 4.8
 * บังคับให้มีปุ่มนั้น) — บัญชีใหม่ไม่มีเบอร์ ⇒ `needsRegistration` ⇒ มาที่นี่
 * ฝังไทยตายตัว = เขาอ่านไม่ออกแล้วตีเป็นบั๊ก (กฎเดียวกับ `seller/loading.tsx`)
 *
 * Base: theme/paces/Admin/TS/src/app/(other)/maintenance/page.tsx
 *   (จอสถานะเต็มหน้า: ไอคอนวงกลม + หัวข้อ + คำอธิบาย + ปุ่มเดียว)
 */

import { signOut } from 'next-auth/react'
import { useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'

export default function AppSetupBlockedNotice() {
  const t = useT()
  const [leaving, setLeaving] = useState(false)

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="bg-info/15 flex size-16 items-center justify-center rounded-full">
        <Icon icon="device-desktop" className="text-info-ink text-3xl" aria-hidden="true" />
      </span>

      <h1 className="text-dark text-lg font-bold">{t.appSetupBlocked.title}</h1>

      {/* max-w-sm — บรรทัดยาวเกิน ~60 ตัวอักษรอ่านยากบนมือถือ และจอนี้มีแต่ข้อความล้วน */}
      <p className="text-default-700 max-w-sm text-sm leading-relaxed">{t.appSetupBlocked.body}</p>

      <button
        type="button"
        disabled={leaving}
        onClick={() => {
          /* 🛑 ไม่คืน `leaving` เป็น false ใน finally — `signOut` พาออกจากหน้านี้อยู่แล้ว
             การคืนสถานะหลังสั่งเปลี่ยนหน้า = ปุ่มกลับมากดได้แวบหนึ่งก่อนหน้าจะเปลี่ยน
             (บทเรียนเดียวกับ `signIn()` ที่ resolve ทันทีทั้งที่เบราว์เซอร์ยังไม่ไปไหน) */
          setLeaving(true)
          void signOut({ callbackUrl: '/auth/sign-in' })
        }}
        className="btn bg-light text-dark hover:bg-light-hover mt-2 min-h-11 px-6 font-semibold disabled:opacity-60"
      >
        {t.appSetupBlocked.signOut}
      </button>
    </div>
  )
}
