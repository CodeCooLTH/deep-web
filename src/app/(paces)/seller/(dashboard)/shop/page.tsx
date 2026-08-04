/**
 * ตั้งค่าร้านค้า — Seller Shop Settings Page
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/settings/page.tsx
 *
 * โครงสร้าง: copy จาก Paces settings/page.tsx (stepper card layout)
 * ปรับ: โหลด active shop ของ seller ผ่าน requireActiveShop (Phase 4 D5 — แทน getShopByUserId เดิม
 *       ซึ่ง resolve Personal เสมอ; ตอนนี้ตั้งค่าได้ทั้ง Personal/Business ตาม active context), ส่ง prop ไป ShopForm
 * Strip: breadcrumb subtitle เปลี่ยนเป็นไทย, header icon คงไว้จาก version เดิม
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import ShopForm from './components/ShopForm'
import SignOutCard from './components/SignOutCard'
import ShopQuickLinks from './components/ShopQuickLinks'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { formatDateTime } from '@/lib/format-date'

export const metadata: Metadata = { title: 'ตั้งค่าร้าน' }

// แปลงอายุร้านเป็นข้อความไทยที่อ่านง่าย
function formatShopAge(createdAt: Date): string {
  const now = new Date()
  const diff = now.getTime() - new Date(createdAt).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return 'เปิดร้านวันนี้'
  if (days < 30) return `เปิดร้านมา ${days} วัน`
  if (days < 365) {
    const months = Math.floor(days / 30)
    return `เปิดร้านมา ${months} เดือน`
  }
  const years = Math.floor(days / 365)
  const remainMonths = Math.floor((days % 365) / 30)
  return remainMonths > 0
    ? `เปิดร้านมา ${years} ปี ${remainMonths} เดือน`
    : `เปิดร้านมา ${years} ปี`
}

export default async function ShopSettingsPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  // active shop (Personal หรือ Business ตาม session.user.activeShopId, verify membership ภายใน)
  // settings ไม่ gate ด้วย locked — package lock ล็อกเฉพาะ transaction ไม่ใช่การแก้ข้อมูลร้าน
  let shop: any = null
  // kind/role ของ active shop — ใช้ตัดสินว่ารายการ "จัดการร้าน" จะมีเมนูพนักงานไหม
  // (เงื่อนไขเดียวกับ applyStaffMenu ใน _seller-menu.ts: BUSINESS + OWNER เท่านั้น)
  // default PERSONAL/OWNER = ปลอดภัยสุด (ไม่โชว์เมนูพนักงาน) เมื่อ resolve ไม่ได้
  let shopKind: 'PERSONAL' | 'BUSINESS' = 'PERSONAL'
  let shopRole: 'OWNER' | 'ADMIN' = 'OWNER'
  try {
    const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
    shop = active?.shop ?? null
    if (active) {
      shopKind = active.kind
      shopRole = active.role
    }
  } catch {
    shop = null
  }

  const isExisting = !!shop
  const pageSubtext = isExisting
    ? `เปิดร้านเมื่อ ${formatDateTime(shop.createdAt)} — ${formatShopAge(shop.createdAt)}`
    : 'ตั้งค่าร้านค้าของคุณเพื่อเริ่มรับออเดอร์และสร้าง Trust Score'

  return (
    <>
      {/* หัวหน้า + breadcrumb — เดสก์ท็อปเท่านั้น
          บนมือถือ SellerMobileHeader (layout) แสดงชื่อหน้า "ตั้งค่าร้านค้า" ให้อยู่แล้ว
          ถ้าปล่อยไว้จะได้หัวข้อซ้ำกันสามชั้นติดกัน: topbar "ตั้งค่าร้านค้า" / breadcrumb
          "ตั้งค่าร้าน" / บรรทัดวันที่ยาว — กินจอไปเกือบ 1 ใน 3 ก่อนเห็นเนื้อหาจริง
          อายุร้านย้ายไปอยู่ในการ์ดหัวร้านของมือถือแทน (สั้นลงเหลือ "เปิดร้านวันนี้") */}
      <div className="hidden lg:block">
        <PageBreadcrumb title="ตั้งค่าร้าน" trail={[{ label: 'ร้านค้า', href: '/shop' }]} />
        <div className="mb-5">
          <p className="text-default-400 text-sm mt-0.5">{pageSubtext}</p>
        </div>
      </div>

      {/* ShopForm รับ shop จริงของ seller — null = ยังไม่มีร้าน */}
      <ShopForm
        shop={shop}
        isExisting={isExisting}
        ageText={isExisting ? formatShopAge(shop.createdAt) : null}
      />

      {/* รายการ "จัดการร้าน" + ออกจากระบบ — เฉพาะ <1024px
          `.seller-mobile-shell` ซ่อน TopBar + Sidenav บนจอเล็ก ซึ่งเป็นที่อยู่ของทั้งเมนูร้าน
          และปุ่มออกจากระบบ ทำให้มือถือเข้าไม่ถึงเลยทั้งสองอย่าง (ดู comment หัวไฟล์ทั้งสองตัว)
          ≥1024px ไม่ render — sidebar + UserDropdownDetailed ทำหน้าที่นี้อยู่แล้ว */}
      <div className="lg:hidden">
        <ShopQuickLinks shopKind={shopKind} shopRole={shopRole} />
        <SignOutCard />
      </div>

      {/* ลบบัญชีไม่ได้อยู่หน้านี้ (ย้ายไป /account แล้ว 2026-08-04) — เข้าถึงได้จากแถว
          "ข้อมูลส่วนตัว" ใน ShopQuickLinks ด้านบน. เหตุผล: ลบบัญชีคือลบ "ตัวคน" ไม่ใช่ลบร้าน
          และการวางไว้ที่นี่ทำให้แถบ "บันทึกการเปลี่ยนแปลง" (fixed) ลอยทับการ์ดที่ไม่เกี่ยวกับ
          ฟอร์มร้านเลย — ดู account/page.tsx */}

      {/* เว้นที่ให้แถบ "บันทึก" ที่เป็น fixed ใน ShopForm — ต้องอยู่ "ท้ายสุดของหน้า" ไม่ใช่ท้ายฟอร์ม
          เดิมวางไว้ในฟอร์ม แล้วแถบไปบังการ์ดออกจากระบบซึ่ง render ต่อจากฟอร์ม (เลื่อนสุดแล้ว
          ปุ่มออกจากระบบโดนทับจนกดไม่ได้) — ตัวเว้นต้องเป็นสิ่งสุดท้ายที่หน้าเลื่อนถึง
          h-16 ≈ ความสูงแถบ (py-3 + ปุ่ม py-3); เดสก์ท็อปไม่มีแถบนี้จึงไม่ต้องเว้น */}
      <div className="h-16 lg:hidden" aria-hidden="true" />
    </>
  )
}
