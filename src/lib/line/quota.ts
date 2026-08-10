// (S-9, feature 00025 TFR-LINE-07/TD-006) — ตรรกะล้วนของ "โควตาข้อความ LINE"
//
// ไฟล์นี้ไม่รู้จัก Prisma / fetch / React เลย — รับตัวเลขเข้า คืนคำตัดสินออก ทั้งหมดเป็นฟังก์ชัน
// บริสุทธิ์ที่เทสจับได้ เหตุผลที่ต้องแยกออกมาแทนการเขียนเทอร์นารีในที่ที่ใช้:
//
//   1. `shouldBlockLinePush()` ตัดสินว่า "ห้ามส่ง" — เขียนกลับด้านเมื่อไหร่ก็ยังผ่าน tsc/build/detector
//      ทุกด่าน เพราะมันเป็น boolean ที่ถูกต้องตามชนิดทุกประการ สิ่งที่ผิดคือ *ความหมาย*
//      (docs/conventions/ui-boolean-needs-a-testable-home.md)
//   2. เกณฑ์ "เหลือน้อย ≤20%" จะถูกใช้ทั้งฝั่ง server (route/service) และฝั่ง UI (มาตรวัด) —
//      กติกาเดียวต้องมีนิยามเดียว (Hard Rule 16)

import { QUOTA_LOW_RATIO, QUOTA_TTL_MS } from './constants'

/**
 * ผลการอ่านโควตาที่ "ตีความแล้ว" — สามสถานะนี้แยกกันโดยตั้งใจ เพราะปลายทางปฏิบัติต่อมันคนละแบบ:
 *
 * - `LIMITED`   — รู้ตัวเลขจริง (LINE ตอบ `type: 'limited'`) เป็นสถานะเดียวที่มีสิทธิ์บล็อกการส่ง
 * - `UNLIMITED` — LINE ตอบ `type: 'none'` (แพ็กเกจไม่จำกัดจำนวนข้อความ) ไม่มีอะไรให้นับ
 * - `UNKNOWN`   — อ่านไม่ได้ / ยังไม่เคยอ่าน 🛑 **ห้ามตีความว่าโควตาหมด** (TD-006: การบล็อกด้วย
 *                 ข้อมูลที่เราอ่านไม่ได้ = ระบบเราล่มแล้วร้านตอบลูกค้าไม่ได้ ซึ่งแย่กว่าปล่อยให้
 *                 LINE เป็นผู้ปฏิเสธเอง ซึ่งมีเส้นทาง error รองรับอยู่แล้ว)
 */
export type LineQuotaRead =
  | { kind: 'LIMITED'; total: number; used: number }
  | { kind: 'UNLIMITED' }
  | { kind: 'UNKNOWN' }

/** ระดับที่ทั้ง server และ UI ใช้ร่วมกัน — UI แปลงเป็นสี/ข้อความ, service ใช้ตัดสินว่าบล็อกไหม */
export type LineQuotaLevel = 'OK' | 'LOW' | 'EXHAUSTED' | 'UNLIMITED' | 'UNKNOWN'

/** คงเหลือ = เพดาน − ที่ใช้ไป แต่ไม่ต่ำกว่า 0 (LINE นับ `totalUsage` ของทั้งเดือนซึ่งอาจมากกว่า
 *  `value` ได้ในช่วงที่ร้านเพิ่งลดแพ็กเกจ — เลขติดลบไม่มีความหมายกับผู้ใช้ และทำให้สูตร % เพี้ยน) */
export function computeLineQuotaRemaining(total: number, used: number): number {
  return Math.max(0, total - used)
}

/**
 * จัดระดับโควตา — จุดเดียวในระบบที่รู้เกณฑ์ "เหลือน้อย" (QUOTA_LOW_RATIO)
 *
 * 🛑 `UNKNOWN` ต้องไม่ถูกจัดเป็น `EXHAUSTED` เด็ดขาด — ดู comment ของ LineQuotaRead
 */
export function classifyLineQuota(read: LineQuotaRead): LineQuotaLevel {
  if (read.kind === 'UNLIMITED') return 'UNLIMITED'
  if (read.kind === 'UNKNOWN') return 'UNKNOWN'

  const remaining = computeLineQuotaRemaining(read.total, read.used)
  if (remaining <= 0) return 'EXHAUSTED'
  // total = 0 กันหารศูนย์ (ถ้าเพดานเป็น 0 จริง remaining จะเป็น 0 และตกที่ EXHAUSTED ไปแล้วข้างบน)
  if (read.total > 0 && remaining / read.total <= QUOTA_LOW_RATIO) return 'LOW'
  return 'OK'
}

/**
 * 🛑 กติกาข้อเดียวที่มีอำนาจ "ห้ามยิง LINE" ด้วยเหตุผลเรื่องโควตา (TFR-LINE-06 ข้อ 5)
 *
 * บล็อกเฉพาะเมื่อ **รู้แน่ ๆ ว่าเหลือ 0** เท่านั้น — `UNKNOWN`/`UNLIMITED`/`LOW` ส่งได้หมด
 *
 * ผู้เรียกต้องเช็คเองก่อนว่ากำลังจะส่งด้วย push จริงหรือไม่ — **ส่งด้วย reply ไม่กินโควตา จึงห้าม
 * เอาผลของฟังก์ชันนี้ไปบล็อก** (TC-28: โควตาหมดแต่ยังอยู่ในหน้าต่างฟรี = ต้องส่งได้ตามปกติ ซึ่งเป็น
 * เคสที่ implement ผิดได้ง่ายที่สุดตามที่ TestCase.md เตือนไว้เอง)
 */
export function shouldBlockLinePush(level: LineQuotaLevel): boolean {
  return level === 'EXHAUSTED'
}

/** cache ยังใช้ได้ไหม (TTL 5 นาที ตาม TD-006) — `null` = ยังไม่เคยอ่าน = ไม่สด */
export function isLineQuotaCacheFresh(fetchedAt: Date | null | undefined, nowMs: number): boolean {
  if (!fetchedAt) return false
  return nowMs - fetchedAt.getTime() < QUOTA_TTL_MS
}
