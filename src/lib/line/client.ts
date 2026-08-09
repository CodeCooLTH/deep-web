import { API_BASE, DATA_API_BASE } from './constants'

// fetch wrapper บาง ๆ สำหรับเรียก LINE Messaging API (feature 00025, S-3)
// pattern เดียวกับ facebook/graph.ts (graphFetch): ใส่ token ผ่าน header Authorization เสมอ
// ไม่ใส่ใน query string เพราะ URL มักถูก log ทั้งเส้น (Vercel log, error tracker) → token หลุดง่าย
//
// 🛑 ห้าม log token/secret ในทุกกรณี รวมถึงตอน error — err ที่ throw ออกไปเก็บแค่ name/message ของ
// network error เอง (ไม่มี header/body ของ request ปนอยู่) ส่วน raw ของ LineApiError คือ response
// body ที่ LINE ตอบกลับมาเท่านั้น (LINE ไม่ echo token กลับมาใน error body อยู่แล้ว)

/** การจำแนก error เชิง "transport" เท่านั้น — ไม่ใช่ error code ทางธุรกิจของ API.md §5
 *  (TOKEN_INVALID/CONTACT_BLOCKED/QUOTA_EXCEEDED ฯลฯ เป็นงานของ S-8 ที่อ่าน `raw` ของ error เอง
 *  ต่อ เพราะต้องรู้บริบทว่ากำลังเรียก endpoint ไหนถึงจะแปล error body ของ LINE ได้ถูกความหมาย) */
export type LineErrorKind = 'TOKEN_INVALID' | 'LINE_UNAVAILABLE' | 'UNKNOWN'

function classifyStatus(status: number): LineErrorKind {
  // 401/403 = token ใช้ไม่ได้ (หมดอายุ/revoke/ผิด) — API.md §5 TOKEN_INVALID
  if (status === 401 || status === 403) return 'TOKEN_INVALID'
  // 429 (rate limit) / 5xx (LINE พัง) / 0 (network error หรือ timeout — ไม่มี response เลย)
  // ทั้งหมดนี้คือ "LINE ไม่พร้อมตอบตอนนี้" — API.md §5 LINE_UNAVAILABLE (502)
  if (status === 429 || status >= 500 || status === 0) return 'LINE_UNAVAILABLE'
  return 'UNKNOWN'
}

/** error จาก LINE Messaging API — ทำนองเดียวกับ GraphApiError ของ facebook/graph.ts */
export class LineApiError extends Error {
  readonly kind: LineErrorKind

  constructor(
    message: string,
    /** HTTP status ที่ LINE ตอบ — 0 เมื่อเป็น network error/timeout (ไม่มี response เข้ามาเลย) */
    readonly status: number,
    /** error body ดิบที่ LINE ตอบกลับมา (ไม่มี token ปนอยู่ — เป็น response body ล้วน ๆ) */
    readonly raw?: unknown,
  ) {
    super(message)
    this.name = 'LineApiError'
    this.kind = classifyStatus(status)
  }
}

export interface LineRequestInit {
  method?: string
  body?: unknown
  query?: Record<string, string>
  /** header `X-Line-Retry-Key` — ใช้ตอนกดส่งซ้ำ (push) เพื่อไม่ให้ลูกค้าได้ข้อความซ้ำและไม่ถูกหัก
   *  โควตาซ้ำสอง (SDS §4 "หลักการชดเชยที่ยึด") caller (S-8) เป็นคนตัดสินใจสร้าง/นำคีย์เดิมมาใช้ซ้ำ —
   *  client.ts แค่ส่งต่อ ไม่สร้างคีย์เอง */
  retryKey?: string
  /** timeout ของคำขอนี้ (ms) — default 10_000 */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000

function isTimeoutOrAbort(err: unknown): boolean {
  // AbortSignal.timeout() ยิง DOMException name='TimeoutError' (Node ≥18); เผื่อ runtime อื่นที่ยัง
  // ยิง 'AbortError' แบบเก่าไว้ด้วย — ทั้งคู่แปลว่า "หมดเวลา" ไม่ใช่ error จาก response ของ LINE
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
}

/** ยิง request ไปยัง base ที่ระบุ (API_BASE หรือ DATA_API_BASE) — ใช้ภายในไฟล์นี้เท่านั้น
 *  คืน Response ดิบเสมอ (ไม่แตะ body) ให้ผู้เรียกระดับบนตัดสินใจว่าจะ .json()/.blob()/เช็ค res.ok เอง —
 *  โยน LineApiError เฉพาะตอนที่ fetch เองล้มเหลว (timeout/network) เพราะกรณีนั้นไม่มี Response ให้คืน */
async function rawFetch(base: string, path: string, token: string, init: LineRequestInit): Promise<Response> {
  const qs = new URLSearchParams(init.query ?? {}).toString()
  const url = `${base}${path}${qs ? `?${qs}` : ''}`

  try {
    return await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.retryKey ? { 'X-Line-Retry-Key': init.retryKey } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(init.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })
  } catch (err) {
    throw new LineApiError(
      isTimeoutOrAbort(err) ? 'LINE API หมดเวลาเชื่อมต่อ' : 'เชื่อมต่อ LINE API ไม่สำเร็จ',
      0,
      // เก็บแค่ name/message ของ error เดิม (ไม่มี token/URL เต็มปน — url ที่นี่ก็ไม่มี token เพราะ
      // token ไปทาง header ไม่ใช่ query อยู่แล้ว แต่กันไว้อีกชั้นไม่ยัด error object เต็มลง raw)
      err instanceof Error ? { name: err.name, message: err.message } : undefined,
    )
  }
}

/**
 * ยิง request ไปยัง LINE Messaging API หลัก (API_BASE) แล้ว parse เป็น JSON
 * ไม่ 2xx → โยน LineApiError (message จาก LINE ถ้ามี, ไม่งั้น fallback เป็นข้อความทั่วไป)
 */
export async function lineApiRequest(
  path: string,
  token: string,
  init: LineRequestInit = {},
): Promise<Record<string, unknown>> {
  const res = await rawFetch(API_BASE, path, token, init)
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const message = typeof json.message === 'string' ? json.message : `LINE API error (HTTP ${res.status})`
    throw new LineApiError(message, res.status, json)
  }
  return json
}

/**
 * ยิง request ไปยัง LINE Data API (DATA_API_BASE) — ใช้ดึงเนื้อหาสื่อ (รูป/วิดีโอ/เสียง/ไฟล์)
 * ซึ่งตอบกลับเป็น binary ไม่ใช่ JSON — คืน `Response` ดิบเสมอ (ทั้งกรณี ok และไม่ ok) ให้ผู้เรียก
 * (S-7 media mirror) ตัดสินใจเองว่าจะอ่านเป็น blob/stream และจะจัดการกรณีล้มเหลวยังไง (เช่น เขียน
 * ข้อความ placeholder แทนการโยน error ทิ้งเงียบ ๆ — ดู scope baseline S-7)
 *
 * ยังคงโยน LineApiError เฉพาะตอนที่ fetch เองล้มเหลว (timeout/network) เพราะกรณีนั้นไม่มี Response
 * ให้คืนจริง ๆ
 */
export async function lineDataApiRequest(
  path: string,
  token: string,
  init: LineRequestInit = {},
): Promise<Response> {
  return rawFetch(DATA_API_BASE, path, token, init)
}
