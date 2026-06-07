'use client'

/**
 * CommandTopBar — Top menu bar สำหรับ mobile command center (S-8)
 *
 * ทำไม: desktop sidebar มีเมนูครบแล้ว; mobile ไม่เห็น sidebar โดยตรง
 * จึงต้องมี sticky top bar ที่เปิด offcanvas ได้ + แสดง identity ร้าน
 *
 * V4 Polish: hamburger → ghost; avatar กลม ring; tier chip (Deep tier name);
 * bell → dot แดง; sticky + gradient fade ด้านล่าง; card rounded-[20px] + layered shadow
 *
 * Base: theme/paces/Admin/TS/src/layouts/components/TopBar/components/MenuToggler.tsx
 * Adapt: เพิ่ม shopName / avatarUrl / tierName props;
 *        hamburger ghost ไม่ทึบ; bell dot แดงแทนตัวเลข; tier chip;
 *        header sticky gradient fade; ใช้ showBackdrop() (plain function ไม่ใช้ useLayoutContext hook)
 */

import Icon from '@/components/wrappers/Icon'
import { showBackdrop } from '@/context/useLayoutContext'

type Props = {
  shopName: string
  avatarUrl: string | null
  /** Deep tier name ตาม SSOT เช่น "Deep Silver" */
  tierName: string
}

const CommandTopBar = ({ shopName, avatarUrl, tierName }: Props) => {
  // คำนวณตัวอักษรแรกของชื่อร้านสำหรับ avatar fallback
  // guard ถ้า shopName ว่าง → ใช้ "?" แทน
  const initial = shopName.trim().charAt(0).toUpperCase() || '?'

  return (
    /* sticky top + gradient fade ด้านล่าง (78%→transparent) ตาม mockup v4
       bg = #eef1f6 (Paces app bg token --bg) — ใช้ inline style เพราะ Tailwind arbitrary
       ไม่รองรับ CSS var ใน gradient ได้ clean เท่า */
    <header
      className="sticky top-0 z-20 px-4 pt-4 pb-3"
      style={{ background: 'linear-gradient(180deg,#eef1f6 78%,rgba(238,241,246,0))' }}
      role="banner"
    >
      {/* card: rounded-[20px] + layered shadow ลอยเบา ตาม design spec v4 */}
      <div
        className="bg-white rounded-[20px] flex items-center gap-3 px-3.5 py-2.5"
        style={{ boxShadow: '0 1px 2px rgba(16,24,40,0.04),0 6px 16px -8px rgba(16,24,40,0.10)' }}
      >
        {/* Slot 1: Hamburger ซ้าย — ghost style ไม่ทึบ; เปิด offcanvas sidebar */}
        <button
          type="button"
          className="w-11 h-11 rounded-xl text-[#374151] hover:bg-gray-50 inline-flex items-center justify-center shrink-0"
          onClick={() => showBackdrop()}
          aria-label="เปิดเมนู"
        >
          {/* icon menu-2 ตาม design spec v4 */}
          <Icon icon="menu-2" className="text-[26px]" />
        </button>

        {/* Slot 2: Identity กลาง — avatar กลม + ชื่อร้าน 2 บรรทัด + tier chip */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Avatar — กลม ring-2 ring-white shadow-sm; null → initial fallback */}
          {avatarUrl ? (
            <img
              src={avatarUrl}
              className="w-9 h-9 rounded-full object-cover ring-2 ring-white shadow-sm shrink-0"
              alt=""
              aria-hidden="true"
            />
          ) : (
            <div
              className="w-9 h-9 rounded-full bg-gray-200 inline-flex items-center justify-center text-gray-600 font-bold text-[14px] ring-2 ring-white shadow-sm shrink-0"
              aria-hidden="true"
            >
              {initial}
            </div>
          )}

          {/* ข้อความ 2 บรรทัด: ชื่อร้าน + tier chip */}
          <div className="min-w-0">
            {/* บรรทัด 1: ชื่อร้าน bold truncate */}
            <p className="text-[14.5px] font-bold text-[#111827] truncate leading-tight">
              {shopName}
            </p>
            {/* บรรทัด 2: tier chip — icon check เขียว + Deep tier name เทา */}
            <p className="text-[11px] text-[#7b8597] leading-tight flex items-center gap-1">
              <Icon icon="rosette-discount-check-filled" className="text-[13px] text-emerald-500 shrink-0" />
              <span className="truncate">{tierName}</span>
            </p>
          </div>
        </div>

        {/* Slot 3: Bell ขวา — dot แดงแทนตัวเลข (Phase 2 = notification count จริง) */}
        <button
          type="button"
          className="w-11 h-11 rounded-xl text-[#374151] hover:bg-gray-50 relative inline-flex items-center justify-center shrink-0"
          aria-label="การแจ้งเตือน"
        >
          <Icon icon="bell" className="text-[23px]" />
          {/* dot แดงมุมขวาบน — ring-2 ring-white ให้ดูลอยชัด; คงที่จน Phase 2 */}
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
        </button>
      </div>
    </header>
  )
}

export default CommandTopBar
