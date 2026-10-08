/**
 * template-size — วัดขนาดข้อความของเทมเพลตตอนบันทึก (EXT 00070 · FR-EXT-08 · AC-08-2/3/5)
 *
 * pure · ใช้ทั้ง client (gauge) และ server (ด่านบันทึก) — `bytesOf` ใช้ TextEncoder ไม่ใช่ Buffer
 * ประกอบ fixture "กรณีเลวร้ายสุด" ด้วยเทมเพลตนี้ แล้ววัด "ทั้ง message" รวม altText ที่ระดับ 3
 * (ตัววัดเดียวกับด่านสุดท้ายใน send.service — R-3: fitToLimits วัดแค่ contents จึงหลวมกว่า)
 */
import { buildSummaryReportFlex, bytesOf, rebuildAtLevel, REPORT_BUBBLE_MAX_BYTES } from '@/lib/line/flex-summary-report'
import { combineTotals, isMixedFinanceRules, canSumProfit, sumTrend } from '@/lib/line-report/aggregate'
import type { TemplateV1 } from '@/lib/line-report/template'
import type { GroupSummary, ShopSummary, Trend } from '@/lib/line-report/types'

export const TEMPLATE_BYTES_LIMIT = REPORT_BUBBLE_MAX_BYTES
export const TEMPLATE_LARGE_WARNING = 'รอบที่ข้อมูลเยอะ ระบบอาจตัดกราฟ/ขายดี 3 อันดับ'
/** level ที่ตัดได้ทุกอย่างที่ตัดได้ ยกเว้นย่อ altText (FR-EXT-08) */
const MEASURE_LEVEL = 3

export type MeasureCtx = { computedAt?: string }
export type TemplateMeasure = {
  /** ไบต์ UTF-8 ของ `JSON.stringify(message)` ใบที่ใหญ่สุด ที่ระดับ 3 — เกิน limit = บันทึกไม่ได้ */
  bytes: number
  limit: number
  /** ระดับ 0 (ไม่ตัดอะไร) ใบที่ใหญ่สุด — เกิน limit = ผ่านได้แต่ต้องมี warning */
  fullBytes: number
  warnings: string[]
}

const NAME_50 = 'ร้านชื่อยาวที่สุดเท่าที่ระบบอนุญาตทดสอบสระซ้อนก็ได้ ๆ ๆ ๆ ๆ ๆ ๆ ๆ ๆ'.slice(0, 50)
const PRODUCT_60 = 'สินค้าชื่อยาวมากมายก่อนายตัวอย่างสำหรับวัดขนาดข้อความ'.padEnd(60, 'ๆ').slice(0, 60)
const BIG = 18_902_340

const worstShop = (i: number, state: ShopSummary['state'], trend: Trend): ShopSummary => ({
  shop: { id: `w${i}`, name: `${NAME_50.slice(0, 49)}${i}`, vertical: 'ONLINE_SALES' },
  state,
  ...(state === 'EXCLUDED' ? { excludedReason: 'LOCKED' } : {}),
  orders: state === 'OK' ? 99_999 : 0,
  confirmed: state === 'OK' ? BIG : 0,
  unconfirmed: state === 'OK' ? BIG : 0,
  cancelled: state === 'OK' ? 9_999 : 0,
  ...(state === 'OK'
    ? {
        top3: [0, 1, 2].map((k) => ({ name: `${PRODUCT_60.slice(0, 59)}${k}`, qty: 99_999, amount: BIG })),
        profit: { netProfit: BIG, capped: true },
        finance: { expense: BIG, netSales: -BIG, expenseRecorded: false, items: Array.from({ length: 9 }, (_, k) => ({ key: `K${k}`, label: `หมวดค่าใช้จ่ายยาว ${k}`, amount: BIG })) },
        trend,
      }
    : {}),
})

/** เทมเพลตนี้ที่ข้อมูลเลวร้ายสุดตาม AC-EXT-08-2 — ผู้เรียกใช้ซ้ำเพื่อทดสอบได้ */
export function worstCaseSummary(computedAt: string): GroupSummary {
  const iso = (d: number) => `2026-10-${String(d).padStart(2, '0')}`
  const trend: Trend = {
    dates: [1, 2, 3, 4, 5, 6, 7].map(iso),
    confirmed: [BIG, BIG, BIG, BIG, BIG, BIG, BIG],
    unconfirmed: [BIG, BIG, BIG, BIG, BIG, BIG, BIG],
    orders: [99_999, 99_999, 99_999, 99_999, 99_999, 99_999, 99_999],
  }
  const shops = [
    ...Array.from({ length: 10 }, (_, i) => worstShop(i, 'OK', trend)),
    ...Array.from({ length: 10 }, (_, i) => worstShop(10 + i, 'EXCLUDED', trend)),
  ]
  return {
    window: { startIso: iso(7), endIso: iso(7), computedAt },
    shops,
    total: combineTotals(shops),
    profitSummable: canSumProfit(shops.map((s) => s.shop)),
    mixedFinanceRules: isMixedFinanceRules(shops.map((s) => s.shop)),
    trend: sumTrend(shops),
    trendPartial: true,
  }
}

/** ctx.computedAt = เวลาคำนวณ ISO (ไม่ส่ง = ค่าคงที่ — ผลต้องเท่ากันทุกครั้ง/ทั้งสองฝั่ง) */
export function measureTemplate(template: TemplateV1, ctx: MeasureCtx = {}): TemplateMeasure {
  const computedAt = ctx.computedAt ?? '2026-10-07T11:59:00.000Z'
  const summary = worstCaseSummary(computedAt)
  const monthly = { ...summary, window: { ...summary.window, startIso: '2026-10-01', endIso: '2026-10-31' } }
  const cycleToDate = { startIso: '2026-10-01', endIso: '2026-10-07', totals: { orders: 99_999, confirmed: BIG, unconfirmed: BIG, cancelled: 9_999 }, failedShops: 3 }
  // รายวัน+รายเดือนใน push เดียว (สองข้อความ) — วัดแต่ละใบแล้วเอาใบที่ใหญ่สุด
  const messages = buildSummaryReportFlex({ summary, kind: 'DAILY', template, cycleToDate, monthly })
  const max = (level: number) => Math.max(...messages.map((m) => bytesOf(JSON.stringify(rebuildAtLevel(m, level)))))
  const bytes = max(MEASURE_LEVEL)
  const fullBytes = max(0)
  return { bytes, limit: TEMPLATE_BYTES_LIMIT, fullBytes, warnings: fullBytes > TEMPLATE_BYTES_LIMIT && bytes <= TEMPLATE_BYTES_LIMIT ? [TEMPLATE_LARGE_WARNING] : [] }
}
