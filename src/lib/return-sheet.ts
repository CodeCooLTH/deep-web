/**
 * return-sheet — ตรรกะของ *จอ* คืนของที่ทดสอบได้โดยไม่ต้องมี DOM (feature 00056 · re-design 2026-08-25)
 *
 * pure module — ห้าม import prisma/server-only/react
 *
 * 🛑 **ทำไมไม่เขียนเป็นเทอร์นารีใน JSX**: เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม" แต่คือ
 * *"ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม"* (`docs/conventions/ui-boolean-needs-a-testable-home.md`)
 * ทุกฟังก์ชันในไฟล์นี้เขียนกลับด้านได้ง่ายมาก และผลลัพธ์คือ **ร้านเสียเงินจริง**:
 *   - แสดงราคาที่ยังไม่รู้เป็น ฿0 ⇒ ร้านคิดว่าส่งฟรี
 *   - ปล่อยให้กด "ถัดไป" ทั้งที่ขนส่งเจ้านั้นเปิดพัสดุไม่ได้ ⇒ ใบคืนค้างโดยออกเลขไม่ได้
 *   - โชว์ตัวเลือก iShip ให้ร้านที่ยังไม่เชื่อม ⇒ กดแล้วตายที่ปลายทางโดยไม่มีทางแก้จากจอนี้
 */

import { RETURN_METHODS, type ReturnMethodKey, type ReturnMethodOption } from './order-return'

/**
 * selectableReturnMethods — วิธีที่ร้าน "กดได้จริง" ณ ตอนนี้
 *
 * 🛑 ร้านที่ยังไม่เชื่อม iShip ต้อง **ไม่เห็นข้อแรกเลย ไม่ใช่เห็นแล้วกดไม่ได้** — ยกแพตเทิร์นจาก
 * `ShipmentEntryModal.tsx` (`showSegmented`) ซึ่งเป็นพี่น้องในโดเมนเดียวกันและซ่อนทั้งชุด
 * ไม่ใช่ disable (`docs/conventions/sibling-surface-parity.md`) · ตัวเลือกที่กดไม่ได้แต่ยัง
 * อยู่บนจอคือคำเชิญให้กดสิ่งที่ไม่มีวันสำเร็จ
 *
 * คืนอย่างน้อย 2 ข้อเสมอ — ทั้ง `SHOP_SELF` และ `BUYER_SELF` ไม่ต้องพึ่ง iShip เลย
 */
export function selectableReturnMethods(ishipConnected: boolean): ReturnMethodOption[] {
  if (ishipConnected) return RETURN_METHODS
  return RETURN_METHODS.filter((m) => m.key !== 'ISHIP')
}

/**
 * methodUsesIship — วิธีนี้ให้ *ระบบ* เปิดพัสดุไหม
 *
 * ตัวตัดสินว่าจอจะโชว์ "ค่าส่งโดยประมาณ + แก้ขนาดกล่อง" (ระบบเป็นคนจ่ายและเป็นคนเปิด)
 * หรือ "ช่องเลขพัสดุ" (ร้าน/ลูกค้าไปเปิดเอง แล้วมาบันทึกไว้เฉย ๆ)
 *
 * 🛑 อ่านจาก `sourceWithTracking === null` ไม่ใช่เทียบ `key === 'ISHIP'` — คีย์เป็นชื่อ
 * ส่วนสิ่งที่ตัดสินจริงคือ "วิธีนี้รับเลขที่กรอกเองไหม" ซึ่งเป็นคุณสมบัติที่ประกาศไว้แล้ว
 * (เพิ่มวิธีที่ 4 ที่ระบบออกเลขให้ในอนาคต จอจะทำถูกเองโดยไม่ต้องแก้ที่นี่)
 */
export function methodUsesIship(key: ReturnMethodKey): boolean {
  return RETURN_METHODS.find((m) => m.key === key)?.sourceWithTracking === null
}

/**
 * ReturnPriceState — สถานะของ "ค่าส่งขากลับโดยประมาณ"
 *
 * 🛑 มี 6 สถานะ ไม่ใช่ 2 — และ **ห้ามยุบ 4 สถานะที่ไม่มีตัวเลขให้เป็น ฿0**
 * เลข 0 อ่านว่า "ส่งฟรี" ซึ่งเป็นข้อเท็จจริงคนละเรื่องกับ "ยังไม่รู้"
 * (`docs/conventions/partial-data-must-be-labeled-or-filled.md` — ค่าส่งวันที่ 9 ขึ้น ฿328.88
 * จาก 31 ออเดอร์ เพราะมีราคาจริงแค่ 7 ใบ เลขถูกทุกบาทตามข้อมูลที่มี)
 */
