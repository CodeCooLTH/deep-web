/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(reports)/sales/page.tsx
 *
 * Re-sourced S15 (Phase B): single-card layout (chart-on-top, table-below) จาก Paces theme.
 * ตัด Flatpickr ออกจาก page — ย้ายไปอยู่ใน SalesDateRange client component แทน
 * (SalesDateRange ขับ real date filtering ผ่าน ?from=&to= searchParams → real data).
 * ข้อมูลทั้งหมดมาจาก real orders ของ shop — ไม่มี Paces demo series ใด ๆ ใน runtime.
 */
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { formatDate, thaiDayKey, localDayKey } from '@/lib/format-date'
import { authOptions } from '@/lib/auth'
import { getOrdersByShop } from '@/services/order.service'
import { can, rolesFromMembership } from '@/lib/shop-permissions'
import ExpenseLockedCard from '../expenses/components/ExpenseLockedCard'
import { requireActiveShop } from '@/lib/shop-context'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import SalesChart from './components/SalesChart'
import SalesTable from './components/SalesTable'
import SalesDateRange from './components/SalesDateRange'
import type { DailyRow, SummaryData } from './components/data'
import { resolveRangeFromParams, thaiMidnightUtc } from '@/lib/date-range'
import { usesServiceFinanceRules } from '@/lib/finance-rules'
import { DRAFTED_STATUS } from '@/lib/order-visibility'
import { countsAsRevenue } from '@/lib/order-revenue'
import { netOfReturns, type ReturnAdjustment } from '@/lib/order-return'
import { getReturnAdjustments } from '@/services/return-adjustment.service'
import { resolveShopVertical } from '@/lib/lodging'
import { resolveOrderVocab, FINANCE_MENU_LABEL } from '@/lib/seller-menu'
import { resolveFinanceTab, resolveDataCompleteness, FINANCE_TAB_PARAM } from '@/lib/finance-tabs'
import { getPnlReport } from '@/services/pnl.service'
import { listExpenses, serializeExpense, hasAnyExpense } from '@/services/expense.service'
import { getCostCoverage } from '@/services/cost-coverage.service'
import { getReceivables, RECEIVABLE_BASIS_NOTE } from '@/services/receivable.service'
import FinanceTabs from './components/FinanceTabs'
import IncompleteDataNotice from './components/IncompleteDataNotice'
import ReceivableList from './components/ReceivableList'
import PnlReportCard from '../expenses/components/PnlReportCard'
import ExpenseWorkspace from '../expenses/components/ExpenseWorkspace'

export const metadata: Metadata = { title: 'ภาพรวมยอดขาย' }

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

/**
 * "เดือนนี้" แบบเดิมของร้านที่ไม่ใช่บริการ — **ทั้งเดือนปฏิทิน** (วันที่ 1 ถึงวันสุดท้าย) ไม่ใช่ 1 ถึงวันนี้
 * คัดลอกจากโค้ดก่อน 00067 (commit e3a52782 · monthRange + parseDate) ทุกบรรทัด — ร้านขายของ/บ้านพัก
 * ต้องได้ตัวเลขและ %เทียบช่วงก่อนเท่าเดิม (มติ user 2026-10-02 · src/lib/finance-rules.ts)
 */
