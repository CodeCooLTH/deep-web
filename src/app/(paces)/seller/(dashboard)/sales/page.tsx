/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(reports)/sales/page.tsx
 *
 * Re-sourced S15 (Phase B): single-card layout (chart-on-top, table-below) จาก Paces theme.
 * ตัด Flatpickr ออกจาก page — ย้ายไปอยู่ใน SalesDateRange client component แทน
 * (SalesDateRange ขับ real date filtering ผ่าน ?from=&to= searchParams → real data).
 * ข้อมูลทั้งหมดมาจาก real orders ของ shop — ไม่มี Paces demo series ใด ๆ ใน runtime.
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { formatDate } from '@/lib/format-date'
import { authOptions } from '@/lib/auth'
import { getOrdersByShop } from '@/services/order.service'
import { listExpenses } from '@/services/expense.service'
import { resolveExpenseAccess } from '@/services/expense-access.service'
import { requireActiveShop } from '@/lib/shop-context'
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

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
  if (!active) redirect('/shop')
  const shop = active.shop

  const { from: defFrom, to: defTo } = monthRange()
  const from = parseDate(fromStr, defFrom)
  const to = parseDate(toStr, defTo)
  to.setHours(23, 59, 59, 999)

  /**
   * ค่าใช้จ่าย (feature 00016) มี gate สิทธิ์ของตัวเอง — หน้านี้ไม่มี. ไม่ผ่าน gate = ไม่ query
   * และไม่ส่งฟิลด์ใด ๆ ลงไป (คอลัมน์/การ์ดหายทั้งอัน) ไม่ใช่ส่ง 0 ลงไปแล้วให้ดูเหมือนไม่มีค่าใช้จ่าย
   */
  const expenseAccess = await resolveExpenseAccess(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  const canSeeFinance = expenseAccess.kind === 'GRANTED'

  const [allOrders, expensesInRange] = await Promise.all([
    getOrdersByShop(shop.id),
    canSeeFinance
      ? // expenseDate เก็บเป็น UTC-midnight ของวันตามปฏิทิน (ไม่ shift TZ) — boundary จึงต่างจาก
        // order.createdAt ที่เป็น timestamptz. ดู "Dual Boundary Design" ใน src/lib/date-range.ts
        listExpenses(shop.id, {
          range: {
            gte: new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())),
            lt: new Date(Date.UTC(to.getFullYear(), to.getMonth(), to.getDate() + 1)),
          },
        })
      : Promise.resolve([]),
  ])

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

  // COGS ต่อวัน — ต้องคิดด้วยถึงจะได้ "กำไรสุทธิ" สูตรเดียวกับการ์ด P&L ใน /expenses
  // (revenue − COGS − expense) ถ้าใช้แค่ revenue − expense ตัวเลขสองหน้าจะไม่ตรงกัน
  const cogsPerDay: Record<string, number> = {}

  for (const o of inRange) {
    const day = new Date(o.createdAt).toISOString().slice(0, 10)
    ordersPerDay[day] = (ordersPerDay[day] ?? 0) + 1
    if (o.status === 'CONFIRMED') {
      completedPerDay[day] = (completedPerDay[day] ?? 0) + 1
      revenuePerDay[day] = (revenuePerDay[day] ?? 0) + Number(o.totalAmount ?? 0)
      for (const item of o.items) {
        // cost = null คือ "ยังไม่ตั้งต้นทุน" ไม่ใช่ "ต้นทุน 0" — ข้ามไป (การ์ด P&L เตือนเรื่องนี้อยู่แล้ว)
        if (item.cost == null) continue
        cogsPerDay[day] = (cogsPerDay[day] ?? 0) + Number(item.cost) * item.qty
      }
    }
  }

  const expensePerDay: Record<string, number> = {}
  for (const e of expensesInRange) {
    const day = new Date(e.expenseDate).toISOString().slice(0, 10)
    expensePerDay[day] = (expensePerDay[day] ?? 0) + Number(e.amount)
  }

  // Zero-fill every day in range
  const days = eachDay(from, to)
  const daily: DailyRow[] = days.map((date) => {
    const orders = ordersPerDay[date] ?? 0
    const completed = completedPerDay[date] ?? 0
    const revenue = revenuePerDay[date] ?? 0
    const avgOrder = completed > 0 ? revenue / completed : 0
    const label = formatDate(date)
    if (!canSeeFinance) return { date, label, orders, completed, revenue, avgOrder }
    const expense = expensePerDay[date] ?? 0
    return {
      date, label, orders, completed, revenue, avgOrder,
      expense,
      netProfit: revenue - (cogsPerDay[date] ?? 0) - expense,
    }
  })

  const totalOrders = daily.reduce((s, d) => s + d.orders, 0)
  const totalCompleted = daily.reduce((s, d) => s + d.completed, 0)
  const totalRevenue = daily.reduce((s, d) => s + d.revenue, 0)
  const avgOrderValue = totalCompleted > 0 ? totalRevenue / totalCompleted : 0

  const summary: SummaryData = {
    totalOrders,
    totalCompleted,
    totalRevenue,
    avgOrderValue,
    ...(canSeeFinance && {
      totalExpense: daily.reduce((s, d) => s + (d.expense ?? 0), 0),
      netProfit: daily.reduce((s, d) => s + (d.netProfit ?? 0), 0),
    }),
  }

  return (
    <>
      <PageBreadcrumb title="ภาพรวมยอดขาย" trail={[{ label: 'ภาพรวม' }]} />

      {/* เลิกใช้ single-card ครอบทั้งหน้า — SalesChart render การ์ดสรุปแยกใบเองแล้ว (แบบหน้าสินค้า)
          ถ้ายังครอบอยู่จะกลายเป็นการ์ดซ้อนการ์ด ซึ่ง DESIGN.md §anti-slop ห้าม */}
      <div className="mb-1.25 flex flex-wrap items-center justify-end gap-3">
        <SalesDateRange from={from.toISOString().slice(0, 10)} to={to.toISOString().slice(0, 10)} />
      </div>

      <SalesChart daily={daily} summary={summary} />

      <div className="card mt-1.25">
        <SalesTable rows={daily} showFinance={canSeeFinance} />
      </div>
    </>
  )
}
