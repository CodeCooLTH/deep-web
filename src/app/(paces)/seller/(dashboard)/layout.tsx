import { authOptions } from '@/lib/auth'
import { getTierLabel } from '@/lib/trust-tier'
import VerticalLayout from '@/layouts/VerticalLayout'
import { getServerSession } from 'next-auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireActiveShop } from '@/lib/shop-context'
import { CanTopUpProvider } from '@/components/paces/PaymentRestrictionProvider'
import { isShopOwnerRole } from '@/lib/shop-owner'
import { resolveOrderVocab, resolveProductVocab } from '@/lib/seller-menu'
import { getT } from '@/i18n/server'
import { can, effectiveRoles } from '@/lib/shop-permissions'
import { bottomNavHiddenPages, resolveMobileNav } from '@/lib/role-nav'
import { resolveSellerMenuItems } from '@/lib/seller-menu-server'
import SellerMobileHeader from './_shared/SellerMobileHeader'
import SellerBottomNav from './_shared/SellerBottomNav'
import TopUpCelebrationPoller from './wallet/components/TopUpCelebrationPoller'
import IapRecoveryListener from './_shared/IapRecoveryListener'
import { getOrderStatusCounts } from '@/services/order.service'
import { getUnreadCountForShop } from '@/services/chat.service'
import { countUnackedAlerts } from '@/services/line-report-access.service'
import { sessionUserId } from '@/lib/session-user'
import OnboardingGate from './dashboard/components/OnboardingGate'
import { getSubscriptionStatus } from '@/services/business-package.service'
import type { BusinessPackageStatusApp, BusinessPackageTier } from '@/lib/business-package'
import { shouldHidePaidFeatures, shouldOfferIap, shouldHidePayments } from '@/lib/app-shell-server'
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

  /**
   * ธุรกิจที่ยังไม่มี slug — **ไม่บังคับให้ไปตั้งก่อนใช้งาน** (user เคาะ 2026-08-05)
   *
   * เดิม layout นี้ force-redirect ไปหน้า setup ทุก route จนกว่าจะตั้ง slug เสร็จ ซึ่ง:
   *   - เป็นด่านที่ขวางงานจริงทั้งหมดเพื่อของที่ไม่จำเป็นต่อการขายหน้าร้าน
   *   - และเพราะปลายทางอยู่ใต้ layout ตัวเดียวกัน มันเคยกลายเป็นลูปไม่รู้จบมาแล้ว (ERR_TOO_MANY_REDIRECTS)
   *
   * ของใหม่: slug จำเป็นเฉพาะตอน "อยากมีหน้าร้านสาธารณะ" (/b/{slug}) เท่านั้น — ไม่มีก็ทำงาน
   * ในระบบได้ครบ แค่ยังไม่มีลิงก์ให้ลูกค้าเปิด ผู้ใช้ไปตั้งเองได้ที่หน้าตั้งค่าธุรกิจเมื่อพร้อม
   * (ธุรกิจที่สร้างผ่าน wizard ใหม่มี slug มาตั้งแต่ต้นอยู่แล้ว เงื่อนไขนี้จึงเจอเฉพาะร้านเก่า)
   */

  // คำนวณ tier label ตาม SSOT (getTierLabel) จาก trustScore session
  const tierName = getTierLabel(user.trustScore ?? 0)
  // ชื่อร้านสำหรับ mobile header — active shop (Personal/Business)
  const shopNameForHeader = shop.shopName ?? `ร้านของ ${user.displayName}`

  /**
   * 00071 P3 · S-16: บทบาทที่ "มีผลจริง" ของผู้ดูในร้านนี้ — คำนวณครั้งเดียวแล้วใช้ตัดสินทั้งแถบล่าง/แชท/เมนู
   * (กฎ PERSONAL=เจ้าของ · BILLING ในร้านที่ขายบริการไม่ได้ถูกตัด อยู่ที่ effectiveRoles ที่เดียว)
   */
  const roles = effectiveRoles({ kind: active.kind, vertical: shop.vertical }, active.role, active.roles)
  // ป้ายเมนู/แท็บของ /orders ต้องเป็นคำเดียวกันทั้ง sidebar, แถบล่างมือถือ และชื่อหน้าบนมือถือ
  // (ผู้ใช้เห็นทั้งสามที่พร้อมกันได้บนจอเดียว) — คำนวณครั้งเดียวที่นี่แล้วส่งลงไปทุกทาง
  const orderVocab = resolveOrderVocab(shop.vertical)
  const nav = resolveMobileNav(roles, { kind: active.kind, vertical: shop.vertical }, orderVocab, await getT())
  const navHidden = bottomNavHiddenPages(roles)

  // pendingCount สำหรับ SellerBottomNav badge — ดึงเฉพาะเมื่อ shop มี id
  // (shop อาจเป็น null เมื่อเพิ่ง auto-create → skip getOrderStatusCounts กัน error ก่อน redirect ทำงาน)
  // try/catch fallback 0 — pattern เดียวกับ dashboard/page.tsx (ไม่ให้ layout crash จาก DB error)
  let pendingCount = 0
  if (shop?.id && nav.tabs.some((tb) => tb.badge === 'pending')) {
    try {
      const counts = await getOrderStatusCounts(shop.id)
      pendingCount = counts.PENDING
    } catch (e) {
      console.error('[layout] getOrderStatusCounts failed, fallback pendingCount=0', e)
    }
  }

  // S-13 (feat 00011 Deep Chat) — unread chat count สำหรับ badge เมนู "ข้อความ"
  // fail-closed: query error → 0 (ไม่แสดง badge) ไม่ให้ layout crash — pattern เดียวกับ pendingCount
  // 00071: คำนวณเฉพาะบทบาทที่มี H1 (แชท) — ช่าง/เปิดบิลไม่มีช่องแชท ไม่ควรเสีย query และไม่ควรได้ตัวเลขข้อความลูกค้า
  const canChat = can(roles, 'H1')
  let unreadChatCount = 0
  if (shop?.id && canChat) {
    try {
      unreadChatCount = await getUnreadCountForShop(shop.id)
    } catch (e) {
      console.error('[layout] getUnreadCountForShop failed, fallback unreadChatCount=0', e)
    }
  }

  // feature 00070 — จุดแดงที่แท็บ "ร้านค้า": กลุ่มรายงาน LINE ของ *เจ้าของ* ที่ alert ยังไม่รับทราบ
  // ผูกกับ User (ไม่ใช่ shop.userId) · fail-closed → false ไม่ให้ layout crash · ไม่ใช่เจ้าของ = นับได้ 0 เอง
  let shopAlert = false
  const reportOwnerId = sessionUserId(session)
  if (reportOwnerId) {
    try {
      shopAlert = (await countUnackedAlerts(reportOwnerId)) > 0
    } catch (e) {
      console.error('[layout] countUnackedAlerts failed, fallback shopAlert=false', e)
    }
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

  /**
   * เปิดจากในแอป iOS → ต้องไม่มีช่องทาง/คำเชิญให้จ่ายเงินทั้ง sidebar และการ์ดเหนือเมนู
   * (App Store Guideline 3.1.1 — rejection 2026-08-04) ดูเหตุผลเต็มที่ src/lib/app-shell.ts
   */
  const hidePayments = await shouldHidePayments()

  /**
   * เมนูฝั่งร้าน — ลำดับการ compose ตัวกรอง/badge/คำแปลทั้งหมดย้ายไปอยู่ที่
   * `src/lib/seller-menu-server.ts` (2026-08-25) เพื่อให้ `(chat)/layout.tsx` ซึ่งต้องมีเมนู
   * ของตัวเองด้วย (ChatNavRail) เรียก **ชุดเดียวกัน** ได้ ไม่ใช่ก็อปลำดับไปวางอีกที่
   * — เมนูสองชุดที่กรองคนละกฎ = permission drift ที่ `seller-menu.ts` เตือนไว้เองว่าเป็น
   * ความเสี่ยงอันดับ 1 และไม่มี gate ไหนจับได้ (ทั้งสองชุด "ถูก" ในตัวเอง)
   *
   * (active.kind/active.role มาจาก requireActiveShop ด้านบน — re-verify membership แล้ว
   * ไม่ trust JWT เปล่า ๆ) `unreadChatCount`/`hidePayments` ส่งเข้าไปเพราะที่นี่ใช้กับของอื่นด้วย
   * (SellerBottomNav / การ์ดแพ็กเกจ) จะได้ไม่ต้องถามซ้ำสองรอบต่อ request
   */
  const menuItems = await resolveSellerMenuItems({
    session: session as unknown as { user: { id: string; activeShopId?: string | null } },
    shopId: shop?.id ?? null,
    kind: active.kind,
    role: active.role,
    roles: active.roles,
    vertical: shop.vertical,
    unreadChatCount,
    hidePayments,
    // เจ้าของหลักของร้านนี้ (T4) — requireActiveShop อ่านแถวร้านมาแล้ว ไม่ต้อง query ซ้ำในตัวประกอบเมนู
    isPrimaryOwner: active.shop.userId === user.id,
    hidePaidFeatures: await shouldHidePaidFeatures(),
    offerIap: await shouldOfferIap(),
  })

  // 00071 F3: ผู้ไม่ใช่เจ้าของเติมเงินไม่ได้ — ปุ่ม/ข้อความ "เครดิตไม่พอ" ทั้งโซนอ่านจาก context นี้
  return (
    <CanTopUpProvider canTopUp={isShopOwnerRole(active.role, active.roles)}>
    <VerticalLayout
      menuItems={menuItems}
      shellClassName="seller-mobile-shell"
      topbarSlot={
        <SellerMobileHeader
          shopName={shopNameForHeader}
          avatarUrl={shop?.logo ?? null}
          tierName={tierName}
          trustScore={user.trustScore ?? 0}
          orderLabel={orderVocab.noun}
          productLabel={resolveProductVocab(shop.vertical).productNoun}
        />
      }
      bottomNavSlot={
        <SellerBottomNav
          nav={nav}
          pendingCount={pendingCount}
          unreadChatCount={unreadChatCount}
          shopAlert={shopAlert}
          hideOnOrderDetail={navHidden.orderDetail}
          hideOnQueues={navHidden.queues}
        />
      }
      sidenavFooterSlot={<OnboardingGate vertical={shop.vertical} />}
      // การ์ดแพ็กเกจเป็นเรื่องของร้านแบบธุรกิจเท่านั้น — บัญชีส่วนตัวไม่มี Business Package
      // ให้พูดถึงจริง ๆ (schema ผูกกับ Business) การไม่แสดงจึงตรงความจริง ไม่ใช่การซ่อนของที่มีอยู่
      // (user เคาะ 2026-08-04). Sidenav/index.tsx เช็ค `headerSlot &&` อยู่แล้ว → ไม่มี div เปล่าค้าง
      //
      // ทุก role ของร้านธุรกิจเห็นการ์ดเหมือนกัน (user สั่ง 2026-07-29 — เดิมซ่อนจาก ADMIN แล้วพบว่าผิด:
      // พนักงานก็ควรรู้ว่าร้านอยู่แพ็กเกจไหน) ต่างแค่ canManage — เฉพาะ OWNER ที่กดไปจัดการได้
      // 🛑 ในแอป iOS ไม่แสดงการ์ดนี้เลย: มันบอกแพ็กเกจปัจจุบันและกดไปหน้าจัดการ/อัปเกรดได้
      //    = ทั้ง "ราคา/ระดับที่ซื้อได้" และ "ลิงก์ไปหน้าจ่ายเงิน" ในใบเดียว
      sidenavHeaderSlot={
        active.kind === 'BUSINESS' && !hidePayments ? (
          <ShopPackageSidenavCard
            status={businessPackageStatus}
            tier={businessPackageTier}
            // แพ็กเกจเป็นของเจ้าของหลัก — เจ้าของร่วมกดไปก็เจอหน้าแพ็กเกจของตัวเอง ไม่ใช่ของร้านนี้ (EXT 00012 BR-MR-08)
            canManage={active.shop.userId === user?.id}
          />
        ) : undefined
      }
    >
      {children}
      {/* TopUpCelebrationPoller: poll /api/wallet/events ทุก 20s
          mount ที่ layout เพื่อให้แจ้ง seller ทุก page ไม่ใช่แค่ wallet page
          'use client' component — import ตรงจาก RSC layout ได้ (Next.js 16) */}
      {/* 00071 F3: ผู้ไม่ใช่เจ้าของโดน 403 จาก /api/wallet/events อยู่แล้ว — ไม่ mount ให้ poll ฟรี ๆ */}
      {isShopOwnerRole(active.role, active.roles) && <TopUpCelebrationPoller />}
      {/* ChatToastListener (S-7, toast "ข้อความใหม่" มุมขวาล่าง) ถอด mount ออกตามที่ user สั่ง
          2026-10-10 — ไฟล์ยังอยู่ กลับมา mount ได้ทันทีถ้าเปลี่ยนใจ (ถ้าใส่คืนต้องคง `canChat &&` ของ 00071
          ไว้ — ช่าง/เปิดบิลไม่ควรได้ toast ข้อความลูกค้า) · ตัวเลขยังไม่อ่านในเมนูแชทมาจาก DB ไม่ได้พึ่ง
          ตัวนี้ และแจ้งเตือนเด้งเข้ามือถือ (seller-push.service) เป็นอีกเส้นทาง ไม่กระทบ */}
      {/* IapRecoveryListener (00064): รับธุรกรรม Apple ที่ค้างจากรอบก่อนแล้วเปิดสิทธิ์ให้เอง
          — mount ที่ layout เพราะคนที่จ่ายเงินแล้วสิทธิ์ไม่เปิดจะไม่เดินกลับไปหน้าแพ็กเกจเอง
          บนเบราว์เซอร์ปกติตัวนี้ไม่แขวน listener ใด ๆ (ไม่มี ReactNativeWebView) */}
      {/* เฉพาะเปลือกที่มี IAP (iOS) — Android ไม่มีการซื้อในแอป (2026-10-01) */}
      {(await shouldOfferIap()) && <IapRecoveryListener />}
      {/* SellerChatWidget (floating bubble มุมขวาล่าง) ถอด mount ออกตามที่ user สั่ง 2026-07-29 —
          ทับพื้นที่เดียวกับ toast แจ้งข้อความใหม่ และซ้ำกับเมนู "แชท" ที่มีอยู่แล้วทั้ง sidenav
          (desktop) และ SellerBottomNav (mobile). ไฟล์ widget ยังอยู่ในโปรเจกต์ (SellerChatWidget /
          ChatWidgetList / ChatWidgetThreadPanel) — กลับมา mount ได้ทันทีถ้าเปลี่ยนใจ */}
    </VerticalLayout>
    </CanTopUpProvider>
  )
}
