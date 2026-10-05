/**
 * line-client.ts — ตัวห่อ LINE Messaging API สำหรับรายงานกลุ่ม (SDS §3.1 · LINE-API-Facts §2–§4)
 *
 * ใช้ token ของ OA กลางจาก `getReportBotConfig()` เท่านั้น · token ไปทาง header ของ `lineApiRequest`
 * ไม่เคยถูกใส่ใน log/error/return (ไฟล์นี้ไม่มี console เลย)
 */
import { lineApiRequest, LineApiError, type LineErrorKind } from '@/lib/line/client'
import { getReportBotConfig } from './config'
import { LineReportError } from './errors'
import { httpReason, type DeliveryReason } from './delivery-reasons'

/** ผลของ push/reply — ไม่ throw เมื่อ LINE ปฏิเสธ เพื่อให้ผู้เรียกจัดตาม state machine (TFR-18) */
export type SendResult =
  | { ok: true; /** true = 409 (retry key ซ้ำ ⇒ LINE ส่งไปแล้ว นับเป็น SENT) */ duplicate: boolean }
  | { ok: false; status: number; kind: LineErrorKind; reason: DeliveryReason }

function token(): string {
  const cfg = getReportBotConfig()
  if (!cfg) throw new LineReportError('BOT_NOT_CONFIGURED')
  return cfg.accessToken
}

/** ผู้เรียกเช็คก่อนเริ่มงาน — env ไม่ครบ = throw BOT_NOT_CONFIGURED */
export function assertReady(): void {
  token()
}

function toFailure(err: unknown): SendResult {
  if (!(err instanceof LineApiError)) throw err
  const raw = err.raw as { name?: string } | undefined
  const reason: DeliveryReason =
    err.kind === 'TOKEN_INVALID'
      ? 'TOKEN_INVALID'
      : err.status === 0
        ? raw?.name === 'TimeoutError' || raw?.name === 'AbortError'
          ? 'TIMEOUT'
          : 'NETWORK'
        : httpReason(err.status)
  return { ok: false, status: err.status, kind: err.kind, reason }
}

/**
 * push เข้ากลุ่ม · `messages` เป็น array หรือ string `raw` (= JSON.stringify(messages) ที่เก็บใน pendingPayload)
 * retry ต้องส่งไบต์เดิม: `lineApiRequest` stringify body เอง ⇒ ส่ง `JSON.parse(raw)` แล้ว round-trip ได้ไบต์เดิม
 */
export async function pushToGroup(groupId: string, messages: unknown[] | string, retryKey: string): Promise<SendResult> {
  const t = token()
  const parsed = typeof messages === 'string' ? (JSON.parse(messages) as unknown[]) : messages
  try {
    await lineApiRequest('/v2/bot/message/push', t, { method: 'POST', body: { to: groupId, messages: parsed }, retryKey })
    return { ok: true, duplicate: false }
  } catch (err) {
    const r = toFailure(err)
    // 409 = retry key ซ้ำ ⇒ LINE รับไปแล้ว (LINE-API-Facts §3) ถือว่าส่งสำเร็จ
    return !r.ok && r.status === 409 ? { ok: true, duplicate: true } : r
  }
}

/** reply ไม่มี retry key (ใช้กับ reply ไม่ได้ — 400) */
export async function replyTo(replyToken: string, messages: unknown[]): Promise<SendResult> {
  const t = token()
  try {
    await lineApiRequest('/v2/bot/message/reply', t, { method: 'POST', body: { replyToken, messages } })
    return { ok: true, duplicate: false }
  } catch (err) {
    return toFailure(err)
  }
}

/** 404 = บอทไม่อยู่ในกลุ่ม → null · error อื่น throw LineApiError ต่อ */
async function getOr404(path: string): Promise<Record<string, unknown> | null> {
  try {
    return await lineApiRequest(path, token())
  } catch (err) {
    if (err instanceof LineApiError && err.status === 404) return null
    throw err
  }
}

export async function fetchGroupSummary(groupId: string): Promise<{ groupName: string } | null> {
  const r = await getOr404(`/v2/bot/group/${encodeURIComponent(groupId)}/summary`)
  return r ? { groupName: typeof r.groupName === 'string' ? r.groupName : '' } : null
}

export async function fetchMemberCount(groupId: string): Promise<number | null> {
  const r = await getOr404(`/v2/bot/group/${encodeURIComponent(groupId)}/members/count`)
  return r && typeof r.count === 'number' ? r.count : null
}

/** true = ออกแล้ว · false = บอทไม่อยู่ในกลุ่มอยู่แล้ว (404) */
export async function leaveGroup(groupId: string): Promise<boolean> {
  try {
    await lineApiRequest(`/v2/bot/group/${encodeURIComponent(groupId)}/leave`, token(), { method: 'POST' })
    return true
  } catch (err) {
    if (err instanceof LineApiError && err.status === 404) return false
    throw err
  }
}
