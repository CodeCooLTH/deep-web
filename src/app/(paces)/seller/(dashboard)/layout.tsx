import { authOptions } from '@/lib/auth'
import { getTierLabel } from '@/lib/trust-tier'
import VerticalLayout from '@/layouts/VerticalLayout'
import { getServerSession } from 'next-auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireActiveShop } from '@/lib/shop-context'
import { resolveExpenseAccess, type ExpenseAccessDecision } from '@/services/expense-access.service'
import {
  sellerMenuItems,
  applyInventoryGate,
  applyChatBadge,
  applyStaffMenu,
  applyExpenseMenu,
  applyVerticalMenu,
} from './_seller-menu'
import SellerMobileHeader from './_shared/SellerMobileHeader'
import SellerBottomNav from './_shared/SellerBottomNav'
import TopUpCelebrationPoller from './wallet/components/TopUpCelebrationPoller'
import ChatToastListener from './_shared/ChatToastListener'
import SellerChatWidget from './_shared/SellerChatWidget'
import { getOrderStatusCounts } from '@/services/order.service'
import { getEntitlementInfo } from '@/services/inventory-entitlement.service'
import { getUnreadCountForShop } from '@/services/chat.service'
import type { EntitlementStatus, InventoryPackage } from '@/lib/inventory-addon'
import OnboardingGate from './dashboard/components/OnboardingGate'
import { getSubscriptionStatus } from '@/services/business-package.service'
import type { BusinessPackageStatusApp, BusinessPackageTier } from '@/lib/business-package'
import ShopPackageSidenavCard from './_shared/ShopPackageSidenavCard'

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

  // feature 00012 (Lazy Personal shop): เลิก auto-create Personal shop — ผู้ถูกเชิญ (ADMIN business)
  // เข้ามาโดยไม่มีร้านของตัวเอง. resolve active shop (Personal หรือ Business ตาม session.activeShopId +
  // verify membership) — header/badge/pendingCount/entitlement สะท้อน "workspace ที่กำลังดูอยู่"
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
  // ไม่มี active เลย (nobody: ไม่มีทั้ง Personal + business membership) → /choose-shop ให้เลือก "เปิดร้าน"
  if (!active) redirect('/choose-shop')
  const shop = active.shop

  // x-pathname (proxy ตั้งไว้) — ใช้กัน redirect loop ของ onboarding เท่านั้น
  const currentPath = (await headers()).get('x-pathname') ?? ''

  // D4: active = Business ที่ยังไม่ onboard (ไม่มี slug) → บังคับไป onboarding
  // ยกเว้นเมื่อกำลังอยู่หน้า onboarding เอง — กัน redirect loop
  if (active.kind === 'BUSINESS' && !shop.slug) {
    const onboardingPath = `/business/${shop.id}/onboarding`
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

  // feature 00016 (Expense & Cost Tracking, Unit 5A) — decision สำหรับเมนู "ค่าใช้จ่าย" (badge/ซ่อน)
  // fail-closed: query error → ถือเป็น NO_SHOP (ซ่อนเมนูสนิท ปลอดภัยสุด — enforcement จริงอยู่ที่
  // resolveExpenseAccess() ใน ExpensesPage เองอยู่แล้ว นี่แค่ UX hint) ไม่ให้ layout crash
  let expenseAccessDecision: ExpenseAccessDecision = { kind: 'NO_SHOP' }
  try {
    expenseAccessDecision = await resolveExpenseAccess(
      session as unknown as { user: { id: string; activeShopId?: string | null } },
    )
  } catch (e) {
    console.error('[layout] resolveExpenseAccess failed, fallback NO_SHOP (hide menu)', e)
  }

  // Business Package sidenav card — ownerId = session user ไม่ใช่ active shop (Business Package
  // ผูกกับบัญชีเจ้าของ ไม่ใช่ร้าน — มิเรอร์ business/page.tsx:51). fail-closed: query error → NOT_SUBSCRIBED
  // (pattern เดียวกับ entitlementInfo บรรทัดด้านบน — ไม่ให้ layout crash จาก DB error)
  let businessPackageStatus: BusinessPackageStatusApp = 'NOT_SUBSCRIBED'
  let businessPackageTier: BusinessPackageTier | null = null
  try {
    // ต้อง resolve จาก "เจ้าของร้านที่กำลังเปิดอยู่" (shop.userId) ไม่ใช่ session user —
    // การ์ดเขียนว่า "แพ็กเกจร้านค้า" ถ้าใช้ user.id สมาชิก ADMIN ของร้าน Business จะเห็น
    // แพ็กเกจ "ส่วนตัวของตัวเอง" แทนของร้าน (bug ที่เจอ 2026-07-29 ตอนเปิดให้ทุก role เห็น)
    // มิเรอร์ isOwnerPaidPlan(shopId) ใน ai-suggest-quota.service ที่ resolve แบบเดียวกัน
    const subscription = await getSubscriptionStatus(shop.userId)
    if (subscription) {
      businessPackageStatus = subscription.status as BusinessPackageStatusApp
      businessPackageTier = subscription.tier as BusinessPackageTier
    }
  } catch (e) {
    console.error('[layout] getSubscriptionStatus failed, fallback NOT_SUBSCRIBED', e)
  }

  // feature 00012 (Task 4.3) — applyStaffMenu ซ่อนเมนู "พนักงาน" ให้เห็นเฉพาะ owner ของ Business shop
  // (active.kind/active.role มาจาก requireActiveShop ด้านบน — re-verify membership แล้ว ไม่ trust JWT เปล่า ๆ)
  // feature 00016 — applyExpenseMenu ซ่อน/ติด badge เมนู "ค่าใช้จ่าย" ตามสิทธิ์+แพ็กเกจ
  // feature 00017 — applyVerticalMenu กรองเมนูตามประเภทกิจการ (ห้องพัก vs สินค้า/สต็อก/ประมูล)
  //
  // ลำดับสำคัญ: applyVerticalMenu อยู่ "ชั้นนอกสุด" โดยตั้งใจ — กรองหลัง gate อื่นทุกตัว
  // เพื่อไม่ให้ badge/disable ที่ gate ชั้นในติดไว้ ไปโผล่บนเมนูที่ควรถูกซ่อนไปแล้ว
  // (เช่น badge "เลือกแพ็กเกจ" ของสต็อก ต้องไม่โผล่ในร้านบ้านพักที่ไม่มีเมนูสต็อกเลย)
  const menuItems = applyVerticalMenu(
    applyExpenseMenu(
      applyStaffMenu(
        applyChatBadge(applyInventoryGate(sellerMenuItems, entitlementInfo), unreadChatCount),
        { kind: active.kind, role: active.role },
      ),
      expenseAccessDecision,
    ),
    shop.vertical,
  )

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
      bottomNavSlot={<SellerBottomNav pendingCount={pendingCount} unreadChatCount={unreadChatCount} />}
      sidenavFooterSlot={<OnboardingGate />}
      // ทุก role เห็นการ์ดเหมือนกัน (user สั่ง 2026-07-29 — เดิมซ่อนจาก ADMIN แล้วพบว่าผิด:
      // พนักงานก็ควรรู้ว่าร้านอยู่แพ็กเกจไหน) ต่างแค่ canManage — เฉพาะ OWNER ที่กดไปจัดการได้
      sidenavHeaderSlot={
        <ShopPackageSidenavCard
          status={businessPackageStatus}
          tier={businessPackageTier}
          canManage={active.role === 'OWNER'}
        />
      }
    >
      {children}
      {/* TopUpCelebrationPoller: poll /api/wallet/events ทุก 20s
          mount ที่ layout เพื่อให้แจ้ง seller ทุก page ไม่ใช่แค่ wallet page
          'use client' component — import ตรงจาก RSC layout ได้ (Next.js 16) */}
      <TopUpCelebrationPoller />
      {/* ChatToastListener (S-7): subscribe chat:shop:{shopId} ทุก page — mount ที่ layout
          เหมือน TopUpCelebrationPoller เพื่อให้ toast เด้งได้ไม่ว่า seller อยู่หน้าไหน */}
      <ChatToastListener shopId={shop?.id ?? null} />
      {/* SellerChatWidget (ChatWidget task, feat 00011 Deep Chat): floating bubble+panel
          มุมขวาล่าง แสดงเฉพาะ ≥lg (mobile ใช้ SellerBottomNav "แชท" แทน) — mount ที่ layout
          เหมือนกัน เพื่อ persist state ข้าม client-navigation (OQ3) */}
      <SellerChatWidget initialUnreadCount={unreadChatCount} />
    </VerticalLayout>
  )
}
