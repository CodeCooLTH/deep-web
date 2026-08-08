/**
 * order-date-filter — SSOT ของตัวกรอง "ช่วงเวลา" ในหน้า /orders (2026-08-08)
 *
 * pure module — ห้าม import prisma/server-only (ใช้ทั้งตารางเดสก์ท็อปและโมดัลมือถือ)
 *
 * ทำไมต้องยกออกมาเป็นไฟล์: ก่อนหน้านี้ตรรกะอยู่ใน OrdersTable.tsx ที่เดียว แปลว่า
 * **มือถือไม่มีตัวกรองช่วงเวลาเลย** (โมดัลตัวกรองมีแค่สถานะการขายกับประเภทออเดอร์)
 * พอจะเพิ่มให้มือถือด้วย ถ้าเขียนซ้ำอีกที่ วันหนึ่งสองจอจะกรองไม่ตรงกัน — เป็นคลาสบั๊กที่
 * โปรเจกต์นี้เจอซ้ำหลายรอบ (docs/conventions/sibling-surface-parity.md)
 *
 * [สำคัญ] ตัดวันด้วย thaiDayKey() ไม่ใช่ new Date() ของเครื่อง — ของเดิมใช้
 * `now.getFullYear(), now.getMonth(), now.getDate()` ซึ่งเป็นเวลาของเบราว์เซอร์ผู้ขาย
 * บังเอิญตรงเพราะเครื่องในไทยตั้ง timezone ไทยอยู่แล้ว แต่ไม่ควรพึ่งความบังเอิญ
 * (feature 00033 เคยแก้บั๊กคลาสเดียวกันนี้ที่ /sales และ /orders มาแล้ว — ออเดอร์ช่วง
 * 00:00–07:00 น. ตกไปนับเป็นวันก่อนหน้า)
 */

import { thaiDayKey } from './format-date'

/** ค่าที่ไม่ใช่วันเจาะจง — ต้องตรงกับ value ของตัวเลือกใน UI ทั้ง 2 breakpoint */
export const ORDER_DATE_PRESETS = {
  All: 'ทั้งหมด',
  Today: 'วันนี้',
  'Last 7 Days': '7 วันที่ผ่านมา',
  'Last 30 Days': '30 วันที่ผ่านมา',
  'This Year': 'ปีนี้',
} as const

export type OrderDatePreset = keyof typeof ORDER_DATE_PRESETS

export function isOrderDatePreset(v: string): v is OrderDatePreset {
  return v in ORDER_DATE_PRESETS
}

/** "2026-08-01" — รูปของค่าที่หมายถึง "วันเจาะจงวันเดียว" (ผลลัพธ์ของ thaiDayKey) */
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export function isSpecificDay(v: string): boolean {
  return DAY_KEY_RE.test(v)
}

const DAY_MS = 86_400_000

/**
 * แถวนี้ผ่านตัวกรองวันไหม
 *
 * @param createdAtISO วันที่ของออเดอร์ (Order.createdAt ที่ serialize เป็น ISO แล้ว)
 * @param filter 'All' | preset | 'YYYY-MM-DD' (วันเจาะจง)
 * @param now  ฉีดได้เพื่อให้เทสไม่ผูกกับนาฬิกาจริง
 *
 * ค่าที่ไม่รู้จัก = ไม่กรอง (fail-open) — ลิงก์เก่า/พิมพ์มั่วต้องไม่ทำให้หน้าว่างเปล่า
 * โดยไม่มีคำอธิบาย ซึ่งเป็นกติกาเดียวกับ ?stage=/?appt= ของหน้านี้
 */
export function matchesOrderDateFilter(
  createdAtISO: string | null | undefined,
  filter: string,
  now: Date = new Date(),
): boolean {
  if (!filter || filter === 'All') return true
  if (!createdAtISO) return false

  const rowKey = thaiDayKey(createdAtISO)
  if (!rowKey) return false

  // วันเจาะจง — เทียบคีย์วันไทยตรง ๆ ไม่ต้องคำนวณช่วง
  if (isSpecificDay(filter)) return rowKey === filter

  const todayKey = thaiDayKey(now)
  switch (filter) {
    case 'Today':
      return rowKey === todayKey
    case 'Last 7 Days':
      return rowKey >= thaiDayKey(new Date(now.getTime() - 7 * DAY_MS)) && rowKey <= todayKey
    case 'Last 30 Days':
      return rowKey >= thaiDayKey(new Date(now.getTime() - 30 * DAY_MS)) && rowKey <= todayKey
    case 'This Year':
      // คีย์เป็น "YYYY-MM-DD" ตามปฏิทินไทย → เทียบปีด้วย prefix 4 ตัวแรกพอ
      return rowKey.slice(0, 4) === todayKey.slice(0, 4)
    default:
      return true
  }
}
