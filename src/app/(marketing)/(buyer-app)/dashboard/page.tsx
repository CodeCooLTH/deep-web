// MUI Imports
import Grid from '@mui/material/Grid'

// Type Imports
import type { Metadata } from 'next'

// Third-party Imports
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

// Lib / Service Imports
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrdersByBuyer } from '@/services/order.service'
import { getReviewsByBuyer } from '@/services/review.service'
import { getTrustLevel } from '@/services/trust-score.service'

// Components Imports
import Congratulations from '@views/apps/ecommerce/dashboard/Congratulations'
import StatCard from '@views/apps/ecommerce/dashboard/StatCard'
import Orders, { type DashboardOrder } from '@views/apps/ecommerce/dashboard/Orders'
import Transactions, { type DashboardReview } from '@views/apps/ecommerce/dashboard/Transactions'

/**
 * Base: theme/vuexy/typescript-version/full-version/src/app/[lang]/(dashboard)/(private)/apps/ecommerce/dashboard/page.tsx
 * Widgets adapted: Congratulations (welcome + trust score), StatisticsCard (4 buyer tiles),
 *                  Orders (recent 5 orders), Transactions (recent 5 reviews given).
 * Dropped: LineChartProfit, RadialBarChart, DonutChartGeneratedLeads, RevenueReport,
 *          EarningReports, PopularProducts, InvoiceListTable — seller-side metrics.
 */

export const metadata: Metadata = { title: 'หน้าหลักของฉัน' }

const NEXT_LEVEL_LABEL: Record<string, string> = {
  D: 'C',
  C: 'B',
  B: 'B+',
  'B+': 'A',
  A: 'A+',
  'A+': 'A+ (ระดับสูงสุด)'
}

export default async function BuyerDashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/auth/sign-in?callbackUrl=/dashboard')

  const userId = (session.user as { id: string }).id

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      verifications: true,
      userBadges: { include: { badge: true } }
    }
  })

  if (!user) redirect('/auth/sign-in')

  const [allOrders, recentReviewsRaw, reviewsGivenCount] = await Promise.all([
    getOrdersByBuyer(userId),
    getReviewsByBuyer(userId, 5),
    prisma.review.count({ where: { reviewerUserId: userId, deletedAt: null } })
  ])

  const recentOrdersRaw = allOrders.slice(0, 5)
  const completedOrders = allOrders.filter((o) => o.status === 'CONFIRMED').length

  const trustLevel = getTrustLevel(user.trustScore)
  const nextLevelLabel = NEXT_LEVEL_LABEL[trustLevel] ?? 'A+'

  // สัญญาณความน่าเชื่อถือ (ยืนยันตัวตน) — จาก verification ที่ APPROVED เท่านั้น
  const approvedLevels = new Set(user.verifications.filter((v) => v.status === 'APPROVED').map((v) => v.level))
  const verifiedPhone = approvedLevels.has(1)
  const verifiedDoc = approvedLevels.has(2)
  const verifiedBiz = approvedLevels.has(3)

  // Map service types to widget-friendly shapes (decimal totalAmount → number).
  const recentOrders: DashboardOrder[] = recentOrdersRaw.map((o) => ({
    id: o.id,
    publicToken: o.publicToken,
    status: o.status,
    type: o.type,
    totalAmount: Number(o.totalAmount),
    shop: o.shop ? { id: o.shop.id, name: o.shop.shopName } : null,
    items: o.items.map((it) => ({ id: it.id, name: it.name }))
  }))

  const recentReviews: DashboardReview[] = recentReviewsRaw.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    order: {
      publicToken: r.order.publicToken,
      shop: {
        user: {
          displayName: r.order.shop.user.displayName,
          username: r.order.shop.user.username
        }
      }
    }
  }))

  return (
    <Grid container spacing={6}>
      {/* แถว 1 — welcome banner เต็มความกว้าง */}
      <Grid size={12}>
        <Congratulations
          displayName={user.displayName}
          trustScore={user.trustScore}
          trustLevel={trustLevel}
          nextLevelLabel={nextLevelLabel}
          verifiedPhone={verifiedPhone}
          verifiedDoc={verifiedDoc}
          verifiedBiz={verifiedBiz}
        />
      </Grid>

      {/* แถว 2 — สถิติ 4 การ์ดเท่ากัน */}
      <Grid size={{ xs: 6, lg: 3 }}>
        <StatCard icon='tabler-shopping-bag' stats={`${allOrders.length}`} title='คำสั่งซื้อทั้งหมด' color='primary' />
      </Grid>
      <Grid size={{ xs: 6, lg: 3 }}>
        <StatCard icon='tabler-circle-check' stats={`${completedOrders}`} title='สำเร็จแล้ว' color='success' />
      </Grid>
      <Grid size={{ xs: 6, lg: 3 }}>
        <StatCard icon='tabler-star' stats={`${reviewsGivenCount}`} title='รีวิวที่ให้' color='warning' />
      </Grid>
      <Grid size={{ xs: 6, lg: 3 }}>
        <StatCard icon='tabler-award' stats={`${user.userBadges.length}`} title='Badge ที่ได้รับ' color='info' />
      </Grid>

      {/* แถว 3 — คำสั่งซื้อ + รีวิว (สูงเท่ากัน) */}
      <Grid size={{ xs: 12, lg: 6 }}>
        <Orders orders={recentOrders} />
      </Grid>
      <Grid size={{ xs: 12, lg: 6 }}>
        <Transactions reviews={recentReviews} />
      </Grid>
    </Grid>
  )
}
