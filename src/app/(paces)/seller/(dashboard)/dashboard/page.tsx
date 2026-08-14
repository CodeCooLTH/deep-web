/**
 * Seller Dashboard — ภาพรวมร้านค้า
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx
 *
 * Widget mapping (per docs/system/ui-guideline/seller/page-sourcing.md):
 *  - UserCard          → kept, รับ shopName + trustScore จาก server
 *  - StatisticCard     → kept, map orders/revenue/trust score (x3)
 *  - AchievementLevel  → kept (compose-from StatisticCard shell), แทนที่ WeeklyPerformanceInsights
 *  - SalesReport       → kept, Thai copy, headline stats เป็น 0 (honest-zero)
 *  - RecentOrder       → kept, Thai copy
 *
 *  DROPPED (ไม่อยู่ใน keep-list ของ page-sourcing.md + ไม่มี real data source ใน MVP):
 *  - StorePerformanceOverview (fake channel donut, Math.random refresh)
 *  - TopSellingProducts (12 Paces furniture fixtures, USD prices)
 *  - RecentActivity (fake English platform events, ไม่มี activity-log model)
 *  - RevenueByLocation (ไม่มี geo data)
 *  - WeeklyPerformanceInsights (ไม่มีใน SafePay schema)
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
// filter วันนี้/เดือนนี้ ระดับหน้า (desktop) — อ่านจาก cookie ตอน SSR เพื่อ render ช่วงที่ user
// เลือกไว้ตั้งแต่ paint แรก (requirement: "ทุกครั้งที่เปิดหน้านี้ให้ filter แบบนั้นเสมอ")
import { cookies } from 'next/headers'
import {
  DashboardRangeProvider,
  DashboardRangePills,
  DashboardRangeFade,
  type DashboardRange,
} from './components/DashboardRangeControl'
import { authOptions } from '@/lib/auth'
import { shouldHidePayments } from '@/lib/app-shell-server'
import { prisma } from '@/lib/prisma'
import { requireActiveShop } from '@/lib/shop-context'
import { toFileUrl } from '@/lib/file-url'
import { getTrustLevel } from '@/services/trust-score.service'
import { getOrdersByShop, getOrderStatusCounts, getShippingStageCounts } from '@/services/order.service'
import { countsAsRevenue } from '@/lib/order-revenue'
import { getBestSellerProducts } from '@/services/product.service'
// คำที่ผันตามประเภทกิจการ (ORDER_VOCAB/PRODUCT_VOCAB) — SSOT เดียวของทั้งระบบ
import { resolveOrderVocab } from '@/lib/seller-menu'
// นัดวันนี้ (feature 00024) — ตัวกั้น + ตัวนับ สำหรับไทล์ที่ 2 ของ OrderStatusBand
import { canUseAppointments } from '@/lib/appointments'
import { getTodayAppointmentCount } from '@/services/appointment.service'
import type { Metadata } from 'next'
import { getT } from '@/i18n/server'
import { byVertical } from '@/i18n/vertical'
import { getServerSession } from 'next-auth'
import RecentOrder from './components/RecentOrder'
import SalesReport from './components/SalesReport'
import StatisticCard from './components/StatisticCard'
import UserCard from './components/UserCard'
import AchievementLevel from './components/AchievementLevel'
import { getBadgeProgress, toBadgeScope } from '@/services/badge.service'
import type { BadgeProgress } from '@/types/badge'
import type { StatType } from './components/StatisticCard'
import type { SalesSeriesPoint, SalesSummary } from './components/SalesReport'
import type { OrderType } from './components/data'
import CommandCenter from './components/CommandCenter'
import OrderStatusBand from './components/OrderStatusBand'
import { PROMO_BANNER } from './_constants/command-center'
// v8: ดึง wallet balance + tier label เพิ่มใน CommandCenterData (S-6/S-8)
import { getBalance } from '@/services/wallet.service'
import { getTierLabel } from '@/lib/trust-tier'
// v10: review count + avg rating สำหรับ stats row ใน CompactHero (S-8)
import { getAvgRatingByUsername } from '@/services/review.service'
// Sales Chart (feature Quick Create + Sales Chart) — ยอดขายรายวันเดือนปัจจุบัน สำหรับการ์ด mini + full sheet
// alias กัน shadow ชื่อกับ SalesSeriesPoint/salesSeries (desktop SalesReport) ที่มีอยู่แล้วในไฟล์นี้
import { getSalesSeries } from '@/services/dashboard.service'
// ค่าใช้จ่าย/กำไรสุทธิบนการ์ดยอดขาย (feature 00016) มี gate สิทธิ์ของตัวเอง — ต้องเช็คก่อนขอข้อมูล
import { resolveExpenseAccess } from '@/services/expense-access.service'
import { resolveShortcutState } from '@/services/shortcut.service'
import type { ShortcutCatalogItemDto } from './_constants/command-center'
import type { SalesSeries as SalesChartSeries } from '@/services/dashboard.service'
// แถบแพ็กเกจร้านค้าบนมือถือ (Row 3 ของ CompactHero) — RSC layout ไม่ส่ง prop ให้ page ได้ ต้อง fetch ซ้ำ
// (query เล็ก ยอมรับได้ — ห้าม refactor เป็น context/global ตาม Controller decision)
import { getSubscriptionStatus } from '@/services/business-package.service'
import type { BusinessPackageStatusApp, BusinessPackageTier } from '@/lib/business-package'
// การ์ดเดสก์ท็อปที่ดึงกลับมา 2026-08-05 (เคยถูกตัดตั้งแต่ยุค MVP ด้วยเหตุผล "ยังไม่มีข้อมูลจริง"
// ซึ่งหมดอายุไปแล้ว — ตอนนี้ทุกใบมี service ป้อนข้อมูลจริงครบ ดูตารางใน mockup ที่ user อนุมัติ
// docs/superpowers/specs/2026-08-05-seller-dashboard-desktop-mockup.html)
import { getSalesChannelBreakdown, getProvinceSales } from '@/services/dashboard.service'
import type { SalesChannelSlice, ProvinceSales } from '@/services/dashboard.service'
import { getRecentActivity, type ActivityItem } from '@/services/activity.service'
import SalesChannelDonut from './components/SalesChannelDonut'
import TopSellingProducts from './components/TopSellingProducts'
import RecentActivityFeed from './components/RecentActivityFeed'
import ProvinceSalesMap from '@/components/safepay/ProvinceSalesMap'

/**
 * ชื่อแท็บเบราว์เซอร์ต้องตามภาษาที่ผู้ใช้เลือกด้วย ⇒ ต้องเป็น `generateMetadata` (async)
 * ไม่ใช่ `const metadata` ซึ่งถูกประเมินตอน build ครั้งเดียวและไม่เห็น request
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t.dashboard.metaTitle }
}

/** PDPA masking — แสดงเฉพาะ 4 ตัวท้าย ปิดส่วนที่เหลือด้วย bullet
 *  คัดลอก logic จาก customers/page.tsx และ orders/[token]/components/CustomerDetails.tsx
 *  เพื่อความสม่ำเสมอ (S5-pdpafix)
 */
