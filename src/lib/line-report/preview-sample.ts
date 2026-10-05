/**
 * preview-sample — ข้อมูลตัวอย่างสำหรับพรีวิว Flex ของรายงานกลุ่ม LINE (00068 · addendum E §4.5)
 *
 * 🛑 ตัวเลขคงที่ ไม่แตะฐานข้อมูล ไม่ใช่ยอดจริงของใคร — UI ต้องติดป้าย "ตัวอย่าง" เสมอ
 * ใช้เป็นอินพุตของ `buildSummaryReportFlex` (builder ผันคำเรียกใบ/จัดรูปเงินเอง ห้ามจัดรูปซ้ำที่นี่)
 * เวลา/วันที่รับจากผู้เรียก (server) — ห้ามอ่านนาฬิกาเองเพื่อกัน hydration mismatch
 */
import type { GroupSummary, ShopSummary, Window } from '@/lib/line-report/types'

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

/** ตัวเลขตัวอย่างต่อร้าน — ขยับตามลำดับร้านเพื่อให้เห็นการเรียง/รวมยอด แต่คงที่ทุกครั้ง */
function sampleShop(s: SampleShopInput, i: number): ShopSummary {
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
  }
}

export function buildSampleSummary(input: {
  shops: readonly SampleShopInput[]
  window: Pick<Window, 'startIso' | 'endIso' | 'fullDay'>
  computedAtIso: string
}): GroupSummary {
  return {
    window: { ...input.window, computedAt: input.computedAtIso },
    shops: input.shops.map(sampleShop),
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
