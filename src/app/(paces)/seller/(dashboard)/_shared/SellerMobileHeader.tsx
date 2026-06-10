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
  /** Trust score 0–100; ส่งต่อไป IdentityBar เพื่อแสดง progress bar */
  trustScore: number
}

const SellerMobileHeader = ({ shopName, avatarUrl, tierName, trustScore }: Props) => {
  const pathname = usePathname()
  const router = useRouter()

  // dashboard path → delegate ทั้งหมดไป IdentityBar
  if (pathname === '/dashboard') {
    return <IdentityBar shopName={shopName} avatarUrl={avatarUrl} tierName={tierName} trustScore={trustScore} />
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
    /* sticky top + gradient fade ด้านล่าง (80%→transparent) — v6: bg mist #F8F7FA
       ลบ card wrapper เดิม (bg-white rounded-[20px] shadow) → flat บนพื้น mist เหมือน IdentityBar */
    <header
      className="sticky top-0 z-20"
      style={{ background: 'linear-gradient(180deg,#F8F7FA 80%,rgba(248,247,250,0))' }}
      role="banner"
    >
      {/* flat flex row — ไม่มี card ครอบ ตาม v6 */}
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5">
        {/* Back button ซ้าย — w-11 h-11 = 44px touch target */}
        <button
          type="button"
          className="w-11 h-11 rounded-[11px] inline-flex items-center justify-center shrink-0"
          style={{ color: 'rgba(47,43,61,.70)' }}
          aria-label="ย้อนกลับ"
          onClick={handleBack}
        >
          {/* arrow-left ชัดกว่า chevron สำหรับ "กลับ" semantic */}
          <Icon icon="arrow-left" className="text-[22px]" />
        </button>

        {/* Page title กลาง — flex-1 truncate ป้องกันล้น; text-center ให้สม่ำเสมอ */}
        <p className="flex-1 min-w-0 text-center text-[15px] font-semibold text-[#2F2B3D] truncate">
          {pageTitle}
        </p>

        {/* Bell ขวา — w-11 h-11=44px touch target; dot แดง ring mist สอดคล้องกับ IdentityBar */}
        <button
          type="button"
          className="w-11 h-11 rounded-[11px] relative inline-flex items-center justify-center shrink-0"
          style={{ color: 'rgba(47,43,61,.70)' }}
          aria-label="การแจ้งเตือน"
        >
          <Icon icon="bell" className="text-[22px]" />
          {/* dot แดง #FF4C51 มุมขวาบน — ring mist กัน dot ชนกับ icon */}
          <span
            className="absolute w-[7px] h-[7px] rounded-full"
            style={{ top: '9px', right: '10px', background: '#FF4C51', boxShadow: '0 0 0 2px #F8F7FA' }}
          />
        </button>
      </div>
    </header>
  )
}

export default SellerMobileHeader
