/**
 * ads-profit.ts — สูตรกลางของรายงานกำไรและประสิทธิภาพโฆษณารายวัน (00096 · PRD §3.2/§4.1 · BRD FR-004..FR-009)
 *
 * 🛑 สูตรทุกตัวอยู่ที่นี่ที่เดียว — หน้า/ตาราง/รายละเอียด/CSV เรียกจากที่นี่ (HR16) · ตัวประกอบ (ยอด/ต้นทุน/ค่าใช้จ่าย) มาจาก
 *    pnlOrderParts ใน ads-profit.service — ไฟล์นี้ไม่คิดยอดเอง
 * 🛑 ตัวหาร 0 = null ("—") ไม่ใช่ 0/∞ · ค่าโฆษณาไม่ทราบ (Meta ไม่ OK) = null แล้ว "กำไรหลังค่าโฆษณา" = null (ไม่แอบนับเป็น 0)
 */

export type ProfitParts = {
  /** จำนวนใบที่นับ (ตัวหารของต่อใบ) */
  orders: number
  /** ยอดสุทธิ (หลังหักคืน) — pnlOrderParts.revenue */
  revenue: number
  /** ต้นทุนสินค้า (หลังหักคืน) */
  cogs: number
  /** ค่าใช้จ่ายผันแปรที่ระบบมี: ค่าส่งขาไป (ตามกฎหน้ากำไร) + ค่าส่งคืน */
  variable: number
  /** ใบที่ต้นทุน/ค่าส่งไม่ครบ */
  incomplete: number
}

export type ProfitMetrics = {
  profitBefore: number
  /** null = ไม่ทราบค่าโฆษณา */
  profitAfter: number | null
  costPerOrder: number | null
  profitPerOrder: number | null
  aov: number | null
  /** % ของยอดสุทธิ */
  margin: number | null
  roas: number | null
}

const r2 = (n: number) => Math.round(n * 100) / 100
const div = (a: number, b: number) => (b > 0 ? a / b : null)

export function profitMetrics(spend: number | null, p: ProfitParts): ProfitMetrics {
  const profitBefore = r2(p.revenue - p.cogs - p.variable)
  const profitAfter = spend === null ? null : r2(profitBefore - spend)
  const per = profitAfter === null ? null : div(profitAfter, p.orders)
  const cpo = spend === null ? null : div(spend, p.orders)
  const m = profitAfter === null ? null : div(profitAfter * 100, p.revenue)
  const roas = spend === null ? null : div(p.revenue, spend)
  const aov = div(p.revenue, p.orders)
  return {
    profitBefore,
    profitAfter,
    costPerOrder: cpo === null ? null : r2(cpo),
    profitPerOrder: per === null ? null : r2(per),
    aov: aov === null ? null : r2(aov),
    margin: m === null ? null : Math.round(m * 10) / 10,
    roas: roas === null ? null : r2(roas),
  }
}

/** เกณฑ์ตัดสินสถานะ (BRD FR-006) — ค่าเดียวทั้งระบบ */
export const PROFIT_RULES = { minOrders: 3, minSpend: 300, breakevenPct: 2 } as const

export type ProfitStatus = 'INCOMPLETE' | 'LOW_DATA' | 'NO_SPEND' | 'PROFIT' | 'BREAKEVEN' | 'LOSS'

/** ลำดับตรวจตาม BRD FR-006: ต้นทุนไม่ครบ → ข้อมูลไม่พอ → (ไม่ทราบค่าโฆษณา) → เท่าทุน → กำไร/ขาดทุน */
export function profitStatus(spend: number | null, p: ProfitParts, m: ProfitMetrics): ProfitStatus {
  if (p.incomplete > 0) return 'INCOMPLETE'
  if (p.orders < PROFIT_RULES.minOrders && (spend ?? 0) < PROFIT_RULES.minSpend) return 'LOW_DATA'
  if (spend === null || m.profitAfter === null) return 'NO_SPEND'
  if (spend > 0 && Math.abs(m.profitAfter) <= (spend * PROFIT_RULES.breakevenPct) / 100) return 'BREAKEVEN'
  return m.profitAfter > 0 ? 'PROFIT' : m.profitAfter < 0 ? 'LOSS' : 'BREAKEVEN'
}

/**
 * จัดสรรค่าโฆษณาให้แต่ละใบเท่า ๆ กัน (PRD §4.1 ข้อ 4) — ป้าย "กำไรต่อคำสั่งซื้อหลังจัดสรรค่าโฆษณา"
 * 🛑 ผลรวมที่จัดสรร = ค่าโฆษณาจริงเสมอ: ปัด 2 ตำแหน่งแล้วใบสุดท้ายรับเศษ · 0 ใบ = [] (ไม่กระจายไปใบอื่น)
 */
export function allocateSpend(spend: number, orderCount: number): number[] {
  if (orderCount <= 0) return []
  const each = Math.floor((spend / orderCount) * 100) / 100
  const out = Array.from({ length: orderCount }, () => each)
  out[orderCount - 1] = r2(spend - each * (orderCount - 1))
  return out
}

export const sumParts = (list: ProfitParts[]): ProfitParts =>
  list.reduce((s, p) => ({ orders: s.orders + p.orders, revenue: s.revenue + p.revenue, cogs: s.cogs + p.cogs, variable: s.variable + p.variable, incomplete: s.incomplete + p.incomplete }),
    { orders: 0, revenue: 0, cogs: 0, variable: 0, incomplete: 0 })

export type ProductLine = { key: string; name: string; qty: number; price: number; cost: number | null; orderId: string }
export type ProductProfit = { key: string; name: string; qty: number; orders: number; revenue: number; cogs: number; missingCost: boolean; profitBefore: number; allocated: number | null; profitAfter: number | null }

/**
 * สินค้าของโฆษณาเดียว (00096 P2 · PRD §3.4 แท็บ 4) — รายบรรทัด ไม่เอายอดทั้งบิลใส่ทุกสินค้า (ไม่นับซ้ำ)
 * ยอด = ราคา × จำนวน (ก่อนหักส่วนลดท้ายบิล) · ค่าโฆษณาจัดสรรตามสัดส่วนยอดของสินค้า — ผลรวม = ค่าโฆษณาจริง (บรรทัดท้ายรับเศษ)
 */
export function productProfit(lines: ProductLine[], spend: number | null): ProductProfit[] {
  const by = new Map<string, ProductProfit & { orderSet: Set<string> }>()
  for (const l of lines) {
    let p = by.get(l.key)
    if (!p) by.set(l.key, (p = { key: l.key, name: l.name, qty: 0, orders: 0, revenue: 0, cogs: 0, missingCost: false, profitBefore: 0, allocated: null, profitAfter: null, orderSet: new Set() }))
    p.qty += l.qty
    p.revenue += l.price * l.qty
    if (l.cost === null) p.missingCost = true
    else p.cogs += l.cost * l.qty
    p.orderSet.add(l.orderId)
  }
  const list = [...by.values()].sort((a, b) => b.revenue - a.revenue)
  const total = list.reduce((n, p) => n + p.revenue, 0)
  let left = spend ?? 0
  return list.map(({ orderSet, ...p }, i) => {
    const allocated = spend === null ? null : i === list.length - 1 ? r2(left) : r2(total > 0 ? (spend * p.revenue) / total : spend / list.length)
    if (allocated !== null) left -= allocated
    const profitBefore = r2(p.revenue - p.cogs)
    return { ...p, orders: orderSet.size, revenue: r2(p.revenue), cogs: r2(p.cogs), profitBefore, allocated, profitAfter: allocated === null ? null : r2(profitBefore - allocated) }
  })
}
