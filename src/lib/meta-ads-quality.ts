/**
 * meta-ads-quality — อ่านตัวชี้วัดคุณภาพโฆษณาจาก Marketing API Insights (00093 FR-002) · Q1–Q4 ตาม BRD §5
 * 🛑 token ส่งทาง header เท่านั้น ไม่อยู่ใน URL/log/ผลลัพธ์ · ไม่ throw: ทุกความล้มเหลวกลายเป็น state ของคำขอนั้น
 * 🛑 ห้ามอ่าน purchase/action_values/purchase_roas (BR-AIQ-01) — ยอดขายมาจาก Deep เท่านั้น
 * 🛑 action ที่ไม่มีในคำตอบ = null (ไม่ทราบ) ไม่ใช่ 0 (BR-AIQ-07)
 *
 * TODO(BRD §6): parser นี้เขียนจากเอกสาร Meta + fixture ที่ "จำลอง" ในเทส — ต้องเก็บ payload จริงของร้านนำร่อง
 * (Q1–Q4) มาแทน fixture และยืนยัน 5 ข้อใน BRD §6 ก่อนประกาศให้ร้านอื่นใช้ (docs/conventions/external-payload-schema.md)
 */
import { GRAPH_BASE } from '@/lib/facebook/constants'
import { classifyInsightsError } from '@/lib/meta-ads-insights'

export const ACTION = {
  started: 'onsite_conversion.messaging_conversation_started_7d',
  replied: 'onsite_conversion.messaging_conversation_replied_7d',
  depth2: 'onsite_conversion.messaging_user_depth_2_message_send',
  depth3: 'onsite_conversion.messaging_user_depth_3_message_send',
  block: 'onsite_conversion.messaging_block',
} as const

export type QualityKind = 'ad' | 'account' | 'placement' | 'agegender'

export type ChatActions = { chats: number | null; depth2: number | null; depth3: number | null; replied: number | null; block: number | null }
export type AdInsightRow = ChatActions & {
  adId: string; adName: string | null; adsetName: string | null; campaignName: string | null
  impressions: number | null; reach: number | null; clicks: number | null
  video: { p25: number | null; p50: number | null; p75: number | null; p100: number | null; thruplay: number | null }
}
export type ReachRow = { impressions: number | null; reach: number | null }
export type PlacementRow = { platform: string; position: string; spend: number | null; impressions: number | null; clicks: number | null; chats: number | null }
export type AgeGenderRow = { age: string; gender: string; spend: number | null; impressions: number | null; reach: number | null; chats: number | null }

type RowOf = { ad: AdInsightRow; account: ReachRow; placement: PlacementRow; agegender: AgeGenderRow }
export type QualityFetch<K extends QualityKind> =
  | { state: 'OK'; rows: RowOf[K][] }
  /** UNAVAILABLE = Meta บอกว่า breakdown/field นี้ใช้ไม่ได้กับบัญชี/ช่วงนี้ (BR-AIQ-11) — ไม่ใช่ความล้มเหลวที่ลองใหม่แล้วหาย */
  | { state: 'AUTH' | 'ERROR' | 'UNAVAILABLE'; rows: [] }

// ── parser (pure) ────────────────────────────────────────────────────────────
type Raw = Record<string, unknown>
const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/** actions[] → ค่าของ action_type ที่ขอ · ไม่มี action นั้น (หรือไม่มี actions เลย) = null */
export function actionValue(actions: unknown, type: string): number | null {
  if (!Array.isArray(actions)) return null
  const hit = actions.find((a) => (a as Raw)?.action_type === type) as Raw | undefined
  return hit ? num(hit.value) : null
}

/** video_pN_watched_actions = [{ action_type: 'video_view', value }] · ไม่มี field = null (ไม่ใช่วิดีโอ/ไม่ทราบ) */
export function videoValue(field: unknown): number | null {
  if (!Array.isArray(field) || field.length === 0) return null
  return (field as Raw[]).reduce<number | null>((s, a) => {
    const v = num(a?.value)
    return v === null ? s : (s ?? 0) + v
  }, null)
}

const chatActions = (d: Raw): ChatActions => ({
  chats: actionValue(d.actions, ACTION.started),
  depth2: actionValue(d.actions, ACTION.depth2),
  depth3: actionValue(d.actions, ACTION.depth3),
  replied: actionValue(d.actions, ACTION.replied),
  block: actionValue(d.actions, ACTION.block),
})

export function parseAdRow(d: Raw): AdInsightRow | null {
  if (!d.ad_id) return null // แถวไม่มีรหัสแอดผูกกับ Deep ไม่ได้
  return {
    adId: String(d.ad_id), adName: str(d.ad_name), adsetName: str(d.adset_name), campaignName: str(d.campaign_name),
    impressions: num(d.impressions), reach: num(d.reach), clicks: num(d.inline_link_clicks),
    ...chatActions(d),
    video: {
      p25: videoValue(d.video_p25_watched_actions), p50: videoValue(d.video_p50_watched_actions),
      p75: videoValue(d.video_p75_watched_actions), p100: videoValue(d.video_p100_watched_actions),
      thruplay: videoValue(d.video_thruplay_watched_actions),
    },
  }
}
const parseReach = (d: Raw): ReachRow => ({ impressions: num(d.impressions), reach: num(d.reach) })
const parsePlacement = (d: Raw): PlacementRow | null =>
  d.publisher_platform ? {
    platform: String(d.publisher_platform), position: String(d.platform_position ?? 'unknown'),
    spend: num(d.spend), impressions: num(d.impressions), clicks: num(d.inline_link_clicks), chats: actionValue(d.actions, ACTION.started),
  } : null
