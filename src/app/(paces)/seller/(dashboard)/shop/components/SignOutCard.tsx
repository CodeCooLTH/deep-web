'use client'

/**
 * SignOutCard — ปุ่ม "ออกจากระบบ" สำหรับผู้ขายบนมือถือ
 *
 * ทำไมต้องมี: ปุ่มออกจากระบบเดิมมีอยู่ 2 ที่ คือ TopBar (UserDropdownDetailed) และ Sidenav
 * (UserProfileSettings) — แต่ `.seller-mobile-shell` ซ่อน `.app-header` และ `.app-menu`
 * ทั้งคู่เมื่อจอ <1024px (src/assets/css/safepay-overrides.css §Seller Mobile Shell)
 * ผลคือบนมือถือ "ออกจากระบบไม่ได้เลย" ทั้งในเบราว์เซอร์และในแอปผู้ขาย (WebView) ซึ่งยิ่งหนัก
 * เพราะแอปไม่มีแถบ URL ให้พิมพ์ /api/auth/signout เอง — ล็อกอินแล้วค้างบัญชีนั้นจนกว่าจะลบแอป
 *
 * ทำไมวางที่ /shop: เป็นปลายทางเดียวใน SellerBottomNav ("ร้านค้า") ที่ผู้ขาย **ทุกคน** เข้าถึงได้
 *   - AccountSwitcherSheet ใช้ไม่ได้ — AccountSwitcherLauncher mount sheet เฉพาะเมื่อ
 *     hasBusinessMembership === true (decision 2026-07-04) → ผู้ขายทั่วไปจะยังออกไม่ได้
 *   - SellerMobileHeader ใช้ไม่ได้ — คืน null บน /dashboard และ /orders (หน้ามี header ของตัวเอง)
 *
 * `lg:hidden` อยู่ที่ call-site (shop/page.tsx): ≥1024px มี TopBar/Sidenav ให้อยู่แล้ว
 * ไม่ต้องมีปุ่มซ้ำ — และกัน desktop regress
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/page.tsx (card + card-header
 *   `bg-light/15 border-dashed` section header) ซึ่ง Base เดิมมาจาก
 *   theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 * Logic reused from: src/layouts/components/Sidenav/components/UserProfileSettings.tsx:41
 *   (signOut({ callbackUrl: '/auth/sign-in' }) — callbackUrl เดียวกันเป๊ะ ไม่แตกทางออกเป็นสองแบบ)
 * Confirm: pacesConfirm.danger — blocking dialog ต้องเป็น Sweet Alerts ตาม src/lib/paces-swal.ts
 *   (ห้าม window.confirm) และต้องถามก่อนเพราะปุ่มอยู่ในหน้าที่ผู้ใช้เข้ามาแก้ข้อมูลร้าน กดพลาดได้
 */

import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { signOut, useSession } from 'next-auth/react'

export default function SignOutCard() {
  const { data: session } = useSession()
  // ชื่อที่แสดง = ข้อมูลส่วนตัวเสมอ (ไม่สะท้อนร้าน business ที่ active) — ตรงกับ UserProfileSettings
  const user = session?.user as { displayName?: string; username?: string } | undefined
  const name = user?.displayName ?? user?.username ?? 'ผู้ขาย'

  const handleSignOut = async () => {
    const confirmed = await pacesConfirm.danger(
      'ออกจากระบบ?',
      `คุณจะออกจากบัญชี ${name} และกลับไปหน้าเข้าสู่ระบบ`,
      { confirmButtonText: 'ออกจากระบบ', cancelButtonText: 'ยกเลิก' },
    )
    if (confirmed) signOut({ callbackUrl: '/auth/sign-in' })
  }

  return (
    <div className="card mt-4">
      <div className="card-header">
        <h5 className="bg-light/15 border-default-300 flex w-full items-center justify-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium">
          บัญชีผู้ใช้
        </h5>
      </div>
      <div className="card-body">
        <p className="text-default-500 mb-3 text-sm">
          กำลังใช้งานในชื่อ <span className="text-default-800 font-medium">{name}</span>
        </p>
        {/* py-3 ให้ tap target ≥44px ตาม mobile baseline ของโปรเจกต์
            bg-danger/15 + text-danger = destructive ที่ยังไม่ตะโกน (ปุ่มทึบแดงเต็มสงวนไว้ใน
            confirm dialog ซึ่งเป็นจุดตัดสินใจจริง) */}
        <button
          type="button"
          onClick={handleSignOut}
          className="btn bg-danger/15 text-danger hover:bg-danger w-full justify-center gap-1.5 py-3 hover:text-white"
        >
          <Icon icon="logout" className="text-lg" />
          ออกจากระบบ
        </button>
      </div>
    </div>
  )
}
