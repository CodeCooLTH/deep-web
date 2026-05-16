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
import { getTrustLevel } from '@/services/trust-score.service'
import { getOrdersByShop } from '@/services/order.service'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import RecentOrder from './components/RecentOrder'
import SalesReport from './components/SalesReport'
import StatisticCard from './components/StatisticCard'
import UserCard from './components/UserCard'
import AchievementLevel from './components/AchievementLevel'
import type { AchievementBadge } from './components/AchievementLevel'
import type { StatType } from './components/StatisticCard'
import type { OrderType } from './components/data'

export const metadata: Metadata = { title: 'แดชบอร์ด' }

// ─── helper: แปล badge criteria object → ข้อความไทย ─────────────────────────
function criteriaToText(c: unknown): string {
  if (!c || typeof c !== 'object') return ''
  const obj = c as Record<string, unknown>
  switch (obj['type']) {
    case 'FIRST_ORDER':       return 'ปิดออเดอร์แรกได้'
    case 'ORDER_COUNT':       return `ปิด ${obj['count']} ออเดอร์`
    case 'PERFECT_RATING':    return `เรตติ้ง 5.0 (ต้องมี ${obj['minReviews']}+ รีวิว)`
    case 'HIGH_RATING':       return `เรตติ้ง ≥ ${obj['minRating']} (${obj['minReviews']}+ รีวิว)`
    case 'ZERO_COMPLAINT':    return `ปิด ${obj['minOrders']} ออเดอร์ ไม่มี cancel`
    case 'VETERAN':           return `เป็นสมาชิกครบ ${obj['minDays'] ?? 365} วัน`
    case 'FAST_SHIPPING':     return `จัดส่งเฉลี่ย ≤ ${obj['maxHours']} ชม. (${obj['minOrders']}+ ออเดอร์)`
    case 'FULL_VERIFICATION': return 'ยืนยันตัวตนครบทุกระดับ'
    case 'UNIQUE_REVIEWERS':  return `ผู้รีวิว ${obj['count']}+ คน`
    case 'SIGNUP_YEAR':       return `สมัครภายในปี ${obj['year']}`
    default:                  return ''
  }
}

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
  const user = (session as { user?: { id?: string; trustScore?: number; name?: string } } | null)?.user

  // ─── badge + trust score data (server-side) ─────────────────────────────────
  let badges: AchievementBadge[] = []
  let score = 0
  let level = 'D'
  let levelColor = 'text-danger'
  let nextMilestone: string | undefined
  let shopName = 'ร้านค้าของคุณ'
  // ออเดอร์ล่าสุดสำหรับ RecentOrder widget (real data)
  let recentOrders: OrderType[] = []
  // stat counters — คำนวณจาก rawOrders ที่ fetch ครั้งเดียว (ไม่ duplicate query)
  let orderCount = 0
  let revenueK = 0

  if (user?.id) {
    score = user.trustScore ?? 0
    level = getTrustLevel(score)
    levelColor = LEVEL_COLOR[level] ?? 'text-primary'

    try {
      // ดึงชื่อร้านค้า + id เพื่อแสดงใน UserCard header และ fetch orders
      const shop = await prisma.shop.findUnique({
        where: { userId: user.id },
        select: { id: true, shopName: true },
      })
      if (shop?.shopName) shopName = shop.shopName

      // ─── fetch recent orders — ใช้ service layer เดียวกับ orders list page ─────
      if (shop?.id) {
        const rawOrders = await getOrdersByShop(shop.id)

        // คำนวณ stat จาก rawOrders ที่ fetch มาแล้ว — ไม่ query ซ้ำ
        orderCount = rawOrders.length
        // รวมยอดเฉพาะ COMPLETED orders; หาร 1000 เพื่อให้แสดงในหน่วย k
        // (StatisticCard ใช้ suffix:'k' เป็น literal text — value ต้องเป็น หน่วยพัน)
        // ตัวอย่าง: ฿12,400 → 12.4 → แสดงเป็น ฿12.4k
        const completedRevenueBaht = rawOrders
          .filter((o) => o.status === 'COMPLETED')
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
      }

      const earnedRows = await prisma.userBadge.findMany({
        where: { userId: user.id },
        select: { badgeId: true },
      })
      const earnedBadgeIds = new Set(earnedRows.map((x: { badgeId: string }) => x.badgeId))

      const allBadges = await prisma.badge.findMany({
        where: { type: 'ACHIEVEMENT' },
        orderBy: { createdAt: 'asc' },
      })

      badges = allBadges.map((b: { id: string; name: string; nameEN: string; icon: string | null; criteria: unknown }) => ({
        id: b.id,
        name: b.name,
        nameEN: b.nameEN,
        icon: b.icon,
        earned: earnedBadgeIds.has(b.id),
        criteria: criteriaToText(b.criteria),
      }))

      const firstUnearned = badges.find((b) => !b.earned)
      nextMilestone = firstUnearned
        ? `ยังต้องการ: ${firstUnearned.criteria}`
        : 'ปลดล็อกทุก achievement แล้ว!'
    } catch (e) {
      // ใช้ console.error เพื่อ surface error ที่ซ่อนอยู่ — silent catch คือสาเหตุที่ QA พบ
      // badges=[] โดยไม่รู้ว่า query throw อะไร (S5-badgefix)
      console.error('[dashboard] badge fetch failed', e)
      badges = []
      nextMilestone = undefined
    }
  }

  // stat cards — ออเดอร์/รายได้ใช้ข้อมูลจริงจาก rawOrders ที่ fetch ไปแล้ว
  const statData: StatType[] = [
    { title: 'ออเดอร์', value: orderCount, change: 0, icon: 'shopping-cart' },
    { title: 'รายได้', value: revenueK, prefix: '฿', suffix: 'k', change: 0, icon: 'pig-money' },
    { title: 'Trust Score', value: score, suffix: '/100', change: 0, icon: 'shield-check' },
  ]

  return (
    <>
      <PageBreadcrumb title="ภาพรวมร้านค้า" trail={[{ label: 'Analytics' }]} />

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
            badges={badges}
            nextMilestone={nextMilestone}
          />
        </div>
      </div>

      {/* แถว 2 (theme row 2): SalesReport เต็มความกว้าง
          TopSellingProducts ถูก drop → SalesReport ยึดทั้งแถว */}
      <div className="grid grid-cols-1 gap-base mb-base">
        <SalesReport />
      </div>

      {/* แถว 3 (theme row 3): RecentOrder เต็มความกว้าง
          RecentActivity ถูก drop → RecentOrder ยึดทั้งแถว
          orders รับจาก getOrdersByShop — ถ้าไม่มีออเดอร์จะแสดง empty state */}
      <div className="grid grid-cols-1 gap-base">
        <RecentOrder orders={recentOrders} />
      </div>
    </>
  )
}
