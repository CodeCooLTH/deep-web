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
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireActiveShop } from '@/lib/shop-context'
import { toFileUrl } from '@/lib/file-url'
import { getTrustLevel } from '@/services/trust-score.service'
import { getOrdersByShop, getOrderStatusCounts, getShippingStageCounts } from '@/services/order.service'
import { countsAsRevenue } from '@/lib/order-revenue'
import { getBestSellerProducts } from '@/services/product.service'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import RecentOrder from './components/RecentOrder'
import SalesReport from './components/SalesReport'
import StatisticCard from './components/StatisticCard'
import UserCard from './components/UserCard'
import AchievementLevel from './components/AchievementLevel'
import { getBadgeProgress } from '@/services/badge.service'
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

export const metadata: Metadata = { title: 'แดชบอร์ด' }

/** PDPA masking — แสดงเฉพาะ 4 ตัวท้าย ปิดส่วนที่เหลือด้วย bullet
 *  คัดลอก logic จาก customers/page.tsx และ orders/[token]/components/CustomerDetails.tsx
 *  เพื่อความสม่ำเสมอ (S5-pdpafix)
 */
function maskContact(c: string | null | undefined): string {
  if (!c || c.length <= 4) return c ?? 'ไม่ระบุ'
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
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id?: string; trustScore?: number; name?: string; needsOnboarding?: boolean; needsPhoneVerify?: boolean; displayName?: string } } | null)?.user

  // ─── badge + trust score data (server-side) ─────────────────────────────────
  let earnedBadges: BadgeProgress[] = []
  let topInProgress: BadgeProgress[] = []
  let score = 0
  let level = 'D'
  let levelColor = 'text-danger'
  let shopName = 'ร้านค้าของคุณ'
  // ออเดอร์ล่าสุดสำหรับ RecentOrder widget (real data)
  let recentOrders: OrderType[] = []
  // stat counters — คำนวณจาก rawOrders ที่ fetch ครั้งเดียว (ไม่ duplicate query)
  let orderCount = 0
  let revenueK = 0
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
      // perf: getBadgeProgress ต้องการแค่ user.id (ไม่ขึ้นกับ shop) — kick off
      // ขนานตั้งแต่ต้น ให้ทับซ้อนกับ shop.findUnique + getOrdersByShop + JS processing
      // (wall time = max(badge, shop+orders) แทนผลรวม sequential)
      const progressPromise = getBadgeProgress(user.id, 'SELLER')

      // ดึง active shop (Personal หรือ Business ตาม session.activeShopId) — id/shopName/logo/slug ทุก
      // downstream query (orders/balance/activity/rating/liveAuction) ต้อง scope ด้วย active shop.id นี้
      const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
      const shop = active?.shop ?? null

      // แถบแพ็กเกจ (Row 3 มือถือ) — ต้องอยู่หลัง requireActiveShop เพราะ resolve จาก shop.userId
      // (เจ้าของร้าน) ไม่ใช่ session user; inner try/catch เพื่อไม่ให้ล้มลาม block นี้ทั้งก้อน
      if (shop) {
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
        const [statusRes, shippingStageRes, balanceRes, ordersRes, ratingRes, liveAuctionRes, bestSellerRes, salesSeriesRes, shortcutRes, channelRes, activityRes, provinceRes] =
          await Promise.allSettled([
            getOrderStatusCounts(shop.id),
            // ร้านอื่นไม่ต้องเสีย query — ส่ง null แทน แล้วข้ามผลด้านล่าง
            shop.vertical === 'ONLINE_SALES' ? getShippingStageCounts(shop.id) : Promise.resolve(null),
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
            getSalesChannelBreakdown(shop.id, { year: currentYear, month: currentMonth }),
            // กิจกรรมล่าสุด — เคยถูกถอดออก 2026-08-04 ตอนตัดการ์ดนี้ทิ้งจากมือถือ ตอนนี้กลับมาเฉพาะเดสก์ท็อป
            getRecentActivity(shop.id, 6),
            // แผนที่จังหวัด — เฉพาะร้านขายออนไลน์ (user เคาะ) ร้านประเภทอื่นไม่ต้องเสีย query
            shop.vertical === 'ONLINE_SALES'
              ? getProvinceSales(shop.id, { year: currentYear, month: currentMonth })
              : Promise.resolve(null),
          ])

        // orderStatusCounts: fallback 0 ทุก bucket ถ้าล้ม — CommandCenter แสดง 0 แทน crash
        if (statusRes.status === 'fulfilled') orderStatusCounts = statusRes.value
        else console.error('[dashboard] getOrderStatusCounts failed', statusRes.reason)

        // ล้ม = ไม่ส่งชุดใหม่ไป → การ์ดตกกลับไปแสดงสถานะการขายชุดเดิม ดีกว่าโชว์ 0 ทั้งแถว
        // ซึ่งอ่านได้ว่า "ไม่มีงานค้างเลย" ทั้งที่จริงคือเราไม่รู้
        if (shippingStageRes.status === 'fulfilled') shippingStageCounts = shippingStageRes.value ?? undefined
        else console.error('[dashboard] getShippingStageCounts failed', shippingStageRes.reason)

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
              image: first ? (first.startsWith('http') ? first : `/api/files/${first}`) : null,
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

        // เอา 8 รายการล่าสุด; map เป็น OrderType ที่ client component รับได้
        // totalAmount เป็น Prisma Decimal → ต้อง Number() ก่อนส่งผ่าน RSC boundary
        // createdAt เป็น Date → .toISOString() ป้องกัน Date serialization error
        recentOrders = rawOrders.slice(0, 8).map((o) => ({
          token: o.publicToken,
          // mask ก่อนข้าม RSC boundary — ห้ามส่ง raw contact ไปยัง client payload (S5-pdpafix)
          buyerLabel: maskContact(o.buyerContact),
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
  const statData: StatType[] = [
    { title: 'ออเดอร์', value: orderCount, icon: 'shopping-cart' },
    { title: 'รายได้', value: revenueK, prefix: '฿', suffix: 'k', icon: 'pig-money' },
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
        <PageBreadcrumb title="ภาพรวมร้านค้า" trail={[{ label: 'ภาพรวม' }]} />

        {/* แถว 1: UserCard + StatCards (5 คอล) | ช่องทางการขาย + AchievementLevel (7 คอล)
            ครึ่งขวาเคยเป็น AchievementLevel ใบเดียวกิน 7 คอล เพราะ StorePerformanceOverview
            ของ theme ถูกตัดทิ้ง — ตอนนี้ช่องนั้นกลับมาเป็น "ช่องทางการขาย" ที่มีข้อมูลจริง */}
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
            <div className="grid xl:grid-cols-2 grid-cols-1 gap-base h-full">
              <SalesChannelDonut slices={salesChannels} />
              <AchievementLevel
                score={score}
                level={level}
                levelColor={levelColor}
                earnedBadges={earnedBadges}
                topInProgress={topInProgress}
              />
            </div>
          </div>
        </div>

        {/* แถว 2: สถานะคำสั่งซื้อเต็มความกว้าง — component ตัวเดียวกับบนมือถือ (user เคาะ 2026-08-04)
            เดิมชุดนี้เป็น lg:hidden ทำให้เดสก์ท็อปไม่มีทางเข้าตัวกรองสถานะพัสดุเลย ต้องพิมพ์ ?stage= เอง
            อยู่แถวนี้เพราะเป็น "งานค้างวันนี้" — ต้องอยู่เหนือกราฟที่เป็นข้อมูลย้อนหลัง */}
        <div className="mb-base">
          <OrderStatusBand counts={orderStatusCounts} shipping={shippingStageCounts} />
        </div>

        {/* แถว 3: SalesReport | สินค้าขายดี — ครึ่งต่อครึ่ง (theme วางคู่กันแบบนี้เหมือนกัน) */}
        <div className="grid xl:grid-cols-2 grid-cols-1 gap-base mb-base">
          <SalesReport series={salesSeries} summary={salesSummary} />
          <TopSellingProducts products={bestSellers} />
        </div>

        {/* แถว 4: ออเดอร์ล่าสุด (5) | กิจกรรมล่าสุด (7)
            RecentActivityFeed เขียนเสร็จมาตั้งแต่รอบ command center v7 แต่ไม่มีไฟล์ไหน import
            หลังการ์ดถูกถอดออกจากมือถือ 2026-08-04 — รอบนี้เอากลับมาใช้ตัวเดิม ไม่สร้างใหม่ซ้อน */}
        <div className="grid xl:grid-cols-12 grid-cols-1 gap-base">
          <div className="xl:col-span-5">
            <RecentOrder orders={recentOrders} />
          </div>
          <div className="xl:col-span-7">
            <RecentActivityFeed items={recentActivity} />
          </div>
        </div>

        {/* แถว 5: ยอดขายตามจังหวัด — เฉพาะร้านขายออนไลน์เท่านั้น (undefined = ไม่ render ทั้งใบ)
            ร้านคิวงาน/บ้านพักไม่มีพัสดุส่งไปต่างจังหวัด การ์ดนี้จึงไม่มีความหมายกับเขา */}
        {provinceSales && (
          <div className="mt-base">
            <ProvinceSalesMap {...provinceSales} />
          </div>
        )}
      </div>
      {/* onboarding ย้ายไปหน้า /onboarding (บังคับผ่าน proxy) — ไม่ใช้ modal บน dashboard แล้ว */}
    </>
  )
}
