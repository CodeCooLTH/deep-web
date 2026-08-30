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

import { headers } from 'next/headers'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import ShopForm from './components/ShopForm'
import SignOutCard from './components/SignOutCard'
import { BUSINESS_DELETE_RETENTION_DAYS } from '@/lib/business-package'
import { shouldHidePayments } from '@/lib/app-shell-server'
import ShopQuickLinks from './components/ShopQuickLinks'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { formatDateTime } from '@/lib/format-date'
import { verticalRequiresStorefrontLocation } from '@/lib/lodging'

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

  /**
   * URL หน้าร้านสาธารณะ (feature: ที่ตั้ง slug 2026-08-07) — คำนวณที่ server เพราะต้องข้าม
   * subdomain: หน้านี้อยู่ seller.* แต่หน้าร้านอยู่โดเมนหลัก
   * pattern เดียวกับ (dashboard)/public-profile/page.tsx:54-74 เป๊ะ — ห้ามให้ 2 หน้านี้คำนวณ
   * เส้นทางคนละแบบ ไม่งั้นลิงก์ที่ผู้ใช้คัดลอกจาก 2 ที่จะไม่ตรงกัน
   *
   * PERSONAL ใช้ /u/{username} ซึ่งไม่ได้มาจาก slug จึงไม่มีอะไรให้ตั้งที่นี่ — การ์ด slug
   * จึงโผล่เฉพาะ BUSINESS (ร้านส่วนตัวตั้ง slug ผ่าน /onboarding ที่บังคับอยู่แล้ว)
   */
  const host = (await headers()).get('host') ?? ''
  const rootHost = host.replace(/^seller\./, '')
  const proto = host.startsWith('localhost') || host.includes('.local') ? 'http' : 'https'
  const shopPublicUrl =
    shopKind === 'BUSINESS' && shop?.slug ? `${proto}://${rootHost}/b/${shop.slug}` : null
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
        /* ที่ตั้ง URL หน้าร้าน — ส่งเฉพาะ BUSINESS ที่มีร้านจริง (ดูเหตุผลที่ shopPublicUrl)
           slug ที่ยังไม่ตั้ง = null → การ์ดขึ้นเป็นสถานะ "ยังไม่ตั้ง" ให้กรอกได้ทันที */
        slugSetup={
          shopKind === 'BUSINESS' && isExisting
            ? { slug: shop.slug ?? null, publicUrl: shopPublicUrl, publicOrigin: rootHost }
            : undefined
        }
        /* โซนอันตรายเป็นแท็บใน ShopForm ไม่ใช่การ์ดแยกท้ายหน้า (user ทัก 2026-08-05)
           ส่งเฉพาะ BUSINESS + OWNER + มีร้านจริง — ร้านส่วนตัวลบไม่ได้ (ลบบัญชีอยู่ /account)
           และผู้ดูแลที่ถูกเชิญไม่ใช่เจ้าของ จึงไม่มีสิทธิ์ลบร้านของคนอื่น */
        dangerZone={
          shopKind === 'BUSINESS' && shopRole === 'OWNER' && isExisting
            ? { shopId: shop.id, shopName: shop.shopName, retentionDays: BUSINESS_DELETE_RETENTION_DAYS }
            : undefined
        }
        /* ที่อยู่ + หมุดแผนที่ (2026-08-14) — เกณฑ์เดียวกับที่วิซาร์ดสร้างธุรกิจใช้บังคับ
           ขั้น "ที่ตั้งร้าน" ไม่แยกตาม kind: ร้านส่วนตัวที่เป็นคิวงาน/บ้านพักก็ตันเหมือนกัน
           (ตั้งพิกัดได้ครั้งเดียวตอน onboarding แล้วไม่มีทางแก้) */
        locationSetup={
          isExisting && verticalRequiresStorefrontLocation(shop.vertical)
            ? {
                shopId: shop.id,
                address: shop.address ?? null,
                latitude: shop.latitude ?? null,
                longitude: shop.longitude ?? null,
              }
            : undefined
        }
        /* บัญชีรับเงิน (2026-08-29, feature 00062 U19) — เฉพาะ OWNER (ไม่ใช่ ADMIN/staff — UX
           spec §A6 เคาะแล้ว 2026-08-28 ว่าบัญชีธนาคารเข้มกว่าการแก้ข้อมูลร้านทั่วไป) + ร้าน
           ONLINE_SALES เท่านั้น (SERVICE_QUEUE/LODGING ไม่มีการ์ดนี้เลย ไม่ใช่ disabled) — ตรวจ
           ซ้ำที่ server (updateShopPayout) เสมอ ฝั่งนี้กันแค่ไม่ให้คนไม่มีสิทธิ์เห็นการ์ดนี้เลย */
        bankAccountSetup={
          isExisting && shopRole === 'OWNER' && shop.vertical === 'ONLINE_SALES'
            ? {
                payoutBankCode: shop.payoutBankCode ?? null,
                payoutAccountNo: shop.payoutAccountNo ?? null,
                payoutAccountName: shop.payoutAccountName ?? null,
                payoutPromptPayId: shop.payoutPromptPayId ?? null,
                hasExistingPayout: shop.payoutUpdatedAt !== null,
              }
            : undefined
        }
      />

      {/* รายการ "จัดการร้าน" + ออกจากระบบ — เฉพาะ <1024px
          `.seller-mobile-shell` ซ่อน TopBar + Sidenav บนจอเล็ก ซึ่งเป็นที่อยู่ของทั้งเมนูร้าน
          และปุ่มออกจากระบบ ทำให้มือถือเข้าไม่ถึงเลยทั้งสองอย่าง (ดู comment หัวไฟล์ทั้งสองตัว)
          ≥1024px ไม่ render — sidebar + UserDropdownDetailed ทำหน้าที่นี้อยู่แล้ว */}
      <div className="lg:hidden">
        <ShopQuickLinks shopKind={shopKind} shopRole={shopRole} hidePayments={await shouldHidePayments()} />
        <SignOutCard />
      </div>

      {/* ลบบัญชีไม่ได้อยู่หน้านี้ (ย้ายไป /account แล้ว 2026-08-04) — เข้าถึงได้จากแถว
          "ข้อมูลส่วนตัว" ใน ShopQuickLinks ด้านบน. เหตุผล: ลบบัญชีคือลบ "ตัวคน" ไม่ใช่ลบร้าน
          และการวางไว้ที่นี่ทำให้แถบ "บันทึกการเปลี่ยนแปลง" (fixed) ลอยทับการ์ดที่ไม่เกี่ยวกับ
          ฟอร์มร้านเลย — ดู account/page.tsx */}

      {/* ไม่มีตัวเว้นท้ายหน้าแล้ว — ปุ่ม "บันทึกการเปลี่ยนแปลง" เลิกเป็นแถบ fixed ตั้งแต่
          2026-08-15 (ย้ายไปอยู่ในสายเนื้อหาต่อจากการ์ดฟอร์ม ดูเหตุผลใน ShopForm.tsx)
          จึงไม่มีอะไรลอยทับการ์ดออกจากระบบให้ต้องเว้นที่ให้อีก */}
    </>
  )
}
