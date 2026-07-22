import { GRAPH_BASE, MESSENGER_SUBSCRIBED_FIELDS } from './constants'

// Client บาง ๆ ของ Meta Graph API (feature 00018)
// หลักการ: ส่ง access token ผ่าน header Authorization เสมอ ไม่ใส่ใน query string
// เพราะ URL มักถูก log ทั้งเส้น (Vercel log, error tracker) → token หลุดง่าย

export class GraphApiError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly subcode: number | null,
    readonly httpStatus: number,
  ) {
    super(message)
    this.name = 'GraphApiError'
  }
}

async function graphFetch(
  path: string,
  token: string,
  init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(init.query ?? {}).toString()
  const url = `${GRAPH_BASE}${path}${qs ? `?${qs}` : ''}`

  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  })

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = (json.error ?? {}) as { message?: string; code?: number; error_subcode?: number }
    throw new GraphApiError(
      err.message ?? `Graph API error (HTTP ${res.status})`,
      err.code ?? null,
      err.error_subcode ?? null,
      res.status,
    )
  }
  return json
}

export interface PageInfo {
  id: string
  name: string
  accessToken: string
  tasks: string[]
  instagramBusinessAccountId: string | null
}

// (S-3) แลก short-lived user token → long-lived (~60 วัน) ต่ออีกครั้ง — design spec §7.1 ระบุว่า
// ต้องได้ long-lived user token; page token ที่ derive จาก short-lived user token จะหมดอายุเร็ว
// (~1-2 ชม.) ทำให้ TOKEN_INVALID เกิดถี่ผิดปกติ และร้านต้องเชื่อมใหม่บ่อยเกินจำเป็น
async function exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
  const appId = process.env.FB_CHAT_APP_ID
  const appSecret = process.env.FB_CHAT_APP_SECRET
  if (!appId || !appSecret) return shortLivedToken

  const res = await fetch(
    `${GRAPH_BASE}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLivedToken,
      }).toString(),
  )
  const json = (await res.json().catch(() => ({}))) as { access_token?: string }
  // ขั้นแลก long-lived ล้มเหลว (Graph error ชั่วคราว/rate limit) — คืน short-lived แทนการโยน
  // ใช้งานได้ชั่วคราวดีกว่าเชื่อม Page ไม่ได้เลย (ร้านจะเจอ TOKEN_INVALID เร็วขึ้นเท่านั้น ไม่ใช่เชื่อมไม่ได้)
  if (!res.ok || !json.access_token) return shortLivedToken
  return json.access_token
}

// แลก authorization code → long-lived user access token
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  const appId = process.env.FB_CHAT_APP_ID
  const appSecret = process.env.FB_CHAT_APP_SECRET
  if (!appId || !appSecret) throw new Error('FB_CHAT_APP_CREDENTIALS_MISSING')

  const res = await fetch(
    `${GRAPH_BASE}/oauth/access_token?` +
      new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      }).toString(),
  )
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } }
  if (!res.ok || !json.access_token) {
    throw new GraphApiError(json.error?.message ?? 'exchange code failed', null, null, res.status)
  }
  return exchangeForLongLivedToken(json.access_token)
}

// Page ที่ user ดูแล — เอาเฉพาะที่มีสิทธิ์ MESSAGING + MODERATE ตามที่ Meta กำหนด
// สำหรับการรับ-ส่งข้อความแทนเพจ (Page ที่สิทธิ์ไม่ครบเชื่อมไปก็ส่งข้อความไม่ได้)
export async function listManageablePages(userToken: string): Promise<PageInfo[]> {
  const json = await graphFetch('/me/accounts', userToken, {
    query: { fields: 'id,name,access_token,tasks,instagram_business_account' },
  })
  const rows = (json.data ?? []) as Array<{
    id: string
    name: string
    access_token: string
    tasks?: string[]
    instagram_business_account?: { id: string }
  }>

  return rows
    .filter((r) => (r.tasks ?? []).includes('MESSAGING') && (r.tasks ?? []).includes('MODERATE'))
    .map((r) => ({
      id: r.id,
      name: r.name,
      accessToken: r.access_token,
      tasks: r.tasks ?? [],
      instagramBusinessAccountId: r.instagram_business_account?.id ?? null,
    }))
}

// บอก Meta ให้ยิง webhook ของเพจนี้มาที่แอปเรา — ถ้าไม่เรียก จะไม่มีข้อความเข้าเลย
export async function subscribePageToApp(pageId: string, pageToken: string): Promise<void> {
  await graphFetch(`/${pageId}/subscribed_apps`, pageToken, {
    method: 'POST',
    query: { subscribed_fields: MESSENGER_SUBSCRIBED_FIELDS.join(',') },
  })
}

// โปรไฟล์ลูกค้า — ใช้แสดงชื่อ/รูปใน inbox
// ห้ามใช้ /{psid}/picture แบบ FB login เพราะ PSID เป็น page-scoped คนละ ID space
export async function getContactProfile(
  externalUserId: string,
  pageToken: string,
): Promise<{ name: string | null; avatarUrl: string | null }> {
  try {
    const json = await graphFetch(`/${externalUserId}`, pageToken, {
      query: { fields: 'name,profile_pic' },
    })
    return {
      name: (json.name as string | undefined) ?? null,
      avatarUrl: (json.profile_pic as string | undefined) ?? null,
    }
  } catch {
    // โปรไฟล์ดึงไม่ได้ไม่ใช่เหตุให้ทิ้งข้อความ — เก็บข้อความไว้ก่อน ชื่อค่อยเติมทีหลัง
    return { name: null, avatarUrl: null }
  }
}

// ส่งข้อความ text — คืน mid สำหรับเก็บเป็น externalMessageId (กลไก dedupe echo)
export async function sendTextMessage(
  pageId: string,
  pageToken: string,
  recipientId: string,
  text: string,
): Promise<string> {
  const json = await graphFetch(`/${pageId}/messages`, pageToken, {
    method: 'POST',
    body: {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text },
    },
  })
  return (json.message_id as string | undefined) ?? ''
}
