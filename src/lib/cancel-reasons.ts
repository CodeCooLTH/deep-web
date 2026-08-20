// cancel-reasons.ts — ชุดเหตุผลการยกเลิกคำสั่งซื้อ แยกตามประเภทกิจการ (feature 00039)
//
// 🛑 เหตุผลในไฟล์นี้ "ไม่มีอำนาจตัดสินตัวเลข" (BR-OSM-05)
//
// มันถูกเก็บไว้เป็นประวัติให้ร้านและแอดมินใช้เท่านั้น การตัดออกจากตัวหารของอัตราความสำเร็จ
// ตัดสินจาก **เส้นทางที่ถูกใช้** (ผู้ซื้อกดยกเลิกเอง / ขนส่งรายงานว่าตีกลับ) ผ่าน
// isRateExcludedCancellation() ใน lib/order-stats.ts เท่านั้น
//
// ทำไมถึงออกแบบแบบนี้: ถ้าเหตุผลที่ร้านเลือกเองมีผลต่อ % ก็เท่ากับให้ร้านให้คะแนนตัวเอง
// Amazon/eBay/Shopee ตัดสินจากเส้นทางเหมือนกันหมดด้วยเหตุผลเดียวกัน — Amazon ระบุตรง ๆ ว่า
// ถ้าผู้ซื้อทักแชทมาขอยกเลิกแล้วร้านกดให้ จะนับเป็นความผิดร้าน เพราะแยกจากกรณีที่ร้านอ้างเองไม่ได้
// (docs/research/2026-08-08-seller-trust-metrics-benchmark.md §2.2)
//
// 🛑 ห้ามยืมชื่อ flag `countsAgainstGuest` จาก lib/lodging.ts มาใช้ตรง ๆ — ความหมายกลับด้าน
// (อันนั้น = "นับเข้าประวัติผู้จอง" ซึ่งเป็นการลงโทษ *ผู้ซื้อ* ไม่ใช่การยกเว้นให้ *ร้าน*)

import { CANCEL_REASONS as LODGING_CANCEL_REASONS, type ShopVertical } from './lodging'

export type CancelReasonOption = { value: string; label: string }

/**
 * ชุดเหตุผลต่อประเภทกิจการ
 *
 * Record<ShopVertical, ...> โดยตั้งใจ ไม่ใช่ object ธรรมดา — ถ้าวันหนึ่งมี vertical ใหม่
 * TypeScript จะบังคับให้เติมชุดคำที่นี่ทันที ไม่ปล่อยให้ตกไป default เงียบ ๆ
 * (บทเรียน 00028: ตรรกะ `vertical === 'X' ? A : B` ไม่พังเสียงดังเมื่อมีค่าที่สาม)
 *
 * ถ้อยคำแยกชุดจริง ไม่ใช่แทนแค่คำนาม — ร้านคิวงานพูดว่า "ไม่มาตามนัด" ไม่ใช่ "ไม่โอนเงิน"
 * (docs/conventions/... vocab substitution: ประโยคที่มีกริยาของโดเมนต้องแยกชุด)
 */
export const CANCEL_REASONS_BY_VERTICAL: Record<ShopVertical, readonly CancelReasonOption[]> = {
  ONLINE_SALES: [
    { value: 'BUYER_NO_PAYMENT', label: 'ลูกค้าไม่โอนเงิน' },
    { value: 'BUYER_REQUESTED', label: 'ลูกค้าขอยกเลิก' },
    /**
     * เพิ่ม 2026-08-20 — เดิมร้านที่ของถูกตีกลับไม่มีคำที่ตรงความจริงให้เลือกสักคำ
     * (ลูกค้าไม่ได้ขอยกเลิก · เงินอาจโอนมาแล้ว · สินค้าไม่ได้มีปัญหา) ทางเลือกเดียวคือ
     * เลือกคำที่ผิดแล้วประวัติเพี้ยน หรือปล่อยใบนั้นค้างเป็น "จัดส่งแล้ว" ตลอดไป
     *
     * 🛑 ค่านี้ไม่ได้ทำให้ใบนั้นถูกหักออกจากตัวหารอัตราความสำเร็จ — ตัวที่ทำคือ
     * `carrierStatus` ของพัสดุ (BR-OSM-04/05) ซึ่งร้านสร้างขึ้นเองไม่ได้ ถ้าวันหนึ่งมีคน
     * ทำให้ค่านี้มีอิทธิพลต่อตัวเลข = ให้ร้านให้คะแนนตัวเอง ซึ่งคือสิ่งที่ทั้งไฟล์นี้กันอยู่
     */
    { value: 'PARCEL_RETURNED', label: 'ลูกค้าไม่รับของ พัสดุตีกลับ' },
    { value: 'SHOP_ISSUE', label: 'สินค้ามีปัญหา หรือเหตุผลของร้าน' },
    { value: 'MUTUAL', label: 'ตกลงกันได้' },
  ],
  SERVICE_QUEUE: [
    { value: 'BUYER_NO_SHOW', label: 'ลูกค้าไม่มาตามนัด' },
    { value: 'BUYER_REQUESTED', label: 'ลูกค้าขอยกเลิก' },
    { value: 'SHOP_ISSUE', label: 'ร้านติดปัญหา ให้บริการไม่ได้' },
    { value: 'MUTUAL', label: 'ตกลงกันได้' },
  ],
  // ที่พักใช้ชุดเดิมของระบบจอง — ไม่แตะ เพราะ countsAgainstGuest ของมันผูกกับประวัติผู้จอง
  // (BR-LODG-37) ซึ่งเป็นคนละเรื่องกับอัตราความสำเร็จของร้าน และยังทำงานอยู่
  LODGING: Object.entries(LODGING_CANCEL_REASONS).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
}

/** ค่าที่ยอมรับได้สำหรับร้านประเภทนี้ — allow-list ต่อ vertical ไม่ใช่ deny-list รวม
 *
 *  ถ้าใช้ deny-list หรือรวมทุก vertical เป็นชุดเดียว ร้านขายของจะส่ง 'BUYER_NO_SHOW' ผ่านได้
 *  แล้วประวัติจะมีคำที่ไม่มีความหมายกับธุรกิจนั้น (docs/conventions/enum-value-removal.md)
 */
export function isValidCancelReason(vertical: ShopVertical, value: string): boolean {
  return CANCEL_REASONS_BY_VERTICAL[vertical].some((o) => o.value === value)
}

/** ป้ายภาษาไทยของเหตุผล — null เมื่อไม่รู้จัก (ออเดอร์เก่าที่ไม่เคยเก็บเหตุผล) */
export function cancelReasonLabel(vertical: ShopVertical, value: string | null): string | null {
  if (!value) return null
  return CANCEL_REASONS_BY_VERTICAL[vertical].find((o) => o.value === value)?.label ?? null
}

/** เหตุผลที่ระบบตั้งให้เองเมื่อ "ผู้ซื้อ" เป็นคนกดยกเลิก — ไม่ถามซ้ำ
 *
 *  pattern เดียวกับที่การจองทำอยู่แล้ว (order.service.ts: initiator==='buyer' → BUYER_REQUESTED)
 *  เพราะ session บอกอยู่แล้วว่าใครกด ไม่มีอะไรให้ถามเพิ่ม
 */
export const BUYER_SELF_CANCEL_REASON = 'BUYER_REQUESTED'