function maskContact(c: string | null | undefined, unknownLabel: string): string {
  if (!c || c.length <= 4) return c ?? unknownLabel
  return '•'.repeat(Math.max(0, c.length - 4)) + c.slice(-4)
}

// tailwind text-color class ต่อ trust level
const LEVEL_COLOR: Record<string, string> = {
  'A+': 'text-success',
  'A':  'text-success',
  'B+': 'text-primary',
  'B':  'text-primary',
  'C':  'text-warning',
  'D':  'text-danger',
}

// stat card data รับ live values จากนั้น fallback 0 ถ้ายังไม่มี session

export default async function SellerDashboardPage() {
  // filter ช่วงเวลา (desktop) — ค่าที่ไม่รู้จัก/ไม่มี cookie ตกเป็น 'month' (พฤติกรรมเดิมของหน้า)
  const range: DashboardRange =
    (await cookies()).get('seller_dashboard_range')?.value === 'today' ? 'today' : 'month'
  const t = await getT()
  const rangeLabel = range === 'today' ? t.dashboard.rangeToday : t.dashboard.rangeMonth
  // รูปเดียวกันแต่ใช้กลางประโยค ("today" ไม่ใช่ "Today") — ใช้กับ empty state ของโดนัท
  const rangeLabelInline = range === 'today' ? t.dashboard.rangeTodayInline : t.dashboard.rangeMonthInline

  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id?: string; trustScore?: number; name?: string; needsOnboarding?: boolean; needsPhoneVerify?: boolean; displayName?: string } } | null)?.user

  // ─── badge + trust score data (server-side) ─────────────────────────────────
  let earnedBadges: BadgeProgress[] = []
  let topInProgress: BadgeProgress[] = []
  let score = 0
  let level = 'D'
  let levelColor = 'text-danger'
  let shopName = t.dashboard.shopFallback
  // ออเดอร์ล่าสุดสำหรับ RecentOrder widget (real data)
  let recentOrders: OrderType[] = []
  // stat counters — คำนวณจาก rawOrders ที่ fetch ครั้งเดียว (ไม่ duplicate query)
  // orderCount = ตลอดชีพ (มือถือ CompactHero + SalesReport summary ใช้ — ห้ามเปลี่ยนความหมาย)
  let orderCount = 0
  let revenueK = 0
  // ตัวเลข stat card เดสก์ท็อปตาม filter วันนี้/เดือนนี้ — กรองจาก rawOrders ก้อนเดียวกันด้วย JS
  let rangeOrderCount = 0
  let rangeRevenueK = 0
  // monthly series สำหรับ SalesReport chart
  let salesSeries: SalesSeriesPoint[] = []
  let salesSummary: SalesSummary = { totalRevenue: 0, totalOrders: 0, growth: null }

  // ─── Command Center data (mobile) ───────────────────────────────────────────
  // avatarUrl: shop.logo → fallback user.avatar → null (SellerHeader แสดงอักษรย่อเมื่อ null)
  let avatarUrl: string | null = null
  // orderStatusCounts: นับ order ต่อ status สำหรับ OrderStatusTimeline
  // fallback = 0 ทุก bucket ถ้า fetch ล้ม (ตาม plan Error Handling)
  let orderStatusCounts = { PENDING: 0, SHIPPED: 0, CONFIRMED: 0, CANCELLED: 0 }
  // ตัวนับ "ของอยู่ไหน" — เฉพาะร้านขายออนไลน์ (user สั่ง 2026-08-04); undefined = การ์ดใช้ชุดเดิม
  let shippingStageCounts: { AWAITING_PARCEL: number; AWAITING_PICKUP: number; SHIPPING: number; AWAITING_COD: number; PROBLEM: number } | undefined
  // จำนวนนัดวันนี้ — เฉพาะร้านที่ใช้ระบบคิวงานได้ (SERVICE_QUEUE); undefined = ไทล์ที่ 2 คงเป็น "กำลังจัดส่ง"
  let appointmentTodayCount: number | undefined
  // คำที่ผันตามประเภทกิจการ — resolve ที่นี่ที่เดียวแล้วส่งลง CommandCenter
  // ประกาศไว้ชั้นนอกเพราะ `shop` เป็น block-scoped อยู่ใน try ด้านล่าง แต่ต้องใช้ตอน render
  // ทั้งก้อนเป็นสตริงล้วน จึงส่งข้ามเส้น server→client ได้ (ต่างจาก ProductVocab ที่มีฟังก์ชัน)
  let orderVocab = resolveOrderVocab('ONLINE_SALES')
  let orderNoun = orderVocab.noun
  // ส่ง vertical ดิบลงไปให้ BestSellerStrip ('use client') resolve เอง — ProductVocab มีฟังก์ชัน
  // อยู่ข้างใน ส่งทั้งก้อนข้ามเส้น server→client ไม่ได้ (พังจริงบน prod 2026-08-07)
  let shopVertical = 'ONLINE_SALES'
  // v8: walletBalance สำหรับ WalletCard — fallback 0 ถ้า fetch ล้ม (pattern เดียวกับ getOrderStatusCounts)
  let walletBalance = 0
  // สินค้าขายดี (feature Quick Create) — strip บน command center จิ้ม→/orders/new?product=; fallback []
  let bestSellers: { id: string; name: string; price: number; image: string | null; soldCount: number }[] = []
  // v10: CompactHero — shop link (slug) + stats row (orders/reviews/rating); honest-zero ถ้าล้ม
  let shopSlug: string | null = null
  let reviewCount = 0
  let avgRating = 0
  // D#13: จำนวน auction สถานะ live ของร้าน — badge บน tile "ประมูล" ใน CarouselGrid
  let liveAuctionCount = 0
  // Sales Chart (mobile command center) — ยอดขายรายวันเดือนปัจจุบัน; null = fetch ล้ม → การ์ดซ่อนตัวเอง
  let mobileSalesSeries: SalesChartSeries | null = null
  // แถบแพ็กเกจร้านค้าบนมือถือ (Row 3 ของ CompactHero) — resolve จาก "เจ้าของร้านที่เปิดอยู่"
  // (shop.userId) ไม่ใช่ session user: สมาชิก ADMIN ของร้าน Business จะเห็นแพ็กเกจส่วนตัวของตัวเอง
  // แทนของร้าน (bug 2026-07-29) — จึงต้องรอ requireActiveShop ก่อน ดูจุด fetch ด้านล่าง
  let packageStatus: BusinessPackageStatusApp = 'NOT_SUBSCRIBED'
  let packageTier: BusinessPackageTier | null = null
  // canManage: เฉพาะ OWNER ที่กดไปหน้าจัดการแพ็กเกจได้ — คนอื่นเห็นข้อมูลเหมือนกันแต่ไม่มีลิงก์
  let packageCanManage = false
  // เมนูลัด (feature 00027) — undefined = ยังไม่ได้ resolve/ไม่ผ่าน gate ร้าน → การ์ดซ่อนตัวเอง
  let shortcutTiles: ShortcutCatalogItemDto[] | undefined

  // ─── การ์ดเดสก์ท็อปที่ดึงกลับ 2026-08-05 (ทั้งหมดเป็นข้อมูล "เดือนนี้" ชุดเดียวกัน) ────────
  // ช่องทางการขาย: [] = ยังไม่มีออเดอร์เดือนนี้ หรือ fetch ล้ม → การ์ดขึ้น empty state (honest-zero)
  let salesChannels: SalesChannelSlice[] = []
  // กิจกรรมล่าสุด: service รวม 5 แหล่งและ mask PII ให้แล้วก่อนข้าม RSC boundary
  let recentActivity: ActivityItem[] = []
  // ยอดขายรายจังหวัด: undefined = ร้านไม่ใช่ประเภทขายออนไลน์ หรือ fetch ล้ม → ไม่ render การ์ดแผนที่
  // (user เคาะ 2026-08-05: ร้านขายหน้าร้านไม่ต้องมี panel นี้เลย ไม่ใช่โชว์การ์ดว่าง)
  let provinceSales: ProvinceSales | undefined

  if (user?.id) {
    score = user.trustScore ?? 0
    level = getTrustLevel(score)
    levelColor = LEVEL_COLOR[level] ?? 'text-primary'

    try {
      // ดึง active shop (Personal หรือ Business ตาม session.activeShopId) — id/shopName/logo/slug ทุก
      // downstream query (orders/balance/activity/rating/liveAuction) ต้อง scope ด้วย active shop.id นี้
      const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
      const shop = active?.shop ?? null

      // 🛑 คะแนนบนการ์ด "ระดับความสำเร็จ" ต้องเป็นของร้านที่เปิดอยู่ ไม่ใช่ของคนที่ล็อกอิน
      // เหรียญของร้าน BUSINESS เขียนคะแนนลง `Shop.trustScore` (recalculateShopTrustScore) แต่
      // วงนี้อ่าน `user.trustScore` มาตลอด ⇒ ร้าน BUSINESS ปลดล็อกเหรียญแล้ว **ไม่มีตัวเลขไหน
      // บนแดชบอร์ดขยับเลย** — คลาสเดียวกับบั๊กรายการเหรียญที่แก้ไปในคอมมิตเดียวกันนี้ แค่ย้าย
      // จาก "รายการ" มาอยู่ที่ "คะแนน" (impeccable critique 2026-08-09 P0)
      // PERSONAL คงเดิม: `Shop.trustScore` ของร้านส่วนตัวเป็น 0 เสมอตามดีไซน์ (ดู schema.prisma)
      // แพตเทิร์นเดียวกับ public-profile/builder/page.tsx:184
      if (active?.kind === 'BUSINESS') {
        score = shop?.trustScore ?? 0
        level = getTrustLevel(score)
        levelColor = LEVEL_COLOR[level] ?? 'text-primary'
      }

      // 🛑 badge ต้อง scope ด้วยร้านที่เปิดอยู่ จึง kick off **หลัง** requireActiveShop ไม่ใช่ก่อน
      // (เดิมคอมเมนต์ตรงนี้เขียนว่า "ต้องการแค่ user.id ไม่ขึ้นกับ shop" ซึ่งผิด — เหรียญของร้าน
      // BUSINESS เก็บที่ UserBadge.shopId ทำให้แดชบอร์ดโชว์ของร้านส่วนตัวที่ว่างเปล่ามาตลอด)
      // perf: ยังขนานกับ getOrdersByShop + JS processing ที่ตามมาทั้งชุด เสียแค่ทับซ้อนกับ
      // requireActiveShop เอง (query เดียว) — แลกกับตัวเลขที่ถูกร้าน
      const badgeScope = toBadgeScope(active, user.id)
      const progressPromise = getBadgeProgress(badgeScope.ownerUserId, 'SELLER', badgeScope.shop)

      // แถบแพ็กเกจ (Row 3 มือถือ) — ต้องอยู่หลัง requireActiveShop เพราะ resolve จาก shop.userId
      // (เจ้าของร้าน) ไม่ใช่ session user; inner try/catch เพื่อไม่ให้ล้มลาม block นี้ทั้งก้อน
      if (shop) {
        // คำเรียก order/สินค้า ผันตามประเภทกิจการ — ต้องอยู่ก่อนทุก branch ที่ใช้ shop.vertical
        orderVocab = resolveOrderVocab(shop.vertical)
        orderNoun = orderVocab.noun
        shopVertical = shop.vertical

        packageCanManage = active?.role === 'OWNER'
        try {
          const subscription = await getSubscriptionStatus(shop.userId)
          if (subscription) {
            packageStatus = subscription.status as BusinessPackageStatusApp
            packageTier = subscription.tier as BusinessPackageTier
          }
        } catch (e) {
          console.error('[dashboard] getSubscriptionStatus failed, fallback NOT_SUBSCRIBED', e)
        }
      }

      if (shop?.shopName) shopName = shop.shopName
      // owner-at-creation user (shop.userId) — สำหรับ Business shop นี้อาจไม่ใช่ session user ปัจจุบัน
      // (member ที่ไม่ใช่ owner) แต่ยังใช้ avatar/username ของ owner ได้ตาม pattern เดิม (public profile ผูกกับ shop.userId)
      const owner = shop
        ? await prisma.user.findUnique({ where: { id: shop.userId }, select: { avatar: true, username: true } })
        : null
      // avatarUrl: ใช้ logo ร้านก่อน → fallback owner.avatar (รูปเดียวกับที่ public profile /u/[username] แสดง)
      // กัน header ขึ้นอักษรย่อทั้งที่มีรูป — ร้านที่ยังไม่ตั้ง logo จะใช้รูปโปรไฟล์ owner แทน; ไม่ใช่ PII sensitive
      //
      // [สำคัญ] ต้องผ่าน toFileUrl() — bug 2026-08-01: เดิมส่งค่าดิบจาก DB เข้า src ของรูปตรง ๆ
      // แต่ Shop.logo เก็บเป็น "storage key" (เช่น "2026/07/31/uuid.jpg") ไม่ใช่ URL
      // เบราว์เซอร์จึงตีความเป็น path สัมพัทธ์ -> /dashboard/2026/07/31/uuid.jpg -> 404
      // ผลคือร้านที่ตั้งโลโก้แล้วยังเห็นเป็นอักษรย่อบน dashboard ทั้งที่หน้า /shop แสดงรูปได้
      // (owner.avatar เป็น URL เต็มจาก OAuth จึงบังเอิญไม่พัง — เลยไม่มีใครสังเกต)
      // helper จัดการทั้งสองรูปแบบให้แล้ว ดูคอมเมนต์หัว src/lib/file-url.ts
      avatarUrl = toFileUrl(shop?.logo ?? owner?.avatar ?? null)
      // shopSlug (ชื่อเดิม) ตอนนี้เก็บ "path เต็ม" ของหน้าร้าน active shop สำหรับ ShopLinkButtons:
      // BUSINESS → /b/{slug} (findShopBySlug กรอง kind=BUSINESS); PERSONAL → /u/{owner username}
      // (owner = shop.userId — personal คือ seller เอง; business admin = username เจ้าของร้านจริง)
      shopSlug =
        active?.kind === 'BUSINESS' && shop?.slug
          ? `/b/${shop.slug}`
          : owner?.username
            ? `/u/${owner.username}`
            : null

      // ─── fetch recent orders — ใช้ service layer เดียวกับ orders list page ─────
      if (shop?.id) {
        // เวลาไทย "ตอนนี้" — ใช้กำหนดเดือน/ปีปัจจุบันสำหรับ Sales Chart (mode='daily')
        // (logic เดียวกับใน dashboard.service.ts getSalesSeries — คำนวณซ้ำที่นี่เพื่อ pass เป็น param)
        const thaiNow = new Date(Date.now() + 7 * 60 * 60 * 1000)
        const currentYear = thaiNow.getUTCFullYear()
        const currentMonth = thaiNow.getUTCMonth() + 1
        const currentDay = thaiNow.getUTCDate()

        // ช่วงของ filter เดสก์ท็อป — นิยาม "วันนี้/เดือนนี้" เดียวกับ dashboard.service (เที่ยงคืนไทย)
        // ใช้ทั้งเป็น param ของ channel/province query และเป็นกรอบกรอง rawOrders ฝั่ง JS ด้านล่าง
        const rangePeriod =
          range === 'today'
            ? { year: currentYear, month: currentMonth, day: currentDay }
            : { year: currentYear, month: currentMonth }
        const TZ_MS = 7 * 60 * 60 * 1000
        const rangeGte =
          range === 'today'
            ? new Date(Date.UTC(currentYear, currentMonth - 1, currentDay) - TZ_MS)
            : new Date(Date.UTC(currentYear, currentMonth - 1, 1) - TZ_MS)
        const rangeLt =
          range === 'today'
            ? new Date(rangeGte.getTime() + 24 * 60 * 60 * 1000)
            : new Date(Date.UTC(currentYear, currentMonth, 1) - TZ_MS)

        // ต้องรู้ผลก่อนยิง getSalesSeries เพราะมันตัดสินว่าจะ query ค่าใช้จ่าย/ต้นทุนด้วยไหม
        // (fail-closed ตั้งแต่ชั้น query — ไม่ใช่ query มาแล้วค่อยซ่อนตอน render)
        const expenseGranted =
          (
            await resolveExpenseAccess(
              session as unknown as { user: { id: string; activeShopId?: string | null } },
            )
          ).kind === 'GRANTED'

        // perf: query เหล่านี้ independent → ยิงขนาน (Promise.allSettled) แทน sequential
        // wall time = max(query) ไม่ใช่ผลรวม; allSettled กัน 1 ตัวล้มทำตัวอื่นพัง (คง fallback เดิม)
        const [statusRes, shippingStageRes, appointmentTodayRes, balanceRes, ordersRes, ratingRes, liveAuctionRes, bestSellerRes, salesSeriesRes, shortcutRes, channelRes, activityRes, provinceRes] =
          await Promise.allSettled([
            getOrderStatusCounts(shop.id),
            // ร้านอื่นไม่ต้องเสีย query — ส่ง null แทน แล้วข้ามผลด้านล่าง
            shop.vertical === 'ONLINE_SALES' ? getShippingStageCounts(shop.id) : Promise.resolve(null),
            // นัดวันนี้ — เฉพาะร้านที่ผ่านตัวกั้นระบบคิวงาน (BR-RSV-01); ร้านอื่นไม่ต้องเสีย query
            canUseAppointments(shop) ? getTodayAppointmentCount(shop.id) : Promise.resolve(null),
            getBalance(shop.id),
            // getRecentActivity ถูกถอดออก 2026-08-04 พร้อมการตัด "กิจกรรมล่าสุด" ออกจากหน้าแรก —
            // มันรวม 5 แหล่ง (Order/Review/SMS/TopUp/StockMovement) ที่ไม่มีใครใช้ในหน้านี้แล้ว
            // /notifications ยังเรียก service ตัวนี้เองแยกต่างหาก ข้อมูลจึงไม่หายไปจากระบบ
            getOrdersByShop(shop.id),
            getAvgRatingByUsername(owner?.username ?? ''),
            // D#13: นับ auction status='live' — lightweight count query ตรง ๆ (ไม่ over-fetch ผ่าน listSellerAuctions)
            prisma.auction.count({ where: { shopId: shop.id, status: 'live' } }),
            // สินค้าขายดี (top 8) สำหรับ strip บน command center
            getBestSellerProducts(shop.id, 8),
            // Sales Chart mini card — ยอดขายรายวันเดือนปัจจุบัน
            getSalesSeries(shop.id, 'daily', { year: currentYear, month: currentMonth }, expenseGranted),
            // เมนูลัดที่ผู้ใช้เลือกไว้ (feature 00027) — เรียก service ตรง ไม่ผ่าน HTTP เพราะอยู่ฝั่ง server แล้ว
            resolveShortcutState(session as unknown as { user: { id: string; activeShopId?: string | null } }),
            // ─── 3 การ์ดเดสก์ท็อปที่ดึงกลับ 2026-08-05 — ทั้งหมดผูกกับ "เดือนปฏิทินไทยเดือนนี้" ───
            // ชุดเดียวกับที่ Sales Chart ใช้ (currentYear/currentMonth ด้านบน) เพื่อไม่ให้หน้าเดียว
            // มีสองนิยามของคำว่า "เดือนนี้"
            getSalesChannelBreakdown(shop.id, rangePeriod),
            // กิจกรรมล่าสุด — เคยถูกถอดออก 2026-08-04 ตอนตัดการ์ดนี้ทิ้งจากมือถือ ตอนนี้กลับมาเฉพาะเดสก์ท็อป
            getRecentActivity(shop.id, 6),
            // แผนที่จังหวัด — เฉพาะร้านขายออนไลน์ (user เคาะ) ร้านประเภทอื่นไม่ต้องเสีย query
            shop.vertical === 'ONLINE_SALES'
              ? getProvinceSales(shop.id, rangePeriod)
              : Promise.resolve(null),
          ])

        // orderStatusCounts: fallback 0 ทุก bucket ถ้าล้ม — CommandCenter แสดง 0 แทน crash
        if (statusRes.status === 'fulfilled') orderStatusCounts = statusRes.value
        else console.error('[dashboard] getOrderStatusCounts failed', statusRes.reason)

        // ล้ม = ไม่ส่งชุดใหม่ไป → การ์ดตกกลับไปแสดงสถานะการขายชุดเดิม ดีกว่าโชว์ 0 ทั้งแถว
        // ซึ่งอ่านได้ว่า "ไม่มีงานค้างเลย" ทั้งที่จริงคือเราไม่รู้
        if (shippingStageRes.status === 'fulfilled') shippingStageCounts = shippingStageRes.value ?? undefined
        else console.error('[dashboard] getShippingStageCounts failed', shippingStageRes.reason)

        // ล้ม = ไม่ส่งตัวเลขไป → ไทล์ที่ 2 ตกกลับเป็น "กำลังจัดส่ง" (ซึ่งจะเป็น 0) ดีกว่าโชว์
        // "นัดวันนี้ 0" ทั้งที่จริง ๆ อาจมีนัดอยู่ — เลข 0 ที่ผิดอันตรายกว่าไทล์ที่ไม่เกี่ยว
        if (appointmentTodayRes.status === 'fulfilled') appointmentTodayCount = appointmentTodayRes.value ?? undefined
        else console.error('[dashboard] getTodayAppointmentCount failed', appointmentTodayRes.reason)

        // v8: walletBalance — fallback 0 ถ้าล้ม
        if (balanceRes.status === 'fulfilled') walletBalance = balanceRes.value
        else console.error('[dashboard] getBalance failed', balanceRes.reason)

        // v10: review count + avg rating สำหรับ stats row — honest-zero ถ้าล้ม/ไม่มีรีวิว
        if (ratingRes.status === 'fulfilled') {
          reviewCount = ratingRes.value.reviewCount
          avgRating = ratingRes.value.avgRating
        } else console.error('[dashboard] getAvgRatingByUsername failed', ratingRes.reason)

        // D#13: liveAuctionCount — fallback 0 ถ้าล้ม (honest-zero pattern เดียวกับ field อื่น)
        if (liveAuctionRes.status === 'fulfilled') liveAuctionCount = liveAuctionRes.value
        else console.error('[dashboard] auction.count(live) failed', liveAuctionRes.reason)

        // เมนูลัด — ล้ม/ไม่มีร้าน = undefined → การ์ดซ่อนตัวเอง (honest-hide) ไม่ใช่โชว์การ์ดเปล่า
        if (shortcutRes.status === 'fulfilled' && shortcutRes.value.kind === 'OK') {
          shortcutTiles = shortcutRes.value.tiles
        } else if (shortcutRes.status === 'rejected') {
          console.error('[dashboard] resolveShortcutState failed', shortcutRes.reason)
        }


        // สินค้าขายดี → map เป็น shape เบา {id,name,price,image} (resolve imageUrl server-side); fallback []
        if (bestSellerRes.status === 'fulfilled') {
          bestSellers = bestSellerRes.value.map((p) => {
            const imgs = Array.isArray(p.images) ? (p.images as string[]) : []
            const first = imgs[0] ?? ''
            return {
              id: p.id,
              name: p.name,
              price: Number(p.price),
              image: first ? (toFileUrl(first)) : null,
              soldCount: p.soldCount,
            }
          })
        } else console.error('[dashboard] getBestSellerProducts failed', bestSellerRes.reason)

        // Sales Chart mini card — fallback null ถ้าล้ม → SalesChartCard ซ่อนตัวเอง (honest-hide)
        if (salesSeriesRes.status === 'fulfilled') mobileSalesSeries = salesSeriesRes.value
        else console.error('[dashboard] getSalesSeries failed', salesSeriesRes.reason)

        // ช่องทางการขาย — ล้ม = [] → การ์ดขึ้น empty state ("เดือนนี้ยังไม่มีออเดอร์")
        if (channelRes.status === 'fulfilled') salesChannels = channelRes.value
        else console.error('[dashboard] getSalesChannelBreakdown failed', channelRes.reason)

        // กิจกรรมล่าสุด — ล้ม = [] → RecentActivityFeed มี empty state พร้อม CTA ของตัวเองอยู่แล้ว
        if (activityRes.status === 'fulfilled') recentActivity = activityRes.value
        else console.error('[dashboard] getRecentActivity failed', activityRes.reason)

        // ยอดขายรายจังหวัด — null (ร้านไม่ใช่ขายออนไลน์) หรือล้ม = ไม่ render การ์ดแผนที่เลย
        if (provinceRes.status === 'fulfilled') provinceSales = provinceRes.value ?? undefined
        else console.error('[dashboard] getProvinceSales failed', provinceRes.reason)

        const rawOrders = ordersRes.status === 'fulfilled' ? ordersRes.value : []

        // คำนวณ stat จาก rawOrders ที่ fetch มาแล้ว — ไม่ query ซ้ำ
        orderCount = rawOrders.length
        // รวมยอดของใบที่ "นับเป็นยอดขายแล้ว" — ผู้ซื้อยืนยันรับของ หรือขนส่งรับของไปแล้วจริง
        // (SSOT: lib/order-revenue.ts — ต้องตรงกับ P&L และกราฟยอดขาย ห้ามเขียนเกณฑ์ซ้ำที่นี่)
        // หาร 1000 เพราะ StatisticCard ใช้ suffix:'k' เป็น literal text — value ต้องเป็นหน่วยพัน
        // ตัวอย่าง: ฿12,400 → 12.4 → แสดงเป็น ฿12.4k
        const completedRevenueBaht = rawOrders
          .filter((o) => countsAsRevenue(o))
          .reduce((sum, o) => sum + Number(o.totalAmount), 0)
        revenueK = completedRevenueBaht / 1000

        // ─── stat card เดสก์ท็อปตาม filter วันนี้/เดือนนี้ ────────────────────
        // นับใบไม่รวม CANCELLED ให้ตรงนิยามเดียวกับโดนัทช่องทางการขาย (ไม่งั้นเลขบนการ์ด
        // กับเลขกลางโดนัทในหน้าเดียวกันไม่เท่ากันทั้งที่ป้ายบอกช่วงเดียวกัน)
        const inRange = (o: { createdAt: Date }) => o.createdAt >= rangeGte && o.createdAt < rangeLt
        rangeOrderCount = rawOrders.filter((o) => inRange(o) && o.status !== 'CANCELLED').length
        rangeRevenueK =
          rawOrders
            .filter((o) => inRange(o) && countsAsRevenue(o))
            .reduce((sum, o) => sum + Number(o.totalAmount), 0) / 1000

        // เอา 8 รายการล่าสุด; map เป็น OrderType ที่ client component รับได้
        // totalAmount เป็น Prisma Decimal → ต้อง Number() ก่อนส่งผ่าน RSC boundary
        // createdAt เป็น Date → .toISOString() ป้องกัน Date serialization error
        recentOrders = rawOrders.slice(0, 8).map((o) => ({
          token: o.publicToken,
          // mask ก่อนข้าม RSC boundary — ห้ามส่ง raw contact ไปยัง client payload (S5-pdpafix)
          buyerLabel: maskContact(o.buyerContact, t.dashboard.unknownContact),
          createdAtISO: o.createdAt.toISOString(),
          totalAmount: Number(o.totalAmount),
          type: o.type,
          status: o.status as OrderType['status'],
        }))

        // ─── monthly series สำหรับ SalesReport chart ─────────────────────────
        // group rawOrders by ปี-เดือน (YYYY-MM) → คำนวณรายได้ + จำนวนออเดอร์ต่อเดือน
        // ใช้ JS ธรรมดา ใน RSC — ไม่ query ซ้ำ (มี rawOrders array แล้ว)
        const thMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
        const monthMap = new Map<string, { revenue: number; orderCount: number; label: string }>()
        for (const o of rawOrders) {
          const d = o.createdAt
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          const label = `${thMonths[d.getMonth()]} ${d.getFullYear() + 543}` // พ.ศ.
          const existing = monthMap.get(key)
          if (existing) {
            existing.revenue += Number(o.totalAmount)
            existing.orderCount += 1
          } else {
            monthMap.set(key, { revenue: Number(o.totalAmount), orderCount: 1, label })
          }
        }
        // เรียง key chronologically แล้ว build series array
        salesSeries = Array.from(monthMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, v]) => ({ label: v.label, revenue: v.revenue, orderCount: v.orderCount }))

        // summary — totalRevenue ใช้ยอด CONFIRMED เหมือนกับ revenueK stat; totalOrders = ทั้งหมด
        salesSummary = {
          totalRevenue: completedRevenueBaht,
          totalOrders: orderCount,
          // growth คำนวณไม่ได้เมื่อมีเพียง 1 เดือนหรือไม่มีข้อมูล — ซ่อน column (null)
          growth: null,
        }
      }

      // T9: getBadgeProgress (kick off ตั้งแต่ต้น block — ดู progressPromise ด้านบน)
      // await ตรงนี้: ถ้า shop+orders ใช้เวลานานกว่า badge ก็เสร็จพร้อมแล้ว (overlap)
      const rawProgress = await progressPromise
      earnedBadges = rawProgress.filter((i) => i.earned)
      // top in-progress: ยังไม่ได้รับ, เรียง progressRatio มากสุดก่อน, slice 4 รายการ
      topInProgress = rawProgress
        .filter((i) => !i.earned)
        .sort((a, b) => b.progressRatio - a.progressRatio)
        .slice(0, 4)
    } catch (e) {
      // ใช้ console.error เพื่อ surface error ที่ซ่อนอยู่ — silent catch คือสาเหตุที่ QA พบ
      console.error('[dashboard] badge fetch failed', e)
      earnedBadges = []
      topInProgress = []
    }
  }

  // stat cards — ไม่ส่ง change field (undefined) → StatisticCard ซ่อน indicator block
  // เพราะยังไม่มี prev period data — ไม่โชว์ "0%" หลอกตา
  // ออเดอร์/รายได้ ตาม filter วันนี้/เดือนนี้ (มี periodLabel กำกับ) — Trust Score ไม่ผูกช่วงเวลา
  // จึงไม่มีป้าย: การมี/ไม่มีป้ายคือตัวบอกว่าใบไหนตาม filter
  const statData: StatType[] = [
    { title: t.dashboard.statOrders, value: rangeOrderCount, periodLabel: rangeLabel, icon: 'shopping-cart' },
    { title: t.dashboard.statRevenue, value: rangeRevenueK, prefix: '฿', suffix: 'k', periodLabel: rangeLabel, icon: 'pig-money' },
    { title: 'Trust Score', value: score, suffix: '/100', icon: 'shield-check' },
  ]

  // pendingOrderCount: single source จาก orderStatusCounts.PENDING (UX Q2 resolved)
  // ไม่ derive แยกจาก JS filter อีกต่อไป
  const pendingOrderCount = orderStatusCounts.PENDING

  return (
    <>
      {/* Onboarding checklist + modal ย้ายไป sidebar (seller layout sidenavFooterSlot) — ไม่อยู่ใน dashboard body แล้ว */}

      {/* ─── Mobile: Command Center (< lg) ─────────────────────────────────────
          แสดงเฉพาะหน้าจอ < 1024px; desktop markup ซ่อนด้วย hidden lg:block ด้านล่าง
          recentActivity = [] ตอนนี้ (T6 activity.service จะ wire จริงใน T7)
          promoBanner = PROMO_BANNER constant (null = ซ่อน section ตาม Q3) */}
      <div className="lg:hidden">
        <CommandCenter
          data={{
            pendingOrderCount,
            orderStatusCounts,
            shippingStageCounts,
            // ร้านคิวงาน: ไทล์ที่ 2 = "นัดวันนี้" แทน "กำลังจัดส่ง" (user เคาะ 2026-08-07)
            appointmentTodayCount,
            // คำที่ผันตามประเภทกิจการ (SSOT = src/lib/seller-menu.ts) — ส่งได้เฉพาะสตริง
            orderNoun,
            shopVertical,
            promoBanner: PROMO_BANNER,
            // v8: header card + wallet (S-6/S-8)
            walletBalance,
            shopName,
            avatarUrl,
            tierName: getTierLabel(score),
            trustScore: score,
            // v10: stats row + shop link (S-8)
            shopSlug,
            orderCount,
            reviewCount,
            avgRating,
            // D#13: badge จำนวน live auction บน tile "ประมูล"
            liveAuctionCount,
            // สินค้าขายดี strip (feature Quick Create)
            bestSellers,
            // Sales Chart การ์ด mini — ยอดขายรายวันเดือนปัจจุบัน (null=ซ่อนการ์ด)
            salesSeries: mobileSalesSeries,
            // แถบแพ็กเกจร้านค้าบนมือถือ (Row 3 ของ CompactHero)
            packageStatus,
            packageTier,
            hidePayments: await shouldHidePayments(),
            packageCanManage,
            // เมนูลัดที่ผู้ใช้คนนี้เลือกไว้ (feature 00027)
            shortcutTiles,
          }}
        />
      </div>

      {/* ─── Desktop: ภาพรวมร้านค้า (≥ lg) ──────────────────────────────────
          ครอบด้วย hidden lg:block เพื่อซ่อนบน mobile (มือถือใช้ Command Center v10 ด้านบน)

          เรียงแถวใหม่ 2026-08-05 ตามผังที่ user เคาะ: ตัวตนร้าน → งานค้าง → กราฟ → รายการ → แผนที่
          พร้อมดึง widget ของ theme ecommerce ที่เคยถูกตัดทิ้งกลับมา 4 ตัว (ช่องทางการขาย /
          สินค้าขายดี / กิจกรรมล่าสุด / ยอดขายตามจังหวัด)
          mockup: docs/superpowers/specs/2026-08-05-seller-dashboard-desktop-mockup.html */}
      <div className="hidden lg:block">
        {/* Provider ครอบทั้ง filter pill (ที่แถวหัว) และเนื้อหา — แชร์สถานะ isPending ให้
            DashboardRangeFade จางเนื้อหาระหว่างรอ RSC refresh ตอนสลับช่วง */}
        <DashboardRangeProvider initialRange={range}>
          <PageBreadcrumb title={t.dashboard.pageTitle} trail={[{ label: t.dashboard.breadcrumbOverview }]} action={<DashboardRangePills />} />
          <DashboardRangeFade>

        {/* แถว 1: UserCard + StatCards (5 คอล) | ช่องทางการขาย (7 คอล)
            ช่องขวานี้คือช่องที่ theme ตั้งใจให้เป็น "การ์ดเตี้ย" (StorePerformanceOverview โดนัท 210px)
            เคยลองวาง AchievementLevel ไว้ครึ่งหนึ่งของช่องนี้แล้วหน้าบวมทั้งแถว (user รายงาน
            2026-08-05 ว่า "การ์ดใหญ่ผิดปกติไปหมด"): AchievementLevel มี ring + 2 section +
            progress bar 4 แถว พอถูกบีบเหลือครึ่งความกว้าง เนื้อหา wrap เป็นสองเท่า แล้วเพราะทุกใบ
            ในแถวมี h-full ความสูงแถวจึงถูกลากตามใบที่สูงสุด — UserCard กับ stat card ทางซ้าย
            ถูกยืดตามไปด้วยทั้งที่เนื้อหาไม่ได้เพิ่ม
            โดนัทกิน 7 คอลเต็มจึงเตี้ยที่สุด: layout ข้างในเป็น chart ซ้าย + legend ขวา ยิ่งกว้าง
            legend ยิ่งไม่ wrap (AchievementLevel ย้ายไปแถว 5 ที่มีเพื่อนสูงพอ ๆ กัน) */}
        <div className="grid xl:grid-cols-12 grid-cols-1 gap-base mb-base">
          <div className="xl:col-span-5">
            <div className="grid md:grid-cols-2 grid-cols-1 gap-base h-full">
              <UserCard shopName={shopName} trustScore={score} />
              {statData.map((stat, idx) => (
                <StatisticCard stat={stat} key={idx} />
              ))}
            </div>
          </div>
          <div className="xl:col-span-7">
            <SalesChannelDonut slices={salesChannels} rangeLabel={rangeLabel} rangeLabelInline={rangeLabelInline} />
          </div>
        </div>

        {/* แถว 2: สถานะคำสั่งซื้อเต็มความกว้าง — component ตัวเดียวกับบนมือถือ (user เคาะ 2026-08-04)
            เดิมชุดนี้เป็น lg:hidden ทำให้เดสก์ท็อปไม่มีทางเข้าตัวกรองสถานะพัสดุเลย ต้องพิมพ์ ?stage= เอง
            อยู่แถวนี้เพราะเป็น "งานค้างวันนี้" — ต้องอยู่เหนือกราฟที่เป็นข้อมูลย้อนหลัง */}
        <div className="mb-base">
          {/* prop ชุดเดียวกับมือถือทุกตัว — จอเดียวกันคนละ breakpoint ต้องพูดคำเดียวกัน
              (2026-08-07: เดิมบล็อกนี้ไม่ได้รับ orderNoun/appointmentToday จึงยังเขียน
              "คำสั่งซื้อ"/"กำลังจัดส่ง" ให้ร้านบริการอยู่ ขณะที่มือถือเปลี่ยนไปแล้ว) */}
          <OrderStatusBand
            counts={orderStatusCounts}
            shipping={shippingStageCounts}
            appointmentToday={appointmentTodayCount}
            orderNoun={byVertical(t.vocab.orderNoun, shopVertical)}
            orderNounTitle={byVertical(t.vocab.orderNounTitle, shopVertical)}
          />
        </div>

        {/* แถว 3: SalesReport | สินค้าขายดี — ครึ่งต่อครึ่ง (theme วางคู่กันแบบนี้เหมือนกัน) */}
        <div className="grid xl:grid-cols-2 grid-cols-1 gap-base mb-base">
          <SalesReport series={salesSeries} summary={salesSummary} />
          <TopSellingProducts products={bestSellers} vertical={shopVertical} />
        </div>

        {/* แถว 4: ออเดอร์ล่าสุด (5) | กิจกรรมล่าสุด (7)
            RecentActivityFeed เขียนเสร็จมาตั้งแต่รอบ command center v7 แต่ไม่มีไฟล์ไหน import
            หลังการ์ดถูกถอดออกจากมือถือ 2026-08-04 — รอบนี้เอากลับมาใช้ตัวเดิม ไม่สร้างใหม่ซ้อน */}
        <div className="grid xl:grid-cols-12 grid-cols-1 gap-base">
          <div className="xl:col-span-5">
            <RecentOrder orders={recentOrders} orderNoun={byVertical(t.vocab.orderNoun, shopVertical)} />
          </div>
          <div className="xl:col-span-7">
            <RecentActivityFeed items={recentActivity} createLabel={byVertical(t.vocab.createLabel, shopVertical)} />
          </div>
        </div>

        {/* แถว 5: ระดับความสำเร็จ (5) | ยอดขายตามจังหวัด (7)
            จับคู่กันเพราะทั้งสองใบสูงพอ ๆ กัน (~400px) — ไม่มีใครถูก h-full ลากให้บวม
            แผนที่แสดงเฉพาะร้านขายออนไลน์ (undefined = ไม่ render) ร้านคิวงาน/บ้านพักไม่มีพัสดุ
            ส่งไปต่างจังหวัด การ์ดนี้จึงไม่มีความหมายกับเขา — กรณีนั้น AchievementLevel ยึด 5 คอล
            ตามเดิม ไม่ถูกยืดเพราะไม่มีเพื่อนในแถว */}
        <div className="grid xl:grid-cols-12 grid-cols-1 gap-base mt-base">
          <div className="xl:col-span-5">
            <AchievementLevel
              score={score}
              level={level}
              levelColor={levelColor}
              earnedBadges={earnedBadges}
              topInProgress={topInProgress}
            />
          </div>
          {provinceSales && (
            <div className="xl:col-span-7">
              <ProvinceSalesMap {...provinceSales} rangeLabel={rangeLabel} />
            </div>
          )}
        </div>
          </DashboardRangeFade>
        </DashboardRangeProvider>
      </div>
      {/* onboarding ย้ายไปหน้า /onboarding (บังคับผ่าน proxy) — ไม่ใช้ modal บน dashboard แล้ว */}
    </>
  )
}
