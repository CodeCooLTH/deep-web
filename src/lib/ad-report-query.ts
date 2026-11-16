/**
 * ad-report-query — แปลง query ของรายงานยอดขายตามโฆษณา (00091) · pure
 * ใช้ตัวแปลงช่วงวันที่ของรายงานผลงานแอดมินตัวเดิม (เพดาน MAX_RANGE_DAYS เดียวกัน — มติ 2026-11-14)
 * ต่างแค่ค่าตั้งต้น = 30 วันล่าสุด (ตามนิยาม resolveDateRange('30d') ไม่ตั้งนิยามใหม่)
 */
import { parseReportQuery, type ParsedReportQuery } from '@/lib/agent-report-query'
import { resolveDateRange } from '@/lib/date-range'

export function parseAdReportQuery(q: { from?: string | null; to?: string | null; shopChannelId?: string | null }): ParsedReportQuery {
  const hasRange = Boolean(q.from) && Boolean(q.to)
  const def = resolveDateRange('30d').label
  return parseReportQuery({
    from: hasRange ? q.from : def.start,
    to: hasRange ? q.to : def.end,
    shopChannelId: q.shopChannelId,
  })
}

/** 00096 รายงานกำไรโฆษณารายวัน — ค่าตั้งต้น = วันนี้ · ?mode=realized · partial = ช่วงมีวันนี้ (ยังไม่จบวัน BRD FR-002) */
export function parseAdsProfitQuery(sp: { from?: string; to?: string; shopChannelId?: string; mode?: string }) {
  const def = resolveDateRange('today').label
  const has = Boolean(sp.from) && Boolean(sp.to)
  const q = parseReportQuery({ from: has ? sp.from : def.start, to: has ? sp.to : def.end, shopChannelId: sp.shopChannelId })
  const mode: 'expected' | 'realized' = sp.mode === 'realized' ? 'realized' : 'expected'
  return { q, mode, partial: q.label.to >= def.end }
}
