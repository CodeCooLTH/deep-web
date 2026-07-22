// stat-change-tone.ts — Pure helper: className badge สำหรับ % เปลี่ยนแปลงในการ์ดสถิติออเดอร์
//
// ทำไมแยกไฟล์: repo ไม่มี component-test infra (ไม่มี jsdom/@testing-library/react ใน
// dependency, มีแค่ vitest pure-module) — ลง dep ใหม่เพื่อเทส component = CREEP
// เลยแยก decision logic (สี badge ตาม changePct) ออกมาเป็น pure function เทสได้ตรง ๆ
//
// บั๊กที่แก้ (S-A1): เดิมทุกการ์ดใช้กฎเดียวกัน (>0=success, <0=danger) รวมถึงการ์ด
// CANCELLED ด้วย → ยอดยกเลิกเพิ่มขึ้นกลายเป็น badge เขียว "+15%" ซึ่งเป็นข่าวร้ายที่ดู
// เหมือนข่าวดี ขัด Verified-Means-Green (เขียว = ดีจริงเท่านั้น) — CANCELLED ต้อง invert
// ตรรกะ: เพิ่มขึ้น = danger (แดง), ลดลง = success (เขียว)

import type { OrderStatCardData } from './data'

export type StatChangeTone = 'success' | 'danger' | 'neutral'

/** className ต่อ tone — ชุดเดิมที่ component ใช้อยู่ (Hard Rule 7: semantic token เท่านั้น) */
export const STAT_CHANGE_TONE_CLASS: Record<StatChangeTone, string> = {
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
  neutral: 'bg-default-400/15 text-default-400',
}

/**
 * getStatChangeTone — ตัดสิน tone ของ badge % เปลี่ยนแปลง ตาม status ของการ์ด
 *
 * กฎปกติ (ทุกสถานะยกเว้น CANCELLED): เพิ่มขึ้น = ดี (success), ลดลง = แย่ (danger)
 * กฎ CANCELLED (invert): เพิ่มขึ้น = แย่ (danger), ลดลง = ดี (success)
 *   เพราะยอดยกเลิกเพิ่มขึ้น = ธุรกิจแย่ลง ไม่ใช่ข่าวดี
 */
export function getStatChangeTone(
  statusKey: OrderStatCardData['status'],
  changePct: number,
): StatChangeTone {
  if (changePct === 0) return 'neutral'

  const isIncrease = changePct > 0
  const isCancelled = statusKey === 'CANCELLED'

  if (isCancelled) {
    return isIncrease ? 'danger' : 'success'
  }
  return isIncrease ? 'success' : 'danger'
}
