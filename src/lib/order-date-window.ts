/**
 * order-date-window — SSOT ของ "วันที่คำสั่งซื้อย้อนหลัง/ล่วงหน้าได้แค่ไหน" (feature 00033)
 *
 * pure module (ไม่มี import) → เรียกได้ทั้ง client component, RSC และ service layer
 *
 * ทำไมต้องเป็นไฟล์เดียว: กฎเดียวกันมีผู้ใช้ 3 ฝั่ง (bound ของ input, ข้อความ error ใต้ช่อง,
 * และด่านโอ fail-closed ที่ service) — บทเรียนตรงจาก shipping-address-status.ts ที่กฎ
 * "ที่อยู่ครบพอบันทึกไหม" เคยเขียนซ้ำ 3 ที่แล้วนิยามไม่ตรงกัน จนปุ่มขึ้น "เลือกแล้ว"
 * ทั้งที่ยังบันทึกไม่ผ่าน
 *
 * รับ nowMs เป็นพารามิเตอร์เสมอ ไม่เรียก Date.now() ข้างใน — เทสได้โดยไม่ต้อง mock เวลา
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** ย้อนหลังได้ไกลสุดกี่วัน (user 2026-08-06) */
export const ORDER_BACKDATE_DAYS = 90
/** ล่วงหน้าได้ไกลสุดกี่วัน */
export const ORDER_FUTUREDATE_DAYS = 7

export const ORDER_DATE_OUT_OF_WINDOW_MESSAGE =
  `วันที่คำสั่งซื้อต้องอยู่ระหว่าง ${ORDER_BACKDATE_DAYS} วันย้อนหลังถึง ${ORDER_FUTUREDATE_DAYS} วันล่วงหน้า`

export type OrderDateWindow = { minMs: number; maxMs: number }

/** ช่วงที่ยอมรับ ณ เวลา nowMs — ขอบทั้งสองด้านนับรวม (inclusive) */
export function orderDateWindow(nowMs: number): OrderDateWindow {
  return {
    minMs: nowMs - ORDER_BACKDATE_DAYS * DAY_MS,
    maxMs: nowMs + ORDER_FUTUREDATE_DAYS * DAY_MS,
  }
}

/**
 * ค่านี้ใช้ได้ไหม — fail-closed: NaN/Infinity/ค่าที่ไม่ใช่ตัวเลขจำกัด ตกทั้งหมด
 * (Number.isFinite ตัดทั้ง NaN และ ±Infinity ในเช็คเดียว)
 */
export function isOrderDateInWindow(valueMs: number, nowMs: number): boolean {
  if (!Number.isFinite(valueMs)) return false
  const { minMs, maxMs } = orderDateWindow(nowMs)
  return valueMs >= minMs && valueMs <= maxMs
}

/** ข้อความไทยบอกว่าทำไมค่านี้ใช้ไม่ได้ — null = ใช้ได้ */
export function orderDateRejectReason(valueMs: number, nowMs: number): string | null {
  return isOrderDateInWindow(valueMs, nowMs) ? null : ORDER_DATE_OUT_OF_WINDOW_MESSAGE
}
