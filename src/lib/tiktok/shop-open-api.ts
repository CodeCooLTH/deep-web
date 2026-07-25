// HTTP client ของ TikTok Shop Open API — feature 00020 Phase 3
//
// ที่มาของสูตร signing: **เอกสารทางการ** "Sign your API request"
// partner.tiktokshop.com/docv2/page/sign-your-api-request (ยืนยันกับ code sample Go/Java ของ
// TikTok เอง) + "Common parameters" /docv2/page/678e3a4278f4c20311b8b57e
// หมายเหตุ: หน้าพวกนี้เป็น JS-rendered ดึงด้วย HTTP client ธรรมดาไม่ได้ — ต้องอ่านผ่าน browser
//
// สำคัญ: signing ผิดนิดเดียว = 401 ทุก request — ห้ามแก้ลำดับการต่อ string ในไฟล์นี้โดยไม่รัน
// เทสใน __tests__/signing.test.ts ซึ่งล็อกพฤติกรรมด้วย fixed vector ไว้
//
// ต่างจาก sample ทางการเล็กน้อยแต่ผลเท่ากัน: sample เช็คแค่ content-type (ไม่เช็ค method) ก่อนต่อ
// body — ที่นี่เช็ค method ด้วยเพื่อความชัดเจน ซึ่งไม่เปลี่ยนผลเพราะ GET ไม่มี body อยู่แล้ว

import crypto from 'node:crypto'

export const TIKTOK_SHOP_API_HOST = 'https://open-api.tiktokglobalshop.com'

/** param ที่ห้ามนำไปคำนวณลายเซ็น (ตรงตาม SDK: sign, access_token, x-tts-access-token) */
const SIGN_EXCLUDED_PARAMS = new Set(['sign', 'access_token', 'x-tts-access-token'])

export class TikTokShopApiError extends Error {
  constructor(
    message: string,
    /** `code` ใน envelope ของ TikTok (0 = สำเร็จ) — null เมื่อ error เกิดก่อนได้ envelope */
    public readonly code: number | null,
    /** request_id — ใส่ใน log ได้ (ไม่ใช่ข้อมูลอ่อนไหว) ช่วยเวลาต้องแจ้ง TikTok */
    public readonly requestId: string | null,
    public readonly httpStatus: number,
  ) {
    super(message)
    this.name = 'TikTokShopApiError'
  }
}

/**
 * คำนวณค่า `sign` — pure function ไม่แตะ network/env เพื่อให้เทสได้ตรง ๆ
 *
 * สูตร (แปลจาก SDK, ลำดับสำคัญมาก):
 *   1. ตัด param `sign` / `access_token` / `x-tts-access-token` ออก
 *   2. เรียง key ตามลำดับตัวอักษร แล้วต่อเป็น `{key}{value}` ติดกัน (ข้ามค่าที่เป็น array)
 *   3. เอา **request path** ไปต่อไว้ "หน้า" ผลของข้อ 2
 *   4. ถ้า method ไม่ใช่ GET และ content-type ไม่ใช่ multipart/form-data → ต่อ **body** ไว้ท้าย
 *   5. ประกบหน้า-หลังด้วย app_secret แล้ว HMAC-SHA256 โดยใช้ app_secret เป็น key → hex
 */
export function buildSignature(params: {
  /** path เท่านั้น ไม่รวม host และไม่รวม query string เช่น `/customer_service/202309/conversations` */
  path: string
  /** query param ทั้งหมดที่จะส่งไปจริง (ก่อนเติม `sign`) */
  query: Record<string, string | number | undefined | (string | number)[]>
  method: string
  /** raw body ที่จะส่งจริง — ต้องเป็น string เดียวกับที่ยิงออกเป๊ะ (JSON.stringify ครั้งเดียวแล้วใช้ซ้ำ) */
  body?: string
  contentType?: string
  appSecret: string
}): string {
  const { path, query, method, body, contentType, appSecret } = params

  const keys = Object.keys(query)
    .filter((k) => !SIGN_EXCLUDED_PARAMS.has(k))
    // ค่า undefined ไม่ได้ถูกส่งออกไปจริง จึงต้องไม่เข้าลายเซ็นด้วย
    .filter((k) => query[k] !== undefined)
    // ค่าที่เป็น array ถูกข้ามตาม SDK (`!is_array($v)`) — ไม่ใช่ join
    .filter((k) => !Array.isArray(query[k]))
    .sort()

  let stringToBeSigned = ''
  for (const k of keys) stringToBeSigned += `${k}${query[k]}`

  stringToBeSigned = path + stringToBeSigned

  const isMultipart = (contentType ?? '').includes('multipart/form-data')
  if (method.toUpperCase() !== 'GET' && !isMultipart && body) {
    stringToBeSigned += body
  }

  stringToBeSigned = appSecret + stringToBeSigned + appSecret

  return crypto.createHmac('sha256', appSecret).update(stringToBeSigned, 'utf8').digest('hex')
}

