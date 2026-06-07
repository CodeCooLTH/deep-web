'use client'

/**
 * SellerMobileHeader — topbar เดียวทุกหน้า mobile (render โดย layout T3)
 *
 * ทำไม: เดิม CommandTopBar อยู่ใน CommandCenter (page-level) → หน้าอื่น ๆ ไม่มี topbar
 * แก้ด้วยย้าย topbar ขึ้น layout slot → render ครอบทุกหน้า (T3 wire ที่ VerticalLayout)
 *
 * 2 mode แยกด้วย pathname:
 *   - /dashboard → identity mode: IdentityBar (avatar + ชื่อร้าน + tier + bell)
 *   - อื่น ๆ → sub-page mode: back button + page title + bell
 *
 * Base: theme/paces/Admin/TS/src/layouts/components/TopBar/components/MenuToggler.tsx
 * Adapt: เปลี่ยนจาก hamburger toggle → dual-mode topbar;
 *        identity mode delegate ไป IdentityBar (T1);
 *        sub-page mode copy markup card/shadow/gradient เดียวกับ IdentityBar
 */

import { usePathname, useRouter } from 'next/navigation'

import Icon from '@/components/wrappers/Icon'

import IdentityBar from './IdentityBar'
import { getSellerPageTitle } from './getSellerPageTitle'

type Props = {
  shopName: string
  avatarUrl: string | null
  /** Deep tier name ตาม SSOT เช่น "Deep Silver" */
  tierName: string
}

const SellerMobileHeader = ({ shopName, avatarUrl, tierName }: Props) => {
  const pathname = usePathname()
  const router = useRouter()

  // dashboard path → delegate ทั้งหมดไป IdentityBar
  if (pathname === '/dashboard') {
    return <IdentityBar shopName={shopName} avatarUrl={avatarUrl} tierName={tierName} />
  }

  // sub-page mode — ชื่อหน้ามาจาก longest-prefix match บน sellerMenuItems
  const pageTitle = getSellerPageTitle(pathname)

  /**
   * deep-link safe back:
   * กรณี user มาจาก deep-link โดยตรง (history.length === 1) → push /dashboard
   * แทน router.back() เพราะ back() จะออกแอปหรือไปหน้าอื่นที่ไม่ใช่ seller
   */
  const handleBack = () => {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push('/dashboard')
    }
  }

  return (
    /* sticky top + gradient fade ด้านล่าง (78%→transparent) — match IdentityBar เป๊ะ */
    <header
      className="sticky top-0 z-20 px-4 pt-4 pb-3"
      style={{ background: 'linear-gradient(180deg,#eef1f6 78%,rgba(238,241,246,0))' }}
      role="banner"
    >
      {/* card: rounded-[20px] + layered shadow ลอยเบา — เหมือน IdentityBar */}
      <div
        className="bg-white rounded-[20px] flex items-center gap-3 px-3.5 py-2.5"
        style={{ boxShadow: '0 1px 2px rgba(16,24,40,0.04),0 6px 16px -8px rgba(16,24,40,0.10)' }}
      >
        {/* Back button ซ้าย — w-11 h-11 = 44px touch target */}
        <button
          type="button"
          className="w-11 h-11 rounded-xl text-[#374151] hover:bg-gray-50 inline-flex items-center justify-center shrink-0"
          aria-label="ย้อนกลับ"
          onClick={handleBack}
        >
          {/* arrow-left ชัดกว่า chevron สำหรับ "กลับ" semantic */}
          <Icon icon="arrow-left" className="text-[22px]" />
        </button>

        {/* Page title กลาง — flex-1 truncate ป้องกันล้น; text-center ให้สม่ำเสมอ */}
        <p className="flex-1 min-w-0 text-center text-[15px] font-bold text-[#111827] truncate">
          {pageTitle}
        </p>

        {/* Bell ขวา — คงสไตล์เดียวกับ IdentityBar (dot แดง + ring-2 ring-white) */}
        <button
          type="button"
          className="w-11 h-11 rounded-xl text-[#374151] hover:bg-gray-50 relative inline-flex items-center justify-center shrink-0"
          aria-label="การแจ้งเตือน"
        >
          <Icon icon="bell" className="text-[23px]" />
          {/* dot แดงมุมขวาบน — คงที่จน Phase 2 (notification count จริง) */}
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
        </button>
      </div>
    </header>
  )
}

export default SellerMobileHeader