function legacyMonthRange(): { from: Date; toExcl: Date; label: { start: string; end: string } } {
  const fromLocal = new Date()
  fromLocal.setDate(1)
  fromLocal.setHours(0, 0, 0, 0)
  const toLocal = new Date(fromLocal)
  toLocal.setMonth(toLocal.getMonth() + 1)
  toLocal.setDate(0)
  toLocal.setHours(23, 59, 59, 999)
  return {
    from: thaiMidnightUtc(fromLocal.getFullYear(), fromLocal.getMonth(), fromLocal.getDate()),
    toExcl: thaiMidnightUtc(toLocal.getFullYear(), toLocal.getMonth(), toLocal.getDate() + 1),
    label: { start: localDayKey(fromLocal), end: localDayKey(toLocal) },
  }
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tab?: string; range?: string; start?: string; end?: string }>
}) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/auth/sign-in')

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
  if (!active) redirect('/shop')
  const shop = active.shop

  /**
   * 00071 BR-RP-08: หน้านี้ทั้งหน้า (ทุกแท็บ) เป็นการเงินเต็ม = เจ้าของร้านเท่านั้น
   * 🛑 ต้องตัดสินตรงนี้ ก่อน parse ช่วงเวลา/query ใด ๆ — ผู้ไม่ใช่เจ้าของต้องไม่ถูกดึงข้อมูลเลย
   */
  if (!can(rolesFromMembership(active.role, active.roles), 'F1')) {
    return (
      <>
        <PageBreadcrumb title={FINANCE_MENU_LABEL} trail={[{ label: 'ธุรกิจ' }]} />
        <ExpenseLockedCard />
      </>
    )
  }

  /**
   * ช่วงเวลา — **ชุดเดียวทุกแท็บ** (`?range=` + `start`/`end`) ผ่าน resolveRangeFromParams (2026-10-01)
   *
   * 🛑 เดิมแท็บยอดเก็บเงินอ่าน `?from=&to=` แต่แท็บกำไร/ค่าใช้จ่ายอ่าน `?range=` ⇒ สลับแท็บแล้ว
   * ช่วงเวลาหาย และ default ไม่ตรงกัน (ทั้งเดือน vs 30 วัน) · ตอนนี้ default = "เดือนนี้" ทุกแท็บ
   * (วันที่ 1 ถึงวันนี้ ตามนิยามเดียวของ resolveDateRange) · `?from=&to=` ยังรับเป็นลิงก์เก่า
   *
   * ขอบวันเป็นเที่ยงคืนเวลาไทยจาก resolveDateRange (feature 00033 §5.3) — ห้ามคำนวณจาก getter
   * ของ Date ที่ server (UTC บน Vercel) ซึ่งเคยทำให้ออเดอร์เช้ามืดตกไปผิดวัน
   */
  const period = resolveRangeFromParams(sp, 'month')
  /**
   * กติกาการเงินชุดใหม่ (00067) — **ร้านบริการเท่านั้น** · ร้านอื่นกลับเป็นของเดิม (มติ user 2026-10-02)
   * ของเดิม: นับยอดจาก status === 'CONFIRMED' · ไม่ตัดร่าง/คืนของ · ไม่หักคืนบางส่วน · นับใบยกเลิกในจำนวนออเดอร์
   * · "เดือนนี้" = ทั้งเดือนปฏิทิน · ถ้อยคำ/สีเดิมของกราฟ/ตาราง
   */
  const newRules = usesServiceFinanceRules(shop.vertical)
  const legacyMonth = !newRules && period.preset === 'month' ? legacyMonthRange() : null
  const from = legacyMonth?.from ?? period.resolved.orderRange.gte
  const toExcl = legacyMonth?.toExcl ?? period.resolved.orderRange.lt
  const rangeLabelDays = legacyMonth?.label ?? period.resolved.label
  /** ป้ายช่วงเวลาที่ผู้ใช้อ่าน — วัน-เดือน-ปี พ.ศ. ผ่านตัวกลาง (เดิมหัวการ์ดกำไรโชว์ "2026-09-01" ดิบ) */
  const periodLabel = `${formatDate(rangeLabelDays.start)} – ${formatDate(rangeLabelDays.end)}`
  const rangeFilter = <SalesDateRange range={period.preset} customDates={period.custom} />

  /** ผ่านด่านเจ้าของร้านข้างบนแล้ว = เห็นการเงินเสมอ (ตัวแปรคงไว้ให้โค้ดเดิมด้านล่างอ่านง่าย) */
  const canSeeFinance = true

  /**
   * ── การเงินร้าน 3 แท็บ (feature 00067) ─────────────────────────────────────
   *
   * 🛑 ตัดสิน vertical ที่นี่ **จุดเดียว** ไม่กระจายเงื่อนไขลงไปในคอมโพเนนต์ลูก —
   * เงื่อนไขที่กระจายจะเงียบเมื่อมี vertical ที่สี่ (บทเรียน 00028) และ `resolveShopVertical`
   * fail-closed ให้แล้ว ห้ามเทียบสตริงเอง
   *
   * 🛑 ร้าน vertical อื่นต้องไม่เห็นความเปลี่ยนแปลงใด ๆ — โค้ดข้างล่างทั้งหมดคงเดิมทุกบรรทัด
   * และไม่มีการ import คอมโพเนนต์แท็บเข้ามาในเส้นทางนั้น
   */
  const isServiceQueue = resolveShopVertical(shop.vertical) === 'SERVICE_QUEUE'
  const tab = isServiceQueue ? resolveFinanceTab(sp[FINANCE_TAB_PARAM]) : 'collect'
  const vocab = resolveOrderVocab(shop.vertical)

  if (isServiceQueue && canSeeFinance && tab !== 'collect') {
    const range = period.resolved
    const rangeQs = new URLSearchParams({ range: period.preset })
    if (period.custom) {
      rangeQs.set('start', period.custom[0])
      rangeQs.set('end', period.custom[1])
    }

    if (tab === 'expense') {
      // แท็บนี้คือหน้า /expenses ทั้งหน้า — ดึงชุดเดียวกับที่หน้านั้นดึง ไม่แตะ getOrdersByShop
      // (การ query ออเดอร์ทั้งร้านเพื่อแสดงรายการค่าใช้จ่ายคือการจ่ายฟรี — NFR-01/03)
      const [report, expenses, everRecorded] = await Promise.all([
        getPnlReport(shop.id, range, shop.vertical),
        listExpenses(shop.id, { range: range.expenseRange }),
        hasAnyExpense(shop.id),
      ])
      return (
        <>
          <PageBreadcrumb title={FINANCE_MENU_LABEL} trail={[{ label: 'ธุรกิจ' }]} />
          <FinanceTabs active={tab} panelId="finance-panel" />
          <div id="finance-panel" role="tabpanel" aria-labelledby={`finance-tab-${tab}`}>
            <ExpenseWorkspace
              initialRange={period.preset}
              initialCustom={period.custom}
              initialReport={report}
              initialExpenses={expenses.map(serializeExpense)}
              hasAnyExpenseEver={everRecorded}
              orderNoun={vocab.noun}
              costNoun={vocab.costNoun}
              serviceRules
            />
          </div>
        </>
      )
    }

    // tab === 'pnl'
    const [report, expenses, coverage] = await Promise.all([
      getPnlReport(shop.id, range, shop.vertical),
      listExpenses(shop.id, { range: range.expenseRange }),
      getCostCoverage(shop.id, range),
    ])
    const completeness = resolveDataCompleteness({
      // ธงมาจาก pnl.service ตัวเดียว ห้ามคำนวณซ้ำที่นี่ (สูตรเดียวต้องอยู่ที่เดียว)
      hasMissingCost: report.hasMissingCost,
      expenseCount: expenses.length,
      uncostedItemCount: coverage.uncostedItemCount,
      soldItemCount: coverage.soldItemCount,
    })

    return (
      <>
        <PageBreadcrumb title={FINANCE_MENU_LABEL} trail={[{ label: 'ธุรกิจ' }]} />
        <FinanceTabs active={tab} panelId="finance-panel" />
        <div id="finance-panel" role="tabpanel" aria-labelledby={`finance-tab-${tab}`}>
          {/* แท็บนี้เคยไม่มีตัวเลือกช่วงเวลาเลย — เปลี่ยนได้ทาง URL อย่างเดียว (พบ 2026-10-01) */}
          <div className="mb-1.25 flex min-w-0 justify-start sm:justify-end">{rangeFilter}</div>
          <IncompleteDataNotice
            completeness={completeness}
            costNoun={vocab.costNoun}
            costSetupHref="/products?cost=missing"
            expenseSetupHref={`/sales?${FINANCE_TAB_PARAM}=expense&${rangeQs.toString()}`}
          />
          <PnlReportCard
            report={report}
            expenses={expenses.map(serializeExpense)}
            rangeLabel={periodLabel}
            orderNoun={vocab.noun}
            costNoun={vocab.costNoun}
            capped={!completeness.complete}
            serviceRules
          />
        </div>
      </>
    )
  }

  /**
   * ช่วงก่อนหน้า — ยาวเท่ากัน ต่อเนื่องกันทันทีก่อน `from` (นิยามเดียวกับ pnl.service)
   * getOrdersByShop ดึงออเดอร์ทั้งหมดอยู่แล้วแล้วค่อยกรองในหน่วยความจำ → คิดช่วงก่อนหน้าได้ฟรี
   * ไม่มี query เพิ่ม ส่วนค่าใช้จ่ายแค่ขยายช่วงของ query เดิมให้คลุมทั้งสองช่วง
   */
  const spanMs = toExcl.getTime() - from.getTime()
  const prevFrom = new Date(from.getTime() - spanMs)

  /**
   * ไม่ query ตาราง `Expense` ที่หน้านี้แล้ว (มติ user 2026-08-09) — หน้านี้เหลือ
   * ยอดขาย − (ต้นทุนสินค้า + ค่าส่ง) เท่านั้น ค่าใช้จ่ายอื่นของร้านยังอยู่ที่หน้า /expenses
   */
  /**
   * 🛑 ตัดร่างออเดอร์ (DRAFTED, feature 00061) ทิ้ง — getOrdersByShop คืนทุกสถานะ แล้ว else-branch ข้างล่าง
   * (ไม่ใช่ CONFIRMED/CANCELLED) เคยนับร่างเป็น "รอลูกค้ายืนยัน" + จำนวนออเดอร์ ทั้งที่ร่างยังไม่ใช่บิลจริง
   * (พบ 2026-10-01 ตอนเทียบกับ receivable.service ซึ่งใช้ withoutDrafted อยู่แล้ว — ชุดแถวต้องตรงกัน)
   */
  // + `RETURNED` (คืนของครบทั้งใบ) ตัดเหมือนกัน — การขายถูกยกเลิกแล้ว หลักใบลดหนี้ · ตรงกับ P&L/receivable (มติ 2026-10-01)
  // คืนบางส่วนที่รับของแล้ว — หักยอด/ต้นทุนผ่านตัวกลางเดียวกับ P&L และชีต (มติ 2026-10-01)
  // ร้านที่ไม่ใช่บริการ: ไม่ดึง/ไม่หักยอดคืน และไม่ตัดร่าง/คืนของ — ของเดิม (Map ว่าง ⇒ amountOf = totalAmount)
  const [shopOrders, returnAdj] = await Promise.all([
    getOrdersByShop(shop.id),
    newRules ? getReturnAdjustments(shop.id) : Promise.resolve(new Map<string, ReturnAdjustment>()),
  ])
  /** ยอดบิลหลังหักคืนบางส่วน — ใช้แทน totalAmount ดิบทุกจุดในหน้านี้ */
  const amountOf = (o: { id: string; totalAmount: unknown }) =>
    netOfReturns(Number(o.totalAmount ?? 0), returnAdj.get(o.id))
  const allOrders = newRules
    ? shopOrders.filter((o) => o.status !== DRAFTED_STATUS && o.status !== 'RETURNED')
    : shopOrders
  /** นับเป็นยอดขายไหม — ร้านบริการ: countsAsRevenue (SSOT) · ร้านอื่น: status === 'CONFIRMED' ตามเดิม */
  const isSale = (o: (typeof shopOrders)[number]) => (newRules ? countsAsRevenue(o) : o.status === 'CONFIRMED')

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
      // 🛑 countsAsRevenue (SSOT order-revenue.ts) ไม่ใช่ status==='CONFIRMED' — ดูหมายเหตุที่ลูปรายวัน
      if (o.status === 'CANCELLED') cancelled++
      else if (isSale(o)) { revenue += amountOf(o); completed++ }
      else { unconfirmed += amountOf(o) }
    }
    // orders = ร้านบริการไม่นับใบยกเลิก (นิยามเดียวกับชีต) · ร้านอื่นนับทุกใบตามเดิม
    return { revenue, unconfirmed, completed, cancelled, orders: newRules ? rows.length - cancelled : rows.length }
  }
  const prevWindow = sumWindow(inPrevRange)

  /**
   * ค่าส่งจริงของ "ช่วงก่อนหน้า" — ต้องนับด้วยเกณฑ์เดียวกับช่วงปัจจุบันเป๊ะ (CONFIRMED + พัสดุ active
   * ที่รู้ราคาแล้ว) ไม่งั้น badge %เปลี่ยนแปลงบนการ์ดค่าใช้จ่ายจะเทียบของคนละชนิดกัน: ตัวตั้งรวมค่าส่ง
   * ตัวเทียบไม่รวม → ขึ้นเป็น "เพิ่มขึ้นมหาศาล" ทุกร้านในวันที่ deploy ทั้งที่ไม่มีใครจ่ายเพิ่มสักบาท
   */
  const prevShippingTotal = inPrevRange.reduce((sum: number, o: OrderItem) => {
    if (o.status === 'CANCELLED' || !isSale(o)) return sum
    const sp = o.shipments?.[0]
    if (!sp) return sum
    return sum + Number(sp.carrierPrice ?? sp.estimatedPrice ?? 0) + Number(sp.codFee ?? 0)
  }, 0)

  // Build bucket maps
  const ordersPerDay: Record<string, number> = {}
  const completedPerDay: Record<string, number> = {}
  const revenuePerDay: Record<string, number> = {}
  // ยอดที่ลูกค้ายังไม่กดยืนยัน (ไม่นับที่ยกเลิก) — ชีตยอดขายบนมือถือแยกสองยอดนี้มาตั้งแต่แรก
  // แต่หน้าเว็บเก็บแค่ยอดที่ยืนยันแล้ว ทำให้สอง surface เล่าเรื่องคนละแบบจากข้อมูลชุดเดียวกัน
  const unconfirmedPerDay: Record<string, number> = {}
  /** บิลที่ไม่ถูกยกเลิกต่อวัน — คู่กับยอดบิล (revenue + unconfirmed) ของตารางร้านบริการ */
  const billPerDay: Record<string, number> = {}

  // COGS ต่อวัน — ต้องคิดด้วยถึงจะได้ "กำไรสุทธิ" สูตรเดียวกับการ์ด P&L ใน /expenses
  // (revenue − COGS − expense) ถ้าใช้แค่ revenue − expense ตัวเลขสองหน้าจะไม่ตรงกัน
  const cogsPerDay: Record<string, number> = {}
  /** ค่าส่งจริง+ค่าธรรมเนียม COD ต่อวัน — ส่วนหนึ่งของ "ค่าใช้จ่าย" ไม่ใช่ต้นทุนสินค้า (D-EXT-10) */
  const shippingCostPerDay: Record<string, number> = {}
  /** พัสดุที่ยังไม่รู้ค่าส่งจริงต่อวัน — ทำให้กำไรของวันนั้นเป็นเพดานบน ต้องมีป้ายกำกับ */
  const pendingShipmentPerDay: Record<string, number> = {}
  /** ยอดค่าธรรมเนียม COD ทั้งช่วง — ส่วนย่อยของค่าส่งข้างบน ใช้โชว์บนการ์ดเท่านั้น */
  let codFeeTotal = 0
  /** มีรายการที่ยืนยันแล้วแต่ยังไม่ตั้งต้นทุน — กำไร/อัตรากำไรเป็นเพดานบน (นิยามเดียวกับ isMissingCost) */
  let hasMissingCost = false

  for (const o of inRange) {
    // feature 00033 §5.3 — ตัดวันตามปฏิทินไทย ต้องเป็นคีย์รูปแบบเดียวกับที่ eachDay() สร้าง
    // ไม่งั้นค่าใน map นี้จะไม่ตรงกับวันที่ eachDay ไล่มา แล้วกราฟกลายเป็น 0 ทั้งแถบโดยไม่มี error
    const day = thaiDayKey(o.createdAt)
    if (o.status !== 'CANCELLED') {
      // "ออเดอร์" ของวันไม่นับใบยกเลิก — นิยามเดียวกับชีตหน้าหลัก (orderCounts) · ใบยกเลิกนับแยกที่การ์ด
      ordersPerDay[day] = (ordersPerDay[day] ?? 0) + 1
      billPerDay[day] = (billPerDay[day] ?? 0) + 1
    } else if (!newRules) {
      // ร้านที่ไม่ใช่บริการ: นับใบยกเลิกในจำนวนออเดอร์ของวันตามเดิม
      ordersPerDay[day] = (ordersPerDay[day] ?? 0) + 1
    }
    /**
     * 🛑 "ขายแล้ว/ยืนยันแล้ว" = countsAsRevenue (SSOT `lib/order-revenue.ts` — user เคาะ 2026-08-05:
     * ลูกค้ากดยืนยัน **หรือ** ขนส่งรับของไปแล้วจริง) ไม่ใช่ status==='CONFIRMED' อย่างเดียว
     * เดิมหน้านี้ใช้ CONFIRMED ล้วน ขณะที่ชีตหน้าหลัก/P&L/การ์ดหน้าแรกใช้ SSOT ⇒ ป้าย "ยืนยันแล้ว"
     * เดียวกันคนละตัวเลข (ข้อมูลจริง ส.ค.: ชีต 114,230 · /sales 86,040 — audit 2026-10-01)
     * COGS/ค่าส่ง/hasMissingCost ใช้ชุดแถวเดียวกัน (ตัวลบต้องอยู่ในขอบเขตเดียวกับตัวตั้ง)
     */
    if (o.status !== 'CANCELLED' && isSale(o)) {
      completedPerDay[day] = (completedPerDay[day] ?? 0) + 1
      revenuePerDay[day] = (revenuePerDay[day] ?? 0) + amountOf(o)
      // ต้นทุนของชิ้นที่คืนบางส่วน — หักครั้งเดียวต่อใบ (ตัวกลาง return-adjustment)
      const returnedCost = returnAdj.get(o.id)?.returnedCost ?? 0
      if (returnedCost) cogsPerDay[day] = (cogsPerDay[day] ?? 0) - returnedCost
      for (const item of o.items) {
        // cost = null คือ "ยังไม่ตั้งต้นทุน" ไม่ใช่ "ต้นทุน 0" — ข้ามไป (การ์ด P&L เตือนเรื่องนี้อยู่แล้ว)
        if (item.cost == null) {
          hasMissingCost = true
          continue
        }
        cogsPerDay[day] = (cogsPerDay[day] ?? 0) + Number(item.cost) * item.qty
      }
      /**
       * ค่าส่งจริง + ค่าธรรมเนียม COD จาก iShip = **ค่าใช้จ่าย** (D-EXT-10) ไม่ใช่ต้นทุนสินค้า
       * จึงไม่เข้า `cogsPerDay` แต่นับแยกใน `shippingCostPerDay`
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
        // ราคาจริงก่อน → ถ้ายังไม่มีใช้ราคาประมาณตอนสร้าง (iShip ไม่เปิดราคาจนกว่าจะชั่ง)
        // ค่าธรรมเนียม COD บวกได้เสมอ — รู้ตั้งแต่วินาทีที่สร้างพัสดุ
        const price = shipment.carrierPrice ?? shipment.estimatedPrice
        shippingCostPerDay[day] =
          (shippingCostPerDay[day] ?? 0) + Number(price ?? 0) + Number(shipment.codFee ?? 0)
        codFeeTotal += Number(shipment.codFee ?? 0)
        // ยังไม่ใช่ราคาจริง = ตัวเลขของวันนั้นยังขยับได้ ต้องมีป้ายกำกับ
        if (shipment.carrierPrice == null) {
          pendingShipmentPerDay[day] = (pendingShipmentPerDay[day] ?? 0) + 1
        }
      }
    } else if (o.status !== 'CANCELLED') {
      // ยังไม่นับเป็นยอดขาย (ลูกค้ายังไม่ยืนยัน และขนส่งยังไม่รับของ) — นิยามเดียวกับ getSalesSeries ของชีต
      unconfirmedPerDay[day] = (unconfirmedPerDay[day] ?? 0) + amountOf(o)
    }
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
    const billCount = billPerDay[date] ?? 0
    if (!canSeeFinance) return { date, label, orders, completed, revenue, unconfirmedRevenue, avgOrder, billCount }
    const shippingCost = shippingCostPerDay[date] ?? 0
    const pendingShipmentCount = pendingShipmentPerDay[date] ?? 0
    return {
      date, label, orders, completed, revenue, unconfirmedRevenue, avgOrder, billCount,
      shippingCost,
      netProfit: revenue - (cogsPerDay[date] ?? 0) - shippingCost,
      pendingShipmentCount,
    }
  })

  const totalOrders = daily.reduce((s, d) => s + d.orders, 0)
  const totalCompleted = daily.reduce((s, d) => s + d.completed, 0)
  const totalRevenue = daily.reduce((s, d) => s + d.revenue, 0)
  const totalUnconfirmed = daily.reduce((s, d) => s + d.unconfirmedRevenue, 0)
  const avgOrderValue = totalCompleted > 0 ? totalRevenue / totalCompleted : 0

  const cancelledCount = inRange.filter((o: OrderItem) => o.status === 'CANCELLED').length
  // ร้านบริการ: totalOrders ไม่รวมใบยกเลิกแล้ว ⇒ รอยืนยัน = ทั้งหมด − ขายแล้ว · ร้านอื่น: สูตรเดิม (หักยกเลิก)
  const unconfirmedCount = newRules ? totalOrders - totalCompleted : totalOrders - totalCompleted - cancelledCount
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
      totalShippingCost: daily.reduce((s, d) => s + (d.shippingCost ?? 0), 0),
      totalCodFee: codFeeTotal,
      netProfit: daily.reduce((s, d) => s + (d.netProfit ?? 0), 0),
      prevShippingCost: prevShippingTotal,
      pendingShipmentCount: daily.reduce((s, d) => s + (d.pendingShipmentCount ?? 0), 0),
      // ป้าย "ไม่เกิน" เมื่อตั้งต้นทุนไม่ครบ — กติกาใหม่ ร้านบริการเท่านั้น (ร้านอื่นแสดงแบบเดิม)
      ...(newRules && { hasMissingCost }),
    }),
  }

  /**
   * รายการที่ยังเก็บเงินไม่ครบ — เฉพาะแท็บ "ยอดเก็บเงิน" ของร้านบริการที่มีสิทธิ์ดูการเงิน
   * ร้าน vertical อื่นไม่ยิง query นี้เลยสักครั้ง (NFR-01)
   *
   * 🛑 ใช้ช่วงเดียวกับการ์ด/กราฟ/ตารางของแท็บนี้ (`period` จาก resolveRangeFromParams ตัวเดียวทุกแท็บ) —
   * ยอดรวมบนการ์ดกับรายการที่ตามเก็บต้องมาจากช่วงเดียวกัน ไม่งั้นสองก้อนบนจอเดียวขัดกันเอง
   */
  const receivables =
    isServiceQueue && canSeeFinance
      ? await getReceivables(shop.id, {
          orderRange: { gte: from, lt: toExcl },
          expenseRange: { gte: from, lt: toExcl },
          label: period.resolved.label,
          prevRange: {
            orderRange: { gte: prevFrom, lt: from },
            expenseRange: { gte: prevFrom, lt: from },
          },
        })
      : null

  /**
   * แกนเงินของร้านบริการ: เติม "รับจริง" รายวันจาก receivable.service (แถวชุดเดียวกับ summary)
   * ⇒ กราฟ/ตารางแยก รับจริง | ค้างรับ ได้ทุกวัน เหมือนชีตหน้าหลัก (เดิมแท่งเดียวเพราะไม่มีข้อมูลนี้)
   */
  const dailyView: DailyRow[] = receivables
    ? daily.map((d) => ({ ...d, received: receivables.daily[d.date]?.received ?? 0 }))
    : daily

  return (
    <>
      <PageBreadcrumb
        title={isServiceQueue ? FINANCE_MENU_LABEL : 'ภาพรวมยอดขาย'}
        trail={[{ label: 'ภาพรวม' }]}
      />
      {isServiceQueue && canSeeFinance && <FinanceTabs active="collect" panelId="finance-panel" />}
      <div id="finance-panel" role={isServiceQueue && canSeeFinance ? 'tabpanel' : undefined} aria-labelledby={isServiceQueue && canSeeFinance ? 'finance-tab-collect' : undefined}>

      {/* เลิกใช้ single-card ครอบทั้งหน้า — SalesChart render การ์ดสรุปแยกใบเองแล้ว (แบบหน้าสินค้า)
          ถ้ายังครอบอยู่จะกลายเป็นการ์ดซ้อนการ์ด ซึ่ง DESIGN.md §anti-slop ห้าม */}
      <div className="mb-1.25 flex min-w-0 flex-wrap items-center justify-start gap-3 sm:justify-end">
        {rangeFilter}
      </div>

      <SalesChart
        daily={dailyView}
        summary={summary}
        periodLabel={periodLabel}
        isServiceQueue={isServiceQueue}
        collect={receivables?.summary}
      />

      <div className="card mt-1.25">
        <SalesTable
          rows={dailyView}
          showFinance={canSeeFinance && !isServiceQueue}
          countNoun={isServiceQueue ? 'งาน' : 'ออเดอร์'}
          moneyAxis={isServiceQueue && receivables != null}
          profitCapped={summary.hasMissingCost === true}
        />
      </div>

      {receivables && (
        <div className="mt-1.25">
          <ReceivableList
            /* key = ช่วงเวลา — ReceivableList ก๊อป initialItems/cursor ลง useState และ Next 16 คง state ของ
               client component ข้ามการเปลี่ยน search params ⇒ ไม่มี key จะค้างรายการของช่วงเก่า แล้ว
               "ดูเพิ่ม" ส่ง cursor เก่าไปกับช่วงใหม่ ได้บิลปนกันสองช่วง (review 2026-10-01) */
            key={`${period.resolved.label.start}_${period.resolved.label.end}`}
            summary={receivables.summary}
            initialItems={receivables.items}
            initialCursor={receivables.nextCursor}
            rangeQuery={`range=custom&start=${period.resolved.label.start}&end=${period.resolved.label.end}`}
            basisNote={RECEIVABLE_BASIS_NOTE}
          />
        </div>
      )}
      </div>
    </>
  )
}
