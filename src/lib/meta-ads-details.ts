/**
 * meta-ads-details — reach/ความถี่ (ทั้งช่วง) + สถานะ/วัตถุประสงค์ของโฆษณา จาก Marketing API (00096 P1 BRD FR-014)
 *
 * แยกจาก meta-ads-insights (ค่าโฆษณารายวัน) เพราะ reach รวมข้ามวันไม่ได้ — ต้องขอเป็นช่วงเดียว (ไม่มี time_increment)
 * 🛑 token ส่งผ่าน header เท่านั้น ไม่อยู่ใน URL/log/ผลลัพธ์ · ไม่ throw: ล้มเหลว = state · paging ต้องเป็นโฮสต์ Graph เท่านั้น
 * 🛑 ไม่อ่านยอดซื้อ/ROAS ของ Meta (HR16 — กฎเดียวกับ meta-ads-insights)
 */
import { GRAPH_BASE } from '@/lib/facebook/constants'
import { classifyInsightsError } from '@/lib/meta-ads-insights'

export type AdDetail = { reach: number | null; frequency: number | null; status: string | null; objective: string | null }
export type AdDetailsResult = { state: 'OK' | 'AUTH' | 'ERROR'; ads: Record<string, AdDetail> }

const MAX_PAGES = 10
const num = (v: unknown) => { if (v === undefined || v === null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

export async function fetchAdDetails(a: { adAccountId: string; token: string; since: string; until: string; doFetch?: typeof fetch; timeoutMs?: number }): Promise<AdDetailsResult> {
  const doFetch = a.doFetch ?? fetch
  if (!/^\d{5,20}$/.test(a.adAccountId)) return { state: 'ERROR', ads: {} }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), a.timeoutMs ?? 5000)
  const get = async (url: string): Promise<{ ok: true; body: any } | { ok: false; state: 'AUTH' | 'ERROR' }> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      const res = await doFetch(url, { headers: { Authorization: `Bearer ${a.token}` }, signal: ctl.signal, redirect: 'error' })
      const body = await res.json().catch(() => null)
      return res.ok ? { ok: true, body } : { ok: false, state: classifyInsightsError(res.status, body) }
    } catch {
      return { ok: false, state: 'ERROR' }
    }
  }
  const pages = async (first: string, each: (d: any) => void): Promise<'OK' | 'AUTH' | 'ERROR'> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    let url: string | null = first
    for (let p = 0; url; p++) {
      if (p >= MAX_PAGES) return 'ERROR'
      const r = await get(url)
      if (!r.ok) return r.state
      for (const d of r.body?.data ?? []) each(d)
      const next: string | undefined = r.body?.paging?.next
      if (next && !next.startsWith('https://graph.facebook.com/')) return 'ERROR'
      url = next ?? null
    }
    return 'OK'
  }
  try {
    const ads: Record<string, AdDetail> = {}
    const qs = new URLSearchParams({ level: 'ad', fields: 'ad_id,reach,frequency', limit: '500', time_range: JSON.stringify({ since: a.since, until: a.until }) })
    const s1 = await pages(`${GRAPH_BASE}/act_${a.adAccountId}/insights?${qs}`, (d) => {
      if (d.ad_id) ads[String(d.ad_id)] = { reach: num(d.reach), frequency: num(d.frequency), status: null, objective: null }
    })
    if (s1 !== 'OK') return { state: s1, ads: {} }
    const ids = Object.keys(ads).slice(0, 500)
    if (ids.length > 0) {
      const q2 = new URLSearchParams({ fields: 'id,effective_status,campaign{objective}', limit: '500', filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: ids }]) })
      // สถานะ/วัตถุประสงค์ล้มเหลว ไม่ทำให้ reach หาย — คืน OK พร้อม status null
      await pages(`${GRAPH_BASE}/act_${a.adAccountId}/ads?${q2}`, (d) => {
        const x = ads[String(d.id)]
        if (x) { x.status = d.effective_status ?? null; x.objective = d.campaign?.objective ?? null }
      })
    }
    return { state: 'OK', ads }
  } finally {
    clearTimeout(timer)
  }
}
