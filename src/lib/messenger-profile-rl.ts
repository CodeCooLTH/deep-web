/**
 * ตัวกันโควตา Messenger Profile API (Ice Breakers ฯลฯ) — 2026-08-27
 *
 * 🛑 Meta จำกัด **10 ครั้ง / 10 นาที ต่อเพจ** ("Calls to the Messenger Profile API are limited
 * to 10 API calls per 10 minute interval. This rate limit is enforced per Page.")
 * และเรานับรวมทั้งอ่านและเขียน เพราะ Meta ไม่ได้แยกให้
 *
 * ทำไมต้องกันเอง ทั้งที่ Meta ก็ปฏิเสธให้อยู่แล้ว: error ของ Meta ตอนชนโควตาอ่านไม่รู้เรื่อง
 * และมาถึงผู้ขาย **หลังจาก**เขากดบันทึกไปแล้ว — ซึ่งเป็นจังหวะที่เขาคิดว่างานเสร็จ
 * กันเองได้ = บอกล่วงหน้าเป็นภาษาคนว่าต้องรอ ไม่ใช่เดาว่าระบบพัง
 *
 * 🛑 **เพดานเราตั้งไว้ 8 ไม่ใช่ 10** — เผื่อคำขอที่เกิดนอกเส้นทางนี้ (คนอื่นในร้านกดพร้อมกัน ·
 * instance อื่นบน Vercel ที่นับแยกกัน) ถ้าตั้งเท่า Meta เป๊ะ เราจะปล่อยให้ชนของจริงพอดี
 *
 * ⚠️ per-instance เหมือน rate limiter ตัวอื่นของโปรเจกต์ (Vercel serverless แยก process)
 * ⇒ กันได้แค่ "คนเดิมกดรัว" ซึ่งเป็นเคสที่พบจริง ไม่ได้กันระดับระบบ — Redis คือ Phase 2
 */
const g = globalThis as unknown as { messengerProfileCalls?: Map<string, number[]> }
const calls = g.messengerProfileCalls ?? (g.messengerProfileCalls = new Map<string, number[]>())

export const PROFILE_RL_MAX = 8
export const PROFILE_RL_WINDOW_MS = 10 * 60 * 1000

export type ProfileRlResult = { ok: true } | { ok: false; retryAfterSec: number }

/**
 * จองสิทธิ์ยิง 1 ครั้งสำหรับช่องทางนี้
 *
 * 🛑 **จองก่อนยิงเสมอ ไม่ใช่หลังยิงสำเร็จ** — คำขอที่ล้มก็กินโควตาของ Meta ไปแล้ว
 * นับเฉพาะที่สำเร็จ = ผู้ขายที่กดซ้ำเพราะ error จะทะลุเพดานจริงโดยที่ตัวนับเรายังว่าง
 */
export function takeMessengerProfileSlot(shopChannelId: string, now = Date.now()): ProfileRlResult {
  const cutoff = now - PROFILE_RL_WINDOW_MS
  const recent = (calls.get(shopChannelId) ?? []).filter((t) => t > cutoff)

  if (recent.length >= PROFILE_RL_MAX) {
    calls.set(shopChannelId, recent)
    // บอกเวลาที่รอจริง ไม่ใช่ "ลองใหม่ภายหลัง" — คำที่ไม่มีตัวเลขทำให้ผู้ใช้กดวนต่อ
    const oldest = Math.min(...recent)
    const retryAfterSec = Math.max(1, Math.ceil((oldest + PROFILE_RL_WINDOW_MS - now) / 1000))
    return { ok: false, retryAfterSec }
  }

  recent.push(now)
  calls.set(shopChannelId, recent)
  return { ok: true }
}

/** ข้อความเดียวที่ใช้ทั้งระบบเมื่อชนโควตา (HR16 — ห้ามพิมพ์คำนี้ซ้ำที่อื่น) */
export function profileRateLimitMessage(retryAfterSec: number): string {
  const min = Math.ceil(retryAfterSec / 60)
  return `แก้คำถามแนะนำได้ ${PROFILE_RL_MAX} ครั้งต่อ 10 นาที (ข้อจำกัดของ Meta) — ลองใหม่อีกครั้งในอีกประมาณ ${min} นาที`
}
