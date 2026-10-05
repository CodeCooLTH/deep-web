/**
 * preview-data — ประกอบ Flex พรีวิวของหน้าจัดข้อความ จาก composer ตัวเดียวกับที่ส่งจริง (feature 00070 EXT · spec §3.7) · pure
 *
 * ข้อมูลตัวอย่าง: ชื่อร้านจริงของกลุ่มทุกร้าน (ไม่แทรกชื่อยาวทดสอบ) · ตัวเลขสมมุติ ฿18,902,340 · ร้านท้ายสุด 0 ใบ ·
 * ร้านที่ล้ม 1 ร้าน (เมื่อมีร้านใช้งานได้ ≥3) · ร้านล็อก/ลบตามกลุ่มจริง — โครงสร้างกลุ่ม (จำนวนร้าน/vertical/สถานะ) ตามกลุ่มจริง
 * เพื่อให้ {คำ} และ availability ของพรีวิวตรงกับคลัง · เวลามาจาก server เสมอ (ห้ามอ่านนาฬิกา — hydration)
 */
import { buildSummaryReportFlex } from '@/lib/line/flex-summary-report'
import { sumTrend } from '@/lib/line-report/aggregate'
import { buildSampleSummary, sampleCycleTotals, withSampleProfit, type SampleShopInput } from '@/lib/line-report/preview-sample'
import { deriveFlags, type Block, type TemplateV1 } from '@/lib/line-report/template'
import type { PreviewKind } from '@/lib/line-report/settings-guards'
import type { GroupSummary, ShopSummary, Trend } from '@/lib/line-report/types'
import { todayThaiIsoDate } from '@/lib/date-range'

const BIG = 18_902_340

const shiftIso = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function worstify(base: GroupSummary, todayIso: string): GroupSummary {
  const okIdx = base.shops.map((s, i) => (s.state === 'OK' ? i : -1)).filter((i) => i >= 0)
  const trendOf = (k: number): Trend => ({
    dates: [6, 5, 4, 3, 2, 1, 0].map((d) => shiftIso(todayIso, -d)),
    confirmed: [0, 1, 2, 3, 4, 5, 6].map((i) => Math.round((BIG * (i + 3)) / 9 / (k + 1))),
    orders: [0, 1, 2, 3, 4, 5, 6].map((i) => (i + 3) * 11 * (4 - Math.min(k, 3))),
  })
  const shops: ShopSummary[] = base.shops.map((s, i) => {
    const k = okIdx.indexOf(i)
    if (k < 0) return s
    const named = k === 0 ? { ...s, confirmed: BIG, unconfirmed: 1_204_500, orders: 99_999 } : s
    if (okIdx.length > 1 && k === okIdx.length - 1) return { ...named, orders: 0, confirmed: 0, unconfirmed: 0, cancelled: 0, top3: [], trend: trendOf(k) }
    return { ...named, trend: trendOf(k) }
  })
  // ร้านที่ล้ม — เฉพาะเมื่อมีร้านใช้งานได้ ≥3 (ไม่ให้กลุ่ม 1–2 ร้านเหลือร้านเดียวที่ไม่มีตัวเลข)
  const failIdx = okIdx.length >= 3 ? okIdx[1] : -1
  const finalShops = shops.map((s, i) => (i === failIdx ? { ...s, state: 'ERROR' as const, trend: undefined, top3: undefined, profit: undefined } : s))
  const okOnly = finalShops.filter((s) => s.state === 'OK')
  return {
    ...base,
    shops: finalShops,
    trend: sumTrend(okOnly),
    trendPartial: failIdx >= 0,
  }
}

/** เทมเพลตสำหรับพรีวิว: ตัดบล็อกข้อความที่ยังว่างออก (composer จะได้ไม่ throw/ไม่ส่งบล็อกเปล่า) */
export const previewTemplate = (t: TemplateV1): TemplateV1 => ({
  ...t,
  blocks: t.blocks.filter((b: Block) => !(b.type === 'text' && !b.runs.some((r) => 'tok' in r || r.t.trim() !== ''))),
})

export function buildPreviewContents(input: {
  template: TemplateV1
  shops: readonly SampleShopInput[]
  kind: PreviewKind
  monthlyEnabled: boolean
  cycle: { startIso: string; endIso: string } | null
  serverNowIso: string
}): Record<string, unknown> {
  const today = todayThaiIsoDate(new Date(input.serverNowIso))
  const window = input.kind === 'MONTHLY' && input.cycle ? { startIso: input.cycle.startIso, endIso: input.cycle.endIso } : { startIso: today, endIso: today }
  const base = worstify(buildSampleSummary({ shops: input.shops, window, computedAtIso: input.serverNowIso }), today)
  const template = previewTemplate(input.template)
  const flags = deriveFlags(template)
  const summary = flags.showProfit ? withSampleProfit(base) : base
  const cycleToDate =
    input.kind === 'DAILY' && flags.attachCycleToDaily && input.monthlyEnabled && input.cycle
      ? { startIso: input.cycle.startIso, endIso: today, totals: sampleCycleTotals(base) }
      : undefined
  return buildSummaryReportFlex({ summary, kind: input.kind, template, cycleToDate })[0].contents as Record<string, unknown>
}
