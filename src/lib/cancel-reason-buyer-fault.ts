/**
 * cancel-reason-buyer-fault — "การยกเลิกครั้งนี้เข้าประวัติของ *ผู้ซื้อ* ไหม" ที่เดียวของระบบ
 * (feature 00055 · BR-BR-10)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🛑 ทำไมต้องมีไฟล์นี้ ทั้งที่ `cancelReasonCountsAgainstGuest()` มีอยู่แล้ว
 *
 * ตัวนั้นอ่านจาก `CANCEL_REASONS` ใน `lib/lodging.ts` ซึ่งมี **4 ค่าของโดเมนที่พักเท่านั้น**
 * (`BUYER_NO_TRANSFER` `BUYER_REQUESTED` `SHOP_ISSUE` `MUTUAL`) แต่ร้านขายออนไลน์และ
 * ร้านบริการใช้ชุดของตัวเองใน `lib/cancel-reasons.ts` ซึ่งมี `BUYER_NO_PAYMENT`
 * `BUYER_NO_SHOW` `PARCEL_RETURNED` — สามตัวนี้ไม่อยู่ในแมปนั้นเลย ⇒ `isCancelReason()`
 * คืน false ⇒ **ไม่เคยถูกนับเข้าประวัติลูกค้าสักครั้งตั้งแต่วันแรก**
 *
 * ผลจริง: "ลูกค้าไม่โอนเงิน" กับ "ลูกค้าไม่มาตามนัด" — สองพฤติกรรมที่ชี้ตัวคนทำชัดที่สุด —
 * เป็นสองอันที่ระบบมองไม่เห็น (บน prod มี `BUYER_NO_PAYMENT` 1 ใบที่หายไปเงียบ ๆ)
 * `tsc` มองไม่เห็นเพราะ `cancelReason` เป็น `String?` ในสคีมา ไม่มี type ให้บังคับ
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🛑 ต้องเป็น **allow-list เท่านั้น** — เหตุผลใหม่ที่ใครเพิ่มทีหลังต้อง "ไม่นับ" เป็นค่าตั้งต้น
 * เดาผิดฝั่งนี้ = ติดตราลูกค้าจากเหตุที่เขาไม่ได้ก่อ ซึ่งเคยเกิดแล้ว 2026-08-11 (ป้าย
 * "เคยยกเลิก N ครั้ง" นับการยกเลิกของ *ร้านเอง* ไปโทษลูกค้า — prod มี 8 ใบเป็น
 * `cancelInitiator='seller'` ทั้งหมด)
 *
 * ไฟล์นี้ **ห้าม import อะไรเลย** — `lodging.ts` และ `cancel-reasons.ts` ต้อง import
 * ตัวนี้ได้ทั้งคู่โดยไม่เกิดวงกลม (`cancel-reasons.ts` import `lodging.ts` อยู่แล้ว)
 */

/**
 * เหตุผลที่ต้นเรื่องมาจากฝั่งลูกค้า — ครอบทุก vertical
 *
 * 🛑 `PARCEL_RETURNED` **จงใจไม่อยู่ในนี้** ไม่ใช่ลืม: ใบที่พัสดุตีกลับถูกนับจาก
 * `carrierStatus` ไปแล้วใน `customer-behavior.ts`/`buyer-reputation.ts` ("ตีกลับชนะยกเลิก
 * เสมอ ใบเดียวนับครั้งเดียว") ถ้านับผ่านเหตุผลอีกทางจะกลายเป็น 2 ครั้งจากใบเดียว แล้วร้าน
 * จะอ่านว่าลูกค้ามีปัญหาสองครั้ง
 *
 * `SHOP_ISSUE`/`MUTUAL` ไม่อยู่ในนี้เพราะเป็นความผิดร้าน/ตกลงกันได้ (BR-BR-04)
 */
export const BUYER_FAULT_CANCEL_REASONS = [
  /** ที่พัก — ผู้จองไม่โอน */
  'BUYER_NO_TRANSFER',
  /** ทุก vertical — ลูกค้าขอยกเลิกเอง */
  'BUYER_REQUESTED',
  /** ขายออนไลน์ — ลูกค้าไม่โอนเงิน (เพิ่ม 2026-08-24 · เดิมไม่เคยถูกนับ) */
  'BUYER_NO_PAYMENT',
  /** ร้านบริการ — ลูกค้าไม่มาตามนัด (เพิ่ม 2026-08-24 · เดิมไม่เคยถูกนับ) */
  'BUYER_NO_SHOW',
] as const

export type BuyerFaultCancelReason = (typeof BUYER_FAULT_CANCEL_REASONS)[number]

/** allow-list + fail-closed — ค่าที่ไม่รู้จัก = ไม่นับ (ห้ามกลับด้านเป็น deny-list) */
export function cancelReasonIsBuyerFault(reason?: string | null): boolean {
  if (!reason) return false
  return (BUYER_FAULT_CANCEL_REASONS as readonly string[]).includes(reason)
}
