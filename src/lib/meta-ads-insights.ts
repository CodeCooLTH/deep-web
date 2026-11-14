/**
 * meta-ads-insights — อ่านค่าโฆษณา (spend) รายแอดรายวันจาก Marketing API (00091 FR-010)
 * 🛑 token ห้ามอยู่ใน URL/log/ผลลัพธ์ — ส่งผ่าน header เท่านั้น · ไม่ throw: ทุกความล้มเหลวกลายเป็น state
 * ผลลัพธ์ตรงนี้คือ "ค่าโฆษณาตามที่ Meta รายงาน" เท่านั้น — ห้ามอ่านตัวเลข purchase/ROAS ของ Meta (HR16)
 */
import { GRAPH_BASE } from '@/lib/facebook/constants'

export type InsightsState = 'OK' | 'AUTH' | 'ERROR' | 'CURRENCY'
export type InsightsRow = { adId: string; adName: string | null; day: string; spend: number }
export type InsightsResult = { state: InsightsState; accountName: string | null; currency: string | null; tz: string | null; rows: InsightsRow[] }

type ErrBody = { error?: { code?: number } }
const RETRY_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 80004])

/** 190/10/2xx = สิทธิ์/โทเคน (AUTH) · นอกนั้น (rate limit/5xx/ต่อไม่ติด/อื่น ๆ) = ERROR — ชุดรหัสเดียวกับ meta-capi/classify */
export function classifyInsightsError(httpStatus: number, body: unknown): 'AUTH' | 'ERROR' {
  const code = ((body ?? {}) as ErrBody).error?.code
  if (code !== undefined && (code === 190 || code === 102 || code === 10 || (code >= 200 && code <= 299))) return 'AUTH'
  if (code !== undefined && RETRY_CODES.has(code)) return 'ERROR'
  return 'ERROR'
}

const MAX_PAGES = 20

export async function fetchAdInsights(a: {
  adAccountId: string; token: string; since: string; until: string; doFetch?: typeof fetch; timeoutMs?: number
}): Promise<InsightsResult> {
  const doFetch = a.doFetch ?? fetch
  const empty: InsightsResult = { state: 'ERROR', accountName: null, currency: null, tz: null, rows: [] }
  // กันชั้นสอง: id ไปอยู่ใน path ของ URL ที่แนบ token — ต้องเป็นตัวเลขล้วนเสมอ
  if (!/^\d{5,20}$/.test(a.adAccountId)) return empty
  // timeout รวมทั้งงาน (บัญชี + ทุกหน้า) — หน้ารายงานห้ามช้าเพราะ Meta
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), a.timeoutMs ?? 5000)
  const get = async (url: string): Promise<{ ok: true; body: any } | { ok: false; state: 'AUTH' | 'ERROR' }> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      const res = await doFetch(url, { headers: { Authorization: `Bearer ${a.token}` }, signal: ctl.signal, redirect: 'error' })
      const body = await res.json().catch(() => null)
      if (!res.ok) return { ok: false, state: classifyInsightsError(res.status, body) }
      return { ok: true, body }
    } catch {
      return { ok: false, state: 'ERROR' }
    }
  }
  try {
    const acc = await get(`${GRAPH_BASE}/act_${a.adAccountId}?fields=name,currency,timezone_name`)
    if (!acc.ok) return { ...empty, state: acc.state }
    const meta = { accountName: (acc.body.name as string)?.trim() || `act_${a.adAccountId}`, currency: (acc.body.currency as string) ?? null, tz: (acc.body.timezone_name as string) ?? null }
    if (meta.currency !== 'THB') return { state: 'CURRENCY', ...meta, rows: [] }

    const qs = new URLSearchParams({
      level: 'ad', fields: 'ad_id,ad_name,spend', time_increment: '1', limit: '500',
      time_range: JSON.stringify({ since: a.since, until: a.until }),
    })
    let url: string | null = `${GRAPH_BASE}/act_${a.adAccountId}/insights?${qs}`
    const rows: InsightsRow[] = []
    for (let page = 0; url; page++) {
      if (page >= MAX_PAGES) return { ...empty, ...meta } // ข้อมูลไม่ครบ = ห้ามแสดงเป็นตัวเลขจริง
      const r = await get(url)
      if (!r.ok) return { ...empty, ...meta, state: r.state }
      for (const d of r.body.data ?? []) {
        const spend = Number(d.spend)
        if (d.ad_id && d.date_start && Number.isFinite(spend)) rows.push({ adId: String(d.ad_id), adName: d.ad_name ?? null, day: String(d.date_start), spend })
      }
      const next: string | undefined = r.body.paging?.next
      // เฉพาะ Graph เท่านั้น — กัน token ไปโฮสต์อื่นถ้าคำตอบถูกแก้
      if (next && !next.startsWith('https://graph.facebook.com/')) return { ...empty, ...meta }
      url = next ?? null
    }
    return { state: 'OK', ...meta, rows }
  } finally {
    clearTimeout(timer)
  }
}