export type ReturnPriceState =
  /** วิธีนี้ร้าน/ลูกค้าไปเปิดพัสดุเอง — เราไม่มีราคาให้ และไม่ควรเดาแทน */
  | { kind: 'HIDDEN' }
  /** ยังไม่รู้ขนาดกล่อง (พัสดุขาไปไม่ได้เปิดผ่าน iShip) — ประเมินไม่ได้จนกว่าจะกรอก */
  | { kind: 'NO_PARCEL' }
  | { kind: 'LOADING' }
  | { kind: 'ERROR'; text: string }
  /** ขนส่งเจ้าที่เลือกไม่มีราคาให้เส้นทางนี้ — ไม่ใช่ "ส่งฟรี" */
  | { kind: 'NO_QUOTE' }
  | { kind: 'PRICE'; amount: number }

export type QuoteRow = { courierCode: string; courierName: string; totalPrice: number }

export type ReturnPriceInput = {
  method: ReturnMethodKey | null
  /** รู้ขนาดกล่องแล้วหรือยัง (ของขาไป หรือที่ร้านกรอกเอง) */
  hasBox: boolean
  loading: boolean
  /** ข้อความ error จาก `/return-quote` — null = ไม่มี */
  error: string | null
  /** ผลราคาที่โหลดมาแล้ว — null = ยังไม่เคยโหลดสำเร็จ */
  rows: QuoteRow[] | null
  /** รหัสขนส่งขากลับที่เลือกอยู่ */
  courierCode: string | null
}

/**
 * resolveReturnPriceState — จอควรแสดงอะไรตรงแถว "ค่าส่งโดยประมาณ"
 *
 * ลำดับของด่านมีความหมาย:
 *   1. ไม่ใช่วิธีที่ระบบเปิดพัสดุ → ไม่มีแถวนี้เลย (ไม่ใช่ "ราคา 0")
 *   2. ไม่รู้ขนาดกล่อง → บอกให้กรอกกล่อง **ก่อน** พูดถึงราคา (ราคาไม่มีทางมาได้)
 *   3. กำลังโหลด → ชนะ error เก่า ไม่งั้นเปลี่ยนขนส่งแล้วยังเห็น error ของเจ้าก่อนหน้าค้าง
 *   4. error → บอกเหตุผลจริง
 *   5. มีราคาของเจ้าที่เลือก → แสดงตัวเลข
 *   6. ที่เหลือ → NO_QUOTE (รวมกรณีโหลดสำเร็จแต่เจ้านี้ไม่อยู่ในผล)
 */
export function resolveReturnPriceState(input: ReturnPriceInput): ReturnPriceState {
  if (!input.method || !methodUsesIship(input.method)) return { kind: 'HIDDEN' }
  if (!input.hasBox) return { kind: 'NO_PARCEL' }
  if (input.loading) return { kind: 'LOADING' }
  if (input.error) return { kind: 'ERROR', text: input.error }
  const row = input.courierCode
    ? (input.rows ?? []).find((r) => r.courierCode === input.courierCode)
    : undefined
  // 🛑 `totalPrice <= 0` = ขนส่งไม่รองรับเส้นทางนี้ ไม่ใช่ส่งฟรี (เคสจริง prod 2026-08-06:
  // Fuze Post ตอบ 0 แล้วชนะ "ถูกที่สุด" ทั้งที่ใช้ส่งจริงไม่ได้) — ฝั่ง server กรองแล้ว
  // แต่กันซ้ำที่นี่เพราะจอเป็นคนพูดคำว่า "฿" ออกไป
  if (row && row.totalPrice > 0) return { kind: 'PRICE', amount: row.totalPrice }
  return { kind: 'NO_QUOTE' }
}

/** คำที่ผู้ใช้เห็นในแต่ละสถานะที่ **ไม่มีตัวเลข** — SSOT เดียว ห้ามพิมพ์ซ้ำที่จอ (HR16) */
export const RETURN_PRICE_TEXT: Record<'NO_PARCEL' | 'LOADING' | 'NO_QUOTE', string> = {
  NO_PARCEL: 'ยังไม่รู้ขนาดกล่องของขาไป — กรอกขนาดก่อนถึงจะประเมินราคาได้',
  LOADING: 'กำลังประเมินค่าส่ง…',
  NO_QUOTE: 'ขนส่งเจ้านี้ยังไม่มีราคาให้เส้นทางนี้ — ลองเปลี่ยนขนส่งขากลับ',
}

