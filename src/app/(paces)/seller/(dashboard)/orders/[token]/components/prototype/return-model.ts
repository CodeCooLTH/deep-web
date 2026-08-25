/** 🧪 PROTOTYPE — throwaway (ดู README.md) · โมเดลร่วมของทั้ง 3 variants */

export type MethodKey = 'ISHIP' | 'SHOP_SELF' | 'BUYER_SELF'

export const METHODS: {
  key: MethodKey
  title: string
  detail: string
  icon: string
  /** ต้องกรอกขนส่ง/เลขพัสดุไหม */
  needsCarrier: boolean
  /** ร้านเลือกได้ไหมว่าจะนับเป็นต้นทุน (ร้านจ่ายเอง = บังคับนับ) */
  costOptional: boolean
  /** สรุปสั้นเรื่องเงิน — โชว์ตรง ๆ เพราะนี่คือสิ่งที่ต่างกันจริงระหว่างข้อ 2 กับ 3 */
  money: string
}[] = [
  {
    key: 'ISHIP',
    title: 'ส่งด้วย iShip',
    detail: 'ระบบออกเลขพัสดุขากลับให้ แล้วได้ใบปะหน้าส่งให้ลูกค้าพิมพ์',
    icon: 'truck-return',
    needsCarrier: false,
    costOptional: false,
    money: 'ตัดจากเครดิตร้าน',
  },
  {
    key: 'SHOP_SELF',
    title: 'ร้านส่งเอง',
    detail: 'ร้านไปเปิดพัสดุที่ขนส่งเจ้าอื่น แล้วมากรอกเลขที่นี่',
    icon: 'building-store',
    needsCarrier: true,
    costOptional: false,
    money: 'เป็นต้นทุนร้าน',
  },
  {
    key: 'BUYER_SELF',
    title: 'ลูกค้าส่งเอง',
    detail: 'ลูกค้าออกค่าส่งและส่งกลับมาเอง',
    icon: 'user',
    needsCarrier: true,
    costOptional: true,
    money: 'ลูกค้าออกค่าส่ง',
  },
]

export const methodOf = (k: MethodKey) => METHODS.find((m) => m.key === k)!

/** รายชื่อขนส่ง — ของจริงจะดึงจาก `COURIER_BRANDS` ใน `src/lib/iship/courier.ts` */
export const CARRIERS = [
  'Flash Express',
  'Kerry Express',
  'ไปรษณีย์ไทย',
  'J&T Express',
  'SPX Express',
  'BEST Express',
  'DHL',
  'Fuze Post',
]

export type ProtoItem = {
  orderItemId: string
  name: string
  orderedQty: number
  remainingQty: number
  unitPrice: number
}

export type Draft = {
  method: MethodKey
  carrier: string
  trackingNo: string
  countAsCost: boolean
  reason: string
  qty: Record<string, number>
}

/**
 * ค่าตั้งต้น — จงใจเลือก `ISHIP` ไว้ให้แล้ว
 *
 * ทั้ง 3 variants ใช้ค่าตั้งต้นเดียวกันเพื่อให้เทียบกันได้ แต่มันสำคัญกับ C ที่สุด:
 * C ตั้งอยู่บนสมมติฐานว่า "เคสที่พบบ่อยควรกดยืนยันได้เลยโดยไม่ต้องตอบอะไร"
 */
export const emptyDraft = (items: ProtoItem[]): Draft => ({
  method: 'ISHIP',
  carrier: '',
  trackingNo: '',
  countAsCost: false,
  reason: '',
  // ของชิ้นเดียวคือเคสที่พบบ่อยที่สุด → เติม 1 ให้เลยเมื่อมีรายการเดียว
  qty: items.length === 1 && items[0] ? { [items[0].orderItemId]: 1 } : {},
})

export const draftCount = (d: Draft) => Object.values(d.qty).reduce((a, b) => a + b, 0)

export const draftTotal = (d: Draft, items: ProtoItem[]) =>
  items.reduce((s, i) => s + (d.qty[i.orderItemId] ?? 0) * i.unitPrice, 0)

/** เกณฑ์ "กดยืนยันได้" เดียวกันทั้ง 3 variants — ไม่งั้นเทียบกันไม่ได้ */
export const draftReady = (d: Draft) => {
  if (draftCount(d) === 0) return false
  const m = methodOf(d.method)
  // เลขพัสดุ "ไม่มีก็เว้นว่างได้" ตามที่เสนอในม็อกอัพ — ไม่บล็อก
  return m.needsCarrier ? true : true
}

/**
 * 🧪 ของปลอมสำหรับตอนออเดอร์นั้นคืนไม่ได้จริง (ยังไม่ส่ง/ยกเลิก/คืนครบแล้ว)
 *
 * prototype ตอบคำถาม "กล่องควรเป็นรูปอะไร" — การบังคับให้ไปหาออเดอร์ที่ของถึงมือลูกค้าแล้ว
 * ก่อนถึงจะดูดีไซน์ได้ คือด่านที่ไม่เกี่ยวกับคำถามเลย · ของจริงมาก่อนเสมอถ้ามี
 */
export const PROTO_DEMO_ITEMS: ProtoItem[] = [
  { orderItemId: 'demo-1', name: 'ไฟหน้า LED H4 6000K (ตัวอย่าง)', orderedQty: 2, remainingQty: 2, unitPrice: 1290 },
  { orderItemId: 'demo-2', name: 'บัลลาสต์ Xenon 35W (ตัวอย่าง)', orderedQty: 1, remainingQty: 1, unitPrice: 890 },
]
