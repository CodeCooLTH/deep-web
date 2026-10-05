/**
 * business-overview.service.ts — "ภาพรวมทุกธุรกิจ" บน Dashboard บริบท Personal (feature 00069)
 * SSOT: docs/20 - Features/00069 - Professional Multi-Business Dashboard/SDS.md §3
 *
 * 🛑 ไม่มีสูตรเงินในไฟล์นี้ — ตัวเลขทุกตัวมาจาก getPnlReport / getSalesSeries ตัวเดิม
 *    เพื่อให้การ์ดตรงกับหน้าการเงินของร้านนั้นทุกบาท (HR16)
 */
import { prisma } from '@/lib/prisma'
import { STACK_COLOR_TOKENS } from '@/lib/portfolio-display'
import { toFileUrl } from '@/lib/file-url'
import { isPaidBusinessShop } from '@/lib/paid-business'
import { resolveDataCompleteness } from '@/lib/finance-tabs'
import {
  financeHrefFor,
  marginPercent,
  periodRange,
  aggregateSalesSeries,
  buildStack,
  buildPortfolio,
  type PortfolioMode,
  type AdditiveSalesSeries,
  type ComparisonRow,
  type PortfolioTotals,
} from '@/lib/business-overview'
import { resolveDateRange } from '@/lib/date-range'
import { getPnlReport } from '@/services/pnl.service'
import { getSalesSeries } from '@/services/dashboard.service'

/**
 * ร้านที่ผู้ใช้เห็นในภาพรวม — query เดียว แยกออกมาให้หน้าเช็คก่อน render
 * (ผู้ใช้ Personal ส่วนใหญ่ไม่มีร้าน BUSINESS ที่จ่ายแล้ว — ถ้าเช็คใน Suspense จะเห็น skeleton วาบทุกครั้ง)
 *
 * userId ต้องมาจาก sessionUserId() ของผู้เรียก — สิทธิ์กรองที่ WHERE ก่อนคำนวณ (fail-closed)
 * ไม่ใช่คำนวณทุกร้านแล้วค่อยซ่อนตอน render (ค่าที่ข้าม RSC ถูก serialize ลง HTML)
 */
export async function listOverviewShops(userId: string) {
  const rows = await prisma.shop.findMany({
    where: {
      kind: 'BUSINESS',
      deletedAt: null,
      purgedAt: null,
      packageLockedAt: null,
      // เจ้าของหลัก หรือ เจ้าของร่วม — ADMIN ไม่นับ (BRD FR-002)
      OR: [{ userId }, { members: { some: { userId, role: 'OWNER' } } }],
    },
    select: {
      id: true,
      shopName: true,
      logo: true,
      vertical: true,
      kind: true,
      packageLockedAt: true,
      user: { select: { businessPackageSubscription: { select: { status: true } } } },
    },
  })
  // WHERE ข้างบนแค่ตัดแถวล่วงหน้า — ตัวตัดสินจริงคือ lib ที่มีเทส
  return rows.filter((s) =>
    isPaidBusinessShop({
      kind: s.kind,
      packageLockedAt: s.packageLockedAt,
      ownerSubscriptionStatus: s.user.businessPackageSubscription?.status ?? null,
    }),
  )
}

export type OverviewShop = Awaited<ReturnType<typeof listOverviewShops>>[number]

// ─── v1.1 (2026-10-05) — SDS ส่วนแก้ไข v1.1 V1.1-3 ─────────────────────────────────────────

export type PortfolioSeries = {
  mode: PortfolioMode
  year: number
  month: number | null
  period: { start: string; end: string }
  aggregate: AdditiveSalesSeries
  stack: { key: string; name: string; values: number[] }[]
  rows: ComparisonRow[]
  totals: PortfolioTotals
}

type SeriesShop = { id: string; shopName: string; logo: string | null; vertical: string }

