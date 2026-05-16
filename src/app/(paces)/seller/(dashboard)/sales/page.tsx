/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(reports)/sales/page.tsx
 *
 * Re-sourced S15 (Phase B): single-card layout (chart-on-top, table-below) จาก Paces theme.
 * ตัด Flatpickr ออกจาก page — ย้ายไปอยู่ใน SalesDateRange client component แทน
 * (SalesDateRange ขับ real date filtering ผ่าน ?from=&to= searchParams → real data).
 * ข้อมูลทั้งหมดมาจาก real orders ของ shop — ไม่มี Paces demo series ใด ๆ ใน runtime.
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { getOrdersByShop } from '@/services/order.service'
import { getShopByUserId } from '@/services/shop.service'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import SalesChart from './components/SalesChart'
import SalesTable from './components/SalesTable'
import SalesDateRange from './components/SalesDateRange'
import type { DailyRow, SummaryData } from './components/data'

export const metadata: Metadata = { title: 'ภาพรวมยอดขาย' }

function parseDate(s?: string, fallback?: Date): Date {
  if (!s) return fallback ?? new Date()
  const d = new Date(s)
  return isNaN(d.getTime()) ? (fallback ?? new Date()) : d
}

function monthRange(): { from: Date; to: Date } {
  const from = new Date()
  from.setDate(1)
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setMonth(to.getMonth() + 1)
  to.setDate(0)
  to.setHours(23, 59, 59, 999)
  return { from, to }
}

/** Iterate every day between from..to (inclusive) as YYYY-MM-DD strings */
function eachDay(from: Date, to: Date): string[] {
  const days: string[] = []
  const cur = new Date(from)
  cur.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(23, 59, 59, 999)
  while (cur.getTime() <= end.getTime()) {
    days.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from: fromStr, to: toStr } = await searchParams

  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) redirect('/auth/sign-in')

  const shop = await getShopByUserId(user.id)
  if (!shop) redirect('/shop')

  const { from: defFrom, to: defTo } = monthRange()
  const from = parseDate(fromStr, defFrom)
  const to = parseDate(toStr, defTo)
  to.setHours(23, 59, 59, 999)

  const allOrders = await getOrdersByShop(shop.id)

  // ใช้ type จริงจาก return value ของ getOrdersByShop — ป้องกัน silent break ถ้า schema เปลี่ยน
  type OrderItem = Awaited<ReturnType<typeof getOrdersByShop>>[number]

  const inRange = allOrders.filter((o: OrderItem) => {
    const t = new Date(o.createdAt).getTime()
    return t >= from.getTime() && t <= to.getTime()
  })

  // Build bucket maps
  const ordersPerDay: Record<string, number> = {}
  const completedPerDay: Record<string, number> = {}
  const revenuePerDay: Record<string, number> = {}

  for (const o of inRange) {
    const day = new Date(o.createdAt).toISOString().slice(0, 10)
    ordersPerDay[day] = (ordersPerDay[day] ?? 0) + 1
    if (o.status === 'CONFIRMED') {
      completedPerDay[day] = (completedPerDay[day] ?? 0) + 1
      revenuePerDay[day] = (revenuePerDay[day] ?? 0) + Number(o.totalAmount ?? 0)
    }
  }

  // Zero-fill every day in range
  const days = eachDay(from, to)
  const daily: DailyRow[] = days.map((date) => {
    const orders = ordersPerDay[date] ?? 0
    const completed = completedPerDay[date] ?? 0
    const revenue = revenuePerDay[date] ?? 0
    const avgOrder = completed > 0 ? revenue / completed : 0
    const label = new Date(date).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    return { date, label, orders, completed, revenue, avgOrder }
  })

  const totalOrders = daily.reduce((s, d) => s + d.orders, 0)
  const totalCompleted = daily.reduce((s, d) => s + d.completed, 0)
  const totalRevenue = daily.reduce((s, d) => s + d.revenue, 0)
  const avgOrderValue = totalCompleted > 0 ? totalRevenue / totalCompleted : 0

  const summary: SummaryData = { totalOrders, totalCompleted, totalRevenue, avgOrderValue }

  return (
    <>
      <PageBreadcrumb title="ภาพรวมยอดขาย" trail={[{ label: 'Analytics' }]} />

      {/* โครงสร้าง single-card ตาม Paces theme: header → card-body (chart) → table+pagination */}
      <div className="card">
        <div className="card-header flex items-center justify-between flex-wrap gap-3">
          <h5 className="card-title">รายงานยอดขาย</h5>
          <SalesDateRange
            from={from.toISOString().slice(0, 10)}
            to={to.toISOString().slice(0, 10)}
          />
        </div>

        <div className="card-body">
          <SalesChart daily={daily} summary={summary} />
        </div>

        {/* SalesTable render เป็น header+DataTable+card-footer ภายใน card เดียวกัน */}
        <SalesTable rows={daily} />
      </div>
    </>
  )
}
