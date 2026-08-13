'use client'

/**
 * AuthLocaleSwitch — สลับภาษาบนหน้าเข้าสู่ระบบของผู้ขาย (feature 00047, ผ่าน safepay-ux gate)
 *
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductTypePickerCardV2.tsx
 *   — `input[type=radio].peer` + `label.peer-checked:*` (ตัวมันเองอ้างอิง
 *     theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx)
 *
 * 🛑 ทำไมหน้านี้ต้องมีตัวสลับแยกจากการ์ดใน /account (มติ D-I18N-6)
 * ภาษาเป็นการตั้งค่าของบัญชีที่อยู่ในฐานข้อมูล แต่หน้านี้ยังไม่รู้ว่าใครกำลังดูอยู่ จึงอ่าน
 * `User.locale` ไม่ได้ ⇒ ตัวนี้เขียน **cookie อย่างเดียว** และมีผลเฉพาะหน้าก่อนล็อกอิน
 * พอล็อกอินสำเร็จ ค่าใน DB ชนะทันที (src/i18n/server.ts อ่าน DB ก่อน cookie เสมอ)
 *
 * เหตุผลที่ DB ต้องชนะ: เครื่องหนึ่งมีคนใช้ได้หลายคน (เครื่องรวมหน้าร้าน/พนักงานยืมกัน)
 * ถ้าปล่อยให้ cookie ทับ คนก่อนหน้าที่กด EN ทิ้งไว้จะเปลี่ยนภาษาให้เจ้าของบัญชีที่ล็อกอินตามมา
 * โดยไม่มีใครตั้งใจและไม่มีอะไรฟ้อง
 *
 * 🛑 เป็น flow element ไม่ใช่ `position:absolute` โดยตั้งใจ
 * `.card-body` ของ AuthCardShell มี safe-area padding ผูกอยู่ และ `AuthLogo` อยู่กึ่งกลางใกล้
 * ขอบบนเหมือนกัน — absolute ที่ 320px เสี่ยงทับโลโก้ การจองแถวของตัวเองตัดความเสี่ยงนั้นทิ้ง
 * (คลาสเดียวกับบทเรียน docs/conventions/flex-header-truncation.md: กล่องที่ตำแหน่งคงที่
 * เจอเนื้อหาอีกก้อนมาแชร์พื้นที่โดยไม่ได้วางแผน)
 *
 * แสดงเป็นรหัส TH/EN ไม่ใช่ชื่อเต็มหรือธง เพราะต้องไม่แย่งความสนใจจากฟอร์มล็อกอิน —
 * รหัสภาษาเป็นสากล อ่านออกทั้งสองภาษาโดยไม่ต้องแปล (FR-I18N-01 ทางกลับต้องอ่านออกเสมอ)
 */

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { useLocale, useT } from '@/i18n/LocaleProvider'
import { writeLocaleCookie } from '@/i18n/locale-cookie'
import type { Locale } from '@/i18n/locales'

export default function AuthLocaleSwitch() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const options: { value: Locale; code: string }[] = [
    { value: 'th', code: t.language.thCode },
    { value: 'en', code: t.language.enCode },
  ]

  function choose(next: Locale) {
    if (next === locale) return
    writeLocaleCookie(next)
    // refresh ไม่ใช่ push/replace — BR-I18N-02 ห้ามแตะ URL (proxy.ts ทำ subdomain rewrite อยู่)
    // และการเปลี่ยน path จะทำให้ ?callbackUrl= ที่ SignInForm อ่านอยู่หลุดไปด้วย
    startTransition(() => router.refresh())
  }

  return (
    <fieldset
      className={`mb-4 flex justify-end ${isPending ? 'pointer-events-none opacity-60' : ''}`}
      disabled={isPending}
    >
      <legend className="sr-only">{t.language.buttonLabel}</legend>
      <div className="border-default-200 inline-flex overflow-hidden rounded-full border">
        {options.map((option) => {
          const active = option.value === locale
          return (
            <div key={option.value}>
              <input
                type="radio"
                name="auth-locale"
                id={`auth-locale-${option.value}`}
                value={option.value}
                checked={active}
                onChange={() => choose(option.value)}
                /* sr-only ไม่ใช่ hidden — display:none ถอด input ออกจาก tab order ทั้งหมด
                   ผู้ใช้คีย์บอร์ดจะโฟกัสไม่ได้เลย (ดูคอมเมนต์เดียวกันที่ LanguagePrefsCard) */
                className="peer sr-only"
              />
              <label
                htmlFor={`auth-locale-${option.value}`}
                className="peer-checked:bg-primary peer-checked:text-white peer-focus-visible:ring-primary text-default-500 flex min-h-11 min-w-11 cursor-pointer items-center justify-center px-3 text-sm font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-inset"
              >
                {option.code}
              </label>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