const parseAgeGender = (d: Raw): AgeGenderRow | null =>
  d.age ? {
    age: String(d.age), gender: String(d.gender ?? 'unknown'),
    spend: num(d.spend), impressions: num(d.impressions), reach: num(d.reach), chats: actionValue(d.actions, ACTION.started),
  } : null

// ── error mapping ────────────────────────────────────────────────────────────
type ErrBody = { error?: { code?: number; message?: string } }
const UNAVAILABLE_MSG = /breakdown|async|not supported|unsupported|too much data|data limit|invalid (field|combination)/i

/**
 * AUTH/ERROR ใช้ชุดเดียวกับ FR-010 · เพิ่ม UNAVAILABLE (BR-AIQ-11): code 100 (พารามิเตอร์/คู่ breakdown ใช้ไม่ได้)
 * หรือข้อความบอกว่า breakdown ต้อง async/ไม่รองรับ — rate limit (17/80004/613) ต้องเป็น ERROR เสมอ (ลองใหม่ได้)
 * TODO(BRD §6): ยืนยันรหัส/ข้อความจริงของ "breakdown ใช้ไม่ได้" จาก payload ที่จับจริง
 */
export function classifyQualityError(httpStatus: number, body: unknown): 'AUTH' | 'ERROR' | 'UNAVAILABLE' {
  const base = classifyInsightsError(httpStatus, body)
  if (base === 'AUTH') return 'AUTH'
  const e = ((body ?? {}) as ErrBody).error
  if (e?.code !== undefined && [4, 17, 32, 341, 613, 80004].includes(e.code)) return 'ERROR'
  if (e?.code === 100 || (e?.message && UNAVAILABLE_MSG.test(e.message))) return 'UNAVAILABLE'
  return 'ERROR'
}

// ── คำขอ ─────────────────────────────────────────────────────────────────────
const MAX_PAGES = 20
const AD_FIELDS = 'ad_id,ad_name,adset_name,campaign_name,impressions,reach,inline_link_clicks,actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_thruplay_watched_actions'
export const MAX_FILTER_ADS = 200

function queryFor(kind: QualityKind, a: { since: string; until: string; adIds?: string[] }): URLSearchParams {
  const base: Record<string, string> = {
    action_report_time: 'conversion', limit: '500', time_range: JSON.stringify({ since: a.since, until: a.until }),
  }
  if (kind === 'ad') Object.assign(base, { level: 'ad', fields: AD_FIELDS })
  else if (kind === 'account') Object.assign(base, { level: 'account', fields: 'impressions,reach' })
  else if (kind === 'placement') Object.assign(base, { level: 'account', fields: 'spend,impressions,inline_link_clicks,actions', breakdowns: 'publisher_platform,platform_position' })
  else Object.assign(base, { level: 'account', fields: 'spend,impressions,reach,actions', breakdowns: 'age,gender' })
  // ad ids ต้องเป็นตัวเลขล้วน (กัน payload แปลกปลอมเข้า filtering)
  if (kind !== 'ad' && a.adIds) base.filtering = JSON.stringify([{ field: 'ad.id', operator: 'IN', value: a.adIds.filter((i) => /^\d{1,30}$/.test(i)).slice(0, MAX_FILTER_ADS) }])
  return new URLSearchParams(base)
}

export async function fetchQuality<K extends QualityKind>(a: {
  kind: K; adAccountId: string; token: string; since: string; until: string; adIds?: string[]; doFetch?: typeof fetch; timeoutMs?: number
}): Promise<QualityFetch<K>> {
  const doFetch = a.doFetch ?? fetch
  const fail = (state: 'AUTH' | 'ERROR' | 'UNAVAILABLE'): QualityFetch<K> => ({ state, rows: [] })
  if (!/^\d{5,20}$/.test(a.adAccountId)) return fail('ERROR') // id ไปอยู่ใน path ที่แนบ token
  // กรองแล้วไม่เหลือแอดที่ถูกรูปแบบ = ไม่ยิง (filtering ว่างจะได้ข้อมูลทั้งบัญชีแทน)
  if (a.kind !== 'ad' && a.adIds && !a.adIds.some((i) => /^\d{1,30}$/.test(i))) return fail('ERROR')
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), a.timeoutMs ?? 8000)
  const parse = (d: Raw) => (a.kind === 'ad' ? parseAdRow(d) : a.kind === 'account' ? parseReach(d) : a.kind === 'placement' ? parsePlacement(d) : parseAgeGender(d))
  try {
    let url: string | null = `${GRAPH_BASE}/act_${a.adAccountId}/insights?${queryFor(a.kind, a)}`
    const rows: unknown[] = []
    for (let page = 0; url; page++) {
      if (page >= MAX_PAGES) return fail('ERROR') // ไม่ครบ = ห้ามโชว์ตัวเลขบางส่วนเป็นตัวเลขจริง
      let res: Response
      try {
        res = await doFetch(url, { headers: { Authorization: `Bearer ${a.token}` }, signal: ctl.signal, redirect: 'error' })
      } catch {
        return fail('ERROR')
      }
      const body = (await res.json().catch(() => null)) as { data?: Raw[]; paging?: { next?: string } } | null
      if (!res.ok) return fail(classifyQualityError(res.status, body))
      for (const d of body?.data ?? []) {
        const row = parse(d)
        if (row) rows.push(row)
      }
      const next = body?.paging?.next
      if (next && !next.startsWith('https://graph.facebook.com/')) return fail('ERROR') // กัน token ไปโฮสต์อื่น
      url = next ?? null
    }
    return { state: 'OK', rows } as QualityFetch<K>
  } finally {
    clearTimeout(timer)
  }
}
