/**
 * order-date-window — SSOT ของ "วันที่คำสั่งซื้อย้อนหลัง/ล่วงหน้าได้แค่ไหน" (feature 00033)
 *
 * pure module (import ได้เฉพาะ pure module ด้วยกัน — format-date.ts ก็ไม่มี import เช่นกัน)
 * → เรียกได้ทั้ง client component, RSC และ service layer
 *
 * ทำไมต้องเป็นไฟล์เดียว: กฎเดียวกันมีผู้ใช้ 3 ฝั่ง (bound ของ input, ข้อความ error ใต้ช่อง,
 * และด่านโอ fail-closed ที่ service) — บทเรียนตรงจาก shipping-address-status.ts ที่กฎ
 * "ที่อยู่ครบพอบันทึกไหม" เคยเขียนซ้ำ 3 ที่แล้วนิยามไม่ตรงกัน จนปุ่มขึ้น "เลือกแล้ว"
 * ทั้งที่ยังบันทึกไม่ผ่าน
 *
 * รับ nowMs เป็นพารามิเตอร์เสมอ ไม่เรียก Date.now() ข้างใน — เทสได้โดยไม่ต้อง mock เวลา
 */

import { formatDateTH } from './format-date'

const DAY_MS = 24 * 60 * 60 * 1000

/** ย้อนหลังได้ไกลสุดกี่วัน (user 2026-08-06) */
export const ORDER_BACKDATE_DAYS = 90
/** ล่วงหน้าได้ไกลสุดกี่วัน */
export const ORDER_FUTUREDATE_DAYS = 7

/**
 * ข้อความสำรองที่ไม่รู้ว่า "ตอนนี้" คือเมื่อไหร่ — ใช้เฉพาะจุดที่ไม่มี nowMs ให้คำนวณวันจริง
 * จุดที่มี nowMs ให้ใช้ `orderDateRejectReason()` ซึ่งบอกวันที่จริงแทนการบอกกฎ
 */
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

/**
 * ข้อความไทยบอกว่าทำไมค่านี้ใช้ไม่ได้ — null = ใช้ได้
 *
 * บอก **วันที่จริงที่เลือกได้** ไม่ใช่บอกกฎ ("90 วันย้อนหลัง") — ผู้ใช้ที่กรอกผิดต้องการรู้ว่า
 * "แล้วต้องกรอกอะไรถึงจะผ่าน" การบอกกฎบังคับให้เขานับวันเอาเองจากวันนี้ ซึ่งเป็นงานที่หน้าจอ
 * ทำแทนได้อยู่แล้ว (impeccable clarify 2026-08-06: error ต้องตอบว่า "กู้คืนยังไง" ไม่ใช่แค่ "ผิดอะไร")
 */
export function orderDateRejectReason(valueMs: number, nowMs: number): string | null {
  if (isOrderDateInWindow(valueMs, nowMs)) return null
  const { minMs, maxMs } = orderDateWindow(nowMs)
  return `เลือกได้ระหว่าง ${formatDateTH(new Date(minMs))} ถึง ${formatDateTH(new Date(maxMs))}`
}

/**
 * โหมดแก้ไขคำสั่งซื้อ — payload ของ createdAt ที่จะส่งไป API (feature 00033 re-review #2, I-7)
 *
 * ปุ่ม "ตอนนี้" ใน OrderDateRow เรียก setValue('orderedAt', undefined, { shouldDirty: true })
 * แล้วยุบแถวไปโชว์ label "วันนี้ HH:mm" ทันที (formatOrderDateLabel(now)) — แต่ orderedAtLocalValue
 * เป็น undefined ด้วย เดิม caller เช็คแค่ `dirty && value` (truthy ทั้งคู่) จึงไม่ส่งอะไรเลยตอนกด
 * ปุ่มนี้: จอบอกว่า "ตอนนี้" แต่ DB ไม่ขยับ (จอโกหก) ฟังก์ชันนี้แยก 3 กรณีให้ตรงกับสิ่งที่จอสื่อ:
 *   - ไม่ dirty เลย                              → ไม่ส่งคีย์ (ไม่แตะวันที่เดิม)
 *   - dirty + มีค่า (พิมพ์ใน datetime-local)      → ส่งค่าที่พิมพ์
 *   - dirty + ไม่มีค่า (กดปุ่ม "ตอนนี้" แล้วยุบ)   → ส่งเวลาปัจจุบันจริง (nowMs) ไม่ใช่งดส่ง
 *
 * รับ nowMs เป็นพารามิเตอร์ (ไม่เรียก Date.now() ข้างใน) ตาม pattern เดียวกับฟังก์ชันอื่นในไฟล์นี้ — เทสได้โดยไม่ต้อง mock เวลา
 */
export function resolveEditedOrderedAtPayload(
  dirty: boolean,
  orderedAtLocalValue: string | undefined,
  nowMs: number,
): { createdAt: string } | Record<string, never> {
  if (!dirty) return {}
  if (orderedAtLocalValue) return { createdAt: new Date(orderedAtLocalValue).toISOString() }
  return { createdAt: new Date(nowMs).toISOString() }
}
