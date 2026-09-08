/**
 * apple/entitlement — "ตกลงใบนี้ยังใช้ได้อยู่ไหม" (feature 00064)
 *
 * Pure module — ห้าม import service/prisma · ฉีดเวลาเข้ามาเสมอ ไม่อ่านนาฬิกาเอง
 * (เทสช่วงผ่อนผันต้องเดินเวลาข้ามวันได้โดยไม่ต้อง mock Date ทั้งระบบ)
 *
 * ── 🛑 ทำไมต้องมีไฟล์นี้แยก ────────────────────────────────────────────────
 *
 * เดิมทั้งระบบตัดสินด้วยบรรทัดเดียว `expiresAt > new Date()` ซึ่ง **ผิด** เมื่อ Apple
 * เก็บเงินไม่สำเร็จ: Apple จะเข้าโหมด billing retry และให้ช่วงผ่อนผัน (grace period)
 * ระหว่างนั้น `expiresDate` เป็นอดีตไปแล้วแต่ผู้ใช้ **ยังต้องใช้งานได้** (BR-IAP-14 · FR-IAP-23)
 * ⇒ ล็อกร้านทันทีที่ expiresDate ผ่านไป = ลูกค้าที่บัตรติดขัดชั่วคราวโดนปิดร้านทั้งที่
 * Apple ยังตามเก็บเงินให้อยู่ และเก็บสำเร็จอีกวันสองวันถัดมา
 *
 * ── 🛑 gracePeriodExpiresDate อยู่คนละ JWS ────────────────────────────────
 *
 * ค่านี้อยู่ใน **signedRenewalInfo** ไม่ใช่ signedTransactionInfo — เป็นคนละก้อนที่ต้อง
 * verify แยกกัน อ่านแต่ธุรกรรมอย่างเดียวจะไม่มีวันเห็นช่วงผ่อนผันเลย (บั๊กเดิม)
 */

/** รูปร่างของ JWSRenewalInfoDecodedPayload เท่าที่เราใช้จริง */
export interface AppleRenewalPayload {
  /** epoch ms — มีค่าเฉพาะตอน Apple เข้าโหมด billing retry แบบให้ผ่อนผัน */
  gracePeriodExpiresDate?: unknown
}

/** สภาพของสิทธิ์หนึ่งใบ ณ จุดที่ตัดสิน */
export interface EntitlementState {
  /** วันหมดอายุจาก Apple (BR-IAP-03) */
  expiresAt: Date
  /** มีค่า = Apple คืนเงิน/เพิกถอนแล้ว */
  revokedAt: Date | null
  /** วันสิ้นสุดช่วงผ่อนผัน — `null` = การต่ออายุปกติ ไม่ได้อยู่ในโหมด retry */
  gracePeriodExpiresAt: Date | null
}

/**
 * อ่านวันสิ้นสุดช่วงผ่อนผันจาก renewal info ที่ **ตรวจลายเซ็นแล้ว**
 *
 * ไม่มีฟิลด์ = การต่ออายุปกติ ไม่ใช่ error ⇒ คืน `null` เฉย ๆ
 */
export function readAppleGracePeriod(payload: AppleRenewalPayload): Date | null {
  const v = payload.gracePeriodExpiresDate
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * ยังมีสิทธิ์ใช้งานอยู่ไหม ณ เวลา `now`
 *
 * 🛑 ลำดับสำคัญ: **การเพิกถอนชนะทุกอย่าง** — ของที่คืนเงินไปแล้วห้ามใช้ได้ต่อ
 * แม้จะยังอยู่ในช่วงผ่อนผัน (คืนเงินแล้วยังใช้ฟรีต่อ = เสียเงินสองต่อ)
 */
export function isEntitlementActive(state: EntitlementState, now: Date): boolean {
  if (state.revokedAt !== null) return false
  if (state.expiresAt > now) return true
  return state.gracePeriodExpiresAt !== null && state.gracePeriodExpiresAt > now
}
