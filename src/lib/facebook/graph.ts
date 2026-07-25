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

// ชื่อ/รูปลูกค้าสำหรับแสดงใน inbox — วิธีดึงต่างกันคนละช่องทาง (ทดสอบกับเพจจริงทุกเคสแล้ว)
//
// **Messenger:** ยิง GET /{psid} ตรง ๆ ไม่ได้ — Meta ตอบ 400 "cannot be loaded due to missing
// permissions" ทุกชุด field เพราะ Messenger User Profile API ถูกจำกัดสำหรับแอปที่ยังไม่มี
// Advanced Access → ต้องใช้ /me/conversations?user_id={psid} ซึ่งคืน participants พร้อมชื่อ
// (endpoint นี้ไม่มีรูปโปรไฟล์ → avatarUrl เป็น null, inbox แสดงตัวอักษรแรกของชื่อแทน)
//
// **Instagram:** กลับกัน — /me/conversations?platform=instagram ตอบ error 2207085 "Fatal"
// แต่ยิง GET /{igsid} ตรงกลับได้ทั้ง name, username และ profile_pic
//
// **ทำไมใช้ /me แทน /{page-id}:** pageToken resolve /me เป็นเพจเจ้าของ token อยู่แล้ว จึงไม่ต้อง
// รู้ Page id — สำคัญมากเพราะ ShopChannel ของช่องทาง IG เก็บ **IG account id** ไม่ใช่ Page id
// การส่ง IG account id เข้า path ทำให้ Meta ตอบ "(#3) Application does not have the capability"
// (บั๊กจริงที่เจอบน prod — ทั้งการดึงชื่อและการส่งข้อความ IG พังทั้งคู่ด้วยเหตุนี้)
export async function getContactProfile(
  externalUserId: string,
  pageToken: string,
  provider: string,
): Promise<{ name: string | null; avatarUrl: string | null }> {
  try {
    if (provider === 'INSTAGRAM') {
      const json = await graphFetch(`/${externalUserId}`, pageToken, {
        query: { fields: 'name,username,profile_pic' },
      })
      return {
        // บาง account ตั้งชื่อเป็นอักขระพิเศษจนอ่านไม่ออก — fallback เป็น @username ที่อ่านได้เสมอ
        name: (json.name as string | undefined) || (json.username as string | undefined) || null,
        avatarUrl: (json.profile_pic as string | undefined) ?? null,
      }
    }

    const json = await graphFetch('/me/conversations', pageToken, {
      query: { fields: 'participants', user_id: externalUserId },
    })
    const threads = (json.data ?? []) as Array<{
      participants?: { data?: Array<{ id?: string; name?: string }> }
    }>
    for (const thread of threads) {
      // participants มีทั้งลูกค้าและตัวเพจเอง — เลือกเฉพาะแถวที่ id ตรงกับ PSID ที่ถาม
      const me = thread.participants?.data?.find((p) => p.id === externalUserId)
      if (me?.name) return { name: me.name, avatarUrl: null }
    }
    return { name: null, avatarUrl: null }
  } catch {
    // ดึงชื่อไม่ได้ไม่ใช่เหตุให้ทิ้งข้อความ — เก็บข้อความไว้ก่อน ชื่อค่อยเติมทีหลัง
    return { name: null, avatarUrl: null }
  }
}

/**
 * getLastInboundTime — เวลาที่ "ลูกค้าทักเข้าเพจล่าสุดจริง" ตาม Meta (feature 00018, user report
 * 2026-07-24) — ไม่ขึ้นกับว่าเรารับ webhook ตอนไหน
 *
 * ทำไมต้องมี: หน้าต่าง 24 ชม.นับจากข้อความล่าสุดของลูกค้า แต่เดิมเราเซ็ต lastInboundAt จาก webhook
 * เท่านั้น — ถ้าร้านเชื่อมเพจ "หลัง" ลูกค้าทักมาแล้ว เราไม่เคยได้ webhook ของข้อความก่อนหน้า →
 * lastInboundAt=NULL ทั้งที่ลูกค้าอาจเพิ่งทัก 3 ชม.ก่อน. Conversations API ให้เวลาจริงจาก Meta
 *
 * Messenger: /me/conversations?user_id={psid}&fields=messages{from,created_time} — pattern เดียวกับ
 * getContactProfile (prod-tested). เลือกข้อความใบล่าสุดที่ from.id === psid (ของลูกค้า ไม่ใช่เพจ) —
 * updated_time เพียว ๆ ใช้ไม่ได้เพราะขยับตอนเพจส่งด้วย. Meta ให้เข้าถึง 20 ข้อความล่าสุด/บทสนทนา
 * (พอสำหรับหาใบล่าสุดของลูกค้า)
 *
 * Instagram: /me/conversations?platform=instagram เคยตอบ error 2207085 "Fatal" บน prod (ดู comment
 * getContactProfile) — ลองแล้ว catch คืน null เงียบ ๆ (ไม่ throw) ให้ระบบ fallback ไปใช้ค่าที่มี
 *
 * คืน Date ของข้อความลูกค้าล่าสุด หรือ null ถ้าไม่พบ/เรียกไม่ได้ (caller ตัดสินใจต่อ)
 */
