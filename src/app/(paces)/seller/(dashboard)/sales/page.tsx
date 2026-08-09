/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(reports)/sales/page.tsx
 *
 * Re-sourced S15 (Phase B): single-card layout (chart-on-top, table-below) จาก Paces theme.
 * ตัด Flatpickr ออกจาก page — ย้ายไปอยู่ใน SalesDateRange client component แทน
 * (SalesDateRange ขับ real date filtering ผ่าน ?from=&to= searchParams → real data).
 * ข้อมูลทั้งหมดมาจาก real orders ของ shop — ไม่มี Paces demo series ใด ๆ ใน runtime.
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { formatDate, thaiDayKey } from '@/lib/format-date'
import { authOptions } from '@/lib/auth'
import { getOrdersByShop } from '@/services/order.service'
import { listExpenses } from '@/services/expense.service'
import { groupExpensesByCategory } from '@/lib/expense'
import { resolveExpenseAccess } from '@/services/expense-access.service'
import { requireActiveShop } from '@/lib/shop-context'
// feature 00033 §5.3 — เที่ยงคืนตามปฏิทินไทย (ไม่ใช่ของ server ซึ่งเป็น UTC) ใช้ตัวเดียวกับ date-range.ts
import { thaiMidnightUtc } from '@/lib/date-range'
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

/**
 * "YYYY-MM-DD" จาก getter ตาม server-local ของ Date instance (I-1, 2026-08-06)
 *
 * ใช้คู่กับ from/toExcl ที่สร้างจาก getter ชุดเดียวกัน (thaiMidnightUtc(fromLocal.getFullYear()/
 * getMonth()/getDate())) ด้านล่าง — ห้ามใช้ thaiDayKey(instant) กับ toLocal เพราะ monthRange()
 * ปิดท้ายด้วย to.setHours(23,59,59,999) แบบ server-local: บน prod (Vercel, TZ=UTC)
 * instant นั้นตกไปอยู่ 06:59 น. ของ "วันถัดไป" ตามเวลาไทย → thaiDayKey อ่านผิดวันไปหนึ่งวัน
 * (ชิปเขียน "1 ก.ย." ทั้งที่กราฟ/ตารางข้างล่างยังถูก เพราะ from/toExcl ใช้ getter ตัวนี้อยู่แล้ว)
 * บั๊กนี้ไม่ reproduce บนเครื่อง dev ที่ TZ=Asia/Bangkok — ต้องทดสอบด้วย TZ=UTC เท่านั้น
 */
function localDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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

/**
 * สร้างรายการวันตามปฏิทินไทย จาก from (เที่ยงคืนไทย, รวม) ถึง toExcl (เที่ยงคืนไทย, ไม่รวม)
 * feature 00033 §5.3 — เดินทีละ 24 ชม.บน UTC instant แล้วแปลงเป็นคีย์ด้วย thaiDayKey เท่านั้น
 * ห้ามใช้ setDate/setHours (local time ของ server = UTC บน Vercel) ไม่งั้นคีย์จะไม่ตรงกับ
 * thaiDayKey ที่ใช้ bucket ข้อมูลด้านล่าง → กราฟกลายเป็น 0 ทั้งแถบแบบเงียบ ๆ
 */
