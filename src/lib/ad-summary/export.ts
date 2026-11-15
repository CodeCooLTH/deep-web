/**
 * ad-summary/export — ตารางสำหรับไฟล์ CSV ของหน้าสรุปโฆษณา (00094 FR-008) · pure
 * ตัวเลข = ค่าเดียวกับตาราง (RollUp ของ service) · อัตรารวมคิด Σ/Σ ด้วยสูตรกลางเดียวกับหน้าจอ (HR16)
 */
import { ratePct, ratio, unitCost } from '@/lib/ad-quality-formulas'
import { cpaOfRow, roasOfRow } from './formulas'
import type { ExportColumn, ExportRow } from '@/lib/order-export'
import type { AdSummaryReport, RollUp } from './types'

export type ExportLevel = 'campaign' | 'adset' | 'ad'
export const EXPORT_LEVELS: ExportLevel[] = ['campaign', 'adset', 'ad']

const UNKNOWN = 'ไม่ทราบแคมเปญ'

const metricCols: ExportColumn[] = [
  { key: 'spend', header: 'ค่าโฆษณา', kind: 'money' },
  { key: 'impressions', header: 'การแสดงผล', kind: 'int' },
  { key: 'ctr', header: 'CTR (%)', kind: 'money' },
  { key: 'cpc', header: 'CPC', kind: 'money' },
  { key: 'cpm', header: 'CPM', kind: 'money' },
  { key: 'chatsMeta', header: 'แชท (Meta)', kind: 'int' },
  { key: 'chats', header: 'แชทเข้าร้าน', kind: 'int' },
  { key: 'orders', header: 'คำสั่งซื้อ', kind: 'int' },
  { key: 'sales', header: 'ยอดขาย', kind: 'money' },
  { key: 'cpo', header: 'ต้นทุนต่อออเดอร์', kind: 'money' },
  { key: 'roas', header: 'ROAS', kind: 'money' },
]

const metrics = (r: RollUp): ExportRow => ({
  spend: r.spend, impressions: r.impressions,
  ctr: ratePct(r.clicks, r.impressions), cpc: unitCost(r.spend, r.clicks), cpm: ratio(r.spend, r.impressions, 1000),
  chatsMeta: r.chatsMeta, chats: r.chats, orders: r.orders, sales: r.sales,
  cpo: cpaOfRow(r), roas: roasOfRow(r),
})

export function adSummaryExportTable(report: AdSummaryReport, level: ExportLevel): { columns: ExportColumn[]; rows: ExportRow[] } {
  const unk = report.unknownCampaign
  if (level === 'campaign') {
    return {
      columns: [{ key: 'name', header: 'แคมเปญ', kind: 'text' }, { key: 'objective', header: 'วัตถุประสงค์', kind: 'text' }, { key: 'status', header: 'สถานะ', kind: 'text' }, ...metricCols],
      rows: [
        ...report.campaigns.map((c) => ({ name: c.name ?? c.campaignId, objective: c.objective, status: c.status, ...metrics(c) })),
        ...(unk.ads.length ? [{ name: UNKNOWN, objective: null, status: null, ...metrics(unk) }] : []),
      ],
    }
  }
  if (level === 'adset') {
    return {
      columns: [{ key: 'campaign', header: 'แคมเปญ', kind: 'text' }, { key: 'name', header: 'ชุดโฆษณา', kind: 'text' }, { key: 'status', header: 'สถานะ', kind: 'text' }, ...metricCols],
      rows: [
        ...report.campaigns.flatMap((c) => c.adsets.map((s) => ({ campaign: c.name ?? c.campaignId, name: s.name ?? s.adsetId, status: s.status, ...metrics(s) }))),
        ...(unk.ads.length ? [{ campaign: UNKNOWN, name: null, status: null, ...metrics(unk) }] : []),
      ],
    }
  }
  const adRow = (campaign: string, adset: string | null, a: RollUp & { adId: string; name: string | null; status: string | null }): ExportRow =>
    ({ campaign, adset, name: a.name ?? a.adId, adId: a.adId, status: a.status, ...metrics(a) })
  return {
    columns: [
      { key: 'campaign', header: 'แคมเปญ', kind: 'text' }, { key: 'adset', header: 'ชุดโฆษณา', kind: 'text' },
      { key: 'name', header: 'โฆษณา', kind: 'text' }, { key: 'adId', header: 'รหัสโฆษณา', kind: 'text', forceText: true }, { key: 'status', header: 'สถานะ', kind: 'text' },
      ...metricCols,
    ],
    rows: [
      ...report.campaigns.flatMap((c) => c.adsets.flatMap((s) => s.ads.map((a) => adRow(c.name ?? c.campaignId, s.name ?? s.adsetId, a)))),
      ...unk.ads.map((a) => adRow(UNKNOWN, null, a)),
    ],
  }
}
