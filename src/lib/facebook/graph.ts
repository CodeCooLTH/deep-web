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
    /** error object ดิบทั้งก้อนที่ Meta ตอบมา (2026-08-03) — เก็บลง ChatMessage.rawMessage ตอนส่งไม่ผ่าน
     *  code/subcode ที่แกะไว้ข้างบนไม่พอตอนสืบจริง: ของที่ต้องใช้บ่อยคือ `fbtrace_id` (ใช้แจ้ง Meta),
     *  `error_user_title`/`error_user_msg` (ข้อความที่ Meta ตั้งใจให้แสดงผู้ใช้) และ `type`
     *  ไม่มี token ปนอยู่ในนี้ — เป็น error body ฝั่งตอบกลับล้วน */
    readonly raw?: unknown,
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
      json.error ?? json,
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
  /** รูปโปรไฟล์ IG — 🛑 CDN URL ที่หมดอายุ ต้อง mirror ก่อนเก็บลงฐาน (ดู listManageablePages) */
  instagramProfilePictureUrl: string | null
  /** ยอดถูกใจเพจ — null = Graph ไม่ส่งมา (สิทธิ์ไม่ถึง/เพจใหม่) **ไม่ใช่ 0** ผู้เรียกต้องแยกสองอย่างนี้ */
  followerCount: number | null
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
    // followers_count ใช้สิทธิ์ pages_read_engagement ซึ่งอยู่ใน CONNECT_SCOPES มาตั้งแต่ต้นแล้ว
    // (ไม่ใช่ของที่เพิ่งเพิ่มเหมือน pages_read_user_content ที่ token เก่าไม่มี) — ถึงอย่างนั้นก็ยัง
    // เขียนแบบ "ไม่มีก็ไม่พัง": Graph ที่ไม่ส่ง field นี้มาจะได้ null แล้ว UI ซ่อนยอดไปเอง
    // ขอ profile_picture_url ของ IG มาพร้อมกันใน call เดิม (ไม่เพิ่มจำนวน request)
    // — `graph.facebook.com/{id}/picture` ใช้ได้เฉพาะ Page ID; IG business account อยู่คนละ
    //   ID space จึงต้องถามผ่าน field นี้เท่านั้น (ใช้สิทธิ์ instagram_basic ที่มีใน CONNECT_SCOPES แล้ว)
    query: {
      fields:
        'id,name,access_token,tasks,instagram_business_account{id,profile_picture_url},followers_count',
    },
  })
  const rows = (json.data ?? []) as Array<{
    id: string
    name: string
    access_token: string
    tasks?: string[]
    instagram_business_account?: { id: string; profile_picture_url?: string }
    followers_count?: number
  }>

  return rows
    .filter((r) => (r.tasks ?? []).includes('MESSAGING') && (r.tasks ?? []).includes('MODERATE'))
    .map((r) => ({
      id: r.id,
      name: r.name,
      accessToken: r.access_token,
      tasks: r.tasks ?? [],
      instagramBusinessAccountId: r.instagram_business_account?.id ?? null,
      /**
       * 🛑 URL นี้เป็น CDN ของ Meta ที่ "หมดอายุ" ห้ามเก็บลงฐานตรง ๆ
       * ผู้เรียกต้อง mirror ก่อนเสมอ (mirrorRemoteImage) — รีโปนี้เจอคลาสนี้มาแล้วกับรูปโพสต์
       * Facebook ที่หายเองใน ~4 วัน โดยไม่มีอะไรฟ้อง (feature 00035/00018)
       */
      instagramProfilePictureUrl: r.instagram_business_account?.profile_picture_url ?? null,
      followerCount: typeof r.followers_count === 'number' ? r.followers_count : null,
    }))
}

/**
 * ยอดผู้ติดตามของบัญชี Instagram business ที่ผูกกับเพจ
 *
 * แยก call ต่างหากจาก /me/accounts เพราะ IG อยู่คนละ ID space — field `followers_count` ของ IG
 * ต้องถามที่ IG user id ด้วย page token (สิทธิ์ instagram_basic ซึ่งอยู่ใน CONNECT_SCOPES แล้ว)
 *
 * ล้มเหลว = คืน null ไม่ throw: การเชื่อมเพจต้องไม่พังเพราะดึงตัวเลขประดับไม่ได้
 * (และ null ที่คืนไปแปลว่า "ไม่รู้" ผู้เรียกจะไม่เขียนทับค่าเดิมในฐาน)
 */
export async function fetchInstagramFollowerCount(
  igUserId: string,
  pageToken: string,
): Promise<number | null> {
  try {
    const json = await graphFetch(`/${igUserId}`, pageToken, { query: { fields: 'followers_count' } })
    const n = (json as { followers_count?: number }).followers_count
    return typeof n === 'number' ? n : null
  } catch {
    return null
  }
}

// บอก Meta ให้ยิง webhook ของเพจนี้มาที่แอปเรา — ถ้าไม่เรียก จะไม่มีข้อความเข้าเลย
export async function subscribePageToApp(pageId: string, pageToken: string): Promise<void> {
  await graphFetch(`/${pageId}/subscribed_apps`, pageToken, {
    method: 'POST',
    query: { subscribed_fields: MESSENGER_SUBSCRIBED_FIELDS.join(',') },
  })
}

/**
 * ไฟล์แนบ/การ์ดของข้อความที่ดึงย้อนหลังจาก Graph
 *
 * ข้อควรระวัง: message attachment **ไม่มีฟิลด์ `type`** (ต่างจาก webhook payload ที่มี) — ชนิดของมันดูจาก
 * "คีย์ไหนโผล่มา" เท่านั้น (`generic_template` / `image_data` / `video_data` / `file_url`)
 * ดู `fetchThreadMessages` ว่าทำไมการขอ `type` ถึงทำให้ข้อมูลหายทั้งก้อน
 */
export interface GraphThreadAttachment {
  /** ชนิดที่อนุมานจากคีย์ที่ Graph คืนมา — ไม่ใช่ค่าที่ Meta ส่งมาตรง ๆ */
  kind: 'template' | 'image' | 'video' | 'file'
  /** หัวข้อ/คำบรรยายของการ์ด (generic_template) — null เมื่อเป็นไฟล์แนบธรรมดา */
  title: string | null
  subtitle: string | null
  /** URL ของสื่อ: image_data.url / video_data.url / file_url / media_url ของการ์ด */
  mediaUrl: string | null
  /** true เมื่อรูปนี้คือสติกเกอร์ (image_data.render_as_sticker) */
  isSticker: boolean
  name: string | null
  mimeType: string | null
  /** ขนาดไฟล์ (byte) เท่าที่ Graph บอก — null เมื่อเป็นการ์ดหรือไม่ได้ส่งมา */
  size: number | null
}

export interface GraphThreadMessage {
  id: string
  createdTime: Date
  /** id ของผู้ส่ง — เทียบกับ page id เพื่อรู้ว่าเป็นฝั่งร้านหรือลูกค้า */
  fromId: string | null
  text: string | null
  attachments: GraphThreadAttachment[]
}

/** map แถว attachment ดิบของ Graph → รูปแบบของเรา (ดู comment ของ GraphThreadAttachment) */
function toThreadAttachment(raw: Record<string, unknown>): GraphThreadAttachment {
  const tpl = raw.generic_template as { title?: string; subtitle?: string; media_url?: string } | undefined
  const img = raw.image_data as { url?: string; render_as_sticker?: boolean } | undefined
  const vid = raw.video_data as { url?: string } | undefined
  const fileUrl = typeof raw.file_url === 'string' ? raw.file_url : null

  const kind: GraphThreadAttachment['kind'] = tpl
    ? 'template'
    : img
      ? 'image'
      : vid
        ? 'video'
        : 'file'

  return {
    kind,
    title: tpl?.title ?? null,
    subtitle: tpl?.subtitle ?? null,
    mediaUrl: img?.url ?? vid?.url ?? fileUrl ?? tpl?.media_url ?? null,
    isSticker: img?.render_as_sticker === true,
    name: typeof raw.name === 'string' ? raw.name : null,
    mimeType: typeof raw.mime_type === 'string' ? raw.mime_type : null,
    size: typeof raw.size === 'number' ? raw.size : null,
  }
}

