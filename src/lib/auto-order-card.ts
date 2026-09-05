// auto-order-card — ตรรกะล้วนของ "การ์ดผลลัพธ์ใบนี้ต้องแสดงอะไร" (00061 หน้า B)
//
// 🛑 แยกออกจาก JSX โดยตั้งใจ: เกณฑ์ที่ตัดสินว่าการ์ดขึ้นสถานะไหน / ข้อความ "ยอดรวมไม่ตรง"
// พูดว่าอะไร เป็นตรรกะที่พังเงียบได้ (เขียนกลับด้านแล้วยังคอมไพล์ผ่านและหน้าตายังดูปกติ)
// ⇒ ต้องมีที่ให้เทสจับ ไม่ใช่เทอร์นารีกลาง JSX (ui-boolean-needs-a-testable-home.md)

import type { DraftReasonCode } from '@/lib/auto-order-reasons'

export type AutoOrderCardState = 'READING' | 'CREATED' | 'DRAFT' | 'SYSTEM_FAILED' | 'DISCARDED'

export type AutoOrderCardInput = {
  /** `null` = การ์ดถูกเขียนก่อนรู้ผล (ยังไม่มีแถว Order ผูก) */
  order: {
    status: string
    draftReasons: string[]
    isDryRun: boolean
  } | null
}

/**
 * สถานะที่การ์ดต้องแสดง
 *
 * 🛑 `SYSTEM_FAILED` แยกจาก `DRAFT` โดยตั้งใจ — เหตุผลเชิงเนื้อหา 8 ข้อสื่อว่า *"คุณพิมพ์
 * ไม่ครบ แก้ได้"* แต่ `PROCESSING_FAILED` สื่อว่า *"ระบบมีปัญหา ไม่ใช่ความผิดใคร"*
 * ใช้หน้าตาเดียวกันแล้วผู้ขายจะไปแก้เทมเพลตที่ถูกอยู่แล้ววนไปเรื่อย ๆ
 *
 * 🛑 `DISCARDED` ต้องมี — ร่างที่ถูกทิ้ง/หมดอายุจะกลายเป็น `CANCELLED` แล้วการ์ดยังอยู่ในเธรด
 * ถ้าไม่มีสถานะนี้ การ์ดจะตกไปสาขา DRAFT แล้วโชว์ปุ่ม "แก้ไข/ทิ้งร่าง" ของสิ่งที่ไม่มีอยู่แล้ว
 */
export function resolveAutoOrderCardState(input: AutoOrderCardInput): AutoOrderCardState {
  const o = input.order
  if (!o) return 'READING'
  if (o.status === 'DRAFTED') {
    return o.draftReasons.includes('PROCESSING_FAILED') ? 'SYSTEM_FAILED' : 'DRAFT'
  }
  if (o.status === 'CANCELLED') return 'DISCARDED'
  return 'CREATED'
}

/** สีแถบซ้ายของการ์ด — accent เดียวที่บอกผลลัพธ์โดยไม่ต้องอ่านตัวหนังสือ */
export function autoOrderCardAccent(state: AutoOrderCardState): string {
  switch (state) {
    case 'CREATED':
      // 🛑 น้ำเงินไม่ใช่เขียว — Verified-Means-Green สงวนให้ "ผู้ซื้อยืนยันแล้ว"
      // ออเดอร์ที่เพิ่งสร้างยังเป็น PENDING ลูกค้ายังไม่ได้ยืนยันอะไรทั้งนั้น
      return 'border-s-primary'
    case 'DRAFT':
      return 'border-s-warning'
    case 'SYSTEM_FAILED':
    case 'DISCARDED':
    case 'READING':
      // สีกลาง — ทั้งสามกรณีไม่ใช่ความผิดของผู้ขาย (น้ำเสียง: อธิบายเหตุ ไม่กล่าวหา)
      return 'border-s-default-300'
  }
}

export type DraftRawItem = { rawName: string; productId: string | null; qty: number; price: number | null }

/**
 * ข้อความของเหตุผล "ยอดรวมไม่ตรง" — ต้องบอก **ส่วนต่าง** เป็นตัวเด่น (BR-ACO-17)
 *
 * 🛑 สิ่งที่ร้านต้องรู้ทันทีคือ "ห่างกันแค่ไหน" ไม่ใช่ต้องมานั่งลบเอง — ตัวเลขดิบสองตัว
 * มีไว้อ้างอิงตอนเทียบกับที่คุยในแชท ไม่ใช่ตัวเด่นของบรรทัด
 */
export function describeTotalMismatch(stated: number, computed: number) {
  const diff = Math.abs(stated - computed)
  return {
    headline: `ยอดรวมไม่ตรง — ต่างกัน ฿${diff.toLocaleString('th-TH')}`,
    detail: `(พิมพ์ ฿${stated.toLocaleString('th-TH')} / คำนวณได้ ฿${computed.toLocaleString('th-TH')})`,
  }
}

/**
 * ที่อยู่ขาดอะไรบ้าง — คืนคำที่เอาไปต่อท้าย "ที่อยู่ไม่ครบ" ได้เลย
 *
 * 🛑 ขาด 1 ส่วน = ระบุชื่อส่วนนั้น · ขาด ≥2 ส่วน = บอกจำนวน ไม่แจกแจง
 * (งบพื้นที่ต่อบรรทัดที่ 320px ≈ 32 ตัวอักษรไทย — แจกแจง 3 ส่วนแล้วตกบรรทัดที่ 3)
 */
export function describeMissingAddressParts(address: {
  line1?: string | null
  province?: string | null
  postcode?: string | null
} | null): string {
  const missing: string[] = []
  if (!address?.line1?.trim()) missing.push('ที่อยู่')
  if (!address?.province?.trim()) missing.push('จังหวัด')
  if (!address?.postcode?.trim()) missing.push('รหัสไปรษณีย์')
  if (missing.length === 0) return ''
  if (missing.length === 1) return ` — ขาด${missing[0]}`
  return ` — ขาด ${missing.length} ส่วน`
}

/**
 * ลำดับที่เหตุผลต้องเรียงบนการ์ด — **เดินตามลำดับช่องในฟอร์มสร้างออเดอร์**
 *
 * 🛑 วันที่อยู่ **ตำแหน่งที่ 3 ก่อนรายการสินค้า** ยืนยันกับ `QuickForm.tsx` แล้ว —
 * ร่างแรกของ ux วางไว้ท้ายสุดด้วยสมมติฐานว่า "วันที่มักอยู่ท้ายฟอร์ม" ซึ่งไม่จริง
 * ถ้าใช้ลำดับนั้น ผู้ขายจะไล่แก้จากบนลงล่างแล้วข้ามช่องวันที่ไปโดยไม่รู้ตัว
 */
export const CARD_REASON_ORDER: DraftReasonCode[] = [
  'NO_PHONE',
  'INVALID_PHONE',
  'ADDRESS_INCOMPLETE',
  'DATE_OUT_OF_WINDOW',
  'NO_ITEMS',
  'ITEM_PRICE_MISSING',
  'ITEM_NOT_MATCHED',
  'TOTAL_MISMATCH',
  'PROCESSING_FAILED',
]

export function sortCardReasons(reasons: string[]): DraftReasonCode[] {
  return [...reasons]
    .filter((r): r is DraftReasonCode => (CARD_REASON_ORDER as string[]).includes(r))
    .sort((a, b) => CARD_REASON_ORDER.indexOf(a) - CARD_REASON_ORDER.indexOf(b))
}
