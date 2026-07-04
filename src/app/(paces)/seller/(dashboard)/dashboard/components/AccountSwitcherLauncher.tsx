'use client'

/**
 * AccountSwitcherLauncher — client wrapper บาง ๆ ครอบ avatar+ชื่อร้าน ใน CompactHero (mobile)
 * เปิด bottom sheet สลับบัญชี (S-1, มือถือ) — reuse logic feat 00008
 *
 * ทำไมเป็น client component แยก: CompactHero เป็น RSC (ไม่รู้ session) — wrapper นี้เรียก
 * useSession() เอง ไม่ต้อง prop-drill hasBusinessMembership จาก server (scope baseline กำหนดไว้)
 *
 * ไม่มี business membership → avatar/ชื่อกดไม่ได้ (ไม่ mount sheet) — decision ยืนยันแล้ว 2026-07-04
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (ปุ่ม + chevron-down affordance primitive)
 * Logic reused from: src/layouts/components/TopBar/components/UserDropdownDetailed.tsx (hasBusinessMembership guard)
 */

import Icon from '@/components/wrappers/Icon'
import { useSession } from 'next-auth/react'
import type { ReactNode } from 'react'
import AccountSwitcherSheet from './AccountSwitcherSheet'

interface Props {
  children: ReactNode
}

export default function AccountSwitcherLauncher({ children }: Props) {
  const { data: session } = useSession()
  const hasBusinessMembership = (session?.user as { hasBusinessMembership?: boolean } | undefined)?.hasBusinessMembership === true

  // ไม่มี business membership → กดไม่ได้ (แสดงเหมือนเดิม ไม่ mount sheet)
  if (!hasBusinessMembership) {
    return <div className="flex items-center gap-3 flex-1 min-w-0">{children}</div>
  }

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
