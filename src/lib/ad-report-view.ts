/**
 * ad-report-view — ตัวตัดสินฝั่งแสดงผลของรายงานยอดขายตามโฆษณา (00091 FR-009) · pure ไม่มี React
 * แยกมาที่ src/lib เพื่อให้เทสจับ boolean/กฎที่ตัดสิน UI ได้ (docs/conventions/ui-boolean-needs-a-testable-home)
 */

/** แอดที่ปิดการขายดีที่สุดต้องมี {noun} ≥ นี้ — กันแอดที่แชท 1 ออเดอร์ 1 ได้ "100%" */
export const BEST_RATE_MIN_ORDERS = 10

type RateRow = { orders: number; closeRatePct: number | null }

/** อัตราสูงสุดเฉพาะแอดที่ orders ≥ 10 และ อัตรา ≤ 100% (เกิน 100% = คลิกก่อนช่วงแล้วสั่งในช่วง ไม่ใช่ผลของแอดนี้ล้วน ๆ) */
export function bestCloseRateRow<T extends RateRow>(rows: T[]): T | null {
  let best: T | null = null
  for (const r of rows) {
    if (r.orders < BEST_RATE_MIN_ORDERS || r.closeRatePct === null || r.closeRatePct > 100) continue
    if (!best || r.closeRatePct > (best.closeRatePct as number) || (r.closeRatePct === best.closeRatePct && r.orders > best.orders)) best = r
  }
  return best
}

/** ผลต่างเป็น "จุดเปอร์เซ็นต์" — null เมื่อฝั่งใดฝั่งหนึ่งไม่มีค่า (ห้ามเทียบกับ 0 ที่ไม่ใช่ค่าจริง) */
export function pointsDelta(cur: number | null, prev: number | null): number | null {
  return cur === null || prev === null ? null : Math.round((cur - prev) * 10) / 10
}

/** n อันดับแรก + ที่เหลือรวมเป็นก้อนเดียว (rest = null เมื่อไม่มีเหลือ) — อินพุตต้องเรียงมาแล้ว */
export function topWithRest<T extends { sales: number }>(sorted: T[], n: number): { top: T[]; rest: { count: number; sales: number } | null } {
  const top = sorted.slice(0, n)
  const tail = sorted.slice(n)
  return { top, rest: tail.length ? { count: tail.length, sales: tail.reduce((s, r) => s + r.sales, 0) } : null }
}

export type ProvinceLine = { kind: 'province' | 'other' | 'unknown'; name: string | null; sales: number; count: number }

/** แถวของการ์ดจังหวัด: จังหวัดมีชื่อ top N → "อื่น ๆ" → "ไม่ระบุ" ท้ายสุด (ผลรวมยอดเท่ายอดเดิมเสมอ) */
export function provinceLines(provinces: { name: string | null; sales: number }[], topN: number): ProvinceLine[] {
  const named = provinces.filter((p) => p.name !== null && p.sales > 0).sort((a, b) => b.sales - a.sales)
  const unknown = provinces.filter((p) => p.name === null).reduce((s, p) => s + p.sales, 0)
  const { top, rest } = topWithRest(named, topN)
  const out: ProvinceLine[] = top.map((p) => ({ kind: 'province', name: p.name, sales: p.sales, count: 1 }))
  if (rest) out.push({ kind: 'other', name: null, sales: rest.sales, count: rest.count })
  if (unknown > 0) out.push({ kind: 'unknown', name: null, sales: unknown, count: 0 })
  return out
}

/** ป้ายแกน x: รายวัน "YYYY-MM-DD" → วัน-เดือน · รายชั่วโมง "YYYY-MM-DDTHH" → "HH:00" */
export function slotLabel(day: string, dayMonth: (d: string) => string): string {
  const i = day.indexOf('T')
  return i === -1 ? dayMonth(day) : `${day.slice(i + 1)}:00`
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** ROAS = ยอดขายของ Deep ÷ ค่าโฆษณา (HR16: ไม่ใช้ตัวเลข purchase ของ Meta) · spend null/0 → null เพราะหารไม่ได้ */
export function roas(sales: number, spend: number | null): number | null {
  return spend === null || spend <= 0 ? null : round2(sales / spend)
}

/** ต้นทุนต่อคำสั่งซื้อ = ค่าโฆษณา ÷ คำสั่งซื้อของ Deep ชุดเดียวกัน · orders 0 → null */
export function costPerOrder(spend: number | null, orders: number): number | null {
  return spend === null || orders <= 0 ? null : round2(spend / orders)
}

/** ROAS ดีที่สุด: เฉพาะแอด orders ≥ 10 และ spend > 0 · เสมอ → orders มากกว่า */
export function bestRoasRow<T extends { orders: number; sales: number; spend: number | null }>(rows: T[]): T | null {
  let best: T | null = null
  let bestV = -1
  for (const r of rows) {
    if (r.orders < BEST_RATE_MIN_ORDERS || r.spend === null || r.spend <= 0) continue
    const v = r.sales / r.spend
    if (!best || v > bestV || (v === bestV && r.orders > best.orders)) { best = r; bestV = v }
  }
  return best
}

/** เรียงตามค่าตัวเลข — null อยู่ท้ายเสมอทั้งสองทิศ (แถวที่ไม่มีค่าห้ามขึ้นบนสุดตอนเรียงน้อย→มาก) */
export function sortNullLast<T>(rows: T[], get: (r: T) => number | null, desc: boolean): T[] {
  return [...rows].sort((x, y) => {
    const a = get(x), b = get(y)
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
    return desc ? b - a : a - b
  })
}
