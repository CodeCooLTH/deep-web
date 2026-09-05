'use client'

/**
 * InspectorHeader — topbar เดียวของทุกหน้า `/inspector` (feature 00060 · T13)
 *
 * Base: theme/paces/Admin/TS/src/layouts/components/TopBar/components/MenuToggler.tsx
 *   (ปุ่มไอคอนกลม `btn btn-icon` — ใช้เป็นฐานของปุ่ม back)
 * Adapt: theme MenuToggler สลับ sidenav ของแอดมิน — ที่นี่ไม่มี sidenav ให้สลับเลย (ผู้ตรวจไม่มี
 *   "ร้าน"/เมนูให้สลับ ตาม UX Design Spec Surface C: "ตัด shop-switcher/bottom-nav ออก") จึงเหลือ
 *   แค่โครง sticky header + ปุ่มไอคอนกลับ ไม่มี toggle เมนู
 *
 * 2 mode: list (ไม่มีปุ่ม back — เป็นหน้าแรกของแอปนี้) / detail (back + title)
 */

import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'

type Props = {
  title: string
  /** true = แสดงปุ่มย้อนกลับ (หน้ารายละเอียดรอบ) */
  showBack?: boolean
}

export default function InspectorHeader({ title, showBack = false }: Props) {
  const router = useRouter()

  return (
    <header
      // pt-[env(safe-area-inset-top)]: (paces)/layout.tsx เปิด viewportFit:'cover' แล้ว —
      // header ที่ sticky top-0 ต้องเว้น inset เอง ไม่งั้นชื่อหน้าไปนอนใต้นาฬิกา (มิเรอร์
      // SellerMobileHeader.tsx)
      className="bg-body-bg sticky top-0 z-20 pt-[env(safe-area-inset-top)]" /* carve-out: safe-area ไม่มี token */
      role="banner"
    >
      <div className="flex items-center gap-3 border-b border-dashed border-default-300 px-4 py-3">
        {showBack && (
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="ย้อนกลับ"
            /* w-11 h-11 = 44px แทน `.btn.btn-icon` เฉย ๆ (ค่า default 37px ต่ำกว่าเพดานแตะขั้นต่ำ
               ของโปรเจกต์ — มิเรอร์ปุ่ม back ของ SellerMobileHeader.tsx) */
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-default-300 text-default-800"
          >
            <Icon icon="arrow-left" className="size-4.5" />
          </button>
        )}
        <p className="min-w-0 flex-1 truncate text-lg font-semibold text-default-900">{title}</p>
      </div>
    </header>
  )
}