/**
 * ข้อความย้อนหลังในเธรดจาก Graph (feature 00018 — user report 2026-07-30 "แชทเข้ามาไม่ครบ")
 *
 * ทำไมต้องมี ทั้งที่มี webhook อยู่แล้ว: **Meta ไม่ยิง `message_echoes` ให้ข้อความที่ระบบตอบกลับ
 * อัตโนมัติของตัวเองส่ง** (ตอบกลับอัตโนมัติของโฆษณา/ข้อความทักทาย/การ์ดปุ่มโทร) — พิสูจน์กับเธรดจริง
 * 2026-07-30: Meta มี 11 ข้อความ เราได้จาก webhook แค่ 5 ที่ขาดคือข้อความอัตโนมัติทั้งหมดในช่วง
 * 4 วินาทีหลังลูกค้าคลิกโฆษณา ส่วนข้อความที่ "คนพิมพ์จริง" มาครบทุกอัน
 * เป็นข้อจำกัดฝั่ง Meta ไม่ใช่ field ที่ subscribe เพิ่มแล้วจะได้ → ต้องมาดึงเอง
 *
 * ใช้ /me/conversations?user_id= เหมือน getContactProfile (pageToken resolve /me เป็นเพจเจ้าของเอง)
 * — Messenger เท่านั้น: ฝั่ง Instagram endpoint นี้ตอบ error 2207085 (ดู comment ที่ getContactProfile)
 *
 * ข้อควรระวังที่ทำให้ข้อมูลหายมาแล้ว (bug จริง prod 2026-07-30 → 08-07, 542 แถว):
 * ขอ `attachments` **แบบไม่ระบุซับฟิลด์** เท่านั้น อย่าไประบุเอง. ของเดิมขอ `attachments{type}`
 * ซึ่ง `type` ไม่ใช่ฟิลด์ของ message attachment (มีเฉพาะใน webhook payload) — Graph **ไม่ตอบ error
 * แต่ตัดคีย์ `attachments` ทิ้งทั้งก้อนแล้วคืน HTTP 200** ผลคือการ์ด/รูปทุกใบที่มาทางนี้กลายเป็น
 * placeholder "[ข้อความจากระบบของ Facebook — เปิดดูใน Messenger]" มาตลอดโดยไม่มีอะไรฟ้อง
 * (ยืนยันกับเธรดจริง: `attachments{type}` → `{"id":…}` เปล่า ๆ · `attachments` → generic_template
 * พร้อม title/subtitle/media_url ครบ). ระบุซับฟิลด์เองเสี่ยงพลาดซ้ำคลาสเดิม — ขอเปล่าไว้ปลอดภัยกว่า
 * และไม่แพงขึ้น เพราะ Graph ตัดฟิลด์ที่ไม่มีข้อมูลออกให้อยู่แล้ว
 */
export async function fetchThreadMessages(
  contactExternalId: string,
  pageToken: string,
  limit = 50,
): Promise<GraphThreadMessage[]> {
  const json = await graphFetch('/me/conversations', pageToken, {
    query: {
      user_id: contactExternalId,
      fields: `messages.limit(${limit}){id,created_time,from,message,attachments}`,
    },
  })
  const threads = (json.data ?? []) as Array<{
    messages?: { data?: Array<Record<string, unknown>> }
  }>
  const rows = threads[0]?.messages?.data ?? []

  return rows.map((r) => {
    const from = r.from as { id?: string } | undefined
    const atts = (r.attachments as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? []
    return {
      id: String(r.id),
      createdTime: new Date(String(r.created_time)),
      fromId: from?.id ?? null,
      // Graph คืน message เป็น "" (ไม่ใช่ null) เมื่อเป็นการ์ด/template — normalize ให้เป็น null
      text: typeof r.message === 'string' && r.message.length > 0 ? r.message : null,
      attachments: atts.map(toThreadAttachment),
    }
  })
}

// คู่ตรงข้ามของ subscribePageToApp — บอก Meta ให้เลิกส่ง webhook ของเพจนี้มาที่แอปเรา
//
// ทำไมต้องมี: ตอน seller กดถอดช่องทาง เดิมเราตั้ง status='DISCONNECTED' ในฐานข้อมูลเราฝ่ายเดียว
// ฝั่ง Meta ยัง subscribe อยู่ → ข้อความลูกค้ายังวิ่งเข้า webhook เราต่อไปเรื่อย ๆ แล้วถูกโยนทิ้ง
// ที่ปลายทาง (getChannelByExternalId คืน null) การ "รับมาแล้วทิ้ง" ยังถือว่าเราแตะข้อมูลบทสนทนา
// ที่ร้านเลิกอนุญาตแล้ว — ผิดหลัก data minimization และเป็นข้อที่ Meta ตรวจตอน App Review ของ
// pages_manage_metadata ("ผู้ใช้ถอนแล้วต้องคืน state ของเพจให้จริง")
//
// ไม่ต้องระบุ app id: Graph ตัด subscription ของแอปที่เป็นเจ้าของ token ที่ยิงมาให้เอง
export async function unsubscribePageFromApp(pageId: string, pageToken: string): Promise<void> {
  await graphFetch(`/${pageId}/subscribed_apps`, pageToken, { method: 'DELETE' })
}

// Page id ที่เป็นเจ้าของ page token ใบนี้ — จำเป็นเฉพาะตอนถอดแถว INSTAGRAM ซึ่ง externalId เก็บ
// **IG account id** ไม่ใช่ page id (คนละ ID space) แต่ subscription ที่ต้องถอนอยู่ที่ Page
// /me resolve เป็นเพจเจ้าของ token เสมอ — เหตุผลเดียวกับที่ getContactProfile ใช้ /me
export async function getPageIdFromToken(pageToken: string): Promise<string | null> {
  const json = await graphFetch('/me', pageToken, { query: { fields: 'id' } })
  return typeof json.id === 'string' ? json.id : null
}

// IG business account ที่ผูกกับเพจนี้ (null ถ้าเพจไม่ได้ผูก IG) — ใช้ตรวจก่อนถอน subscription
// ว่ายังมีช่องทาง IG ที่พึ่ง webhook ของเพจนี้อยู่หรือเปล่า
export async function getInstagramAccountIdForPage(
  pageId: string,
  pageToken: string,
): Promise<string | null> {
  const json = await graphFetch(`/${pageId}`, pageToken, {
    query: { fields: 'instagram_business_account' },
  })
  const ig = json.instagram_business_account as { id?: string } | undefined
  return typeof ig?.id === 'string' ? ig.id : null
}

// ชื่อ/รูปลูกค้าสำหรับแสดงใน inbox — วิธีดึงต่างกันคนละช่องทาง (ทดสอบกับเพจจริงทุกเคสแล้ว)
//
// **Messenger:** ต้องยิง 2 ชั้นเสมอ เพราะ 2 endpoint ให้คนละอย่างและครอบคนละกลุ่ม
//
//   ชั้น 1 — GET /{psid}?fields=name,first_name,last_name,profile_pic (Messenger User Profile API)
//   ให้ **ทั้งชื่อและรูป** แต่ถูกคุมด้วยฟีเจอร์ `Business Asset User Profile Access` ซึ่งตอนนี้อยู่
//   ที่ **Standard Access** = ใช้ได้เฉพาะคนที่ **มี role บนแอป** (admin/developer/tester) เท่านั้น
//   ลูกค้าทั่วไปจะได้ 400 code=100 subcode=33 "cannot be loaded due to missing permissions"
//
//   🛑 คอมเมนต์เดิมตรงนี้เขียนว่า "ยิงตรงไม่ได้ทุกชุด field" ซึ่ง**ผิด** — สรุปจากการทดสอบกับ
//   ลูกค้าจริงอย่างเดียวเลยเหมาว่าตายทั้งหมด. วัดใหม่ 2026-08-09 บนเพจ BT Premium คลอง4 ด้วย
//   token ตัวเดียวกัน: ลูกค้า `37558899090391535` → 400 แต่เจ้าของแอป `28253571950934108`
//   → **200 พร้อม profile_pic** (ยืนยันซ้ำอีก 2 เพจ) และลูกค้าสุ่ม 30 คน → 400 ครบ 30
//   บทเรียน: endpoint ที่ล้มเพราะ "ตัวตนของ subject" ไม่ใช่ "รูปคำขอ" ต้องทดสอบด้วย subject
//   หลายชนิดก่อนสรุปว่าใช้ไม่ได้ ไม่งั้นจะตัดทางที่ใช้ได้จริงบางส่วนทิ้งทั้งเส้น
//
//   ชั้น 2 — /me/conversations?user_id={psid} คืน participants พร้อม **ชื่อของทุกคน** (ไม่จำกัด
//   role) แต่ **ไม่มีรูป**: ขอ participants{picture} ไปก็ตอบ 200 แล้วตัดคีย์ picture ทิ้งเงียบ ๆ
//
// ⇒ ลองชั้น 1 ก่อน ได้ครบทั้งชื่อและรูปก็จบใน 1 call; ไม่ได้ค่อยตกไปชั้น 2 เอาเฉพาะชื่อ
// วันที่ Advanced Access ผ่าน ชั้น 1 จะเริ่มคืนรูปให้ลูกค้าทุกคนเองโดยไม่ต้องแก้อะไรตรงนี้อีก
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

    // ชั้น 1 — User Profile API: ได้ทั้งชื่อและรูป แต่เฉพาะคนที่มี role บนแอป (ดูหัวฟังก์ชัน)
    // ห่อ try แยกเพราะ 400 ตรงนี้เป็น "เรื่องปกติของลูกค้าทั่วไป" ไม่ใช่ความล้มเหลวของทั้งฟังก์ชัน —
    // ถ้าปล่อยให้ throw ออกไป catch ใหญ่ ชื่อที่ชั้น 2 ดึงได้จะหายไปด้วยทั้งที่ดึงได้จริง
    try {
      const direct = await graphFetch(`/${externalUserId}`, pageToken, {
        query: { fields: 'name,first_name,last_name,profile_pic' },
      })
      const full =
        (direct.name as string | undefined) ||
        [direct.first_name, direct.last_name].filter(Boolean).join(' ').trim()
      const pic = (direct.profile_pic as string | undefined) ?? null
      // ยอมรับผลชั้น 1 เฉพาะตอนได้ของที่ชั้น 2 ให้ไม่ได้ (รูป) หรือได้ชื่อมาด้วย — ตอบ 200 เปล่า ๆ
      // ให้ตกไปชั้น 2 ต่อ ไม่ใช่คืน null ทั้งคู่
      if (full || pic) return { name: full || null, avatarUrl: pic }
    } catch {
      // ลูกค้าทั่วไปมาทางนี้เสมอ (400 code=100 subcode=33) — ไม่ log ไม่ throw ตกไปชั้น 2
    }

    // ชั้น 2 — ชื่ออย่างเดียว แต่ได้กับทุกคน
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

/**
 * ดึงเนื้อหาของข้อความ "รายใบ" จาก mid (2026-08-07)
 *
 * ต่างจาก `fetchThreadMessages` ตรงที่ไม่ผูกกับ "50 ข้อความล่าสุดของเธรด" — ใช้กับข้อความเก่า
 * ที่หลุดหน้าต่างนั้นไปแล้วได้ (เช่น backfill ย้อนหลังแถวที่บันทึกเป็น placeholder ไว้ก่อนหน้า)
 *
 * ขอ `attachments` แบบไม่ระบุซับฟิลด์ด้วยเหตุผลเดียวกับ `fetchThreadMessages` — ดู comment ที่นั่น
 * (`attachments{type}` ทำให้ Graph ตัดข้อมูลทิ้งเงียบ ๆ แล้วคืน HTTP 200)
 *
 * คืน null เมื่อ Graph ปฏิเสธ/ข้อความถูกลบ — ผู้เรียกต้องข้ามแถวนั้นไป ไม่ใช่เขียนทับด้วยค่าว่าง
 */
export async function fetchMessageContent(
  messageId: string,
  pageToken: string,
): Promise<{ text: string | null; attachments: GraphThreadAttachment[] } | null> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${messageId}?fields=message,attachments`, {
      headers: { Authorization: `Bearer ${pageToken}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const json = (await res.json().catch(() => ({}))) as {
      message?: string
      attachments?: { data?: Array<Record<string, unknown>> }
    }
    return {
      text: typeof json.message === 'string' && json.message.length > 0 ? json.message : null,
      attachments: (json.attachments?.data ?? []).map(toThreadAttachment),
    }
  } catch {
    return null
  }
}