function eachDay(from: Date, toExcl: Date): string[] {
  const DAY_MS = 24 * 60 * 60 * 1000
  const days: string[] = []
  for (let t = from.getTime(); t < toExcl.getTime(); t += DAY_MS) {
    days.push(thaiDayKey(new Date(t)))
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
  const fromLocal = parseDate(fromStr, defFrom)
  const toLocal = parseDate(toStr, defTo)
  // feature 00033 §5.3 — ขอบวันต้องเป็นเที่ยงคืน "เวลาไทย" ไม่ใช่ของ server (ซึ่งเป็น UTC บน Vercel)
  // เดิม to.setHours(23,59,59,999) = 23:59 UTC = 06:59 น. ของวันถัดไปตามเวลาไทย
  // → ออเดอร์เช้ามืดของวันถัดไปถูกนับเข้าช่วงนี้ ส่วนออเดอร์เที่ยงคืนถึงเช้าของวันแรกหลุดออก
  const from = thaiMidnightUtc(fromLocal.getFullYear(), fromLocal.getMonth(), fromLocal.getDate())
  const toExcl = thaiMidnightUtc(toLocal.getFullYear(), toLocal.getMonth(), toLocal.getDate() + 1)

  /**
   * ค่าใช้จ่าย (feature 00016) มี gate สิทธิ์ของตัวเอง — หน้านี้ไม่มี. ไม่ผ่าน gate = ไม่ query
   * และไม่ส่งฟิลด์ใด ๆ ลงไป (คอลัมน์/การ์ดหายทั้งอัน) ไม่ใช่ส่ง 0 ลงไปแล้วให้ดูเหมือนไม่มีค่าใช้จ่าย
   */
  const expenseAccess = await resolveExpenseAccess(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  const canSeeFinance = expenseAccess.kind === 'GRANTED'

  /**
   * ช่วงก่อนหน้า — ยาวเท่ากัน ต่อเนื่องกันทันทีก่อน `from` (นิยามเดียวกับ pnl.service)
   * getOrdersByShop ดึงออเดอร์ทั้งหมดอยู่แล้วแล้วค่อยกรองในหน่วยความจำ → คิดช่วงก่อนหน้าได้ฟรี
   * ไม่มี query เพิ่ม ส่วนค่าใช้จ่ายแค่ขยายช่วงของ query เดิมให้คลุมทั้งสองช่วง
   */
  const spanMs = toExcl.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - spanMs)

  const [allOrders, expensesInRange] = await Promise.all([
    getOrdersByShop(shop.id),
    canSeeFinance
      ? // expenseDate เก็บเป็น UTC-midnight ของวันตามปฏิทิน (ไม่ shift TZ) — boundary จึงต่างจาก
        // order.createdAt ที่เป็น timestamptz. ดู "Dual Boundary Design" ใน src/lib/date-range.ts
        // ดึงคลุมช่วงก่อนหน้าด้วย (ยาวเท่ากัน ต่อเนื่องกัน) เพื่อคิด %เปลี่ยนแปลง — ยังเป็น query เดียว
        // ใช้ fromLocal/toLocal (ปฏิทินดิบ ไม่ shift) ไม่ใช่ from/toExcl (shift เข้าเที่ยงคืนไทยแล้ว)
        listExpenses(shop.id, {
          range: {
            gte: new Date(Date.UTC(fromLocal.getFullYear(), fromLocal.getMonth(), fromLocal.getDate()) - spanMs),
            lt: new Date(Date.UTC(toLocal.getFullYear(), toLocal.getMonth(), toLocal.getDate() + 1)),
          },
        })
      : Promise.resolve([]),
  ])

  // ใช้ type จริงจาก return value ของ getOrdersByShop — ป้องกัน silent break ถ้า schema เปลี่ยน
  type OrderItem = Awaited<ReturnType<typeof getOrdersByShop>>[number]

  const inRange = allOrders.filter((o: OrderItem) => {
    const t = new Date(o.createdAt).getTime()
    return t >= from.getTime() && t < toExcl.getTime()
  })
  const inPrevRange = allOrders.filter((o: OrderItem) => {
    const t = new Date(o.createdAt).getTime()
    return t >= prevFrom.getTime() && t < from.getTime()
  })

  /** รวมยอดของช่วงหนึ่ง — ใช้กับทั้งช่วงปัจจุบันและช่วงก่อนหน้า กันสูตรสองชุดหลุดจากกัน */
  const sumWindow = (rows: OrderItem[]) => {
    let revenue = 0, unconfirmed = 0, completed = 0, cancelled = 0
    for (const o of rows) {
      if (o.status === 'CONFIRMED') { revenue += Number(o.totalAmount ?? 0); completed++ }
      else if (o.status === 'CANCELLED') cancelled++
      else { unconfirmed += Number(o.totalAmount ?? 0) }
    }
    return { revenue, unconfirmed, completed, cancelled, orders: rows.length }
  }
  const prevWindow = sumWindow(inPrevRange)

  /**
   * ค่าส่งจริงของ "ช่วงก่อนหน้า" — ต้องนับด้วยเกณฑ์เดียวกับช่วงปัจจุบันเป๊ะ (CONFIRMED + พัสดุ active
   * ที่รู้ราคาแล้ว) ไม่งั้น badge %เปลี่ยนแปลงบนการ์ดค่าใช้จ่ายจะเทียบของคนละชนิดกัน: ตัวตั้งรวมค่าส่ง
   * ตัวเทียบไม่รวม → ขึ้นเป็น "เพิ่มขึ้นมหาศาล" ทุกร้านในวันที่ deploy ทั้งที่ไม่มีใครจ่ายเพิ่มสักบาท
   */
  const prevShippingTotal = inPrevRange.reduce((sum: number, o: OrderItem) => {
    if (o.status !== 'CONFIRMED') return sum
    const sp = o.shipments?.[0]
    if (!sp || sp.carrierPrice == null) return sum
    return sum + Number(sp.carrierPrice) + Number(sp.codFee ?? 0)
  }, 0)

  // Build bucket maps
  const ordersPerDay: Record<string, number> = {}
  const completedPerDay: Record<string, number> = {}
  const revenuePerDay: Record<string, number> = {}
  // ยอดที่ลูกค้ายังไม่กดยืนยัน (ไม่นับที่ยกเลิก) — ชีตยอดขายบนมือถือแยกสองยอดนี้มาตั้งแต่แรก
  // แต่หน้าเว็บเก็บแค่ยอดที่ยืนยันแล้ว ทำให้สอง surface เล่าเรื่องคนละแบบจากข้อมูลชุดเดียวกัน
  const unconfirmedPerDay: Record<string, number> = {}

  // COGS ต่อวัน — ต้องคิดด้วยถึงจะได้ "กำไรสุทธิ" สูตรเดียวกับการ์ด P&L ใน /expenses
  // (revenue − COGS − expense) ถ้าใช้แค่ revenue − expense ตัวเลขสองหน้าจะไม่ตรงกัน
  const cogsPerDay: Record<string, number> = {}
  /** ค่าส่งจริง+ค่าธรรมเนียม COD ต่อวัน — ส่วนหนึ่งของ "ค่าใช้จ่าย" ไม่ใช่ต้นทุนสินค้า (D-EXT-10) */
  const shippingCostPerDay: Record<string, number> = {}
  /** พัสดุที่ยังไม่รู้ค่าส่งจริงต่อวัน — ทำให้กำไรของวันนั้นเป็นเพดานบน ต้องมีป้ายกำกับ */
  const pendingShipmentPerDay: Record<string, number> = {}

  for (const o of inRange) {
    // feature 00033 §5.3 — ตัดวันตามปฏิทินไทย ต้องเป็นคีย์รูปแบบเดียวกับที่ eachDay() สร้าง
    // ไม่งั้นค่าใน map นี้จะไม่ตรงกับวันที่ eachDay ไล่มา แล้วกราฟกลายเป็น 0 ทั้งแถบโดยไม่มี error
    const day = thaiDayKey(o.createdAt)
    ordersPerDay[day] = (ordersPerDay[day] ?? 0) + 1
    if (o.status === 'CONFIRMED') {
      completedPerDay[day] = (completedPerDay[day] ?? 0) + 1
      revenuePerDay[day] = (revenuePerDay[day] ?? 0) + Number(o.totalAmount ?? 0)
      for (const item of o.items) {
        // cost = null คือ "ยังไม่ตั้งต้นทุน" ไม่ใช่ "ต้นทุน 0" — ข้ามไป (การ์ด P&L เตือนเรื่องนี้อยู่แล้ว)
        if (item.cost == null) continue
        cogsPerDay[day] = (cogsPerDay[day] ?? 0) + Number(item.cost) * item.qty
      }
      /**
       * ค่าส่งจริง + ค่าธรรมเนียม COD จาก iShip = **ค่าใช้จ่าย** (D-EXT-10) ไม่ใช่ต้นทุนสินค้า
       * จึงไม่เข้า `cogsPerDay` แต่ไปรวมกับ `expensePerDay` ด้านล่าง
       *
       * 🛑 นับเฉพาะออเดอร์ที่ CONFIRMED เหมือน COGS โดยตั้งใจ — ต้องเป็น **แถวชุดเดียวกับตัวตั้ง**
       * ไม่งั้นแถวรายวันจะหักค่าส่งของออเดอร์ที่ยังไม่ถูกนับเป็นยอดขาย แล้วกำไรของวันนั้นต่ำกว่าจริง
       * (บทเรียน `feedback_subtrahend_must_match_minuend_scope`) — ค่าส่งของใบที่ยังไม่ยืนยันจะโผล่
       * เองในวันที่ลูกค้ากดยืนยัน เพราะ bucket ยึด "วันที่สั่งซื้อ" ตัวเดียวกัน ไม่หายไปไหน
       *
       * `carrierPrice == null` = ขนส่งยังไม่เข้ารับ iShip จึงยังไม่คิดเงิน — นับเป็น "ยังไม่รู้"
       * ห้ามตีเป็น 0 (จะอ่านว่าส่งฟรี) และ `codFee` แยกก้อนกับค่าส่ง ไม่ทับซ้อนกัน
       */
      const shipment = o.shipments?.[0]
      if (shipment) {
        if (shipment.carrierPrice == null) {
          pendingShipmentPerDay[day] = (pendingShipmentPerDay[day] ?? 0) + 1
        } else {
          shippingCostPerDay[day] =
            (shippingCostPerDay[day] ?? 0) + Number(shipment.carrierPrice) + Number(shipment.codFee ?? 0)
        }
      }
    } else if (o.status !== 'CANCELLED') {
      // PENDING/SHIPPED = ขายได้แล้วแต่ยังไม่ถูกนับเป็นรายได้ (ตรงนิยามเดียวกับ getSalesSeries)
      unconfirmedPerDay[day] = (unconfirmedPerDay[day] ?? 0) + Number(o.totalAmount ?? 0)
    }
  }

  const expensePerDay: Record<string, number> = {}
  let prevExpenseTotal = 0
  const currentExpenses: typeof expensesInRange = []
  for (const e of expensesInRange) {
    const t = new Date(e.expenseDate).getTime()
    if (t < from.getTime()) { prevExpenseTotal += Number(e.amount); continue }  // ช่วงก่อนหน้า
    currentExpenses.push(e)
    // ข้อยกเว้นที่ตั้งใจ (feature 00033 §5.3 step 5): expenseDate ถูก normalize เป็น
    // UTC-midnight-of-calendar-date ตอน WRITE อยู่แล้ว (Dual Boundary Design, date-range.ts) —
    // ไม่ใช่ event-time ที่ต้อง shift เข้า thai TZ เหมือน order.createdAt ห้ามเปลี่ยนเป็น thaiDayKey
    const day = new Date(e.expenseDate).toISOString().slice(0, 10)
    expensePerDay[day] = (expensePerDay[day] ?? 0) + Number(e.amount)
  }

  // Zero-fill every day in range
  const days = eachDay(from, toExcl)
  const daily: DailyRow[] = days.map((date) => {
    const orders = ordersPerDay[date] ?? 0
    const completed = completedPerDay[date] ?? 0
    const revenue = revenuePerDay[date] ?? 0
    const avgOrder = completed > 0 ? revenue / completed : 0
    const label = formatDate(date)
    const unconfirmedRevenue = unconfirmedPerDay[date] ?? 0
    if (!canSeeFinance) return { date, label, orders, completed, revenue, unconfirmedRevenue, avgOrder }
    // ค่าใช้จ่ายของวัน = ที่ร้านบันทึกเอง + ค่าส่งจริงจาก iShip (สองแหล่ง ห้ามให้แหล่งใดเขียนทับอีกแหล่ง
    // — BR-EXP-18-05) ร้านที่พิมพ์ค่าส่งเองในหมวด "ค่าขนส่ง" ด้วยจะเห็นยอดซ้อน ซึ่งยังไม่มีทาง dedupe
    // อัตโนมัติได้ (ตอนนี้ตาราง Expense ว่างทั้งฐาน จึงยังไม่เกิดจริง — ดู Open Question ใน PRD)
    const shippingCost = shippingCostPerDay[date] ?? 0
    const expense = (expensePerDay[date] ?? 0) + shippingCost
    const pendingShipmentCount = pendingShipmentPerDay[date] ?? 0
    return {
      date, label, orders, completed, revenue, unconfirmedRevenue, avgOrder,
      expense,
      netProfit: revenue - (cogsPerDay[date] ?? 0) - expense,
      shippingCost,
      pendingShipmentCount,
    }
  })

  const totalOrders = daily.reduce((s, d) => s + d.orders, 0)
  const totalCompleted = daily.reduce((s, d) => s + d.completed, 0)
  const totalRevenue = daily.reduce((s, d) => s + d.revenue, 0)
  const totalUnconfirmed = daily.reduce((s, d) => s + d.unconfirmedRevenue, 0)
  const avgOrderValue = totalCompleted > 0 ? totalRevenue / totalCompleted : 0

  const cancelledCount = inRange.filter((o: OrderItem) => o.status === 'CANCELLED').length
  const unconfirmedCount = totalOrders - totalCompleted - cancelledCount
  const prevAvgOrder = prevWindow.completed > 0 ? prevWindow.revenue / prevWindow.completed : 0

  const summary: SummaryData = {
    totalOrders,
    totalCompleted,
    totalRevenue,
    totalUnconfirmed,
    avgOrderValue,
    unconfirmedCount,
    cancelledCount,
    days: days.length,
    prevRevenue: prevWindow.orders === 0 ? null : prevWindow.revenue,
    prevUnconfirmed: prevWindow.orders === 0 ? null : prevWindow.unconfirmed,
    prevOrders: prevWindow.orders === 0 ? null : prevWindow.orders,
    prevAvgOrder: prevWindow.completed === 0 ? null : prevAvgOrder,
    ...(canSeeFinance && {
      totalExpense: daily.reduce((s, d) => s + (d.expense ?? 0), 0),
      netProfit: daily.reduce((s, d) => s + (d.netProfit ?? 0), 0),
      prevExpense: prevExpenseTotal + prevShippingTotal,
      totalShippingCost: daily.reduce((s, d) => s + (d.shippingCost ?? 0), 0),
      pendingShipmentCount: daily.reduce((s, d) => s + (d.pendingShipmentCount ?? 0), 0),
      topExpenseCategory: groupExpensesByCategory(
        currentExpenses.map((e) => ({ category: e.category, amount: Number(e.amount) })),
      )[0]?.category,
    }),
  }

  return (
    <>
      <PageBreadcrumb title="ภาพรวมยอดขาย" trail={[{ label: 'ภาพรวม' }]} />

      {/* เลิกใช้ single-card ครอบทั้งหน้า — SalesChart render การ์ดสรุปแยกใบเองแล้ว (แบบหน้าสินค้า)
          ถ้ายังครอบอยู่จะกลายเป็นการ์ดซ้อนการ์ด ซึ่ง DESIGN.md §anti-slop ห้าม */}
      <div className="mb-1.25 flex flex-wrap items-center justify-end gap-3">
        {/* ใช้ fromLocal/toLocal (วันที่ตามที่เลือกจริง ไม่ shift) — from/toExcl ใช้เฉพาะกรอง order เท่านั้น
            localDayKey ไม่ใช่ thaiDayKey — ดูเหตุผลที่นิยามฟังก์ชันด้านบน (I-1) */}
        <SalesDateRange from={localDayKey(fromLocal)} to={localDayKey(toLocal)} />
      </div>

      <SalesChart daily={daily} summary={summary} />

      <div className="card mt-1.25">
        <SalesTable rows={daily} showFinance={canSeeFinance} />
      </div>
    </>
  )
}
