// (00025 ส่วนขยาย 2026-08-12) — SSOT ของ **คำ สี ไอคอน และปุ่มทางออก** ของสถานะช่องทาง LINE
//
// 🛑 แยกจาก `channel-health.ts` (ซึ่งตัดสิน *ว่าเป็นสถานะอะไร*) เพราะไฟล์นี้ตัดสิน *ว่าจะพูดว่าอะไร*
// และมีผู้อ่านอย่างน้อย 3 จุดที่ต้องพูดตรงกัน: การ์ดใน `/settings/channels` · แผงผลของปุ่ม
// "ทดสอบการเชื่อมต่อ" · แถบแทนที่ช่องพิมพ์ในเธรดแชท
//
// ถ้าปล่อยให้แต่ละจุดพิมพ์คำเอง จะได้ "โทเคนหมดอายุ" ที่หนึ่งกับ "Token ใช้งานไม่ได้แล้ว" อีกที่หนึ่ง
// สำหรับสถานะเดียวกัน โดยไม่มี tsc/build/เทสตัวไหนฟ้อง เพราะทั้งคู่เป็นสตริงที่ถูกต้อง (Hard Rule 16)
//
// คำทั้งหมดมาจาก Design Spec ของ `safepay-ux` (2026-08-12) — ห้าม dev แต่งเอง

import type { LineChannelHealth } from './channel-health'

/** ปุ่มทางออก 1 ปุ่มต่อสถานะ — ค่า `action` บอก **เจตนา** ไม่ใช่ปลายทาง (หน้าจอ map เป็น handler เอง) */
export type LineHealthAction =
  | 'FIX_SECRET'
  | 'UPDATE_TOKEN'
  | 'SETUP_WEBHOOK'
  | 'ISSUE_LONG_LIVED'
  | null

export interface LineHealthPresentation {
  label: string
  /** บรรทัดอธิบายใต้ป้าย — `null` เมื่อไม่มีอะไรต้องทำ (สถานะปกติไม่ต้องอธิบายตัวเอง) */
  detail: string | null
  /** tone ของ Paces — 🛑 `success` สงวนไว้ให้ HEALTHY เท่านั้น (Verified-Means-Green) */
  tone: 'success' | 'warning' | 'danger'
  /** ชื่อไอคอน tabler — เลี่ยง robot (=DeepBot) / sparkles (=DeepAI) / bolt (=DeepMenu ของ 00045) */
  icon: string
  action: LineHealthAction
  actionLabel: string | null
}

/**
 * ตารางคำของทุกสถานะ
 *
 * 🛑 ประกาศเป็น `Record<LineChannelHealth, …>` โดยตั้งใจ — วันที่มีคนเพิ่มสถานะที่ 7 เข้า union
 * `tsc` จะบังคับให้มาเติมคำที่นี่ ไม่ใช่ปล่อยให้ตกไปที่ default เงียบ ๆ แล้วผู้ขายเห็นป้ายว่าง
 * (บทเรียน enum-value-removal.md: grep จับ object key ไม่ได้ ต้องให้ type บังคับ)
 */