/**
 * ดึงเนื้อหาโพสต์ของโฆษณา (feature 00018 E5) — ข้อความจริงที่ลูกค้าเห็นในโฆษณา + รูปโพสต์
 *
 * ทำไมต้องมี: `ads_context_data.ad_title` ที่มากับ webhook คือ **ชื่อ ad ที่ร้านตั้งไว้ใน Ads
 * Manager** (เช่น "video v3", "โพสแนวตั้ง") ไม่ใช่ข้อความโฆษณา — เอามาโชว์แล้วผู้ขายอ่านไม่รู้เรื่อง
 * ว่าเป็นโฆษณาชิ้นไหน. ข้อความจริงอยู่ที่โพสต์ ต้องดึงเพิ่มเอง (ทดสอบกับเพจจริงแล้ว ได้ข้อความ
 * ตรงกับที่แอป Messenger แสดงในแบนเนอร์ "This is a reply to an ad")
 *
 * สำคัญ: ต้องยิงด้วย `{pageId}_{postId}` — ใช้ `postId` เปล่า ๆ Meta ตอบ 400 code 12
 * "singular statuses API is deprecated for versions v2.4 and higher"
 *
 * `full_picture` ใช้ได้กับโฆษณาวิดีโอด้วย (คืน thumbnail) — จึงเป็นแหล่งรูปที่ครอบคลุมกว่า
 * `ads_context_data.photo_url` ที่เป็น null เมื่อโฆษณาเป็นวิดีโอ
 *
 * คืน null ทุกช่อง (ไม่ throw) เมื่อดึงไม่ได้ — อยู่ใน hot path ของ webhook ห้ามค้าง/ห้ามพัง
 */