export async function getLastInboundTime(
  externalUserId: string,
  pageToken: string,
  provider: string,
): Promise<Date | null> {
  try {
    const query: Record<string, string> = { fields: 'messages{from,created_time}' }
    // Messenger ใช้ user_id filter ได้; IG ต้องใส่ platform=instagram (แต่ prod เคย fatal — เผื่อ Meta แก้แล้ว)
    if (provider === 'INSTAGRAM') query.platform = 'instagram'
    query.user_id = externalUserId

    const json = await graphFetch('/me/conversations', pageToken, { query })
    const threads = (json.data ?? []) as Array<{
      messages?: { data?: Array<{ created_time?: string; from?: { id?: string } }> }
    }>

    let latest: number | null = null
    for (const thread of threads) {
      for (const m of thread.messages?.data ?? []) {
        // นับเฉพาะข้อความ "จากลูกค้า" (from.id === psid) — ข้อความจากเพจไม่ต่ออายุหน้าต่าง 24 ชม.
        if (m.from?.id !== externalUserId || !m.created_time) continue
        const t = new Date(m.created_time).getTime()
        if (!Number.isNaN(t) && (latest === null || t > latest)) latest = t
      }
    }
    return latest === null ? null : new Date(latest)
  } catch {
    // เรียกไม่ได้ (IG fatal / token / rate limit) — ไม่ใช่เหตุให้ล้ม; caller ใช้ค่าที่มีอยู่แทน
    return null
  }
}

// ดึง "ข้อความที่ Meta render แล้ว" ของ message id หนึ่ง (feature 00018, user 2026-07-24) — ใช้กับ
// attachment ที่ Meta สังเคราะห์ text ไว้แต่ไม่ส่งมากับ webhook: template (คำสั่งซื้อ/คำขอชำระเงิน เช่น
// "You requested ฿590.00..."), fallback/แชร์ลิงก์-โพสต์, story reply. คืน null ถ้าไม่มี/ผิดพลาด/หมดเวลา
// timeout เอง (graphFetch ไม่มี) — อยู่ใน hot path ของ webhook ห้ามค้าง (Meta retry ถ้า webhook ช้า)
export async function fetchMessageText(messageId: string, pageToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${messageId}?fields=message`, {
      headers: { Authorization: `Bearer ${pageToken}` },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const json = (await res.json().catch(() => ({}))) as { message?: string }
    const t = json.message ?? null
    return t && t.trim().length > 0 ? t : null
  } catch {
    return null
  }
}

// ดึง file_url สดของ attachment แรกของ message id หนึ่ง (feature 00018, user report 2026-07-25) —
// ใช้เป็น fallback เมื่อ webhook ไม่ส่ง payload.url มา (Messenger voice message/บาง attachment) หรือ
// url ใน webhook หมดอายุ/ยิงไม่ได้. Graph คืน url สดที่ยัง fetch ได้ (host fbsbx/fbcdn). null ถ้าไม่มี/error
export async function fetchAttachmentUrl(messageId: string, pageToken: string): Promise<string | null> {
  try {
    // file_url = ไฟล์อัปโหลด (image/video/audio/file); image_data = สติกเกอร์/GIF; video_data = reel/วิดีโอ
    // สติกเกอร์กับ GIF ของ Messenger ไม่มี file_url แต่มี image_data.url — เดิม fallback อ่านแค่ file_url
    // จึงตกหล่น (user report 2026-07-25 "gif/sticker บางอย่างไม่รองรับ")
    const res = await fetch(
      `${GRAPH_BASE}/${messageId}?fields=attachments{file_url,image_data,video_data}`,
      {
        headers: { Authorization: `Bearer ${pageToken}` },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!res.ok) return null
    const json = (await res.json().catch(() => ({}))) as {
      attachments?: {
        data?: Array<{
          file_url?: string
          image_data?: { url?: string; preview_url?: string }
          video_data?: { url?: string; preview_url?: string }
        }>
      }
    }
    const a = json.attachments?.data?.[0]
    const url =
      a?.file_url ||
      a?.image_data?.url ||
      a?.video_data?.url ||
      a?.image_data?.preview_url ||
      a?.video_data?.preview_url
    return typeof url === 'string' && url.length > 0 ? url : null
  } catch {
    return null
  }
}

// ส่งข้อความ text — คืน mid สำหรับเก็บเป็น externalMessageId (กลไก dedupe echo)
//
// ใช้ /me/messages ไม่ใช่ /{page-id}/messages ด้วยเหตุผลเดียวกับ getContactProfile:
// pageToken resolve /me เป็นเพจอยู่แล้ว และ ShopChannel ของ IG เก็บ IG account id ไม่ใช่ Page id
// (ยิง IG account id เข้า path → "(#3) Application does not have the capability")
export async function sendTextMessage(
  pageToken: string,
  recipientId: string,
  text: string,
): Promise<string> {
  const json = await graphFetch('/me/messages', pageToken, {
    method: 'POST',
    body: {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text },
    },
  })
  return (json.message_id as string | undefined) ?? ''
}

/**
 * ส่งรูปภาพไปยัง Messenger/Instagram — feature 00018 (composer แนบรูปช่องทางนอก)
 *
 * imageUrl ต้องเป็น URL สาธารณะที่ Meta ดึงได้ (เราส่ง presigned URL ของ S3 อายุ 1 ชม. — /api/files
 * ของเรา auth-gated Meta ดึงไม่ได้). Send API รับ attachment ทีละชนิด ไม่มี text ในตัว — caption
 * ส่งเป็นข้อความตามหลังแยก (ดู sendOutboundMessage). ใช้ /me/messages เหมือน text (pageToken
 * resolve เพจ/IG account ให้เอง — ห้ามใส่ page-id path เพราะ IG เก็บ IG account id ไม่ใช่ Page id)
 */
export async function sendImageMessage(
  pageToken: string,
  recipientId: string,
  imageUrl: string,
): Promise<string> {
  const json = await graphFetch('/me/messages', pageToken, {
    method: 'POST',
    body: {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { attachment: { type: 'image', payload: { url: imageUrl } } },
    },
  })
  return (json.message_id as string | undefined) ?? ''
}
