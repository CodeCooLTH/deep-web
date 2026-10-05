/**
 * line-report-summary.service.ts — ประกอบตัวเลขสรุปของกลุ่ม LINE (00070 · SDS §3.3 · SRS TFR-LGS-13/14)
 *
 * 🛑 HR16: ไม่มีสูตรยอดขาย/กำไรของตัวเองในไฟล์นี้ — เรียก SSOT เดิมแล้ว "ตัดวัน/บวก" เท่านั้น
 *   ออเดอร์/ยอดขาย/ยังไม่นับ → getSalesSeries · ยกเลิก → countCancelledOrders
 *   กำไร → getPnlReport (เรียกเฉพาะ showProfit) · Top 3 → getProductSalesMonth (ไม่ใช่ LODGING)
 * ต่อร้าน try/catch แยก — ล้ม = state ERROR (ไม่นับยอดรวม · ไม่ใช่ 0)
 */
import { getSalesSeries, type SalesSeries } from '@/services/dashboard.service'
import { getPnlReport } from '@/services/pnl.service'
import { getProductSalesMonth, type ProductSalesMonth } from '@/services/product-sales-series.service'
import { listExpenses } from '@/services/expense.service'
import { countCancelledOrders } from '@/services/cancelled-order-count.service'
import { resolveDateRange, shiftIsoDate } from '@/lib/date-range'
import { resolveDataCompleteness } from '@/lib/finance-tabs'
import { resolveShopVertical } from '@/lib/lodging'
import { combineTotals, isMixedFinanceRules, canSumProfit, mergeTop3, sumDays, sumDaysSparse, dailyValues, sumTrend, type TopRow } from '@/lib/line-report/aggregate'
import { monthsInRange } from '@/lib/line-report/cycle'
import type { TemplateNeeds } from '@/lib/line-report/template'
import type { GroupSummary, ShopProfit, ShopRef, ShopSummary, Totals, Window } from '@/lib/line-report/types'

export type SummaryFlags = {
  showOrders: boolean
  showSales: boolean
  showCancelled: boolean
  showTopProducts: boolean
  showProfit: boolean
}

/**
 * สิ่งที่เทมเพลตขอเพิ่มจาก flags (`deriveNeeds`) — ไม่ส่ง = ใช้ flags ล้วน (พฤติกรรมเดิม)
 * needTop3/needPnl = flags เดิมอยู่แล้ว จึงไม่อ่านซ้ำที่นี่ · needCycle ใช้ที่ชั้น send ไม่ใช่ที่นี่
 */
export type SummaryNeeds = Partial<Pick<TemplateNeeds, 'needSeries' | 'needTrend7' | 'needCompare' | 'needCancelled'>>

/** แนวโน้ม 7 วัน = 6 วันก่อน endIso ถึง endIso (EXT-09) */
const TREND_DAYS = 7

/**
 * cache ต่อรอบ sweep — เก็บ Promise (ไม่ใช่ค่า) เพื่อให้เรียกพร้อมกันก็ยิงครั้งเดียวต่อ key (AC-16-7)
 * key: series/top3 = (shopId,y,m) · cancelled/pnl = (shopId,start,end)
 */
export type SweepCache = {
  series: Map<string, Promise<SalesSeries>>
  top3: Map<string, Promise<ProductSalesMonth>>
  cancelled: Map<string, Promise<number>>
  profit: Map<string, Promise<ShopProfit>>
}

export const createSweepCache = (): SweepCache => ({
  series: new Map(),
  top3: new Map(),
  cancelled: new Map(),
  profit: new Map(),
})

function memo<T>(m: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let p = m.get(key)
  if (!p) {
    p = load()
    m.set(key, p)
  }
  return p
}

type Month = { year: number; month0: number }