export async function fetchAdPostContent(
  pageId: string,
  postId: string,
  pageToken: string,
): Promise<{ message: string | null; fullPicture: string | null; permalink: string | null }> {
  const empty = { message: null, fullPicture: null, permalink: null }
  try {
    const res = await fetch(`${GRAPH_BASE}/${pageId}_${postId}?fields=message,full_picture,permalink_url`, {
      headers: { Authorization: `Bearer ${pageToken}` },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return empty
    const json = (await res.json().catch(() => ({}))) as {
      message?: string
      full_picture?: string
      permalink_url?: string
    }
    const message = json.message?.trim()
    return {
      message: message && message.length > 0 ? message : null,
      fullPicture: json.full_picture ?? null,
      // ลิงก์โพสต์จริง — ใช้ทำปุ่ม "ดูโฆษณา" (เลือกอันนี้แทน deep link ของ Ads Manager เพราะเปิดได้
      // เสมอ ไม่ต้องมีสิทธิ์ ad account และไม่ต้องเดา business context ที่ถูกต้อง)
      permalink: json.permalink_url ?? null,
    }
  } catch {
    return empty
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
  // reply/quote (user 2026-07-25): ตอบทับข้อความ mid นี้ — Messenger รองรับ reply_to:{mid} (Send API);
  // IG ไม่ยืนยัน → ถ้า Meta ปฏิเสธ caller จับ error เอง (ยังส่งข้อความปกติได้)
  replyToMid?: string | null,
  // tag = ส่งนอกหน้าต่าง 24 ชม. (HUMAN_AGENT) — ต้องมาคู่กับ messaging_type 'MESSAGE_TAG'
  // ไม่ส่ง tag = RESPONSE ตามเดิม (ในหน้าต่างปกติ ส่งเนื้อหาโปรโมชันได้ด้วย)
  tag?: string,
): Promise<string> {
  const json = await graphFetch('/me/messages', pageToken, {
    method: 'POST',
    body: {
      recipient: { id: recipientId },
      ...(tag ? { messaging_type: 'MESSAGE_TAG', tag } : { messaging_type: 'RESPONSE' }),
      message: { text },
      ...(replyToMid ? { reply_to: { mid: replyToMid } } : {}),
    },
  })
  return (json.message_id as string | undefined) ?? ''
}

/** ชนิด attachment ที่ Meta Send API รับ — ตรงกับค่าใน `message.attachment.type` */
export type GraphAttachmentType = 'image' | 'video' | 'audio' | 'file'

/**
 * ส่งไฟล์แนบไปยัง Messenger/Instagram — feature 00018 (composer แนบไฟล์ช่องทางนอก)
 *
 * เดิมชื่อ sendImageMessage รองรับแต่ `type: 'image'` — generalize 2026-08-02 ตอนเปิดให้ร้าน
 * แนบวิดีโอ/เสียง/เอกสารได้ ตัว payload ต่างกันแค่ค่า `attachment.type` เท่านั้น
 *
 * url ต้องเป็น URL สาธารณะที่ Meta ดึงได้ (เราส่ง presigned URL ของ S3 อายุ 1 ชม. — /api/files
 * ของเรา auth-gated Meta ดึงไม่ได้). Send API รับ attachment ทีละชนิด ไม่มี text ในตัว — caption
 * ส่งเป็นข้อความตามหลังแยก (ดู sendOutboundMessage). ใช้ /me/messages เหมือน text (pageToken
 * resolve เพจ/IG account ให้เอง — ห้ามใส่ page-id path เพราะ IG เก็บ IG account id ไม่ใช่ Page id)
 */
export async function sendAttachmentMessage(
  pageToken: string,
  recipientId: string,
  type: GraphAttachmentType,
  url: string,
  replyToMid?: string | null,
  // tag = ส่งนอกหน้าต่าง 24 ชม. (HUMAN_AGENT) — ดู comment ที่ sendTextMessage
  tag?: string,
): Promise<string> {
  const json = await graphFetch('/me/messages', pageToken, {
    method: 'POST',
    body: {
      recipient: { id: recipientId },
      ...(tag ? { messaging_type: 'MESSAGE_TAG', tag } : { messaging_type: 'RESPONSE' }),
      message: { attachment: { type, payload: { url } } },
      ...(replyToMid ? { reply_to: { mid: replyToMid } } : {}),
    },
  })
  return (json.message_id as string | undefined) ?? ''
}

/**
 * ร้าน "กดรีแอ็กชัน" ใส่ข้อความของลูกค้า (feature 00018 — user สั่ง 2026-08-03 "reaction ข้อความด้วย")
 *
 * เอกสาร Send API → Sender Actions (ล็อกโครงจากเอกสารก่อนเขียน ไม่เดา):
 *   POST /me/messages
 *   { recipient: { id }, sender_action: "react", payload: { message_id, reaction } }
 *   ถอนรีแอ็กชัน = sender_action "unreact" และ **ไม่ส่ง** field reaction
 * ใช้ได้ทั้ง Messenger และ Instagram (โครงเดียวกัน) — pageToken resolve เพจ/IG account ให้เอง
 * เหมือน sendTextMessage จึงใช้ /me/messages ไม่ใช่ path ที่มี id
 *
 * ไม่มี messaging_type/tag: sender action ไม่ใช่ "ข้อความ" เอกสารระบุให้ส่งเฉพาะ sender_action
 * + recipient (+ payload) เท่านั้น — ใส่ field เกินไปเสี่ยงโดนปฏิเสธทั้งคำขอ
 *
 * emoji ต้องเป็น UTF-8 จริง (เช่นหัวใจ) ไม่ใช่ชื่อเชิงความหมายอย่าง "love"
 */
export async function sendMessageReaction(
  pageToken: string,
  recipientId: string,
  mid: string,
  /** null = ถอนรีแอ็กชันออก */
  emoji: string | null,
): Promise<void> {
  await graphFetch('/me/messages', pageToken, {
    method: 'POST',
    body: {
      recipient: { id: recipientId },
      sender_action: emoji ? 'react' : 'unreact',
      payload: { message_id: mid, ...(emoji ? { reaction: emoji } : {}) },
    },
  })
}

/** wrapper ของเดิม — auto-reply-send.service.ts และเทสเก่ายังเรียกชื่อนี้อยู่ */
export async function sendImageMessage(
  pageToken: string,
  recipientId: string,
  imageUrl: string,
  replyToMid?: string | null,
  tag?: string,
): Promise<string> {
  return sendAttachmentMessage(pageToken, recipientId, 'image', imageUrl, replyToMid, tag)
}

// ───────────────────────────────────────────────────────────────────────────
// feature 00029 — คอมเมนต์บนโพสต์ของเพจ
// ต้องมี pages_read_user_content (อ่าน) / pages_manage_engagement (ตอบ)
// ───────────────────────────────────────────────────────────────────────────

export interface GraphPostMeta {
  id: string
  message: string | null
  permalink: string | null
  /** รูปประกอบโพสต์ — ใช้เป็น thumbnail ในรายการซ้าย */
  picture: string | null
  createdTime: Date | null
  /** 'video' | 'photo' | 'album' | 'link' | 'status' — วิดีโอต้องมีปุ่มเล่นทับรูปปก */
  mediaType: string | null
  /** ยอด engagement (user สั่ง 2026-08-03 ให้มีเหมือนหน้าโพสต์จริง) — null = ดึงไม่ได้ */
  reactionCount: number | null
  commentCount: number | null
  shareCount: number | null
}

/**
 * ข้อมูลโพสต์ที่ webhook ไม่ได้ส่งมา — `feed` ให้แค่ `post_id` (ยืนยันจาก payload จริง 2026-08-03)
 * เรียกครั้งเดียวต่อโพสต์แล้ว cache ลง FacebookPost ไม่เรียกซ้ำทุกคอมเมนต์
 */
export async function fetchPostMeta(postId: string, pageToken: string): Promise<GraphPostMeta | null> {
  try {
    // summary(true) = ขอ "จำนวนรวม" ไม่ใช่รายชื่อคนกด (เร็วกว่าและไม่ดึง PII ของคนที่ไม่เกี่ยว)
    const json = await graphFetch(`/${encodeURIComponent(postId)}`, pageToken, {
      query: {
        fields:
          'id,message,permalink_url,full_picture,created_time,status_type,' +
          'attachments{media_type},shares,' +
          'reactions.summary(true).limit(0),comments.summary(true).limit(0)',
      },
    })
    const atts = (json.attachments as { data?: Array<{ media_type?: string }> } | undefined)?.data ?? []
    const reactions = json.reactions as { summary?: { total_count?: number } } | undefined
    const comments = json.comments as { summary?: { total_count?: number } } | undefined
    const shares = json.shares as { count?: number } | undefined
    return {
      id: String(json.id ?? postId),
      message: typeof json.message === 'string' ? json.message : null,
      permalink: typeof json.permalink_url === 'string' ? json.permalink_url : null,
      picture: typeof json.full_picture === 'string' ? json.full_picture : null,
      createdTime: typeof json.created_time === 'string' ? new Date(json.created_time) : null,
      mediaType: atts[0]?.media_type ?? (typeof json.status_type === 'string' ? json.status_type : null),
      reactionCount: reactions?.summary?.total_count ?? null,
      commentCount: comments?.summary?.total_count ?? null,
      shareCount: shares?.count ?? null,
    }
  } catch {
    // โพสต์ที่เข้าไม่ถึง (dark post/ถูกลบ/สิทธิ์ไม่พอ) — คืน null ให้ caller เก็บเท่าที่มี
    // ดีกว่าทำให้ทั้ง ingest ล้มเพราะข้อมูลประกอบชิ้นเดียว
    return null
  }
}

export interface GraphComment {
  id: string
  message: string | null
  createdTime: Date
  fromId: string | null
  fromName: string | null
  parentId: string | null
  attachmentUrl: string | null
}

/**
 * คอมเมนต์ย้อนหลังของโพสต์ (backfill ตอนเปิดโพสต์ — BRD Q-2: ครั้งละ 30 อัน)
 *
 * `order=chronological` เพื่อให้ลำดับตรงกับที่แสดงบนจอ (เก่า→ใหม่) และ cursor เดินหน้าได้ตรง
 * `filter=stream` = เอาคอมเมนต์ลูกมาด้วย ไม่ใช่เฉพาะ top-level (เราต้องใช้ลูกตัดสินว่า "ตอบแล้ว")
 */
/**
 * ขอ "ไฟล์แนบล่าสุด" ของคอมเมนต์ใบเดียวจาก Graph — ใช้กู้รูปที่ URL เดิมหมดอายุไปแล้ว
 *
 * ทำไมต้องมีทั้งที่ `fetchPostComments` ขอ `attachment{url,media}` อยู่แล้ว: ตัวนั้นเดินทาง
 * edge `/{post}/comments` ซึ่งดึงมาทีละหน้าและใช้ตอน backfill คอมเมนต์ที่ยังไม่มีในฐาน
 * ส่วนตัวนี้ยิงตรงที่ `/{comment-id}` เพื่อขอ **URL ใหม่ของคอมเมนต์ที่เรามีอยู่แล้ว**
 *
 * ขอ `type` มาด้วย (ต่างจาก fetchPostComments) เพราะเป็นทางเดียวที่จะรู้ว่าไฟล์แนบเป็น
 * รูป/วิดีโอ/สติกเกอร์ — คอลัมน์ `attachmentUrl` ตัวเดียวบอกชนิดไม่ได้
 *
 * 🛑 ไม่กลืน error — ผู้เรียกต้องแยกให้ออกระหว่าง "คอมเมนต์ถูกลบไปแล้ว" กับ "สิทธิ์ไม่พอ"
 * ซึ่งเป็นคนละเรื่องกันสิ้นเชิงและนำไปสู่การตัดสินใจคนละแบบ (ลบแถวทิ้ง vs ไปยื่นขอสิทธิ์)
 */
export async function fetchCommentAttachment(
  commentId: string,
  pageToken: string,
): Promise<{ attachmentUrl: string | null; attachmentType: string | null; message: string | null }> {
  const json = await graphFetch(`/${encodeURIComponent(commentId)}`, pageToken, {
    query: { fields: 'id,message,attachment{type,url,media}' },
  })
  const att = json.attachment as
    | { type?: string; url?: string; media?: { image?: { src?: string } } }
    | undefined
  return {
    attachmentUrl: att?.media?.image?.src ?? att?.url ?? null,
    attachmentType: att?.type ?? null,
    message: typeof json.message === 'string' && json.message.length > 0 ? json.message : null,
  }
}

export async function fetchPostComments(
  postId: string,
  pageToken: string,
  limit = 30,
  after?: string | null,
): Promise<{ items: GraphComment[]; nextCursor: string | null }> {
  const json = await graphFetch(`/${encodeURIComponent(postId)}/comments`, pageToken, {
    query: {
      fields: 'id,message,created_time,from{id,name},parent{id},attachment{url,media}',
      order: 'chronological',
      filter: 'stream',
      limit: String(limit),
      ...(after ? { after } : {}),
    },
  })
  const rows = (json.data ?? []) as Array<Record<string, unknown>>
  const paging = (json.paging ?? {}) as { cursors?: { after?: string }; next?: string }
  return {
    items: rows.map((r) => {
      const from = r.from as { id?: string; name?: string } | undefined
      const parent = r.parent as { id?: string } | undefined
      const att = r.attachment as { url?: string; media?: { image?: { src?: string } } } | undefined
      return {
        id: String(r.id),
        message: typeof r.message === 'string' && r.message.length > 0 ? r.message : null,
        createdTime: new Date(String(r.created_time)),
        fromId: from?.id ?? null,
        fromName: from?.name ?? null,
        parentId: parent?.id ?? null,
        attachmentUrl: att?.media?.image?.src ?? att?.url ?? null,
      }
    }),
    // มี next เท่านั้นถึงจะมีหน้าถัดไปจริง — cursors.after มาแม้หมดแล้ว
    nextCursor: paging.next ? (paging.cursors?.after ?? null) : null,
  }
}

/**
 * ตอบคอมเมนต์แบบสาธารณะในนามเพจ — คืน comment id ของคำตอบ
 * เอกสาร Pages API: `POST /{object-id}/comments` (pages_manage_engagement)
 */
export async function createCommentReply(
  commentId: string,
  pageToken: string,
  message: string,
  /**
   * URL รูปสาธารณะที่ Meta ดึงเองได้ → คอมเมนต์เป็นรูป (เอกสาร Object comments edge: `attachment_url`)
   * เอกสารระบุว่าต้องมีอย่างน้อยหนึ่งใน message/attachment_url/attachment_id/attachment_share_url/source
   * — ส่งได้ทั้งคู่ (รูป + คำบรรยาย) ในคอมเมนต์เดียว ต่างจาก Send API ของแชทที่ต้องแยกข้อความออกมา
   */
  attachmentUrl?: string | null,
): Promise<string> {
  const json = await graphFetch(`/${encodeURIComponent(commentId)}/comments`, pageToken, {
    method: 'POST',
    body: {
      ...(message ? { message } : {}),
      ...(attachmentUrl ? { attachment_url: attachmentUrl } : {}),
    },
  })
  return typeof json.id === 'string' ? json.id : ''
}

/**
 * ทักแชทส่วนตัวจากคอมเมนต์ (Private Replies, ยิง /me/messages) — feature 00038
 *
 * contract ล็อกจากเอกสาร Meta "Private Replies" ก่อนเขียนโค้ด ไม่ได้เดา:
 *   POST /{PAGE_ID}/messages
 *   { recipient: { comment_id: "<COMMENT_ID>" }, message: { text: "..." } }
 *   → { recipient_id: "<PSID>", message_id: "<MID>" }
 *
 * 🛑 ข้อจำกัดที่แก้ไม่ได้: ส่งได้ **ครั้งเดียวต่อคอมเมนต์** และภายใน **7 วัน** นับจากเวลาคอมเมนต์
 * ยิงพลาด = เสียสิทธิ์ของคอมเมนต์นั้นถาวร จึงห้ามเรียกฟังก์ชันนี้ซ้ำแบบ retry อัตโนมัติ
 *
 * ใช้ /me/messages ไม่ใช่ /{page-id}/messages ตามที่เอกสาร Meta เขียน — ด้วยเหตุผลเดียวกับ
 * sendTextMessage (graph.ts:524): pageToken resolve /me เป็นเพจให้อยู่แล้ว และ
 * ShopChannel.externalId ของช่องทาง IG เก็บ **IG account id ไม่ใช่ Page id** การยิง externalId
 * เข้า path ตรง ๆ จะได้ "(#3) Application does not have the capability" ทันทีที่เฟส 2 เปิด IG
 * รอบนี้เป็น FB อย่างเดียวจึงยังไม่พัง แต่นี่คือกับดักที่วางไว้รอ ไม่ใช่เรื่องที่ค่อยแก้ทีหลัง
 *
 * หมายเหตุ: ใช้ pages_messaging ที่มีใน CONNECT_SCOPES อยู่แล้ว — ไม่ต้องให้ร้านเชื่อมเพจใหม่
 */
export async function sendPrivateReplyToComment(
  pageToken: string,
  commentExternalId: string,
  text: string,
): Promise<{ recipientId: string; messageId: string }> {
  const json = await graphFetch('/me/messages', pageToken, {
    method: 'POST',
    body: {
      recipient: { comment_id: commentExternalId },
      message: { text },
    },
  })
  return {
    recipientId: typeof json.recipient_id === 'string' ? json.recipient_id : '',
    messageId: typeof json.message_id === 'string' ? json.message_id : '',
  }
}

// ───────────────────────────────────────────────────────────────────────────
// สติกเกอร์ (Sticker API) — user สั่ง 2026-08-04 "channel ที่เป็น facebook รองรับ sticker ด้วย"
//
// contract ล็อกจากเอกสาร Meta "Sticker API" (Updated: Jun 3, 2026) ก่อนเขียนโค้ด ไม่ได้เดา:
//   - catalog (browse/search) ใช้ **App Access Token** = `APP_ID|APP_SECRET` ไม่ใช่ page token
//     GET /sticker_packs                        → { data: [{id,name,description,preview_image_url,sticker_count}] }
//     GET /sticker_packs/<PACK_ID>/stickers     → { data: [{id,name,image_url,width,height,is_animated}] }
//     GET /sticker_search?q=<>=min 2 ตัวอักษร   → รูปเดียวกับ stickers ข้างบน
//   - ส่ง ใช้ **Page Access Token** + pages_messaging (เหมือน Send API อื่น) และอยู่ใต้กฎหน้าต่างเวลาเดิม
//     POST /me/messages { recipient, message: { sticker_id } }
//   - ส่งได้เฉพาะสติกเกอร์ฟรี first-party ของ Meta (~105 แพ็ก) + นิ้วโป้ง 369239263222822
//     ที่ไม่อยู่ใน catalog แต่ส่งได้เสมอ
//
// locale: เอกสารเตือนตรง ๆ ว่าถ้าไม่ส่ง locale จะ default en_US แล้ว **ค้นภาษาไทยได้ผลว่างเปล่า**
// จึงส่ง th_TH ทุกครั้ง (ยังตกไปอังกฤษเองถ้าไม่เจอ ตามที่เอกสารระบุ)

/** สติกเกอร์นิ้วโป้งของ Messenger — ไม่อยู่ใน catalog แต่ส่งได้เสมอ (ตามเอกสาร) */
export const THUMBS_UP_STICKER_ID = '369239263222822'

const STICKER_LOCALE = 'th_TH'

export interface GraphStickerPack {
  id: string
  name: string
  description: string | null
  previewImageUrl: string | null
  stickerCount: number | null
}

export interface GraphSticker {
  id: string
  name: string | null
  imageUrl: string
  width: number | null
  height: number | null
  isAnimated: boolean
}

/**
 * App Access Token — ประกอบจาก env ฝั่ง server เท่านั้น (ห้ามหลุดไปฝั่ง client เด็ดขาด:
 * มันคือ secret ของแอปทั้งใบ ไม่ใช่ token ของเพจเดียว) route ที่เรียกต้องเป็น server route
 */
function appAccessToken(): string {
  // ต้องเป็นแอปเดียวกับที่ใช้ทำ Messenger integration (FB_CHAT_APP_*) ไม่ใช่แอป login (FACEBOOK_ID/
  // FACEBOOK_SECRET ที่ NextAuth ใช้) — page token ที่เราถือมาจากแอปนี้ สติกเกอร์ที่ส่งได้จึงต้อง
  // มาจาก catalog ของแอปเดียวกัน (และ secret ของแอป login ไม่ควรถูกใช้ในเส้นทางแชทเลย)
  const id = process.env.FB_CHAT_APP_ID
  const secret = process.env.FB_CHAT_APP_SECRET
  if (!id || !secret) throw new Error('FB_CHAT_APP_CREDENTIALS_MISSING')
  return `${id}|${secret}`
}

function toSticker(raw: Record<string, unknown>): GraphSticker | null {
  const id = typeof raw.id === 'string' ? raw.id : null
  const imageUrl = typeof raw.image_url === 'string' ? raw.image_url : null
  if (!id || !imageUrl) return null
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : null,
    imageUrl,
    width: typeof raw.width === 'number' ? raw.width : null,
    height: typeof raw.height === 'number' ? raw.height : null,
    isAnimated: raw.is_animated === true,
  }
}

/** แพ็กสติกเกอร์ทั้งหมดที่ส่งได้ (ฟรี first-party) */
export async function fetchStickerPacks(): Promise<GraphStickerPack[]> {
  const json = await graphFetch('/sticker_packs', appAccessToken(), {
    query: { locale: STICKER_LOCALE },
  })
  const data = Array.isArray(json.data) ? (json.data as Record<string, unknown>[]) : []
  return data.flatMap((p) => {
    const id = typeof p.id === 'string' ? p.id : null
    const name = typeof p.name === 'string' ? p.name : null
    if (!id || !name) return []
    return [
      {
        id,
        name,
        description: typeof p.description === 'string' ? p.description : null,
        previewImageUrl: typeof p.preview_image_url === 'string' ? p.preview_image_url : null,
        stickerCount: typeof p.sticker_count === 'number' ? p.sticker_count : null,
      },
    ]
  })
}

/** สติกเกอร์ในแพ็กหนึ่ง */
export async function fetchStickersInPack(packId: string): Promise<GraphSticker[]> {
  const json = await graphFetch(`/sticker_packs/${encodeURIComponent(packId)}/stickers`, appAccessToken(), {
    query: { locale: STICKER_LOCALE },
  })
  const data = Array.isArray(json.data) ? (json.data as Record<string, unknown>[]) : []
  return data.flatMap((s) => {
    const st = toSticker(s)
    return st ? [st] : []
  })
}

/**
 * ค้นสติกเกอร์ข้ามทุกแพ็ก — q ต้องยาว >=2 ตัวอักษรตามเอกสาร (สั้นกว่านั้น Meta ตีตก)
 *
 * ส่ง `locale` **เฉพาะเมื่อคำค้นเป็นภาษาไทย** — วัดกับ API จริง 2026-08-04:
 *     q=cat (ไม่ส่ง locale) -> 25 ผลลัพธ์
 *     q=แมว + locale=th_TH  -> 25 ผลลัพธ์
 *     q=cat + locale=th_TH  -> **0 ผลลัพธ์**
 * เอกสารเขียนว่า "searches in the specified language first; falls back to English if no results"
 * แต่พฤติกรรมจริงไม่ fallback — ส่ง locale ไทยติดไปกับคำอังกฤษแล้วได้ศูนย์ ซึ่งผู้ใช้อ่านว่า
 * "ค้นไม่เจอ/ระบบพัง" ทั้งที่มีสติกเกอร์อยู่. ยึดพฤติกรรมจริง ไม่ยึดเอกสาร
 */
export async function searchStickers(q: string): Promise<GraphSticker[]> {
  const query = q.trim()
  if (query.length < 2) return []
  const hasThai = /[\u0E00-\u0E7F]/.test(query)
  const json = await graphFetch('/sticker_search', appAccessToken(), {
    query: { q: query, ...(hasThai ? { locale: STICKER_LOCALE } : {}) },
  })
  const data = Array.isArray(json.data) ? (json.data as Record<string, unknown>[]) : []
  return data.flatMap((s) => {
    const st = toSticker(s)
    return st ? [st] : []
  })
}

/**
 * ส่งสติกเกอร์เข้าเธรด — คืน mid ของข้อความที่ Meta สร้าง (เหมือน sendTextMessage)
 * tag: ส่งนอกหน้าต่าง 24 ชม. (HUMAN_AGENT) — เหตุผลเดียวกับ sendTextMessage
 */
export async function sendStickerMessage(
  pageToken: string,
  recipientId: string,
  stickerId: string,
  /** ตอบทับข้อความ mid นี้ (user สั่ง 2026-08-04 "กด sticker จะถือว่าเป็น reply อัตโนมัติ")
   *  เอกสาร Sticker API ไม่ได้พูดถึง reply_to ไว้ — เป็น field ระดับคำขอเดียวกับข้อความปกติ จึงส่ง
   *  แบบ best-effort: ถ้า Meta ปฏิเสธ ผู้เรียก (sendOutboundMessage) จะลองใหม่แบบไม่มี reply_to */
  replyToMid?: string | null,
  tag?: string,
): Promise<string> {
  const json = await graphFetch('/me/messages', pageToken, {
    method: 'POST',
    body: {
      recipient: { id: recipientId },
      ...(tag ? { messaging_type: 'MESSAGE_TAG', tag } : { messaging_type: 'RESPONSE' }),
      // sticker_id เป็น field ระดับ message (ไม่ใช่ attachment) ตามตัวอย่างในเอกสาร
      message: { sticker_id: stickerId },
      ...(replyToMid ? { reply_to: { mid: replyToMid } } : {}),
    },
  })
  return (json.message_id as string | undefined) ?? ''
}

/**
 * โพสต์ของเพจย้อนหลัง (user สั่ง 2026-08-04 "จัดเลย ย้อนหลัง")
 *
 * ทำไมต้องมี: แถว FacebookPost ฝั่งเราเกิดขึ้นเฉพาะเมื่อมีคอมเมนต์ webhook วิ่งเข้ามา **หลัง**
 * ร้านเชื่อมเพจ (ensurePost ถูกเรียกจาก ingestFeedComment ที่เดียว) โพสต์ที่คอมเมนต์เข้ามาก่อนนั้น
 * จึงไม่มีในฐานเลย — รายการในแท็บความคิดเห็นจึงน้อยกว่า Business Suite ซึ่งอ่านประวัติจาก Meta ตรง ๆ
 *
 * ใช้ `/{page-id}/posts` (โพสต์ที่เพจเผยแพร่เอง) ไม่ใช่ `/feed` (รวมโพสต์ที่คนอื่นมาโพสต์บนเพจ
 * ซึ่งไม่ใช่ของที่ร้านต้องตอบคอมเมนต์) ขอ summary ของคอมเมนต์มาด้วยเพื่อ "คัดเฉพาะโพสต์ที่มีคอมเมนต์"
 * ก่อนจะไปยิงดึงคอมเมนต์รายโพสต์ — ไม่ต้องเสีย call ให้โพสต์ที่ไม่มีใครคอมเมนต์
 *
 * ต้องมี pages_read_engagement (อ่านโพสต์/ยอด) + pages_read_user_content (อ่านคอมเมนต์ของคนอื่น)
 */
export interface GraphPagePost {
  id: string
  message: string | null
  createdTime: Date | null
  permalink: string | null
  picture: string | null
  mediaType: string | null
  commentCount: number
  reactionCount: number | null
  shareCount: number | null
}

export async function fetchPagePosts(
  pageToken: string,
  pageId: string,
  limit = 25,
): Promise<GraphPagePost[]> {
  const json = await graphFetch(`/${pageId}/posts`, pageToken, {
    query: {
      // summary(true).limit(0) = ขอแค่ยอดรวม ไม่ต้องส่งรายการมาด้วย (payload เล็กลงมาก)
      fields:
        'id,message,created_time,permalink_url,full_picture,status_type,attachments{media_type},comments.summary(true).limit(0),reactions.summary(true).limit(0),shares',
      limit: String(Math.min(Math.max(limit, 1), 100)),
    },
  })
  const rows = Array.isArray(json.data) ? (json.data as Record<string, unknown>[]) : []
  return rows.flatMap((p) => {
    const id = typeof p.id === 'string' ? p.id : null
    if (!id) return []
    const comments = p.comments as { summary?: { total_count?: number } } | undefined
    const reactions = p.reactions as { summary?: { total_count?: number } } | undefined
    const shares = p.shares as { count?: number } | undefined
    const atts = p.attachments as { data?: Array<{ media_type?: string }> } | undefined
    return [
      {
        id,
        message: typeof p.message === 'string' && p.message.length > 0 ? p.message : null,
        createdTime: typeof p.created_time === 'string' ? new Date(p.created_time) : null,
        permalink: typeof p.permalink_url === 'string' ? p.permalink_url : null,
        picture: typeof p.full_picture === 'string' ? p.full_picture : null,
        // media_type ของ attachment ตรงกับที่ fetchPostMeta ใช้ (video/photo/album/…) —
        // ตกไปใช้ status_type ถ้าไม่มี attachment (โพสต์ข้อความล้วน)
        mediaType: atts?.data?.[0]?.media_type ?? (typeof p.status_type === 'string' ? p.status_type : null),
        commentCount: comments?.summary?.total_count ?? 0,
        reactionCount: reactions?.summary?.total_count ?? null,
        shareCount: shares?.count ?? null,
      },
    ]
  })
}

/**
 * sendTemplateMessage — ยิง `message.attachment` ชนิด template ที่ผู้เรียกประกอบมาแล้ว (2026-08-11)
 *
 * ใช้กับ Generic Template (การ์ดสินค้า) — payload มาจากข้างนอกแทนที่จะประกอบในนี้ เพราะรูปร่าง
 * การ์ดเป็นเรื่องของเนื้อหา ไม่ใช่เรื่องของ HTTP
 *
 * (เดิมประโยคนี้อ้างอิงโครงของ `sendImageGridMessage` ซึ่งถูกลบทิ้งแล้ว 2026-08-23 หลัง R-8 —
 * เส้นทางกริดรูปกลายเป็น "หลายแถวคิว" แทนการยิงก้อนเดียว จึงไม่เหลือผู้เรียก)
 *
 * IG ใช้โครงเดียวกันเป๊ะ (เอกสาร Instagram Platform → generic-template) จึงไม่ต้องแยกฟังก์ชัน —
 * ตัวที่ต่างคือ token/endpoint ซึ่ง graphFetch จัดการให้อยู่แล้วเหมือน sendTextMessage
 */
export async function sendTemplateMessage(
  pageToken: string,
  recipientId: string,
  attachment: Record<string, unknown>,
  opts: { tag?: string } = {},
): Promise<string> {
  const json = await graphFetch('/me/messages', pageToken, {
    method: 'POST',
    body: {
      recipient: { id: recipientId },
      ...(opts.tag ? { messaging_type: 'MESSAGE_TAG', tag: opts.tag } : { messaging_type: 'RESPONSE' }),
      message: { attachment },
    },
  })
  return (json.message_id as string | undefined) ?? ''
}

// ══════════════════════════════════════════════════════════════════════════
// Conversation Routing — ขอสิทธิ์คุมเธรดคืนจากเอเจนต์ AI ของ Meta (2026-08-26)
// ══════════════════════════════════════════════════════════════════════════
//
// ที่มา: ปุ่ม "ตอบเอง" ในห้องแชทผู้ขาย **ไม่เคยยิงอะไรออกไปเลย** ตั้งแต่วันแรก (2026-08-08) —
// มันแค่ `setRespondingManually(true)` ปลดล็อกช่องพิมพ์ฝั่งเรา แล้วผู้ขายก็ไปเจอ
// `(#10) another app is controlling this thread` ตอนกดส่ง. ตอนนั้นเลือกทำแบบนั้นเพราะยิง
// `take_thread_control` แล้วได้ `(#27) not supported when Conversation Routing is not enabled`
// จึงสรุปว่า "ทำไม่ได้" — **แต่สรุปเร็วไป**: เอกสาร Conversation Routing ของ Meta เขียนไว้ว่า
// ในโหมด default (ยังไม่ได้ตั้ง Default Application ที่เพจ) มีของ 2 ชิ้นที่ยังใช้ได้อยู่
//
//   "The Take Thread Control API is blocked unless a default application is set."
//   "Request Thread Control API Available: Any application can request thread control,
//    but only the first application to invoke the API will receive control."
//
// ⇒ `request_thread_control` **ไม่เคยถูกทดสอบเลยสักครั้ง** ทั้งที่เอกสารบอกว่าใช้ได้โดยไม่ต้อง
// ตั้งค่าอะไรที่เพจ. ฟังก์ชันนี้จึงลองตามลำดับ take → request แล้วรายงานว่าได้ผลทางไหน
//
// 🛑 สามสถานะนี้ **ไม่ใช่ระดับความสำเร็จของสิ่งเดียวกัน** ห้ามยุบรวม:
//   TAKEN     = Meta ยืนยันว่าเราเป็นเจ้าของเธรดแล้ว ⇒ ส่งข้อความผ่านแน่นอน
//   REQUESTED = เรา "ขอ" ไปแล้ว เจ้าของเดิมจะให้หรือไม่ให้ก็ได้ ⇒ **ยังไม่รู้ว่าส่งจะผ่านไหม**
//               (API ตอบ success:true แปลว่า "คำขอถูกส่ง" ไม่ได้แปลว่า "ได้สิทธิ์แล้ว")
//   FAILED    = ทั้งสองทางปิด ⇒ ทางออกเดียวคือคนไปกดที่ Meta Business Suite ของเพจนั้น
// การเอา REQUESTED ไปแสดงเป็น TAKEN คือการสร้างคำสัญญาแบบเดียวกับบั๊กที่ฟังก์ชันนี้มาแก้
export type ThreadControlOutcome =
  | { outcome: 'TAKEN'; raw: unknown }
  | { outcome: 'REQUESTED'; raw: unknown; takeError: string }
  | { outcome: 'FAILED'; reason: ThreadControlFailureReason; message: string; takeError: string }

/** เหตุผลที่ขอสิทธิ์ไม่สำเร็จ — ผูกกับ *ทางออกที่ต่างกัน* ไม่ใช่แค่ป้ายชื่อ error */
export type ThreadControlFailureReason =
  /** เพจยังไม่ได้ตั้ง Default Application และ request ก็ไม่ผ่าน ⇒ ต้องไปกดที่ Business Suite */
  | 'ROUTING_NOT_ENABLED'
  /** token เพจตาย ⇒ ต้องเชื่อมเพจใหม่ (คนละทางแก้กับข้างบนโดยสิ้นเชิง) */
  | 'TOKEN_INVALID'
  | 'UNKNOWN'

/**
 * 🛑 คัดแยกด้วย **ถ้อยคำ** ไม่ใช่ code เปล่า ๆ — Meta ใช้เลขเดิมซ้ำกับสาเหตุคนละเรื่อง
 * (`#10` เป็นได้ทั้ง "แอปอื่นคุมเธรด" และ "เกินหน้าต่าง 24 ชม." · `#100` เป็นได้หลายอย่าง)
 * บทเรียนเดียวกับ RULES ใน `src/lib/chat-send-failure.ts` ซึ่งเขียนกติกานี้ไว้แล้ว
 */
function classifyThreadControlError(err: GraphApiError): ThreadControlFailureReason {
  if (err.code === 190 || /access token/i.test(err.message)) return 'TOKEN_INVALID'
  if (/conversation routing is not enabled/i.test(err.message)) return 'ROUTING_NOT_ENABLED'
  return 'UNKNOWN'
}

/**
 * ขอสิทธิ์คุมเธรดของลูกค้าหนึ่งราย — ลอง take ก่อน ถ้าไม่ผ่านค่อย request
 *
 * ใช้ `/me/...` ไม่ใช่ `/{page-id}/...` ด้วยเหตุผลเดียวกับ `sendTextMessage` (ดูคอมเมนต์เหนือ
 * ฟังก์ชันนั้น): pageToken resolve เป็นเพจ/IG account ให้เองแล้ว การใส่ id ตรง ๆ ทำให้เส้นทาง IG
 * ต้องเดาว่าจะใช้ Page ID หรือ IG Business Account ID ซึ่งเป็นคนละเลขกัน
 *
 * ไม่ throw — ผู้เรียกคือปุ่มบนหน้าจอ ทุกผลลัพธ์ต้องกลายเป็นคำที่ผู้ขายอ่านรู้เรื่อง ไม่ใช่ 500
 */
export async function claimThreadControl(
  pageToken: string,
  recipientId: string,
  metadata = 'deep-seller-takeover',
): Promise<ThreadControlOutcome> {
  const body = { recipient: { id: recipientId }, metadata }

  try {
    const raw = await graphFetch('/me/take_thread_control', pageToken, { method: 'POST', body })
    return { outcome: 'TAKEN', raw }
  } catch (takeErr) {
    const takeError = takeErr instanceof Error ? takeErr.message : String(takeErr)

    // token ตาย = ทั้งสองทางตายเหมือนกัน ยิงซ้ำไม่มีประโยชน์ และ error ตัวที่สองจะกลบตัวแรก
    // ทำให้ผู้ขายถูกชี้ไปหน้าที่แก้ไม่ตรงปัญหา (ไป Business Suite ทั้งที่ต้องไปเชื่อมเพจใหม่)
    if (takeErr instanceof GraphApiError && classifyThreadControlError(takeErr) === 'TOKEN_INVALID') {
      return { outcome: 'FAILED', reason: 'TOKEN_INVALID', message: takeError, takeError }
    }

    try {
      const raw = await graphFetch('/me/request_thread_control', pageToken, { method: 'POST', body })
      return { outcome: 'REQUESTED', raw, takeError }
    } catch (reqErr) {
      const message = reqErr instanceof Error ? reqErr.message : String(reqErr)
      // จัดประเภทจาก error ของ **take** ไม่ใช่ของ request — ตัวที่บอกว่า "ทำไมเพจนี้ทำไม่ได้"
      // คือ #27 ซึ่งมาจาก take เสมอ ส่วน request ล้มด้วยเหตุผลปลายทางที่คลุมเครือกว่า
      const reason =
        takeErr instanceof GraphApiError
          ? classifyThreadControlError(takeErr)
          : reqErr instanceof GraphApiError
            ? classifyThreadControlError(reqErr)
            : 'UNKNOWN'
      return { outcome: 'FAILED', reason, message, takeError }
    }
  }
}

/**
 * Sender Actions — บอกลูกค้าว่า "ร้านกำลังพิมพ์อยู่" (Messenger + Instagram)
 *
 * เป็น field ระดับคำขอเดียวกับข้อความ (`sender_action`) ไม่ใช่ attachment และ **ห้ามส่ง `message`
 * มาด้วย** — Meta ตีเป็นคำขอคนละชนิด
 *
 * `typing_on` มีอายุของมันเองราว 20 วินาที หรือหายทันทีเมื่อมีข้อความจริงถูกส่ง ⇒ ผู้เรียก
 * **ไม่ต้อง**ยิง `typing_off` ตอนคนหยุดพิมพ์ (ยิงไปก็เปลืองโควตาเปล่า และถ้าจังหวะพลาดจะกลายเป็น
 * จุดกระพริบให้ลูกค้าเห็น) — ปล่อยให้หมดอายุเอง
 *
 * 🛑 ไม่ throw: นี่คือของประดับ ล้มแล้วต้องไม่ทำให้การพิมพ์/ส่งข้อความจริงพลอยพัง
 * (บทเรียนเดียวกับ followerCount/avatar ที่ "ของประกอบต้องไม่ล้มของหลัก")
 */
export async function sendSenderAction(
  pageToken: string,
  recipientId: string,
  action: 'typing_on' | 'typing_off' | 'mark_seen',
): Promise<boolean> {
  try {
    await graphFetch('/me/messages', pageToken, {
      method: 'POST',
      body: { recipient: { id: recipientId }, sender_action: action },
    })
    return true
  } catch (e) {
    // log ไว้ระดับ debug เท่านั้น — เคสที่ล้มบ่อยสุดคือหน้าต่าง 24 ชม. ปิด ซึ่งเป็นเรื่องปกติ
    // ไม่ใช่ความผิดพลาด และไม่มีอะไรให้ผู้ขายทำต่อ
    console.warn('[fb-sender-action] ส่งไม่สำเร็จ', action, e instanceof Error ? e.message : e)
    return false
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Ice Breakers — คำถามยอดฮิตที่ Meta แสดงก่อนเริ่มแชทครั้งแรก (2026-08-27)
// ══════════════════════════════════════════════════════════════════════════

/**
 * 🛑 Messenger กับ Instagram เก็บ **profile คนละก้อน** — แยกด้วย query `?platform=instagram`
 * ตั้งฝั่งหนึ่งไม่มีผลกับอีกฝั่งเลย (เพจ FB กับบัญชี IG ที่ผูกกันก็ยังต้องตั้งสองรอบ)
 * ไม่ส่ง `platform` = Messenger (ค่าตั้งต้นของ Meta)
 */
function profileQuery(provider: string): Record<string, string> {
  return provider === 'INSTAGRAM' ? { platform: 'instagram' } : {}
}

/** 1 รายการที่ลูกค้าเห็นเป็นปุ่ม — `payload` คือสิ่งที่วิ่งกลับมาทาง webhook ตอนถูกแตะ */
export type IceBreakerItem = { question: string; payload: string }

/**
 * ตั้ง Ice Breakers (แทนที่ของเดิมทั้งชุดเสมอ — Meta ไม่มี partial update)
 *
 * 🛑 `locale: 'default'` **บังคับ** ตามเอกสาร ("default locale is REQUIRED") — ขาดแล้ว Meta
 * ปฏิเสธทั้งก้อน เรายังไม่รองรับหลายภาษา จึงส่ง default ชุดเดียว
 *
 * throw เมื่อ Meta ปฏิเสธ — ต่างจาก sendSenderAction ตรงที่อันนี้เป็นการกระทำที่ผู้ขาย **กดเอง
 * และรออยู่หน้าจอ** ⇒ ต้องรู้ว่าล้มเหลวเพราะอะไร ไม่ใช่เงียบแล้วเข้าใจว่าบันทึกแล้ว
 */
export async function setIceBreakers(
  pageToken: string,
  provider: string,
  items: IceBreakerItem[],
): Promise<void> {
  await graphFetch('/me/messenger_profile', pageToken, {
    method: 'POST',
    query: profileQuery(provider),
    body: { ice_breakers: [{ call_to_actions: items, locale: 'default' }] },
  })
}

/**
 * อ่าน Ice Breakers **ที่ Meta ถืออยู่จริง** ณ ตอนนี้
 *
 * 🛑 มีไว้เพื่อตอบคำถามเดียว: *"เพจนี้มีคำถามตั้งอยู่ก่อนแล้วหรือเปล่า และเป็นของใคร"*
 * ฐานเราตอบแทนไม่ได้ — ร้านตั้ง "คำถามที่พบบ่อย" เองใน Business Suite / แอป IG ได้ตลอดเวลา
 * โดยที่เราไม่รู้ ⇒ อ่านจาก `ChannelIceBreaker` อย่างเดียวแล้วบอกผู้ขายว่า "ยังไม่ได้ตั้ง"
 * คือการโกหกที่พาไปสู่การกดทับของตัวเองโดยไม่มีอะไรเตือน
 *
 * 🛑 **ต้องรับคืนได้ 2 รูปแบบ** — เอกสาร Meta เขียนเองว่า GET คืนโครงตามที่ *ของเดิมถูกตั้งมา*:
 *   รูปแบบใหม่ → `data[].call_to_actions[]` (+ `locale`)
 *   รูปแบบเก่า → `data[].ice_breakers[]`
 * รับแบบเดียวแล้วอีกแบบจะถูกอ่านเป็น "ไม่มีอะไรเลย" ซึ่งคือรูปร่างของบั๊กที่ฟังก์ชันนี้มีไว้กัน
 *
 * 🛑 **คืน `null` เมื่ออ่านไม่ได้ ไม่ใช่ `[]`** — "ถามไม่สำเร็จ" กับ "ถามแล้วไม่มี" ต่างกันคนละเรื่อง
 * ตีเป็น `[]` = หน้าจอจะบอกว่าไม่มีของเดิม แล้วผู้ขายกดทับทันที (เคสนี้อันตรายกว่าไม่แสดงอะไรเลย)
 */
export async function getIceBreakers(
  pageToken: string,
  provider: string,
): Promise<IceBreakerItem[] | null> {
  try {
    const res = await graphFetch('/me/messenger_profile', pageToken, {
      query: { ...profileQuery(provider), fields: 'ice_breakers' },
    })
    return parseIceBreakersResponse(res)
  } catch {
    // ล้มเหลว = ไม่รู้ ห้ามเดาว่าว่าง
    return null
  }
}

/**
 * แปลง payload ของ `GET messenger_profile?fields=ice_breakers` เป็นรายการที่ใช้ได้
 *
 * แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพราะนี่คือส่วนที่ผิดง่ายที่สุดและผิดแบบเงียบที่สุด —
 * อ่านผิด = ได้ `[]` ซึ่งหน้าจอแปลว่า "ไม่มีของเดิม" แล้วผู้ขายกดทับทันที
 * (`docs/conventions/ui-boolean-needs-a-testable-home.md`)
 */
export function parseIceBreakersResponse(res: unknown): IceBreakerItem[] {
  const rows = Array.isArray((res as { data?: unknown } | null)?.data)
    ? ((res as { data: unknown[] }).data)
    : []
  const out: IceBreakerItem[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as { call_to_actions?: unknown; ice_breakers?: unknown; locale?: unknown }
    // ข้าม locale อื่น — เราตั้งเฉพาะ `default` และหน้าจอเทียบกับชุดนั้นเท่านั้น
    // (ไม่มี `locale` = รูปแบบเก่าซึ่งไม่มีแนวคิด locale เลย ⇒ นับเป็น default)
    if (typeof r.locale === 'string' && r.locale !== 'default') continue
    const list = Array.isArray(r.call_to_actions)
      ? r.call_to_actions
      : Array.isArray(r.ice_breakers)
        ? r.ice_breakers
        : []
    for (const it of list as unknown[]) {
      if (!it || typeof it !== 'object') continue
      const q = (it as { question?: unknown }).question
      const p = (it as { payload?: unknown }).payload
      // `question` คือสิ่งเดียวที่ลูกค้าเห็น — ไม่มีคำถาม = แถวนี้ไม่มีความหมายให้แสดง
      // ส่วน `payload` ขาดได้ (ของที่ร้านตั้งเองจาก Business Suite ไม่มี payload ของเรา)
      if (typeof q !== 'string' || q.trim() === '') continue
      out.push({ question: q, payload: typeof p === 'string' ? p : '' })
    }
  }
  return out
}

/** ลบทั้งชุด — Meta มี endpoint แยก (ส่ง `ice_breakers` ว่างไม่ได้แปลว่าลบ) */
export async function deleteIceBreakers(pageToken: string, provider: string): Promise<void> {
  await graphFetch('/me/messenger_profile', pageToken, {
    method: 'DELETE',
    query: profileQuery(provider),
    body: { fields: ['ice_breakers'] },
  })
}
