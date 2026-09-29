// 00066 — ตัวเรียก API ฝั่ง client ที่การ์ด/ฟอร์มใช้ร่วมกัน (ที่เดียว ไม่ให้แต่ละที่ parse error คนละแบบ)
import type { FollowUpDto } from '@/services/customer-follow-up.service'

export type ApiResult = { ok: true; item: FollowUpDto | null } | { ok: false; status: number; code?: string }

export async function callFollowUpApi(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<ApiResult> {
  try {
    const res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = (await res.json().catch(() => null)) as { item?: FollowUpDto; code?: string } | null
    // DELETE ซ้ำจาก 2 แท็บ (E18): 404 = ของหายไปแล้ว = ผลที่ผู้ใช้ต้องการ ถือว่าสำเร็จ
    if (method === 'DELETE' && res.status === 404) return { ok: true, item: null }
    if (!res.ok) return { ok: false, status: res.status, code: json?.code }
    return { ok: true, item: json?.item ?? null }
  } catch {
    return { ok: false, status: 0 }
  }
}
