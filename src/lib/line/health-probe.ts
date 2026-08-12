// (00025 ส่วนขยาย 2026-08-12) — 3 การตรวจที่บอกว่า "สายที่เชื่อมไว้ยังใช้ได้อยู่ไหม"
//
// ยืนยันด้วยการยิงจริงกับ OA ทดสอบ 2026-08-12 (ไม่ได้อ่านจากความจำ — ค่าที่ได้กลับมาจริง):
//   POST /v2/oauth/verify                  → {"client_id":"2011036363","expires_in":2339235,"scope":"P"}
//   GET  /v2/bot/channel/webhook/endpoint  → {"endpoint":"https://…/api/channels/line/webhook","active":false}
//   POST /v2/bot/channel/webhook/test      → {"success":true,"statusCode":200,"reason":"OK","detail":"200"}
//
// 🛑 `webhook/test` **เชื่อไม่ได้ว่าเป็นสัญญาณว่าเราประมวลผลได้** — มันรายงาน HTTP status ที่ server
// เราตอบ ซึ่งเป็น 200 เสมอตามสเปกของเราเอง (BR-LINE-05/06) รวมตอนลายเซ็นไม่ผ่านและตอนหา
// destination ไม่เจอ ⇒ ผู้เรียกต้องอ่านตัวนับความล้มเหลวของเราเองเป็นจังหวะที่สอง (AC-CH-17/18)

import { API_BASE, HEALTH_CHECK_TIMEOUT_MS } from './constants'
import { lineApiRequest, LineApiError } from './client'
import { webhookMatchesOrigin, type LineWebhookProbe } from './channel-health'

export interface LineTokenProbe {
  /** ใช้งานได้อยู่ไหม ณ ตอนนี้ */
  valid: boolean
  /**
   * วันหมดอายุ — `null` แปลว่า **ไม่หมดอายุ (long-lived)** หรือ **อ่านไม่ได้**
   * ทั้งสองกรณีต้องไม่เตือน (ผู้เรียกแยกได้จากค่า `valid`)
   */
  expiresAt: Date | null
}

/**
 * ตรวจ channel access token — `POST /v2/oauth/verify`
 *
 * 🛑 endpoint นี้ **ไม่ใช้ Bearer** แต่รับ `access_token` เป็น form field จึงผ่าน `lineApiRequest`
 * (ซึ่งใส่ Authorization header ให้เสมอ) ไม่ได้ ต้องยิงเองตรงนี้
 *
 * ชนิด token ตามเอกสาร LINE: long-lived (ไม่หมดอายุ) · short-lived v2.1 (30 วัน) · stateless (15 นาที)
 * — ตัวที่มี `expires_in` คือสองชนิดหลัง
 */
export async function probeLineToken(channelAccessToken: string): Promise<LineTokenProbe> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/v2/oauth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: channelAccessToken }).toString(),
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    })
  } catch {
    // เครือข่ายล้ม/หมดเวลา = **ไม่รู้** ไม่ใช่ "token เสีย" — คืน valid:true เพื่อไม่ให้ผู้เรียก
    // ไปพลิกสถานะร้านเป็น TOKEN_INVALID เพราะเน็ตเราเองมีปัญหา (fail-open โดยตั้งใจ ตรงกับ TD-006)
    return { valid: true, expiresAt: null }
  }

  if (!res.ok) {
    // 400/401 จาก endpoint นี้ = token ใช้ไม่ได้จริง (LINE ตอบชัดเจน ไม่ใช่การเดา)
    return { valid: false, expiresAt: null }
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : null
  // ไม่มี `expires_in` = long-lived → ไม่มีวันหมดอายุให้เก็บ
  // ≤0 = หมดอายุไปแล้ว แต่ยังคงบันทึกวันที่ไว้ให้หน้าจอบอกได้ว่าหมดตั้งแต่เมื่อไหร่
  return {
    valid: true,
    expiresAt: expiresIn === null ? null : new Date(Date.now() + expiresIn * 1000),
  }
}

/**
 * ตรวจว่า webhook ที่ร้านตั้งในคอนโซล LINE ชี้มาที่เราและเปิดสวิตช์แล้วหรือยัง
 * `GET /v2/bot/channel/webhook/endpoint` → `{ endpoint, active }`
 *
 * @param expectedUrl URL ที่เราแสดงให้ร้านคัดลอกไปวาง — **ต้องเป็นตัวแปรเดียวกัน** ไม่ใช่ hardcode
 *                    โดเมน prod (D-CH-6 / HR16)
 * @returns `null` เมื่ออ่านไม่ได้ (เน็ตล้ม/สิทธิ์ไม่พอ) = **ยังไม่เคยตรวจ** ไม่ใช่ "ตรวจแล้วไม่ผ่าน"
 */
export async function probeLineWebhook(
  channelAccessToken: string,
  expectedUrl: string,
): Promise<LineWebhookProbe | null> {
  try {
    const json = await lineApiRequest('/v2/bot/channel/webhook/endpoint', channelAccessToken, {
      timeoutMs: HEALTH_CHECK_TIMEOUT_MS,
    })
    const endpoint = typeof json.endpoint === 'string' && json.endpoint ? json.endpoint : null
    return {
      endpoint,
      active: json.active === true,
      matchesUs: webhookMatchesOrigin(endpoint, expectedUrl),
    }
  } catch (e) {
    if (e instanceof LineApiError && e.status === 404) {
      // LINE ตอบ 404 เมื่อยังไม่เคยตั้ง webhook เลย — นี่คือ "ตรวจแล้วและยังไม่ได้ตั้ง"
      // ต่างจากอ่านไม่ได้ จึงต้องคืน probe จริงไม่ใช่ null
      return { endpoint: null, active: false, matchesUs: false }
    }
    return null
  }
}

export interface LineWebhookTestResult {
  /** ค่าที่ LINE รายงาน — 🛑 **ไม่ใช่หลักฐานว่าเราประมวลผล event ได้** */
  reportedSuccess: boolean
  statusCode: number | null
  reason: string | null
}

/**
 * สั่งให้ LINE ยิง test event เข้ามาที่ webhook ของเรา — `POST /v2/bot/channel/webhook/test`
 *
 * 🛑 ผลลัพธ์ของฟังก์ชันนี้ **ห้ามนำไปแสดงเป็นไฟเขียวโดยลำพัง** — ดูหัวไฟล์
 */
export async function testLineWebhook(channelAccessToken: string): Promise<LineWebhookTestResult | null> {
  try {
    const json = await lineApiRequest('/v2/bot/channel/webhook/test', channelAccessToken, {
      method: 'POST',
      body: {},
      timeoutMs: HEALTH_CHECK_TIMEOUT_MS,
    })
    return {
      reportedSuccess: json.success === true,
      statusCode: typeof json.statusCode === 'number' ? json.statusCode : null,
      reason: typeof json.reason === 'string' ? json.reason : null,
    }
  } catch {
    return null
  }
}
