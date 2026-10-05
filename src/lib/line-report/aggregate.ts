/**
 * aggregate.ts — รวมตัวเลขหลายวัน/หลายร้าน (SRS TFR-13/14 · SDS §3.3) · pure
 * ไม่มีสูตรยอดขาย/กำไร — รับค่าที่ SSOT (getSalesSeries ฯลฯ) คำนวณแล้วมาตัดวัน/บวกเท่านั้น (HR16)
 */
import { usesServiceFinanceRules } from '@/lib/finance-rules'
import { round2 } from '@/lib/round2'
import type { ShopFinance, ShopRef, ShopSummary, Top3Row, Totals, Trend } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * 🛑 จุดเดียวที่ตัดวัน — วัน d (1-based) ของเดือนนี้อยู่ใน [startIso, endIso] ไหม
 * เปลี่ยนขอบ ±1 วัน = ยอดเพี้ยน (เทส mutation/parity อ้างฟังก์ชันนี้)
 */
function dayInRange(month: { year: number; month0: number }, day: number, startIso: string, endIso: string): boolean {
  const iso = `${month.year}-${pad(month.month0 + 1)}-${pad(day)}`
  return iso >= startIso && iso <= endIso
}

/** รวม series รายวันของเดือนหนึ่ง (index = วัน−1) เฉพาะวันในช่วง */
export function sumDays(
  values: ArrayLike<number>,
  month: { year: number; month0: number },
  startIso: string,
  endIso: string,
): number {
  let sum = 0
  for (let i = 0; i < values.length; i++) if (dayInRange(month, i + 1, startIso, endIso)) sum += values[i] ?? 0
  return sum
}

/**
 * ค่ารายวันของเดือนหนึ่งเฉพาะวันในช่วง เรียงตามวัน — วันที่ series ไม่มีค่า = 0 (ไม่ข้าม ไม่งั้น index เลื่อน)
 * ใช้ dayInRange ตัวเดียวกับ sumDays ⇒ Σ dailyValues = sumDays โดยโครงสร้าง
 */
export function dailyValues(
  values: ArrayLike<number>,
  month: { year: number; month0: number },
  startIso: string,
  endIso: string,
): number[] {
  const last = new Date(Date.UTC(month.year, month.month0 + 1, 0)).getUTCDate()
  const out: number[] = []
  for (let d = 1; d <= last; d++) if (dayInRange(month, d, startIso, endIso)) out.push(values[d - 1] ?? 0)
  return out
}

/** รวม trend ของร้านที่ state OK เท่านั้น (ERROR/EXCLUDED ไม่นับ) · ไม่มีร้านที่มี trend = undefined */
export function sumTrend(shops: readonly ShopSummary[]): Trend | undefined {
  let acc: Trend | undefined
  for (const s of shops) {
    if (s.state !== 'OK' || !s.trend) continue
    if (!acc) acc = { dates: [...s.trend.dates], confirmed: s.trend.confirmed.map(() => 0), orders: s.trend.orders.map(() => 0) }
    s.trend.confirmed.forEach((v, i) => (acc!.confirmed[i] += v))
    s.trend.orders.forEach((v, i) => (acc!.orders[i] += v))
  }
  return acc
}

/** เหมือน `sumDays` แต่รับแบบ sparse `[dayIdx0, value][]` (รูปของ getProductSalesMonth) */
export function sumDaysSparse(
  entries: ReadonlyArray<readonly [number, number]>,
  month: { year: number; month0: number },
  startIso: string,
  endIso: string,
): number {
  let sum = 0
  for (const [idx0, v] of entries) if (dayInRange(month, idx0 + 1, startIso, endIso)) sum += v
  return sum
}

/** ยอดรวมของร้านที่ state OK เท่านั้น — ERROR/EXCLUDED ไม่นับ (ไม่ใช่ 0) */
export function combineTotals(shops: readonly ShopSummary[]): Totals {
  const t: Totals = { orders: 0, confirmed: 0, unconfirmed: 0, cancelled: 0 }
  for (const s of shops) {
    if (s.state !== 'OK') continue
    t.orders += s.orders
    t.confirmed += s.confirmed
    t.unconfirmed += s.unconfirmed
    t.cancelled += s.cancelled
  }
  return t
}

export type TopRow = Top3Row & { productId?: string; isCustom?: boolean }

/** รวมแถวสินค้าข้ามเดือน (key = productId ?? ชื่อ) ตัด isCustom → qty↓ amount↓ ชื่อ ก→ฮ → ตัด `limit` */
export function mergeTop3(rows: readonly TopRow[], limit = 3): Top3Row[] {
  const by = new Map<string, Top3Row>()
  for (const r of rows) {
    if (r.isCustom) continue
    const key = r.productId ?? r.name
    const cur = by.get(key)
    if (cur) {
      cur.qty += r.qty
      cur.amount += r.amount
    } else by.set(key, { name: r.name, qty: r.qty, amount: r.amount })
  }
  return [...by.values()]
    .sort((a, b) => b.qty - a.qty || b.amount - a.amount || a.name.localeCompare(b.name, 'th'))
    .slice(0, limit)
}

/** กติกาการเงินของร้านไม่เท่ากัน (บริการ vs อื่น) */
export function isMixedFinanceRules(shops: readonly Pick<ShopRef, 'vertical'>[]): boolean {
  return new Set(shops.map((s) => usesServiceFinanceRules(s.vertical))).size > 1
}

/** รวมกำไรข้ามร้านได้ก็ต่อเมื่อทุกร้านใช้กติกาเดียวกัน — ไม่ใช่ = กำไรรายร้านเท่านั้น + หมายเหตุ */
export function canSumProfit(shops: readonly Pick<ShopRef, 'vertical'>[]): boolean {
  return !isMixedFinanceRules(shops)
}

/**
 * รวมค่าใช้จ่าย/ยอดหลังหักค่าใช้จ่ายของร้าน OK เท่านั้น (ERROR/EXCLUDED ไม่นับ) · round2
 * `expenseRecorded` รวมแบบ ∧ (ครบก็ต่อเมื่อทุกร้านมีบันทึก) · ร้าน OK ที่ไม่มี finance → undefined (รวมบางส่วนไม่ได้ ไม่ประมาณ)
 * ผู้เรียกตัดสินเรื่อง canSumProfit/ERROR เอง — ที่นี่รวมตามที่ได้รับ
 */
export function combineFinance(shops: readonly ShopSummary[]): ShopFinance | undefined {
  const ok = shops.filter((s) => s.state === 'OK')
  if (!ok.length || ok.some((s) => !s.finance)) return undefined
  let expense = 0, netSales = 0
  for (const s of ok) { expense += s.finance!.expense; netSales += s.finance!.netSales }
  return { expense: round2(expense), netSales: round2(netSales), expenseRecorded: ok.every((s) => s.finance!.expenseRecorded) }
}
