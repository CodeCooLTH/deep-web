// pricing.ts — ราคาค่าตรวจ + เวอร์ชันเงื่อนไข ที่เดียวของทั้งฟีเจอร์ (feature 00060 · T4)
//
// 🛑 **ตัวเลขในไฟล์นี้ยังเป็นร่าง ยังไม่มีมติ** (PRD §10.2 · A-4 · OQ-1) — ห้ามคัดลอกไปเขียน
//    ซ้ำที่อื่นเด็ดขาด ไม่ว่าจะในหน้าจอ เอกสาร หรือข้อความ toast เพราะวันที่ราคาถูกเคาะจริง
//    จุดที่ถูกลืมจะเก็บเงินคนละจำนวนกับที่หน้าจอบอก แล้วไม่มีอะไรฟ้อง (HR16)
//
// 🛑 **D-16 ย้ายฐานต้นทุนไปเป็น "ต่อที่พักหนึ่งหลัง" แล้ว** (3 ใน 4 ขั้นมีข้อตรวจที่ผูกรายหลัง)
//    ราคาต่อเดือนแบบเหมาต่อร้านข้างล่างนี้จึงยัง **ขาดทุนกับลูกค้ารายใหญ่ที่สุดอย่างเป็นระบบ**
//    โครงสร้างที่ถูกคือ "ฐานต่อร้าน + ต่อหลัง" ซึ่งยังไม่มีมติ ⇒ ตัวคูณจำนวนหลังยังไม่มีในไฟล์นี้
//    โดยเจตนา (ใส่ค่ามั่วไว้ก่อนจะกลายเป็นตัวเลขที่ถูกอ้างต่อว่า "ตัดสินแล้ว")

import type { InspectionStep } from './checks'

/**
 * 🛑 สวิตช์เดียวที่กั้นไม่ให้ราคาที่ยังไม่เคาะถูกเรียกเก็บจริง
 *
 * ตั้ง `false` **หลัง** มีมติราคาเท่านั้น การแก้ค่านี้ต้องเป็นการกระทำที่ตั้งใจและเห็นได้ใน diff
 * ไม่ใช่ผลข้างเคียงของงานอื่น
 */
export const INSPECTION_PRICING_IS_DRAFT = true

/** ราคาต่อเดือน (บาท จำนวนเต็ม) — ร่างจาก PRD §10.2 */
export const INSPECTION_MONTHLY_PRICE_BAHT: Record<InspectionStep, number> = {
  1: 99,
  2: 299,
  3: 599,
  4: 999,
}

/** ค่าแรกเข้าครั้งเดียวตอนเข้าขั้นนั้นครั้งแรก — มีเฉพาะขั้น 4 (ค่าเดินทาง/ลงพื้นที่ครั้งแรก) */
export const INSPECTION_SETUP_FEE_BAHT: Record<InspectionStep, number> = {
  1: 0,
  2: 0,
  3: 0,
  4: 3900,
}

/**
 * เวอร์ชันข้อความเงื่อนไขที่ผู้ใช้กดยอมรับ
 * 🛑 ต้องชี้ไฟล์ที่อ่านย้อนหลังได้จริงเสมอ — เวอร์ชันที่ย้อนไปอ่านข้อความไม่ได้ = ไม่มีเวอร์ชัน
 *    (มีเทส `[blocker]` ยืนยันว่าไฟล์นี้มีอยู่จริงบนดิสก์)
 */
export const INSPECTION_TERMS_VERSION = 'v1-2026-08-29'
export const INSPECTION_TERMS_PATH =
  'docs/20 - Features/00060 - Shop Inspection Plan/TERMS-v1-2026-08-29.md'

export class InspectionPricingDraftError extends Error {
  readonly code = 'PRICING_NOT_DECIDED'
  constructor() {
    super('PRICING_NOT_DECIDED')
    this.name = 'InspectionPricingDraftError'
  }
}

/**
 * ด่านกันเก็บเงินด้วยราคาร่างบนของจริง
 *
 * 🛑 PRD A-4 เขียนไว้ว่า "implement ได้แต่เปิดขายจริงไม่ได้จนกว่าจะมีมติ" — ประโยคนั้นเป็น
 *    **กฎที่เขียนไว้** ซึ่งบังคับอะไรไม่ได้เลยด้วยตัวมันเอง คนที่ต่อหน้าจอเสร็จแล้ว deploy
 *    จะไม่มีอะไรมาห้าม และบั๊กจะปรากฏเป็น "เก็บเงินลูกค้าผิดจำนวน" ไม่ใช่ error
 *    (docs/conventions/rule-must-be-enforced-not-described.md)
 *
 * เลือกกั้นด้วย `NODE_ENV === 'production'` ไม่ใช่กั้นทุกที่ เพราะ dev/เทสต้องเดินเส้นทาง
 * เก็บเงินให้ครบเพื่อพิสูจน์ว่ามันถูก
 */
export function assertInspectionPricingDecided(): void {
  if (INSPECTION_PRICING_IS_DRAFT && process.env.NODE_ENV === 'production') {
    throw new InspectionPricingDraftError()
  }
}

/** ยอดที่เก็บตอนสมัครครั้งแรก = ค่าเดือนแรก + ค่าแรกเข้าของขั้นนั้น */
export function subscribeChargeBaht(step: InspectionStep): number {
  return INSPECTION_MONTHLY_PRICE_BAHT[step] + INSPECTION_SETUP_FEE_BAHT[step]
}

/** ยอดที่เก็บตอนต่ออายุอัตโนมัติ = ค่าเดือนอย่างเดียว (ค่าแรกเข้าเก็บครั้งเดียวตลอด) */
export function renewChargeBaht(step: InspectionStep): number {
  return INSPECTION_MONTHLY_PRICE_BAHT[step]
}

/**
 * ยอดที่เก็บตอนอัปเกรดขั้น
 *
 * 🛑 **สูตรนี้ยังไม่มีมติ (AC-INS-07-3 · OQ-1)** — ที่เขียนไว้คือ "ส่วนต่างค่าเดือน +
 *    ค่าแรกเข้าของขั้นใหม่ที่ยังไม่เคยจ่าย" ซึ่งเป็นสูตรที่ **ไม่คิดเงินซ้ำกับสิ่งที่จ่ายไปแล้ว**
 *    และรอบบิลไม่ถูกรีเซ็ต (`nextRenewalAt` เดิมคงอยู่) เพื่อไม่ให้การอัปเกรดกลางรอบ
 *    กลายเป็นการเก็บค่าเดือนสองครั้งในเดือนเดียว
 *
 *    ถ้ามติออกมาต่างจากนี้ **แก้ที่ฟังก์ชันนี้ฟังก์ชันเดียว** ห้ามไปแก้ที่ผู้เรียก
 */
export function upgradeChargeBaht(fromStep: InspectionStep, toStep: InspectionStep): number {
  const monthlyDiff = INSPECTION_MONTHLY_PRICE_BAHT[toStep] - INSPECTION_MONTHLY_PRICE_BAHT[fromStep]
  const setupDiff = INSPECTION_SETUP_FEE_BAHT[toStep] - INSPECTION_SETUP_FEE_BAHT[fromStep]
  // ทั้งสองส่วนตัดที่ 0 แยกกัน — ขั้นที่ค่าเดือนถูกลงแต่มีค่าแรกเข้า (ถ้าอนาคตมี) จะได้ไม่หักล้างกัน
  return Math.max(0, monthlyDiff) + Math.max(0, setupDiff)
}
