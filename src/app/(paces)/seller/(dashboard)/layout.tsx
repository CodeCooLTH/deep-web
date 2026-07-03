import { authOptions } from '@/lib/auth'
import { getTierLabel } from '@/lib/trust-tier'
import VerticalLayout from '@/layouts/VerticalLayout'
import { getServerSession } from 'next-auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ensurePersonalShop, requireActiveShop } from '@/lib/shop-context'
import { sellerMenuItems, applyInventoryGate, applyChatBadge } from './_seller-menu'
import SellerMobileHeader from './_shared/SellerMobileHeader'
import SellerBottomNav from './_shared/SellerBottomNav'
import TopUpCelebrationPoller from './wallet/components/TopUpCelebrationPoller'
import ChatToastListener from './_shared/ChatToastListener'
import { getOrderStatusCounts } from '@/services/order.service'
import { getEntitlementInfo } from '@/services/inventory-entitlement.service'
import { getUnreadCountForShop } from '@/services/chat.service'
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

  // Every seller MUST have a Personal shop (invariant) — auto-create เฉพาะ PERSONAL (D1)
  await ensurePersonalShop(user.id)
  // resolve active shop (Personal หรือ Business ตาม session.activeShopId + verify membership)
  // — header/badge/pendingCount/entitlement ต้องสะท้อน "workspace ที่กำลังดูอยู่" ไม่ใช่ Personal เสมอ (P4-5)
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
  if (!active) redirect('/auth/sign-in') // ไม่ควรเกิดหลัง ensurePersonalShop
  const shop = active.shop

  // D4: active = Business ที่ยังไม่ onboard (ไม่มี slug) → บังคับไป onboarding
  // ยกเว้นเมื่อกำลังอยู่หน้า onboarding เอง (อ่าน x-pathname จาก proxy) — กัน redirect loop
  if (active.kind === 'BUSINESS' && !shop.slug) {
    const onboardingPath = `/business/${shop.id}/onboarding`
    const currentPath = (await headers()).get('x-pathname') ?? ''
    if (currentPath !== onboardingPath) redirect(onboardingPath)
  }

  // คำนวณ tier label ตาม SSOT (getTierLabel) จาก trustScore session
  const tierName = getTierLabel(user.trustScore ?? 0)
  // ชื่อร้านสำหรับ mobile header — active shop (Personal/Business)
  const shopNameForHeader = shop.shopName ?? `ร้านของ ${user.displayName}`

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
  // S-13 (feat 00011 Deep Chat) — unread chat count สำหรับ badge เมนู "ข้อความ"
  // fail-closed: query error → 0 (ไม่แสดง badge) ไม่ให้ layout crash — pattern เดียวกับ pendingCount
  let unreadChatCount = 0
  if (shop?.id) {
    try {
      unreadChatCount = await getUnreadCountForShop(shop.id)
    } catch (e) {
      console.error('[layout] getUnreadCountForShop failed, fallback unreadChatCount=0', e)
    }
  }

  const menuItems = applyChatBadge(applyInventoryGate(sellerMenuItems, entitlementInfo), unreadChatCount)

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
      {/* ChatToastListener (S-7): subscribe chat:shop:{shopId} ทุก page — mount ที่ layout
          เหมือน TopUpCelebrationPoller เพื่อให้ toast เด้งได้ไม่ว่า seller อยู่หน้าไหน */}
      <ChatToastListener shopId={shop?.id ?? null} />
    </VerticalLayout>
  )
}