const PRESENTATION: Record<LineChannelHealth, LineHealthPresentation> = {
  SECRET_MISMATCH: {
    label: 'Channel secret ไม่ตรง',
    detail:
      'ข้อความจากลูกค้าเข้าไม่ถึง Deep เลย ทั้งที่ LINE รายงานว่าส่งสำเร็จ — Channel secret ที่วางไว้ไม่ตรงกับที่ตั้งในคอนโซล LINE',
    tone: 'danger',
    icon: 'shield-lock',
    action: 'FIX_SECRET',
    actionLabel: 'แก้ไข Channel secret',
  },
  TOKEN_INVALID: {
    label: 'Token ใช้งานไม่ได้แล้ว',
    detail: 'ส่งข้อความหาลูกค้าไม่ได้จนกว่าจะวาง token ใหม่ — token เดิมอาจถูกเพิกถอนหรือหมดอายุ',
    tone: 'danger',
    icon: 'alert-circle',
    action: 'UPDATE_TOKEN',
    actionLabel: 'อัปเดต token',
  },
  WEBHOOK_NOT_SET: {
    label: 'ยังไม่ได้ตั้ง Webhook',
    detail: 'วาง Webhook URL ในคอนโซล LINE ให้เรียบร้อยก่อน จึงจะเริ่มรับข้อความลูกค้าได้',
    tone: 'warning',
    icon: 'link-off',
    action: 'SETUP_WEBHOOK',
    actionLabel: 'ตั้งค่า Webhook',
  },
  WEBHOOK_INACTIVE: {
    label: 'Webhook ปิดอยู่',
    detail: 'ตั้ง URL ไว้แล้วแต่สวิตช์ "Use webhook" ในคอนโซล LINE ยังปิดอยู่',
    tone: 'warning',
    icon: 'link-off',
    action: 'SETUP_WEBHOOK',
    actionLabel: 'ตั้งค่า Webhook',
  },
  WEBHOOK_POINTS_ELSEWHERE: {
    label: 'Webhook ชี้ไปที่อื่น',
    detail: 'Webhook ของ OA นี้ชี้ไปยัง URL อื่น ไม่ใช่ของ Deep — ข้อความลูกค้าจะไม่เข้าที่นี่',
    tone: 'warning',
    icon: 'link-off',
    action: 'SETUP_WEBHOOK',
    actionLabel: 'ตั้งค่า Webhook',
  },
  TOKEN_EXPIRING: {
    // label เติมวันที่ทีหลังผ่าน `describeLineChannelHealth()` — ต้องบอก **วันที่จริง**
    // ไม่ใช่คำว่า "ใกล้หมดอายุ" ซึ่งไม่บอกว่าต้องรีบแค่ไหน
    label: 'Token จะหมดอายุ',
    detail: 'เปลี่ยนเป็นแบบไม่หมดอายุเพื่อไม่ต้องมาตั้งซ้ำ',
    tone: 'warning',
    icon: 'clock-exclamation',
    action: 'ISSUE_LONG_LIVED',
    actionLabel: 'เปลี่ยนเป็นไม่หมดอายุ',
  },
  HEALTHY: {
    label: 'เชื่อมต่อสมบูรณ์',
    detail: null,
    tone: 'success',
    icon: 'shield-check',
    action: null,
    actionLabel: null,
  },
}

/**
 * คืนคำที่จะแสดงสำหรับสถานะหนึ่ง
 *
 * @param expiryText ข้อความวันที่ (พ.ศ.) ของ `TOKEN_EXPIRING` — ผู้เรียกฟอร์แมตมาด้วย
 *        `formatDate` จาก `src/lib/format-date.ts` เท่านั้น (ห้าม `toLocaleDateString` เอง)
 * @param daysLeft เหลืออีกกี่วัน — ใช้เติมในบรรทัดอธิบายของ `TOKEN_EXPIRING`
 */
export function describeLineChannelHealth(
  health: LineChannelHealth,
  opts?: { expiryText?: string | null; daysLeft?: number | null },
): LineHealthPresentation {
  const base = PRESENTATION[health]
  if (health !== 'TOKEN_EXPIRING') return base

  return {
    ...base,
    label: opts?.expiryText ? `${base.label} ${opts.expiryText}` : base.label,
    detail:
      typeof opts?.daysLeft === 'number'
        ? `อีก ${opts.daysLeft} วัน token นี้จะใช้งานไม่ได้ — ${base.detail}`
        : base.detail,
  }
}

/**
 * ป้ายนี้ควรใช้สีเขียวไหม
 *
 * 🛑 มีฟังก์ชันนี้แทนที่จะให้ component เช็ค `tone === 'success'` เอง เพราะกฎที่ต้องรักษาคือ
 * **"เขียว = ผ่านทุกด่าน"** ไม่ใช่ "เขียวเมื่อ tone เป็น success" — ถ้าวันหนึ่งมีคนเผลอตั้ง tone
 * ของสถานะอื่นเป็น success ด่านนี้ยังจับได้ (เทส [blocker] ผูกกับฟังก์ชันนี้)
 */
export function isGreenState(health: LineChannelHealth): boolean {
  return health === 'HEALTHY'
}