async function summarizeShop(
  shop: ShopRef,
  months: Month[],
  { startIso, endIso }: Window,
  flags: SummaryFlags,
  needs: SummaryNeeds,
  cache: SweepCache,
): Promise<ShopSummary> {
  const out: ShopSummary = { shop, state: 'OK', orders: 0, confirmed: 0, unconfirmed: 0, cancelled: 0 }
  const vertical = shop.vertical ?? undefined

  // series ผ่าน memo เดียวกันทั้งยอดช่วงและกราฟ (key = ร้าน+เดือน) ⇒ เดือนซ้อนกันยิงครั้งเดียว
  const loadSeries = (m: Month) =>
    memo(cache.series, `${shop.id}:${m.year}:${m.month0}`, async () => {
      // รูป `= await getSalesSeries(` ตั้งใจ — เทสสแกน AC-14-1 ตรวจว่าผลถูกนำไปใช้จริง
      const series = await getSalesSeries(shop.id, 'daily', { year: m.year, month: m.month0 + 1 }, false, vertical)
      return series
    })

  if (flags.showOrders || flags.showSales || needs.needSeries || needs.needCompare) {
    const all = await Promise.all(months.map(loadSeries))
    all.forEach((s, i) => {
      out.orders += sumDays(s.orderCounts, months[i], startIso, endIso)
      out.confirmed += sumDays(s.confirmedValues, months[i], startIso, endIso)
      out.unconfirmed += sumDays(s.unconfirmedValues, months[i], startIso, endIso)
    })
  }

  if (needs.needTrend7) {
    const tStart = shiftIsoDate(endIso, -(TREND_DAYS - 1))
    const tMonths = monthsInRange(tStart, endIso)
    const all = await Promise.all(tMonths.map(loadSeries))
    out.trend = { dates: [], confirmed: [], orders: [] }
    all.forEach((s, i) => {
      out.trend!.confirmed.push(...dailyValues(s.confirmedValues, tMonths[i], tStart, endIso))
      out.trend!.orders.push(...dailyValues(s.orderCounts, tMonths[i], tStart, endIso))
    })
    for (let i = 0; i < TREND_DAYS; i++) out.trend.dates.push(shiftIsoDate(tStart, i))
  }

  if (flags.showCancelled || needs.needCancelled) {
    out.cancelled = await memo(cache.cancelled, `${shop.id}:${startIso}:${endIso}`, () =>
      countCancelledOrders(shop.id, startIso, endIso),
    )
  }

  // ร้านบ้านพักข้าม Top 3 (precedent 00063 · SDS §12 #12) — ไม่มีแถวหัวข้อด้วย (top3 = undefined)
  if (flags.showTopProducts && resolveShopVertical(shop.vertical) !== 'LODGING') {
    const all = await Promise.all(
      months.map((m) =>
        memo(cache.top3, `${shop.id}:${m.year}:${m.month0}`, () => getProductSalesMonth(shop.id, m.year, m.month0)),
      ),
    )
    const rows: TopRow[] = []
    all.forEach((pm, i) => {
      for (const r of pm.rows) {
        const qty = sumDaysSparse(r.qty, months[i], startIso, endIso)
        if (qty <= 0) continue // ไม่ขายในช่วงนี้ = ไม่ติดอันดับ (AC-16-1)
        rows.push({
          productId: r.key,
          name: r.name,
          qty,
          amount: sumDaysSparse(r.amount, months[i], startIso, endIso),
          isCustom: r.isCustom,
        })
      }
    })
    out.top3 = mergeTop3(rows)
    // ข้อมูลถูกตัดเพราะชนเพดาน = อันดับจากข้อมูลบางส่วน ต้องบอกผู้อ่าน (partial-data-must-be-labeled-or-filled)
    if (all.some((pm) => pm.truncated)) out.top3Truncated = true
  }

  // 🛑 guard ก่อนเรียก — showProfit=false ต้องไม่แตะ getPnlReport เลย (TFR-LGS-11)
  if (flags.showProfit) {
    out.profit = await memo(cache.profit, `${shop.id}:${startIso}:${endIso}`, async () => {
      const range = resolveDateRange('custom', startIso, endIso)
      // ยิงค่าใช้จ่ายขนานกับ P&L · คงรูป `= await getPnlReport(` ไว้ให้เทสสแกน AC-14-1
      const expensesP = listExpenses(shop.id, { range: range.expenseRange })
      // กัน unhandledRejection ถ้า getPnlReport throw ก่อนถึง await expensesP (await ด้านล่างยังได้ error ตามปกติ)
      expensesP.catch(() => undefined)
      const report = await getPnlReport(shop.id, range, shop.vertical)
      const expenses = await expensesP
      // ชุดเดียวกับ sales/page.tsx — ป้ายเพดานเมื่อข้อมูลไม่ครบ (ตัวนับรายการสินค้าไม่มีผลกับ `complete`)
      const c = resolveDataCompleteness({
        hasMissingCost: report.hasMissingCost,
        expenseCount: expenses.length,
        uncostedItemCount: 0,
        soldItemCount: 0,
      })
      return { netProfit: report.netProfit, capped: !c.complete }
    })
  }
  return out
}

