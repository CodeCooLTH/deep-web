/**
 * Admin dashboard — 8 real stat cards from DB (PRD §9.1 ครบ).
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx
 *       + theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 * Adaptations:
 *   - Server component; data fetched directly via Prisma (uses the same
 *     queries as /api/admin/dashboard) to avoid the HTTP roundtrip.
 *   - Dropped every non-applicable widget (UserCard, StorePerformanceOverview,
 *     WeeklyPerformanceInsights, SalesReport, TopSellingProducts, RecentOrder,
 *     RevenueByLocation, RecentActivity) — we don't have the source data yet.
 *   - Welcome sub-header: "สวัสดี {displayName}".
 *   - 8 stats (PRD §9.1): total users, shops, orders, pending verifications,
 *     avg trust score, completion rate, avg review rating, active users (30 วัน).
 */
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import StatisticCard, { type AdminStat } from '@/views/dashboards/ecommerce/StatisticCard'
import { getServerSession } from 'next-auth'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'แดชบอร์ดผู้ดูแล' }

async function getAdminStats() {
  // Same queries as /api/admin/dashboard (src/app/api/admin/dashboard/route.ts)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 วันล่าสุด
  const [
    totalUsers,
    totalShops,
    totalOrders,
    pendingVerifications,
    avgTrustScore,
    confirmedOrders,
    cancelledOrders,
    ratingAgg,
    recentOrders,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isShop: true } }),
    prisma.order.count(),
    prisma.verificationRecord.count({ where: { status: 'PENDING' } }),
    prisma.user.aggregate({ _avg: { trustScore: true } }),
    // Completion Rate = CONFIRMED / (CONFIRMED + CANCELLED) (PRD §9.1)
    prisma.order.count({ where: { status: 'CONFIRMED' } }),
    prisma.order.count({ where: { status: 'CANCELLED' } }),
    // Avg Rating = AVG(reviews.rating) ทั้งหมด
    prisma.review.aggregate({ _avg: { rating: true }, where: { deletedAt: null } }),
    // Active Users = user (buyer หรือ เจ้าของร้าน) ที่มี order ใน 30 วัน
    prisma.order.findMany({
      where: { createdAt: { gte: since } },
      select: { buyerUserId: true, shop: { select: { userId: true } } },
    }),
  ])

  const completedDenom = confirmedOrders + cancelledOrders
  const completionRate =
    completedDenom > 0 ? Math.round((confirmedOrders / completedDenom) * 100) : 0

  const avgRating = Math.round((ratingAgg._avg.rating ?? 0) * 10) / 10

  // นับ distinct user ที่ active ผ่าน order — buyer (buyerUserId) + seller (shop.userId)
  const activeUserIds = new Set<string>()
  for (const o of recentOrders) {
    if (o.buyerUserId) activeUserIds.add(o.buyerUserId)
    if (o.shop?.userId) activeUserIds.add(o.shop.userId)
  }

  return {
    totalUsers,
    totalShops,
    totalOrders,
    pendingVerifications,
    avgTrustScore: Math.round(avgTrustScore._avg.trustScore || 0),
    completionRate,
    avgRating,
    activeUsers: activeUserIds.size,
  }
}

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user as { displayName?: string } | undefined

  const stats = await getAdminStats()

  const cards: AdminStat[] = [
    { title: 'ผู้ใช้ทั้งหมด', value: stats.totalUsers, icon: 'users', tone: 'primary' },
    { title: 'ร้านค้า', value: stats.totalShops, icon: 'building-store', tone: 'info' },
    { title: 'ออเดอร์ทั้งหมด', value: stats.totalOrders, icon: 'receipt', tone: 'success' },
    { title: 'รอตรวจสอบ', value: stats.pendingVerifications, icon: 'shield-exclamation', tone: 'warning' },
    { title: 'คะแนนเชื่อถือเฉลี่ย', value: stats.avgTrustScore, icon: 'star', tone: 'secondary' },
    { title: 'อัตราสำเร็จ', value: stats.completionRate, suffix: '%', icon: 'circle-check', tone: 'success' },
    { title: 'คะแนนรีวิวเฉลี่ย', value: stats.avgRating, icon: 'star-filled', tone: 'warning' },
    { title: 'ผู้ใช้ active (30 วัน)', value: stats.activeUsers, suffix: ' คน', icon: 'user-check', tone: 'info' },
  ]

  return (
    <>
      <PageBreadcrumb title="แดชบอร์ดผู้ดูแล" subtitle="ภาพรวม" />

      <div className="card mb-base">
        <div className="card-body">
          <h4 className="text-lg font-semibold mb-1">
            สวัสดี {user?.displayName ?? 'Admin'}
          </h4>
          <p className="text-default-400 text-sm mb-0">
            ภาพรวมระบบ Deep — ข้อมูลสรุปจากฐานข้อมูลแบบเรียลไทม์
          </p>
        </div>
      </div>

      <div className="grid xl:grid-cols-4 md:grid-cols-2 grid-cols-1 gap-base">
        {cards.map((stat) => (
          <StatisticCard key={stat.title} stat={stat} />
        ))}
      </div>
    </>
  )
}
