'use client'

/**
 * CommandTopBar — Top menu bar สำหรับ mobile command center (S-8)
 *
 * ทำไม: desktop sidebar มีเมนูครบแล้ว; mobile ไม่เห็น sidebar โดยตรง
 * จึงต้องมี sticky top bar ที่เปิด offcanvas ได้ + แสดง identity ร้าน
 *
 * Base: theme/paces/Admin/TS/src/layouts/components/TopBar/components/MenuToggler.tsx
 * Adapt: เพิ่ม shopName / bell / avatar slot; button เปลี่ยนเป็น rounded-xl 44px;
 *        ใช้ showBackdrop() ตรง (plain function) ไม่ใช้ useLayoutContext hook
 */

import Icon from '@/components/wrappers/Icon'
import { showBackdrop } from '@/context/useLayoutContext'

type Props = {
  shopName: string
  avatarUrl: string | null
}

// hardcode notification count = 0 จน Phase 2 มี notification system
const NOTIFICATION_COUNT = 0

const CommandTopBar = ({ shopName, avatarUrl }: Props) => {
  // คำนวณตัวอักษรแรกของชื่อร้านสำหรับ avatar fallback
  // guard ถ้า shopName ว่าง → ใช้ "?" แทน
  const initial = shopName.trim().charAt(0).toUpperCase() || '?'

  return (
    <header
      className="bg-white rounded-2xl shadow-sm mx-3 mt-3 px-4 py-3 flex items-center justify-between sticky top-3 z-10"
      role="banner"
    >
      {/* Slot 1: Hamburger ซ้าย — เปิด offcanvas sidebar */}
      <button
        type="button"
        className="w-11 h-11 rounded-xl bg-primary text-white inline-flex items-center justify-center shrink-0"
        onClick={() => showBackdrop()}
        aria-label="เปิดเมนู"
      >
        {/* icon menu-2 ตาม design spec S-8 (menu-4 คือ variant ที่ MenuToggler theme ใช้) */}
        <Icon icon="menu-2" className="text-2xl" />
      </button>

      {/* Slot 2: ชื่อร้าน กลาง — truncate รองรับชื่อยาว */}
      <div className="flex items-center gap-2 min-w-0 px-2 flex-1">
        <span className="text-[15px] font-bold text-default-900 truncate">
          {shopName}
        </span>
      </div>

      {/* Slot 3: Bell + Avatar ขวา */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Bell notification — badge ซ่อนเมื่อ count=0 (conditional render ไว้รอ Phase 2) */}
        <button
          type="button"
          className="w-11 h-11 rounded-xl bg-gray-50 text-gray-600 relative inline-flex items-center justify-center"
          aria-label="การแจ้งเตือน"
        >
          <Icon icon="bell" className="text-xl" />
          {/* แสดง badge เฉพาะเมื่อ count > 0 — Phase 2 จะ wire real notification count */}
          {NOTIFICATION_COUNT > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-5 h-5 px-1 text-[11px] bg-danger text-white rounded-full inline-flex items-center justify-center leading-none">
              {NOTIFICATION_COUNT >= 100 ? '99+' : NOTIFICATION_COUNT}
            </span>
          )}
        </button>

        {/* Avatar — แสดงรูปถ้ามี avatarUrl; ถ้า null แสดง initial ตัวอักษรแรกชื่อร้าน */}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            className="w-11 h-11 rounded-xl object-cover bg-gray-100"
            alt=""
            aria-hidden="true"
          />
        ) : (
          <div
            className="w-11 h-11 rounded-xl bg-gray-200 inline-flex items-center justify-center text-gray-600 font-bold text-[15px]"
            aria-hidden="true"
          >
            {initial}
          </div>
        )}
      </div>
    </header>
  )
}

export default CommandTopBar
