/**
 * meta-ads-hourly — ค่าโฆษณาของ "วันเดียว" ถึงก่อนชั่วโมงที่กำหนด (00096 P1 · เทียบเมื่อวาน ณ เวลาเดียวกัน)
 *
 * ระดับบัญชี + breakdown `hourly_stats_aggregated_by_advertiser_time_zone` (ค่า "HH:00:00 - HH:59:59" ตามเขตเวลาบัญชี)
 * 🛑 token ผ่าน header เท่านั้น · ไม่ throw: ล้มเหลว = state · paging เฉพาะโฮสต์ Graph · ไม่อ่านยอดซื้อ/ROAS ของ Meta (HR16)
 * 🛑 แถวที่อ่านชั่วโมงไม่ออก = ERROR ทั้งก้อน (ไม่เดา — ตัวเลขไม่ครบห้ามแสดงเงียบ ๆ)
 * 🛑 ไม่มีแถวเลย = UNAVAILABLE ไม่ใช่ 0 — เอกสาร Meta (มีผล 2026-08-06): breakdown รายชั่วโมงอาจคืนว่างสำหรับบางบัญชีจนกว่าแอดมินจะเปิดใน Ads Manager
 *    แยก "ไม่มีข้อมูล" กับ "ใช้ 0 บาท" ไม่ได้ ⇒ ไม่เทียบ ดีกว่าเทียบกับ 0 ปลอม
 */
import { GRAPH_BASE } from '@/lib/facebook/constants'
import { classifyInsightsError } from '@/lib/meta-ads-insights'

export type HourlySpendResult = { state: 'OK' | 'AUTH' | 'ERROR' | 'UNAVAILABLE'; spend: number }

const MAX_PAGES = 5

export async function fetchSpendBeforeHour(a: {
  adAccountId: string; token: string; day: string; beforeHour: number; doFetch?: typeof fetch; timeoutMs?: number
}): Promise<HourlySpendResult> {
  const doFetch = a.doFetch ?? fetch
  if (!/^\d{5,20}$/.test(a.adAccountId) || !/^\d{4}-\d{2}-\d{2}$/.test(a.day)) return { state: 'ERROR', spend: 0 }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), a.timeoutMs ?? 5000)
  try {
    const qs = new URLSearchParams({
      level: 'account', fields: 'spend', limit: '100',
      breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
      time_range: JSON.stringify({ since: a.day, until: a.day }),
    })
    let url: string | null = `${GRAPH_BASE}/act_${a.adAccountId}/insights?${qs}`
    let spend = 0, rows = 0
    for (let p = 0; url; p++) {
      if (p >= MAX_PAGES) return { state: 'ERROR', spend: 0 }
      let res: Response, body: any // eslint-disable-line @typescript-eslint/no-explicit-any
      try {
        res = await doFetch(url, { headers: { Authorization: `Bearer ${a.token}` }, signal: ctl.signal, redirect: 'error' })
        body = await res.json().catch(() => null)
      } catch {
        return { state: 'ERROR', spend: 0 }
      }
      if (!res.ok) return { state: classifyInsightsError(res.status, body), spend: 0 }
      for (const d of body?.data ?? []) {
        const m = /^(\d{2}):/.exec(String(d.hourly_stats_aggregated_by_advertiser_time_zone ?? ''))
        const v = Number(d.spend)
        if (!m || !Number.isFinite(v)) return { state: 'ERROR', spend: 0 }
        rows += 1
        if (Number(m[1]) < a.beforeHour) spend += v
      }
      const next: string | undefined = body?.paging?.next
      if (next && !next.startsWith('https://graph.facebook.com/')) return { state: 'ERROR', spend: 0 }
      url = next ?? null
    }
    if (rows === 0) return { state: 'UNAVAILABLE', spend: 0 }
    return { state: 'OK', spend: Math.round(spend * 100) / 100 }
  } finally {
    clearTimeout(timer)
  }
}