export type MethodStepBlock = 'NO_METHOD' | 'NO_PARCEL' | 'NO_QUOTE' | 'QUOTE_ERROR'

export const METHOD_STEP_BLOCK_TEXT: Record<MethodStepBlock, string> = {
  NO_METHOD: 'เลือกวิธีส่งของกลับก่อน',
  NO_PARCEL: RETURN_PRICE_TEXT.NO_PARCEL,
  NO_QUOTE: RETURN_PRICE_TEXT.NO_QUOTE,
  QUOTE_ERROR: 'ประเมินค่าส่งขากลับไม่สำเร็จ — เปลี่ยนขนส่ง หรือเลือกวิธีที่ร้าน/ลูกค้าส่งเอง',
}

/**
 * methodStepBlock — กด "ถัดไป" จากขั้นเลือกวิธีได้ไหม · `null` = ได้
 *
 * 🛑 บล็อกเฉพาะตอนที่ *เดินต่อไปแล้วจะล้มจริง* ไม่ใช่ตอนที่ข้อมูลยังไม่ครบสวยงาม —
 * ราคาที่ยังโหลดไม่เสร็จไม่ได้ทำให้ใบคืนเปิดไม่ได้ (ราคาเป็นข้อมูลประกอบ ไม่ใช่เงื่อนไข)
 * แต่ขนส่งที่ไม่มีราคาให้เส้นทางนี้ = เปิดพัสดุไม่ผ่านแน่นอน ⇒ บล็อกพร้อมบอกทางแก้
 *
 * 🛑 วิธีที่ร้าน/ลูกค้าส่งเอง **ไม่มีอะไรบล็อกได้เลยนอกจาก "ยังไม่เลือกวิธี"** — เลขพัสดุ
 * เว้นว่างได้ (D-4) และเราไม่ได้เป็นคนเปิดพัสดุ ห้ามเอาเงื่อนไขของ iShip ไปบังคับกับมัน
 */
export function methodStepBlock(
  method: ReturnMethodKey | null,
  price: ReturnPriceState,
): MethodStepBlock | null {
  if (!method) return 'NO_METHOD'
  if (price.kind === 'NO_PARCEL') return 'NO_PARCEL'
  if (price.kind === 'NO_QUOTE') return 'NO_QUOTE'
  if (price.kind === 'ERROR') return 'QUOTE_ERROR'
  return null
}

/**
 * defaultReturnCourier — ขนส่งขากลับที่ควรถูกเลือกไว้ให้ (D-5 "ตั้งต้น = เจ้าเดียวกับขาไป")
 *
 * ISHIP: ต้องเป็น **รหัสแพ็กเกจจริง** ที่ร้านมีในบัญชี iShip ⇒ หยิบจากผลราคาเท่านั้น
 *   เจ้าเดียวกับขาไปก่อน → ไม่มีก็เจ้าที่ถูกที่สุด (`rows` เรียงถูก→แพงมาแล้วจาก server)
 * วิธีอื่น: เป็น **รหัสแบรนด์** จาก `COURIER_OPTIONS` ซึ่งผู้เรียกส่ง `brandFallback` มาให้
 *
 * 🛑 คืน `null` ได้ และนั่นคือค่าที่ถูก — ห้ามถอยไปหยิบเจ้าแรกในลิสต์แบบสุ่ม เพราะ
 * ค่าที่ถูกเลือกไว้ให้จะกลายเป็นค่าที่ถูกบันทึกจริงถ้าร้านไม่แตะ dropdown เลย
 */
export function defaultReturnCourier(input: {
  method: ReturnMethodKey
  forwardCourierCode: string | null
  rows: QuoteRow[] | null
  brandFallback: string | null
}): string | null {
  if (methodUsesIship(input.method)) {
    const rows = input.rows ?? []
    if (rows.length === 0) return null
    const same = input.forwardCourierCode
      ? rows.find((r) => r.courierCode === input.forwardCourierCode)
      : undefined
    return (same ?? rows[0])!.courierCode
  }
  return input.brandFallback
}
