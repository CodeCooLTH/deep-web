/**
 * preview-sample — ข้อมูลตัวอย่างสำหรับพรีวิว Flex ของรายงานกลุ่ม LINE (00070 · addendum E §4.5)
 *
 * 🛑 ตัวเลขคงที่ ไม่แตะฐานข้อมูล ไม่ใช่ยอดจริงของใคร — UI ต้องติดป้าย "ตัวอย่าง" เสมอ
 * ใช้เป็นอินพุตของ `buildSummaryReportFlex` (builder ผันคำเรียกใบ/จัดรูปเงินเอง ห้ามจัดรูปซ้ำที่นี่)
 * เวลา/วันที่รับจากผู้เรียก (server) — ห้ามอ่านนาฬิกาเองเพื่อกัน hydration mismatch
 */
import { combineTotals, sumTrend } from '@/lib/line-report/aggregate'
import type { GroupSummary, ShopSummary, Trend, Window } from '@/lib/line-report/types'

export type SampleShopInput = {
  id: string
  name: string
  vertical: string | null
  /** 'OK' | 'LOCKED' | 'DELETED' | 'PURGED' */
  state: string
}

const TOP3 = [
  { name: 'สินค้าตัวอย่าง ก', qty: 42, amount: 25200 },
  { name: 'สินค้าตัวอย่าง ข', qty: 31, amount: 15500 },
  { name: 'สินค้าตัวอย่าง ค', qty: 18, amount: 5400 },
]

const shiftIso = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** แนวโน้ม 7 วันตัวอย่าง (เก่า→ใหม่) จบที่ endIso · มีวัน 0 หนึ่งวันให้เห็นแท่งว่าง · ขยับตามลำดับร้านเหมือนยอดวัน */
function sampleTrend(endIso: string, i: number): Trend {
  const orders = [21, 0, 28, 34, 25, 38, 32].map((v) => (v > 0 ? v + i * 9 : 0))
  const confirmed = [78_000, 0, 96_500, 112_000, 85_400, 131_000, 128_000].map((v) => (v > 0 ? v - i * 17_500 : 0))
  return { dates: [-6, -5, -4, -3, -2, -1, 0].map((d) => shiftIso(endIso, d)), confirmed, orders }
}

/** ตัวเลขตัวอย่างต่อร้าน — ขยับตามลำดับร้านเพื่อให้เห็นการเรียง/รวมยอด แต่คงที่ทุกครั้ง */
function sampleShop(s: SampleShopInput, i: number, endIso: string): ShopSummary {
  const ref = { id: s.id, name: s.name, vertical: s.vertical }
  if (s.state !== 'OK') {
    return { shop: ref, state: 'EXCLUDED', excludedReason: s.state, orders: 0, confirmed: 0, unconfirmed: 0, cancelled: 0 }
  }
  return {
    shop: ref,
    state: 'OK',
    orders: 32 + i * 9,
    confirmed: 128_000 - i * 17_500,
    unconfirmed: 12_400 - i * 1_200,
    cancelled: 2 + i,
    top3: TOP3,
    trend: sampleTrend(endIso, i),
  }
}

export function buildSampleSummary(input: {
  shops: readonly SampleShopInput[]
  window: Pick<Window, 'startIso' | 'endIso' | 'fullDay'>
  computedAtIso: string
}): GroupSummary {
  const shops = input.shops.map((s, i) => sampleShop(s, i, input.window.endIso))
  return {
    window: { ...input.window, computedAt: input.computedAtIso },
    shops,
    trend: sumTrend(shops),
    profitSummable: true,
    mixedFinanceRules: false,
  }
}

/** ร้านตัวอย่างคงที่ (ภาษาไทย) สำหรับหน้าว่าง/หน้าล็อกที่ยังไม่มีร้านที่เลือก — vertical เดียวกันจึงไม่ปนคำเรียกใบ */
export const STATIC_SAMPLE_SHOPS: readonly SampleShopInput[] = [
  { id: 'sample-1', name: 'ร้านตัวอย่าง สาขาหนึ่ง', vertical: 'ONLINE_SALES', state: 'OK' },
  { id: 'sample-2', name: 'ร้านตัวอย่าง สาขาสอง', vertical: 'ONLINE_SALES', state: 'OK' },
]

/** วันนี้ (ไทย) + เวลาที่คำนวณ มาจาก server — todayIso = YYYY-MM-DD */
export function buildStaticSampleSummary(todayIso: string, computedAtIso: string): GroupSummary {
  return buildSampleSummary({
    shops: STATIC_SAMPLE_SHOPS,
    window: { startIso: todayIso, endIso: todayIso },
    computedAtIso,
  })
}

/**
 * เติมกำไรตัวอย่างให้ร้านที่ OK — builder แสดงบรรทัดกำไรเมื่อร้านมี `profit` เท่านั้น
 * (พรีวิวตอนติ๊ก "กำไร" ต้องเห็นว่าข้อความจะมีบรรทัดนี้) · ตัวเลขคงที่ ไม่ใช่กำไรจริงของใคร
 */
export function withSampleProfit(summary: GroupSummary): GroupSummary {
  return {
    ...summary,
    shops: summary.shops.map((s, i) => (s.state === 'OK' ? { ...s, profit: { netProfit: 41_500 - i * 6_000, capped: false } } : s)),
  }
}

/** ยอดสะสมรอบตัวอย่างของบรรทัด "ยอดสะสมรอบนี้" (รายวันที่แนบรอบ) — คูณจากยอดวันเพื่อให้ใหญ่กว่ายอดวันเสมอ */
export function sampleCycleTotals(summary: GroupSummary): { orders: number; confirmed: number; unconfirmed: number; cancelled: number } {
  const t = combineTotals(summary.shops)
  const k = 18
  return { orders: t.orders * k, confirmed: t.confirmed * k, unconfirmed: t.unconfirmed * k, cancelled: t.cancelled * k }
}
