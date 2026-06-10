'use client'

/**
 * IdentityBar — แสดง identity ร้านค้า (avatar + ชื่อร้าน + tier + bell)
 *
 * ทำไม: แตกออกจาก CommandTopBar (T1) เพื่อให้ SellerMobileHeader ใช้ได้
 * โดยตรง — ลบ hamburger slot ออกทั้งหมด เพราะ mobile shell ไม่มี drawer อีกต่อไป
 * (T3 layout เป็นผู้ inject header slot แทน CommandCenter)
 *
 * Base: theme/paces/Admin/TS/src/layouts/components/TopBar/components/MenuToggler.tsx
 * Adapt: ลบ hamburger; คง avatar กลม ring + ชื่อร้าน 2 บรรทัด + tier chip + bell dot แดง
 *        เหมือน CommandTopBar identity slot เป๊ะ (copy markup เดิม ยกเว้น slot 1)
 */

import Icon from '@/components/wrappers/Icon'

type Props = {
  shopName: string
  avatarUrl: string | null
  /** Deep tier name ตาม SSOT เช่น "Deep Silver" */
  tierName: string
}

const IdentityBar = ({ shopName, avatarUrl, tierName }: Props) => {
  // คำนวณตัวอักษรแรกของชื่อร้านสำหรับ avatar fallback
  // guard ถ้า shopName ว่าง → ใช้ "?" แทน
  const initial = shopName.trim().charAt(0).toUpperCase() || '?'

  return (
    /* sticky top + gradient fade ด้านล่าง (80%→transparent) — v6: bg mist #F8F7FA
       ลบ card wrapper เดิม (bg-white rounded-[20px] shadow) → flat บนพื้น mist */
    <header
      className="sticky top-0 z-20"
      style={{ background: 'linear-gradient(180deg,#F8F7FA 80%,rgba(248,247,250,0))' }}
      role="banner"
    >
      {/* flat flex row — ไม่มี card ครอบ ตาม v6 */}
      <div className="flex items-center gap-2.5 px-4 pt-2 pb-2">
        {/* Identity: avatar กลม ring + ชื่อร้าน 2 บรรทัด + tier */}
        {/* Avatar — กลม w-9 h-9; ring ผ่าน boxShadow (ring+shadow รวม 1 layer); null → initial fallback */}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            className="w-9 h-9 rounded-full object-cover shrink-0"
            style={{ boxShadow: '0 0 0 2px #fff,0 1px 3px rgba(47,43,61,0.18)' }}
            alt=""
            aria-hidden="true"
          />
        ) : (
          <div
            className="w-9 h-9 rounded-full bg-gray-200 inline-flex items-center justify-center text-gray-600 font-bold text-[14px] shrink-0"
            style={{ boxShadow: '0 0 0 2px #fff,0 1px 3px rgba(47,43,61,0.18)' }}
            aria-hidden="true"
          >
            {initial}
          </div>
        )}

        {/* ข้อความ 2 บรรทัด: ชื่อร้าน + tier */}
        <div className="min-w-0 flex-1">
          {/* บรรทัด 1: ชื่อร้าน semibold truncate ink เข้ม */}
          <p className="text-[14.5px] font-semibold text-[#2F2B3D] truncate leading-tight">
            {shopName}
          </p>
          {/* บรรทัด 2: icon check เขียว #28C76F + Deep tier name ink-55 */}
          <p className="text-[11.5px] leading-tight flex items-center gap-1" style={{ color: 'rgba(47,43,61,.55)' }}>
            {/* icon wrapper เติม tabler: ให้อัตโนมัติ — ส่ง name ไม่มี prefix */}
            <Icon icon="rosette-discount-check-filled" className="text-[14px] shrink-0 text-[#28C76F]" />
            <span className="truncate">{tierName}</span>
          </p>
        </div>

        {/* Bell ขวา — w-11 h-11=44px touch target; dot แดง ring mist (ไม่ใช่ ring-white เพราะ bg เป็น mist) */}
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

export default IdentityBar
