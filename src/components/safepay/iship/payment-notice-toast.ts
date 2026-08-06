// ส่วนขยาย 00022 (2026-08-06) — toast แจ้งเรื่องวิธีชำระเงินหลังเปิด/ผูกพัสดุ
//
// อยู่ในไฟล์เดียวเพราะมี 3 จุดเรียก (ฟอร์มสร้าง / แผงผูกพัสดุ / แผงร่างในแชท) และกติกา
// "ยิงใบเดียว ไม่ซ้อนกับ toast สำเร็จ" ต้องเหมือนกันทุกจุด — เขียนซ้ำ 3 ที่แล้วจะเพี้ยนกัน
//
// ทำไมไม่ปล่อยให้ toast สำเร็จขึ้นคู่กัน: ที่ top-right สองใบพร้อมกันบังคับให้ร้านอ่านคำว่า
// "สำเร็จ" ซ้ำโดยไม่ได้ข้อมูลใหม่ ส่วนข้อเท็จจริงเรื่องเงินซึ่งสำคัญกว่าไปอยู่ใบที่สอง
// (ux clarify gate 2026-08-06) — ความสำเร็จพิสูจน์จากจอที่สลับไปอยู่แล้ว

import { pacesToast } from '@/lib/paces-toast'
import type { ShipmentViewJson } from '@/lib/iship/context'

/** ยาวกว่าปกติ (3 วิ) เพราะเป็นข้อมูลเงินที่ระบบไปแก้ให้ ไม่ใช่ ack ธรรมดา */
const NOTICE_DURATION = 6000

/**
 * toastPaymentNotice — ยิง toast ของ paymentNotice ถ้ามี
 *
 * @param prefix ประโยคนำ สำหรับจุดที่แผงถูกปิดทิ้งทันที (แชท: ติ๊ก "แจ้งเลขในแชท" แล้วส่งสำเร็จ)
 *   — จุดนั้น toast คือหลักฐานเดียวที่เหลือว่าเกิดอะไรขึ้น จึงตัดคำยืนยันความสำเร็จทิ้งไม่ได้
 * @returns true = ยิงแล้ว ผู้เรียกไม่ต้องยิง toast สำเร็จของตัวเองซ้ำ
 */
export function toastPaymentNotice(
  notice: ShipmentViewJson['paymentNotice'],
  prefix?: string,
): boolean {
  if (!notice) return false
  const text = prefix ? `${prefix} — ${notice.message}` : notice.message
  // changed = ระบบแก้ให้ ไม่ใช่ผลของสิ่งที่ร้านสั่ง จึงไม่ใช่ success (และห้ามเขียว —
  // Verified-Means-Green สงวนให้ "ยืนยันแล้ว" เท่านั้น) · warning = ร้านต้องไปแก้เอง
  // แต่ไม่มี operation ไหนล้มเหลว จึงไม่ใช่ error
  if (notice.kind === 'changed') pacesToast.info(text, { duration: NOTICE_DURATION })
  else pacesToast.warning(text, { duration: NOTICE_DURATION })
  return true
}
