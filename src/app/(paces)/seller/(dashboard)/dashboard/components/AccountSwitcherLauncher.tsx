'use client'

/**
 * AccountSwitcherLauncher — client wrapper บาง ๆ ครอบ avatar+ชื่อร้าน ใน CompactHero (mobile)
 * เปิด bottom sheet สลับบัญชี (S-1, มือถือ) — reuse logic feat 00008
 *
 * ทำไมเป็น client component แยก: CompactHero เป็น RSC — ตัว sheet ต้องการ hook (useSession/state)
 *
 * feature 00026: เดิม "ไม่มี business membership → กดไม่ได้ (ไม่ mount sheet)" ซึ่งถูกต้องตอนที่ sheet
 * ทำหน้าที่เดียวคือสลับร้าน — แต่ตอนนี้ sheet เป็นทางเข้า "ข้อมูลส่วนตัว" บนมือถือด้วย และ
 * SellerBottomNav ไม่มีแท็บบัญชี ทำให้ seller เดี่ยว (ไม่มี business = คนส่วนใหญ่) เหลือทางเดียว
 * คือเข้าแท็บ "ร้านค้า" → /shop → เลื่อนหา quick links = ต้องเดินผ่านหน้าตั้งค่าร้านเพื่อไปหา
 * ข้อมูลส่วนตัว ซึ่งคืออาการของบั๊กต้นเรื่องเป๊ะ ๆ จึง mount เสมอ
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (ปุ่ม + chevron-down affordance primitive)
 * Logic reused from: src/layouts/components/TopBar/components/UserDropdownDetailed.tsx
 */

import Icon from '@/components/wrappers/Icon'
import type { ReactNode } from 'react'
import AccountSwitcherSheet from './AccountSwitcherSheet'

interface Props {
  children: ReactNode
}

export default function AccountSwitcherLauncher({ children }: Props) {
  return (
    <>
      <button
        type="button"
        data-hs-overlay="#account-switcher-sheet"
        aria-haspopup="dialog"
        aria-controls="account-switcher-sheet"
        aria-label="สลับบัญชี"
        className="flex items-center gap-3 flex-1 min-w-0 text-start active:opacity-80 transition-opacity"
      >
        {children}
        <Icon icon="chevron-down" className="text-white/70 shrink-0" aria-hidden="true" />
      </button>
      <AccountSwitcherSheet />
    </>
  )
}