export async function buildGroupSummary(input: {
  shops: ShopRef[]
  excluded: { shop: ShopRef; reason: string }[]
  window: Window
  flags: SummaryFlags
  /** ไม่ส่ง = flags ล้วน (พฤติกรรมเดิม) */
  needs?: SummaryNeeds
  cache: SweepCache
}): Promise<GroupSummary> {
  const { shops, excluded, window, flags, cache } = input
  const needs = input.needs ?? {}
  const months = monthsInRange(window.startIso, window.endIso)
  const settled = await Promise.allSettled(shops.map((s) => summarizeShop(s, months, window, flags, needs, cache)))
  const results: ShopSummary[] = settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    // ไม่ log payload/ข้อมูลลูกค้า — แค่ id ร้าน + ข้อความ error ให้สืบได้
    console.error('[line-report] shop summary failed', shops[i].id, r.reason instanceof Error ? r.reason.message : r.reason)
    return { shop: shops[i], state: 'ERROR', orders: 0, confirmed: 0, unconfirmed: 0, cancelled: 0 }
  })
  // เรียงเสถียร: ยอดขายนับแล้ว↓ แล้วชื่อ (AC-15-5) · ร้านที่ล้มตามหลังร้านปกติ
  const rank = (s: ShopSummary) => (s.state === 'OK' ? 0 : 1)
  results.sort(
    (a, b) => rank(a) - rank(b) || b.confirmed - a.confirmed || a.shop.name.localeCompare(b.shop.name, 'th'),
  )
  const excludedRows: ShopSummary[] = excluded.map((e) => ({
    shop: e.shop,
    state: 'EXCLUDED',
    excludedReason: e.reason,
    orders: 0,
    confirmed: 0,
    unconfirmed: 0,
    cancelled: 0,
  }))
  return {
    window,
    shops: [...results, ...excludedRows],
    ...(shops.length > 1 ? { total: combineTotals(results) } : {}),
    profitSummable: canSumProfit(shops),
    mixedFinanceRules: isMixedFinanceRules(shops),
    ...(needs.needTrend7
      ? { trend: sumTrend(results), ...(results.some((r) => r.state === 'ERROR') ? { trendPartial: true } : {}) }
      : {}),
  }
}

/**
 * ยอดสะสมของรอบเดือน (TD-005) — orders/ยอดขาย/ยังไม่นับ/ยกเลิก รวมทุกร้าน · ไม่มี Top 3/กำไร
 * ร้านที่ล้มไม่นับ (failed บอกจำนวน เพื่อให้ข้อความใส่หมายเหตุ "ไม่ครบ")
 */
export async function buildCycleCumulative(input: {
  shops: ShopRef[]
  window: Window
  cache: SweepCache
}): Promise<{ totals: Totals; failedShops: number }> {
  const s = await buildGroupSummary({
    ...input,
    excluded: [],
    flags: { showOrders: true, showSales: true, showCancelled: true, showTopProducts: false, showProfit: false },
  })
  return { totals: combineTotals(s.shops), failedShops: s.shops.filter((x) => x.state === 'ERROR').length }
}
