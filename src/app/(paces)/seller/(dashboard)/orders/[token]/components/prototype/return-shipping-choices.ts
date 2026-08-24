/**
 * 🧪 PROTOTYPE — throwaway (ดู README.md ในโฟลเดอร์นี้)
 *
 * แกนกลางของทั้ง 3 variants: ยุบ select 2 ตัวที่ขึ้นต่อกัน (`ใครออกค่าส่ง` × `เลขพัสดุขากลับ`)
 * ให้เหลือ **radio เดียว 4 ตัวเลือกที่เป็นภาษาคน**
 *
 * ทำไมถึงแก้ปัญหาได้จริง ไม่ใช่แค่เปลี่ยนหน้าตา: คู่ที่เป็นไปไม่ได้ (ลูกค้าออกค่าส่ง + ให้ระบบ
 * ออกเลข iShip — เพราะระบบตัดเครดิตของร้านเสมอ) **หายไปจากโครงสร้าง** ⇒ ไม่ต้องมีโค้ดสลับ
 * ตัวเลือกให้อัตโนมัติอีก ซึ่งเป็นพฤติกรรมที่ผู้ใช้เห็นแล้วอ่านเป็นบั๊ก ("กดอันนี้แล้วอีกอันเปลี่ยนเอง")
 */

import type { ReturnPayer, ReturnTrackingSource } from '@/lib/order-return'

export type ChoiceKey = 'SHOP_ISHIP' | 'SHOP_MANUAL' | 'BUYER_MANUAL' | 'BUYER_NONE'

export type ShippingChoice = {
  key: ChoiceKey
  /** พาดหัวสั้น — สิ่งที่ร้านกำลังตัดสินใจจริง ๆ */
  title: string
  /** ขยายความว่าเกิดอะไรขึ้นต่อจากนี้ (ไม่ใช่คำอธิบายศัพท์) */
  detail: string
  icon: string
  payer: ReturnPayer
  trackingSource: ReturnTrackingSource
  /** ต้องกรอกเลขพัสดุไหม */
  needsTracking: boolean
  /** ให้ร้านเลือกได้ไหมว่าจะนับเป็นต้นทุน (ร้านจ่ายเอง = บังคับนับ ถามไม่ได้) */
  costOptional: boolean
}

export const SHIPPING_CHOICES: ShippingChoice[] = [
  {
    key: 'SHOP_ISHIP',
    title: 'ร้านออกค่าส่งให้ — ให้ระบบออกเลขพัสดุ',
    detail: 'ระบบเปิดพัสดุขากลับให้เลย ตัดจากเครดิต iShip ของร้าน แล้วส่งใบปะหน้าให้ลูกค้าพิมพ์',
    icon: 'truck-return',
    payer: 'SHOP',
    trackingSource: 'ISHIP',
    needsTracking: false,
    costOptional: false,
  },
  {
    key: 'SHOP_MANUAL',
    title: 'ร้านออกค่าส่งให้ — ใช้ขนส่งเจ้าอื่น',
    detail: 'ร้านไปเปิดพัสดุเองที่ขนส่งเจ้าอื่น แล้วมากรอกเลขที่นี่',
    icon: 'package',
    payer: 'SHOP',
    trackingSource: 'MANUAL',
    needsTracking: true,
    costOptional: false,
  },
  {
    key: 'BUYER_MANUAL',
    title: 'ลูกค้าออกค่าส่งเอง — ส่งเลขพัสดุมาให้',
    detail: 'ลูกค้าส่งของเองแล้วแจ้งเลขพัสดุมา',
    icon: 'user-check',
    payer: 'BUYER',
    trackingSource: 'MANUAL',
    needsTracking: true,
    costOptional: true,
  },
  {
    key: 'BUYER_NONE',
    title: 'ลูกค้าออกค่าส่งเอง — ไม่มีเลขพัสดุ',
    detail: 'ลูกค้าส่งมาเองโดยไม่ได้แจ้งเลข — ยังปิดงานได้ตามปกติ',
    icon: 'help-circle',
    payer: 'BUYER',
    trackingSource: 'NONE',
    needsTracking: false,
    costOptional: true,
  },
]

export const choiceOf = (key: ChoiceKey): ShippingChoice =>
  SHIPPING_CHOICES.find((c) => c.key === key)!

/** รายการที่คืนได้ — shape เดียวกับที่ API จริงคืนมา */
export type ProtoItem = {
  orderItemId: string
  name: string
  orderedQty: number
  remainingQty: number
  unitPrice: number
}

export type ProtoDraft = {
  qty: Record<string, number>
  choice: ChoiceKey | null
  manualCourier: string
  manualTrackingNo: string
  countAsCost: boolean
  reason: string
}

export const emptyDraft: ProtoDraft = {
  qty: {},
  choice: null,
  manualCourier: '',
  manualTrackingNo: '',
  countAsCost: false,
  reason: '',
}

export const draftTotal = (d: ProtoDraft, items: ProtoItem[]): number =>
  items.reduce((sum, i) => sum + (d.qty[i.orderItemId] ?? 0) * i.unitPrice, 0)

export const draftCount = (d: ProtoDraft): number =>
  Object.values(d.qty).reduce((a, b) => a + b, 0)

/** พร้อมกดยืนยันหรือยัง — เกณฑ์เดียวใช้ทั้ง 3 variants (ไม่งั้นเทียบกันไม่ได้) */
export const draftReady = (d: ProtoDraft, items: ProtoItem[]): boolean => {
  if (draftCount(d) === 0) return false
  if (!d.choice) return false
  const c = choiceOf(d.choice)
  if (c.needsTracking && d.manualTrackingNo.trim() === '') return false
  return items.length > 0
}
