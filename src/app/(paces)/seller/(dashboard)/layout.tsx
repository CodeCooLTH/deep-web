import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTierLabel } from '@/lib/trust-tier'
import VerticalLayout from '@/layouts/VerticalLayout'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { sellerMenuItems, applyInventoryGate } from './_seller-menu'
import SellerMobileHeader from './_shared/SellerMobileHeader'
import SellerBottomNav from './_shared/SellerBottomNav'
import TopUpCelebrationPoller from './wallet/components/TopUpCelebrationPoller'
import { getOrderStatusCounts } from '@/services/order.service'
import { getEntitlementInfo } from '@/services/inventory-entitlement.service'
import type { EntitlementStatus, InventoryPackage } from '@/lib/inventory-addon'
import OnboardingGate from './dashboard/components/OnboardingGate'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user as
    | {
        id: string
        displayName: string
        username: string
        avatar: string | null
        isShop: boolean
        isAdmin: boolean
        trustScore: number
      }
    | undefined
  // No session OR token points to a user that no longer exists in DB (stale
  // cookie from the old synthetic-session bypass) → force re-sign-in.
  // proxy rewrite ครอบ /auth/sign-in → /seller/auth/sign-in ให้อัตโนมัติบน seller subdomain
  if (!session || !user?.id) redirect('/auth/sign-in')

  // Every seller MUST have a shop — auto-create a default one on first visit
  // so they land on a usable dashboard instead of a "create shop" CTA.
  // T3: ขยาย select เพิ่ม shopName + logo เพื่อส่งเข้า SellerMobileHeader
  const shop = await prisma.shop.findUnique({
    where: { userId: user.id },
    select: { id: true, shopName: true, logo: true },
  })
  if (!shop) {
    await prisma.shop.create({
      data: {
        userId: user.id,
        shopName: `ร้านของ ${user.displayName}`,
        businessType: 'INDIVIDUAL',
      },
    })
    // หลัง auto-create ไม่ refetch — ใช้ fallback ชื่อแทน (ตรงกับ shopName ที่ create)
    // shop variable ยังเป็น null → fallback ใน topbarSlot จะใช้ `ร้านของ ${displayName}` แทน
  }

  // คำนวณ tier label ตาม SSOT (getTierLabel) จาก trustScore session
  const tierName = getTierLabel(user.trustScore ?? 0)
  // ชื่อร้านสำหรับ mobile header — fallback กรณี shop เพิ่ง create (shop = null ช่วง auto-create)
  const shopNameForHeader = shop?.shopName ?? `ร้านของ ${user.displayName}`

  // pendingCount สำหรับ SellerBottomNav badge — ดึงเฉพาะเมื่อ shop มี id
  // (shop อาจเป็น null เมื่อเพิ่ง auto-create → skip getOrderStatusCounts กัน error ก่อน redirect ทำงาน)
  // try/catch fallback 0 — pattern เดียวกับ dashboard/page.tsx (ไม่ให้ layout crash จาก DB error)
  let pendingCount = 0
  if (shop?.id) {
    try {
      const counts = await getOrderStatusCounts(shop.id)
      pendingCount = counts.PENDING
    } catch (e) {
      console.error('[layout] getOrderStatusCounts failed, fallback pendingCount=0', e)
    }
  }

  // Inventory Add-on entitlement (status+package) สำหรับ menu gate (SDS §3.9)
  // fail-closed: ถ้า query error → NOT_SUBSCRIBED (แสดง badge เลือกแพ็กเกจ) ไม่ให้ layout crash
  let entitlementInfo: { status: EntitlementStatus; package: InventoryPackage | null } = {
    status: 'NOT_SUBSCRIBED',
    package: null,
  }
  if (shop?.id) {
    try {
      entitlementInfo = await getEntitlementInfo(shop.id)
    } catch (e) {
      console.error('[layout] getEntitlementInfo failed, fallback NOT_SUBSCRIBED', e)
    }
  }
  const menuItems = applyInventoryGate(sellerMenuItems, entitlementInfo)

  return (
    <VerticalLayout
      menuItems={menuItems}
      shellClassName="seller-mobile-shell"
      topbarSlot={
        <SellerMobileHeader
          shopName={shopNameForHeader}
          avatarUrl={shop?.logo ?? null}
          tierName={tierName}
          trustScore={user.trustScore ?? 0}
        />
      }
      bottomNavSlot={<SellerBottomNav pendingCount={pendingCount} />}
      sidenavFooterSlot={<OnboardingGate />}
    >
      {children}
      {/* TopUpCelebrationPoller: poll /api/wallet/events ทุก 20s
          mount ที่ layout เพื่อให้แจ้ง seller ทุก page ไม่ใช่แค่ wallet page
          'use client' component — import ตรงจาก RSC layout ได้ (Next.js 16) */}
      <TopUpCelebrationPoller />
    </VerticalLayout>
  )
}
