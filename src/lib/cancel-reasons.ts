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
    /**
     * เพิ่ม 2026-09-05 (feature 00061 · มติ OD-ACO-01) — ผู้ขายกดปุ่ม "ยกเลิกใบเก่า" จาก
     * การ์ดผลลัพธ์เมื่อระบบสร้างใบใหม่มาแทนใบก่อนหน้าในห้องแชทเดียวกัน
     *
     * 🛑 **จงใจไม่อยู่ใน `BUYER_FAULT_CANCEL_REASONS`** (`lib/cancel-reason-buyer-fault.ts`)
     * ไม่ใช่ลืม — ระบบสร้างใบซ้ำเองไม่ใช่ความผิดลูกค้า ถ้ามีใครเพิ่มเข้าไปทีหลัง ลูกค้าจะ
     * ถูกติดตราจากเหตุที่เขาไม่ได้ก่อเลยแม้แต่น้อย (มีเทส [blocker] ยืนยันว่าไม่อยู่)
     */
    { value: 'DUPLICATE_ORDER', label: 'สั่งซ้ำ ถูกแทนที่ด้วยใบใหม่' },
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


/**
 * เหตุผลที่ **ระบบเป็นผู้ตั้ง** — ไม่อยู่ในดรอปดาวน์ของใครทั้งสิ้น (feature 00061)
 *
 * ทั้งสองค่าเกิดกับแถวที่ **ไม่เคยเป็นออเดอร์จริง** (`status='DRAFTED'`) แล้วถูกปิดทิ้ง ⇒
 * พอปิดแล้ว status กลายเป็น `CANCELLED` มันจะหลุดจากตัวกรอง `excludeDraftedWhere` ทันที
 * และไปโผล่ในกลุ่ม "ออเดอร์ที่ยกเลิก" ของทุกรายงาน **ทั้งที่มันไม่เคยเป็นออเดอร์มาก่อน**
 * ⇒ ต้องถูกหักออกจากอัตราความสำเร็จที่ `isRateExcludedCancellation()` (`lib/order-stats.ts`)
 *
 * 🛑 สองค่านี้แยกกันโดยตั้งใจ ห้ามยุบเป็นค่าเดียว — *"ผู้ขายกดทิ้งเอง"* กับ *"ระบบหมดอายุให้"*
 * ตอบคนละคำถามเวลาร้านถามว่า "ร่างของฉันหายไปไหน" (ข้อหนึ่งตอบว่าคุณกดเอง อีกข้อตอบว่า
 * มันค้างมา 7 วัน) — ยุบรวมแล้วคำตอบเดียวจะผิดครึ่งหนึ่งของเวลาเสมอ
 *
 * 🛑 ไม่ผ่าน `isValidCancelReason()` โดยตั้งใจ — ตัวนั้นเป็น allow-list ของ *สิ่งที่ร้านเลือกได้*
 * ค่าพวกนี้เขียนจากใน service เท่านั้น ไม่มี API ไหนรับมาจาก client
 */
export const SYSTEM_CANCEL_REASONS: Record<string, string> = {
  /** ผู้ขายกดปุ่ม "ทิ้งร่างนี้" เอง (มติ user 2026-09-05) */
  DRAFT_DISCARDED: 'ผู้ขายทิ้งร่างนี้',
  /** ระบบเก็บกวาดร่างที่ค้างเกิน 7 วัน */
  DRAFT_EXPIRED: 'ร่างหมดอายุ (ค้างเกิน 7 วัน)',
}

export const DRAFT_DISCARD_REASON = 'DRAFT_DISCARDED'
export const DRAFT_EXPIRED_REASON = 'DRAFT_EXPIRED'

/** เหตุผลนี้เกิดกับแถวที่ไม่เคยเป็นออเดอร์จริงหรือเปล่า (00061) */
export function isDraftLifecycleCancelReason(reason?: string | null): boolean {
  if (!reason) return false
  return reason === DRAFT_DISCARD_REASON || reason === DRAFT_EXPIRED_REASON
}

/** ป้ายภาษาไทยของเหตุผล — null เมื่อไม่รู้จัก (ออเดอร์เก่าที่ไม่เคยเก็บเหตุผล)
 *
 *  ต้องถอยไปดู SYSTEM_CANCEL_REASONS ด้วยเสมอ ไม่งั้นแถวที่ระบบปิดเองจะขึ้น "—" บนหน้าจอ
 *  ทั้งที่เรารู้เหตุผลชัดเจน (คลาสเดียวกับ label ที่หายเงียบซึ่งไฟล์นี้บันทึกไว้เองด้านบน)
 */
export function cancelReasonLabel(vertical: ShopVertical, value: string | null): string | null {
  if (!value) return null
  return (
    CANCEL_REASONS_BY_VERTICAL[vertical].find((o) => o.value === value)?.label ??
    SYSTEM_CANCEL_REASONS[value] ??
    null
  )
}

/** เหตุผลที่ระบบตั้งให้เองเมื่อ "ผู้ซื้อ" เป็นคนกดยกเลิก — ไม่ถามซ้ำ
 *
 *  pattern เดียวกับที่การจองทำอยู่แล้ว (order.service.ts: initiator==='buyer' → BUYER_REQUESTED)
 *  เพราะ session บอกอยู่แล้วว่าใครกด ไม่มีอะไรให้ถามเพิ่ม
 */
export const BUYER_SELF_CANCEL_REASON = 'BUYER_REQUESTED'
