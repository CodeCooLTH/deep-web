/**
 * ad-summary/buckets — จัดกลุ่มรายวัน → สัปดาห์/เดือน + ซีรีส์ของกราฟ (00094)
 * 🛑 อัตราทุกตัวคำนวณจาก Σตัวตั้ง ÷ Σตัวหาร ของช่อง ห้ามเฉลี่ยค่ารายวัน · reach ห้ามรวมข้ามวัน
 */
import { ratio, ratePct, unitCost, frequency, sumKnown } from '@/lib/ad-quality-formulas'
import { roas, costPerOrder } from '@/lib/ad-report-view'
import { cpm } from './formulas'
import type { Bucket, DailyPoint, Grouping } from './types'

export type SeriesKey =
  | 'sales' | 'spend' | 'orders' | 'chats' | 'chatsMeta' | 'impressions' | 'reach' | 'frequency'
  | 'ctr' | 'cpc' | 'cpm' | 'costPerChatMeta' | 'roas' | 'cpa' | 'closeRate' | 'aov'

const pad = (n: number) => String(n).padStart(2, '0')
const utc = (ymd: string) => { const [y, m, d] = ymd.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
const ymdOf = (dt: Date) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
const dayMonth = (ymd: string) => `${Number(ymd.slice(8, 10))}/${Number(ymd.slice(5, 7))}`

/** จันทร์ของสัปดาห์ที่วันนั้นอยู่ (ISO: จันทร์–อาทิตย์) */
function mondayOf(ymd: string): string {
  const dt = utc(ymd)
  const dow = (dt.getUTCDay() + 6) % 7
  dt.setUTCDate(dt.getUTCDate() - dow)
  return ymdOf(dt)
}
const daysInMonth = (ymd: string) => new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)), 0)).getUTCDate()

function merge(pts: DailyPoint[], day: string, label: string, partial: boolean): Bucket {
  return {
    day, label, partial,
    sales: pts.reduce((s, p) => s + p.sales, 0),
    coveredSales: pts.reduce((s, p) => s + p.coveredSales, 0),
    orders: pts.reduce((s, p) => s + p.orders, 0),
    chats: pts.reduce((s, p) => s + p.chats, 0),
    spend: sumKnown(pts.map((p) => p.spend)),
    impressions: sumKnown(pts.map((p) => p.impressions)),
    clicks: sumKnown(pts.map((p) => p.clicks)),
    chatsMeta: sumKnown(pts.map((p) => p.chatsMeta)),
    // reach เป็นค่าประมาณรายวัน คนเดียวเห็นหลายวัน → รวมข้ามวันไม่ได้
    reach: pts.length === 1 ? pts[0].reach : null,
  }
}

export function groupDaily(points: DailyPoint[], g: Grouping): Bucket[] {
  const sorted = [...points].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  if (g === 'day') {
    return sorted.map((p) => ({ ...p, label: p.day.includes('T') ? `${p.day.slice(11, 13)}:00` : dayMonth(p.day), partial: false }))
  }
  const groups = new Map<string, DailyPoint[]>()
  for (const p of sorted) {
    const key = g === 'week' ? mondayOf(p.day) : `${p.day.slice(0, 7)}-01`
    const arr = groups.get(key)
    if (arr) arr.push(p)
    else groups.set(key, [p])
  }
  return [...groups.entries()].map(([key, pts]) => {
    const full = g === 'week' ? 7 : daysInMonth(key)
    const distinct = new Set(pts.map((p) => p.day.slice(0, 10))).size
    const label = g === 'week' ? dayMonth(key) : `${Number(key.slice(5, 7))}/${key.slice(0, 4)}`
    return merge(pts, key, label, distinct < full)
  })
}

/** ซีรีส์ของกราฟเล็ก — อัตรา = Σ/Σ ของแต่ละช่อง (roas ใช้ยอดขายชุดที่มีค่าโฆษณา · cpa ใช้ออเดอร์ทั้งช่อง) */
export function seriesOf(b: (DailyPoint | Bucket)[], key: SeriesKey): (number | null)[] {
  return b.map((p) => {
    switch (key) {
      case 'sales': return p.sales
      case 'spend': return p.spend
      case 'orders': return p.orders
      case 'chats': return p.chats
      case 'chatsMeta': return p.chatsMeta
      case 'impressions': return p.impressions
      case 'reach': return p.reach
      case 'frequency': return frequency(p.impressions, p.reach)
      case 'ctr': return ratePct(p.clicks, p.impressions)
      case 'cpc': return unitCost(p.spend, p.clicks)
      case 'cpm': return cpm(p.spend, p.impressions)
      case 'costPerChatMeta': return unitCost(p.spend, p.chatsMeta)
      case 'roas': return p.spend === null ? null : roas(p.coveredSales, p.spend)
      case 'cpa': return costPerOrder(p.spend, p.orders)
      case 'closeRate': return ratePct(p.orders, p.chats)
      case 'aov': return ratio(p.sales, p.orders, 1)
    }
  })
}
