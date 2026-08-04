import { authOptions } from '@/lib/auth'
import { getTierLabel } from '@/lib/trust-tier'
import VerticalLayout from '@/layouts/VerticalLayout'
import { getServerSession } from 'next-auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireActiveShop } from '@/lib/shop-context'
import { resolveExpenseAccess, type ExpenseAccessDecision } from '@/services/expense-access.service'
import { sellerMenuItems, applyChatBadge, resolveVisibleSellerMenu, resolveOrderMenuLabel } from '@/lib/seller-menu'
import SellerMobileHeader from './_shared/SellerMobileHeader'
import SellerBottomNav from './_shared/SellerBottomNav'
import TopUpCelebrationPoller from './wallet/components/TopUpCelebrationPoller'
import ChatToastListener from './_shared/ChatToastListener'
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

  // Business Package sidenav card — fail-closed: query error → NOT_SUBSCRIBED
  // (pattern เดียวกับ entitlementInfo บรรทัดด้านบน — ไม่ให้ layout crash จาก DB error)
  // ข้าม query ทั้งก้อนเมื่อ active เป็นบัญชีส่วนตัว — การ์ดไม่ถูก render อยู่แล้ว (ดู sidenavHeaderSlot)
  let businessPackageStatus: BusinessPackageStatusApp = 'NOT_SUBSCRIBED'
  let businessPackageTier: BusinessPackageTier | null = null
  if (active.kind === 'BUSINESS') {
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
  }

  // feature 00027 TFR-001 — การ compose ตัวกรอง 5 ตัว (inventory/staff/expense/appointment/vertical)
  // ย้ายไปอยู่ใน resolveVisibleSellerMenu ที่ src/lib/seller-menu.ts พร้อมเหตุผลของลำดับทั้งหมด
  // เพื่อให้ shortcut.service.ts เรียกชุดเดียวกันได้ (service import จาก src/app/** ไม่ได้)
  //
  // สำคัญ: applyChatBadge ย้ายจาก "ชั้นในสุดอันดับสอง" มาเป็น "ชั้นนอกสุด" — ผลลัพธ์เท่าเดิม
  // เพราะมันแตะแค่ `seller:inbox` ซึ่งไม่มีตัวกรองไหนกรองออกเลยสักตัว badge จึงไปเกาะรายการเดิม
  // ไม่ว่าจะแปะก่อนหรือหลังกรอง — ถ้าวันหน้ามีตัวกรองที่ซ่อนเมนู "ข้อความ" ได้ ข้อสรุปนี้ตายทันที
  // ให้ย้าย applyChatBadge กลับเข้าไปก่อนตัวกรองนั้น
  // (active.kind/active.role มาจาก requireActiveShop ด้านบน — re-verify membership แล้ว ไม่ trust JWT เปล่า ๆ)
  const menuItems = applyChatBadge(
    resolveVisibleSellerMenu(sellerMenuItems, {
      entitlement: entitlementInfo,
      staff: { kind: active.kind, role: active.role },
      expense: expenseAccessDecision,
      shop: { kind: active.kind, vertical: shop.vertical },
    }),
    unreadChatCount,
  )

  // ป้ายเมนู/แท็บของ /orders ต้องเป็นคำเดียวกันทั้ง sidebar, แถบล่างมือถือ และชื่อหน้าบนมือถือ
  // (ผู้ใช้เห็นทั้งสามที่พร้อมกันได้บนจอเดียว) — คำนวณครั้งเดียวที่นี่แล้วส่งลงไปทุกทาง
  const orderLabel = resolveOrderMenuLabel(shop.vertical)

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
          orderLabel={orderLabel}
        />
      }
      bottomNavSlot={
        <SellerBottomNav
          pendingCount={pendingCount}
          unreadChatCount={unreadChatCount}
          orderLabel={orderLabel}
        />
      }
      sidenavFooterSlot={<OnboardingGate />}
      // การ์ดแพ็กเกจเป็นเรื่องของร้านแบบธุรกิจเท่านั้น — บัญชีส่วนตัวไม่มี Business Package
      // ให้พูดถึงจริง ๆ (schema ผูกกับ Business) การไม่แสดงจึงตรงความจริง ไม่ใช่การซ่อนของที่มีอยู่
      // (user เคาะ 2026-08-04). Sidenav/index.tsx เช็ค `headerSlot &&` อยู่แล้ว → ไม่มี div เปล่าค้าง
      //
      // ทุก role ของร้านธุรกิจเห็นการ์ดเหมือนกัน (user สั่ง 2026-07-29 — เดิมซ่อนจาก ADMIN แล้วพบว่าผิด:
      // พนักงานก็ควรรู้ว่าร้านอยู่แพ็กเกจไหน) ต่างแค่ canManage — เฉพาะ OWNER ที่กดไปจัดการได้
      sidenavHeaderSlot={
        active.kind === 'BUSINESS' ? (
          <ShopPackageSidenavCard
            status={businessPackageStatus}
            tier={businessPackageTier}
            canManage={active.role === 'OWNER'}
          />
        ) : undefined
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
      {/* SellerChatWidget (floating bubble มุมขวาล่าง) ถอด mount ออกตามที่ user สั่ง 2026-07-29 —
          ทับพื้นที่เดียวกับ toast แจ้งข้อความใหม่ และซ้ำกับเมนู "แชท" ที่มีอยู่แล้วทั้ง sidenav
          (desktop) และ SellerBottomNav (mobile). ไฟล์ widget ยังอยู่ในโปรเจกต์ (SellerChatWidget /
          ChatWidgetList / ChatWidgetThreadPanel) — กลับมา mount ได้ทันทีถ้าเปลี่ยนใจ */}
    </VerticalLayout>
  )
}