function requireEnv(key: 'TIKTOK_SHOP_APP_KEY' | 'TIKTOK_SHOP_APP_SECRET'): string {
  const value = process.env[key]
  // fail-closed — ยิง request ด้วย app_key ว่างจะได้ 401 ที่ debug ยากกว่า error ตรงนี้
  if (!value) throw new Error(`Missing env: ${key}`)
  return value
}

/**
 * เรียก TikTok Shop Open API พร้อม sign ให้อัตโนมัติ
 *
 * `accessToken` ส่งเป็น header `x-tts-access-token` (ไม่เข้าลายเซ็น) — ห้าม log ค่านี้
 * `shopCipher` ต้องส่งทุก endpoint ที่ทำงานในบริบทของร้าน **ยกเว้น** `/authorization/*` ที่ใช้
 * ตอนยังไม่รู้ cipher (ดู API.md §4.2 ขั้นที่ 3)
 */
export async function tiktokShopFetch<T = unknown>(opts: {
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  accessToken: string
  shopCipher?: string
  query?: Record<string, string | number | undefined>
  body?: unknown
  timeoutMs?: number
}): Promise<T> {
  const { path, method = 'GET', accessToken, shopCipher, query = {}, body, timeoutMs = 15_000 } = opts

  const appKey = requireEnv('TIKTOK_SHOP_APP_KEY')
  const appSecret = requireEnv('TIKTOK_SHOP_APP_SECRET')

  // stringify ครั้งเดียวแล้วใช้ทั้งลายเซ็นและ body จริง — ถ้า stringify สองครั้งแล้วลำดับ key
  // ต่างกันแม้แต่นิด ลายเซ็นจะไม่ตรงกับ body ที่ส่งไป
  const rawBody = body === undefined ? undefined : JSON.stringify(body)
  const contentType = rawBody === undefined ? undefined : 'application/json'

  const signedQuery: Record<string, string | number | undefined> = {
    ...query,
    app_key: appKey,
    // 10 หลัก หน่วยวินาที (ห้ามเป็น millisecond) — TikTok รับช่วง [now-5นาที, now+30วินาที]
    // นอกช่วงนี้ได้ error 36009004 Invalid timestamp → ถ้าเจอ error นี้บน prod ให้สงสัยนาฬิกา
    // ของ instance เพี้ยนก่อนสงสัยสูตรลายเซ็น (เอกสาร "Common parameters")
    timestamp: Math.floor(Date.now() / 1000),
    ...(shopCipher ? { shop_cipher: shopCipher } : {}),
  }

  const sign = buildSignature({ path, query: signedQuery, method, body: rawBody, contentType, appSecret })

  const url = new URL(TIKTOK_SHOP_API_HOST + path)
  for (const [k, v] of Object.entries(signedQuery)) {
    if (v !== undefined) url.searchParams.set(k, String(v))
  }
  url.searchParams.set('sign', sign)

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        'x-tts-access-token': accessToken,
        ...(contentType ? { 'content-type': contentType } : {}),
      },
      body: rawBody,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    // network/timeout — ไม่มี envelope ให้แกะ
    throw new TikTokShopApiError(
      e instanceof Error ? e.message : 'เรียก TikTok Shop API ไม่สำเร็จ',
      null,
      null,
      0,
    )
  }

  // envelope มาตรฐานของ TikTok Shop: { code, message, request_id, data }
  // (ยืนยันจากเอกสาร Send Message — ตัวอย่าง response `{"code":0,"data":{...},"message":"Success",
  // "request_id":"..."}`) ประกาศเป็น type แยกไม่ใช้ `typeof json` ใน cast เพราะ ณ จุดนั้น TS
  // narrow ตัวแปรเป็น `null` ไปแล้ว → cast กลายเป็น `as null` แล้วโค้ดหลัง guard เป็น `never`
  type Envelope = { code?: number; message?: string; data?: T; request_id?: string }
  const text = await res.text()
  let json: Envelope | null = null
  try {
    json = JSON.parse(text) as Envelope
  } catch {
    json = null
  }

  // หมายเหตุ: รูป envelope ({code, message, data, request_id}) ยังไม่ยืนยันจากเอกสารทางการ — verify
  // ตอนเรียกจริงครั้งแรก. เขียนให้ทนทั้งกรณีมี envelope และไม่มี (ไม่พึ่งโครงประโยคของ message)
  if (!json) {
    throw new TikTokShopApiError(
      `TikTok Shop API ตอบรูปแบบที่อ่านไม่ได้ (HTTP ${res.status})`,
      null,
      null,
      res.status,
    )
  }

  const code = typeof json.code === 'number' ? json.code : null
  const requestId = typeof json.request_id === 'string' ? json.request_id : null

  if (!res.ok || (code !== null && code !== 0)) {
    throw new TikTokShopApiError(
      json.message || `TikTok Shop API error (HTTP ${res.status}, code ${code ?? 'unknown'})`,
      code,
      requestId,
      res.status,
    )
  }

  return json.data as T
}
