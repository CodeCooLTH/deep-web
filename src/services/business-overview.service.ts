/**
 * business-overview.service.ts — "ภาพรวมทุกธุรกิจ" บน Dashboard บริบท Personal (feature 00069)
 * SSOT: docs/20 - Features/00069 - Professional Multi-Business Dashboard/SDS.md §3
 *
 * 🛑 ไม่มีสูตรเงินในไฟล์นี้ — ตัวเลขทุกตัวมาจาก getPnlReport / getSalesSeries ตัวเดิม
 *    เพื่อให้การ์ดตรงกับหน้าการเงินของร้านนั้นทุกบาท (HR16)
 */
import { prisma } from '@/lib/prisma'
import { toFileUrl } from '@/lib/file-url'
import { isPaidBusinessShop } from '@/lib/paid-business'
import { resolveDataCompleteness } from '@/lib/finance-tabs'
import { financeHrefFor, marginPercent, summarizeOverview, sumSeries, type OverviewCard, type OverviewTotals } from '@/lib/business-overview'
import type { ResolvedDateRange } from '@/lib/date-range'
import { getPnlReport } from '@/services/pnl.service'
import { getSalesSeries } from '@/services/dashboard.service'

export type BusinessOverview = {
  totals: OverviewTotals
  cards: OverviewCard[]
  series: { labels: string[]; revenue: number[]; netProfit: number[] } | null
  /** "YYYY-MM" ของเดือนที่กราฟแสดง (เดือนที่ช่วงเวลาจบ) */
  seriesMonth: string
}

/**
 * @returns null = ไม่มีร้านเข้าเงื่อนไข → ไม่ render ส่วนนี้
 *
 * userId ต้องมาจาก sessionUserId() ของผู้เรียก — สิทธิ์กรองที่ WHERE ก่อนคำนวณ (fail-closed)
 * ไม่ใช่คำนวณทุกร้านแล้วค่อยซ่อนตอน render (ค่าที่ข้าม RSC ถูก serialize ลง HTML)
 */
export async function getBusinessOverview(
  userId: string,
  range: ResolvedDateRange,
  rangeQs: string,
): Promise<BusinessOverview | null> {
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
  const shops = rows.filter((s) =>
    isPaidBusinessShop({
      kind: s.kind,
      packageLockedAt: s.packageLockedAt,
      ownerSubscriptionStatus: s.user.businessPackageSubscription?.status ?? null,
    }),
  )
  if (shops.length === 0) return null

  // label.end = วันที่ปฏิทินไทย "YYYY-MM-DD" ⇒ ไม่ต้องคำนวณ timezone เอง
  const [year, month] = range.label.end.split('-').map(Number)

  const results = await Promise.allSettled(
    shops.map(async (shop) => {
      const [report, expenseCount, series] = await Promise.all([
        getPnlReport(shop.id, range, shop.vertical),
        prisma.expense.count({
          where: { shopId: shop.id, expenseDate: { gte: range.expenseRange.gte, lt: range.expenseRange.lt } },
        }),
        getSalesSeries(shop.id, 'daily', { year, month }, true, shop.vertical),
      ])
      return { report, expenseCount, series }
    }),
  )

  const cards: OverviewCard[] = []
  const seriesList: Parameters<typeof sumSeries>[0] = []
  shops.forEach((shop, i) => {
    const base = {
      shopId: shop.id,
      shopName: shop.shopName,
      logoUrl: toFileUrl(shop.logo ?? null),
      vertical: shop.vertical,
      href: financeHrefFor(shop.vertical, rangeQs),
    }
    const r = results[i]
    if (r.status === 'rejected') {
      console.error('[business-overview] shop failed', shop.id, r.reason)
      cards.push({ ...base, status: 'ERROR', revenue: 0, netProfit: 0, marginPct: null, orderCount: 0, missingCost: false, missingExpense: false })
      return
    }
    const { report, expenseCount, series } = r.value
    // ใช้แค่ missingCost/missingExpense — การ์ดไม่มีปุ่มตั้งราคาทุน จึงไม่ต้องนับรายการ
    const completeness = resolveDataCompleteness({
      hasMissingCost: report.hasMissingCost,
      expenseCount,
      uncostedItemCount: 0,
      soldItemCount: 0,
    })
    cards.push({
      ...base,
      status: 'OK',
      revenue: report.revenue,
      netProfit: report.netProfit,
      marginPct: marginPercent(report.revenue, report.netProfit),
      orderCount: report.orderCount,
      missingCost: completeness.missingCost,
      missingExpense: completeness.missingExpense,
    })
    seriesList.push(series)
  })

  const { totals, cards: sorted } = summarizeOverview(cards)
  return {
    totals,
    cards: sorted,
    series: sumSeries(seriesList),
    seriesMonth: `${year}-${String(month).padStart(2, '0')}`,
  }
}
