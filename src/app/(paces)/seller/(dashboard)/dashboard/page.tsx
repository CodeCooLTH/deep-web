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
import { getTrustLevel } from '@/services/trust-score.service'
import { getOrdersByShop, getOrderStatusCounts } from '@/services/order.service'
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
import { PROMO_BANNER } from './_constants/command-center'
import { getRecentActivity, type ActivityItem } from '@/services/activity.service'
// v8: ดึง wallet balance + tier label เพิ่มใน CommandCenterData (S-6/S-8)
import { getBalance } from '@/services/wallet.service'
import { getTierLabel } from '@/lib/trust-tier'
// v10: review count + avg rating สำหรับ stats row ใน CompactHero (S-8)
import { getAvgRatingByUsername } from '@/services/review.service'

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
  // recentActivity: feed aggregate (Order/Review/SMS/TopUp) — service ครอบ try/catch→[] อยู่แล้ว
  let recentActivity: ActivityItem[] = []
  // v8: walletBalance สำหรับ WalletCard — fallback 0 ถ้า fetch ล้ม (pattern เดียวกับ getOrderStatusCounts)
  let walletBalance = 0
  // v10: CompactHero — shop link (slug) + stats row (orders/reviews/rating); honest-zero ถ้าล้ม
  let shopSlug: string | null = null
  let reviewCount = 0
  let avgRating = 0
  // D#13: จำนวน auction สถานะ live ของร้าน — badge บน tile "ประมูล" ใน CarouselGrid
  let liveAuctionCount = 0

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
      if (shop?.shopName) shopName = shop.shopName
      // owner-at-creation user (shop.userId) — สำหรับ Business shop นี้อาจไม่ใช่ session user ปัจจุบัน
      // (member ที่ไม่ใช่ owner) แต่ยังใช้ avatar/username ของ owner ได้ตาม pattern เดิม (public profile ผูกกับ shop.userId)
      const owner = shop
        ? await prisma.user.findUnique({ where: { id: shop.userId }, select: { avatar: true, username: true } })
        : null
      // avatarUrl: ใช้ logo ร้านก่อน → fallback owner.avatar (รูปเดียวกับที่ public profile /u/[username] แสดง)
      // กัน header ขึ้นอักษรย่อทั้งที่มีรูป — ร้านที่ยังไม่ตั้ง logo จะใช้รูปโปรไฟล์ owner แทน; ไม่ใช่ PII sensitive
      avatarUrl = shop?.logo ?? owner?.avatar ?? null
      // v10: shop public slug สำหรับ ShopLinkButtons (resolveBuyerBaseUrl()/{slug})
      shopSlug = shop?.slug ?? null

      // ─── fetch recent orders — ใช้ service layer เดียวกับ orders list page ─────
      if (shop?.id) {
        // perf: 5 query นี้ independent → ยิงขนาน (Promise.allSettled) แทน sequential
        // wall time = max(4 query) ไม่ใช่ผลรวม; allSettled กัน 1 ตัวล้มทำตัวอื่นพัง (คง fallback เดิม)
        const [statusRes, balanceRes, activityRes, ordersRes, ratingRes, liveAuctionRes] = await Promise.allSettled([
          getOrderStatusCounts(shop.id),
          getBalance(shop.id),
          getRecentActivity(shop.id, 8),
          getOrdersByShop(shop.id),
          getAvgRatingByUsername(owner?.username ?? ''),
          // D#13: นับ auction status='live' — lightweight count query ตรง ๆ (ไม่ over-fetch ผ่าน listSellerAuctions)
          prisma.auction.count({ where: { shopId: shop.id, status: 'live' } }),
        ])

        // orderStatusCounts: fallback 0 ทุก bucket ถ้าล้ม — CommandCenter แสดง 0 แทน crash
        if (statusRes.status === 'fulfilled') orderStatusCounts = statusRes.value
        else console.error('[dashboard] getOrderStatusCounts failed', statusRes.reason)

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

        // recentActivity feed — fallback [] (service ครอบ error เองแต่กัน allSettled reject ด้วย)
        recentActivity = activityRes.status === 'fulfilled' ? activityRes.value : []

        const rawOrders = ordersRes.status === 'fulfilled' ? ordersRes.value : []

        // คำนวณ stat จาก rawOrders ที่ fetch มาแล้ว — ไม่ query ซ้ำ
        orderCount = rawOrders.length
        // รวมยอดเฉพาะ CONFIRMED orders (terminal สำเร็จ); หาร 1000 เพื่อให้แสดงในหน่วย k
        // (StatisticCard ใช้ suffix:'k' เป็น literal text — value ต้องเป็น หน่วยพัน)
        // ตัวอย่าง: ฿12,400 → 12.4 → แสดงเป็น ฿12.4k
        const completedRevenueBaht = rawOrders
          .filter((o) => o.status === 'CONFIRMED')
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
            recentActivity,
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
          }}
        />
      </div>

      {/* ─── Desktop: ภาพรวมร้านค้า (≥ lg) ──────────────────────────────────
          ห้ามแก้/ลบ desktop widget ใด ๆ ตาม Hard Rule T1
          ครอบด้วย hidden lg:block เพื่อซ่อนบน mobile */}
      <div className="hidden lg:block">
        <PageBreadcrumb title="ภาพรวมร้านค้า" trail={[{ label: 'ภาพรวม' }]} />

        {/* แถว 1 (theme row 1): UserCard + StatCards (5 คอล) | AchievementLevel (7 คอล)
            StorePerformanceOverview ถูก drop → AchievementLevel ยึด 7 คอลเต็ม */}
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
            <AchievementLevel
              score={score}
              level={level}
              levelColor={levelColor}
              earnedBadges={earnedBadges}
              topInProgress={topInProgress}
            />
          </div>
        </div>

        {/* แถว 2 (re-grid Unit-C): SalesReport xl:col-span-8 + RecentOrder xl:col-span-4
            ลดจาก 3 แถวโล่งเหลือ 2 แถว — ไม่เพิ่ม widget ใหม่
            SalesReport รับ real series+summary จาก RSC boundary */}
        <div className="grid xl:grid-cols-12 grid-cols-1 gap-base">
          <div className="xl:col-span-8">
            <SalesReport series={salesSeries} summary={salesSummary} />
          </div>
          <div className="xl:col-span-4">
            <RecentOrder orders={recentOrders} />
          </div>
        </div>
      </div>
      {/* onboarding ย้ายไปหน้า /onboarding (บังคับผ่าน proxy) — ไม่ใช้ modal บน dashboard แล้ว */}
    </>
  )
}
