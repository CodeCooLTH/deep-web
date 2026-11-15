/**
 * meta-ads-entities — อ่านโครงสร้างโฆษณา (แคมเปญ/ชุดโฆษณา/โฆษณา) จาก Marketing API (00094 BRD §5 E1–E3)
 * 🛑 token ส่งทาง header เท่านั้น ไม่อยู่ใน URL/log/ผลลัพธ์ · ไม่ throw: ทุกความล้มเหลวกลายเป็น state
 * 🛑 thumbnail_url หมดอายุ — เป็นค่าในรายงานเท่านั้น ห้ามเก็บลงฐาน/Storage
 * TODO(BRD §6): parser เขียนจากเอกสาร Meta + fixture จำลอง — ต้องยืนยันกับ payload จริงของร้านนำร่อง
 */
import { GRAPH_BASE } from '@/lib/facebook/constants'
import { classifyQualityError } from '@/lib/meta-ads-quality'

export type EntityCampaign = { id: string; name: string | null; objective: string | null; status: string | null }
// รูปจาก Meta ไปลง <img src> ตรง ๆ — รับเฉพาะ https (กัน mixed content / scheme แปลก)
const httpsOnly = (u: string | null) => (u && /^https:\/\//.test(u) ? u : null)
export type EntityAdset = { id: string; name: string | null; status: string | null; campaignId: string | null }
export type EntityAd = { id: string; status: string | null; adsetId: string | null; campaignId: string | null; thumbnailUrl: string | null }
export type EntitiesResult = {
  state: 'OK' | 'AUTH' | 'ERROR' | 'UNAVAILABLE'
  campaigns: EntityCampaign[]
  adsets: EntityAdset[]
  ads: EntityAd[]
}

type Raw = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const id = (v: unknown): string | null => (v === undefined || v === null || v === '' ? null : String(v))

export const parseCampaign = (d: Raw): EntityCampaign | null => (d.id ? { id: String(d.id), name: str(d.name), objective: str(d.objective), status: str(d.effective_status) } : null)
export const parseAdset = (d: Raw): EntityAdset | null => (d.id ? { id: String(d.id), name: str(d.name), status: str(d.effective_status), campaignId: id(d.campaign_id) } : null)
export const parseEntityAd = (d: Raw): EntityAd | null =>
  d.id ? { id: String(d.id), status: str(d.effective_status), adsetId: id(d.adset_id), campaignId: id(d.campaign_id), thumbnailUrl: httpsOnly(str((d.creative as Raw | undefined)?.thumbnail_url)) } : null

const MAX_PAGES = 20
export const MAX_ENTITY_AD_IDS = 200
const FAIL_NONE = { campaigns: [], adsets: [], ads: [] }

export async function fetchEntities(a: {
  adAccountId: string; token: string; adIds: string[]; doFetch?: typeof fetch; timeoutMs?: number
}): Promise<EntitiesResult> {
  const doFetch = a.doFetch ?? fetch
  if (!/^\d{5,20}$/.test(a.adAccountId)) return { state: 'ERROR', ...FAIL_NONE } // id ไปอยู่ใน path ที่แนบ token
  const adIds = [...new Set(a.adIds.filter((i) => /^\d{1,30}$/.test(i)))]
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), a.timeoutMs ?? 8000)
  let pages = 0 // งบหน้ารวมทุกคำขอ — กันวนไม่รู้จบ
  type Page = { ok: true; rows: Raw[] } | { ok: false; state: 'AUTH' | 'ERROR' | 'UNAVAILABLE' }
  const getAll = async (path: string, qs: URLSearchParams): Promise<Page> => {
    let url: string | null = `${GRAPH_BASE}/act_${a.adAccountId}/${path}?${qs}`
    const rows: Raw[] = []
    while (url) {
      if (pages++ >= MAX_PAGES) return { ok: false, state: 'ERROR' } // ไม่ครบ = ห้ามโชว์เป็นตัวเลขจริง
      let res: Response
      try {
        res = await doFetch(url, { headers: { Authorization: `Bearer ${a.token}` }, signal: ctl.signal, redirect: 'error' })
      } catch {
        return { ok: false, state: 'ERROR' }
      }
      const body = (await res.json().catch(() => null)) as { data?: Raw[]; paging?: { next?: string } } | null
      if (!res.ok) return { ok: false, state: classifyQualityError(res.status, body) }
      rows.push(...(body?.data ?? []))
      const next = body?.paging?.next
      if (next && !next.startsWith('https://graph.facebook.com/')) return { ok: false, state: 'ERROR' } // กัน token ไปโฮสต์อื่น
      url = next ?? null
    }
    return { ok: true, rows }
  }
  try {
    const adChunks: string[][] = []
    for (let i = 0; i < adIds.length; i += MAX_ENTITY_AD_IDS) adChunks.push(adIds.slice(i, i + MAX_ENTITY_AD_IDS))
    const [camp, sets, ...adRes] = await Promise.all([
      getAll('campaigns', new URLSearchParams({ fields: 'id,name,objective,effective_status', limit: '500' })),
      getAll('adsets', new URLSearchParams({ fields: 'id,name,effective_status,campaign_id', limit: '500' })),
      ...adChunks.map((c) => getAll('ads', new URLSearchParams({
        fields: 'id,effective_status,adset_id,campaign_id,creative{thumbnail_url}', limit: '500',
        filtering: JSON.stringify([{ field: 'ad.id', operator: 'IN', value: c }]),
      }))),
    ])
    for (const r of [camp, sets, ...adRes]) if (!r.ok) return { state: r.state, ...FAIL_NONE }
    const rowsOf = (r: Page) => (r.ok ? r.rows : [])
    return {
      state: 'OK',
      campaigns: rowsOf(camp).flatMap((d) => parseCampaign(d) ?? []),
      adsets: rowsOf(sets).flatMap((d) => parseAdset(d) ?? []),
      ads: adRes.flatMap((r) => rowsOf(r).flatMap((d) => parseEntityAd(d) ?? [])),
    }
  } finally {
    clearTimeout(timer)
  }
}