/**
 * ยอดรวมทุกธุรกิจของ period หนึ่ง (รายวัน = ทั้งเดือน · รายเดือน = ทั้งปี)
 *
 * ยอดขาย = getSalesSeries.total (นิยามการ์ดยอดขายเดิม: ยืนยันแล้ว + รอยืนยัน — มติ Q22)
 * กำไรสุทธิ = getPnlReport ของช่วงเดียวกัน (ตัวเดียวกับหน้าการเงินของร้าน)
 * includeFinance=false โดยเจตนา — กำไรมีแหล่งเดียว ไม่ให้ series กับ P&L ขัดกันเอง
 *
 * @param shops ผลจาก listOverviewShops (ผ่านด่านสิทธิ์แล้ว) · ว่าง = null
 * @param personal ร้าน Personal ของผู้ใช้เอง — แถวท้ายตาราง ไม่นับในยอดรวม/แท่งซ้อน (มติ Q18c/Q23)
 */
export async function getPortfolioSeries(
  shops: OverviewShop[],
  personal: SeriesShop | null,
  mode: PortfolioMode,
  year: number,
  month: number | null,
): Promise<PortfolioSeries | null> {
  if (shops.length === 0) return null
  const period = periodRange(mode, year, month)
  const range = resolveDateRange('custom', period.start, period.end)
  const rangeQs = new URLSearchParams({ range: 'custom', start: period.start, end: period.end }).toString()

  const all: { shop: SeriesShop; isPersonal: boolean }[] = [
    ...shops.map((s) => ({ shop: s, isPersonal: false })),
    ...(personal ? [{ shop: personal, isPersonal: true }] : []),
  ]
  const results = await Promise.allSettled(
    all.map(async ({ shop }) => {
      const [series, report, expenseCount] = await Promise.all([
        getSalesSeries(shop.id, mode, { year, month: month ?? undefined }, false, shop.vertical),
        getPnlReport(shop.id, range, shop.vertical),
        prisma.expense.count({
          where: { shopId: shop.id, expenseDate: { gte: range.expenseRange.gte, lt: range.expenseRange.lt } },
        }),
      ])
      return { series, report, expenseCount }
    }),
  )

  const rows: Omit<ComparisonRow, 'sharePct'>[] = []
  const bizSeries: AdditiveSalesSeries[] = []
  const stackInput: { key: string; name: string; total: number; values: number[] }[] = []
  all.forEach(({ shop, isPersonal }, i) => {
    const base = {
      shopId: shop.id,
      shopName: shop.shopName,
      logoUrl: toFileUrl(shop.logo ?? null),
      vertical: shop.vertical,
      isPersonal,
      href: financeHrefFor(shop.vertical, rangeQs),
    }
    const r = results[i]
    if (r.status === 'rejected') {
      console.error('[portfolio-series] shop failed', shop.id, r.reason)
      rows.push({ ...base, status: 'ERROR', sales: 0, netProfit: 0, marginPct: null, missingCost: false, missingExpense: false })
      return
    }
    const { series, report, expenseCount } = r.value
    const completeness = resolveDataCompleteness({
      hasMissingCost: report.hasMissingCost,
      expenseCount,
      uncostedItemCount: 0,
      soldItemCount: 0,
    })
    rows.push({
      ...base,
      status: 'OK',
      sales: series.total,
      netProfit: report.netProfit,
      marginPct: marginPercent(series.total, report.netProfit),
      missingCost: completeness.missingCost,
      missingExpense: completeness.missingExpense,
    })
    if (!isPersonal) {
      bizSeries.push(series)
      stackInput.push({ key: shop.id, name: shop.shopName, total: series.total, values: series.values })
    }
  })

  const aggregate = aggregateSalesSeries(bizSeries)
  // ทุกร้าน BUSINESS ล้ม → ไม่มีกราฟให้แสดง แต่ยังคืนแถว ERROR ให้ UI บอกผู้ใช้
  const { totals, rows: sorted } = buildPortfolio(rows)
  return {
    mode,
    year,
    month,
    period,
    aggregate: aggregate ?? {
      labels: [], values: [], confirmedValues: [], unconfirmedValues: [], orderCounts: [], codPendingValues: [],
      total: 0, prevTotal: 0, prevTotalToDate: 0, futureFromIndex: 0,
    },
    // ≤ จำนวนสีในชุด — เกินนี้สีจะวนซ้ำ ร้านสองร้านจะดูเป็นร้านเดียวกันในกราฟ
    stack: buildStack(stackInput, STACK_COLOR_TOKENS.length),
    rows: sorted,
    totals,
  }
}
