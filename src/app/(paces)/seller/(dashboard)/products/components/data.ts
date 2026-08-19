import { PRODUCT_TYPES } from '@/lib/product-types/registry'
export type ProductRow = {
  id: string
  name: string
  description: string
  image: string
  price: number
  /** ราคาทุน (feature 00016) — null = ยังไม่เคยตั้ง ซึ่งต่างจาก 0 ที่แปลว่า "ไม่มีต้นทุนจริง"
   *  UI ต้องแสดง null เป็น "—" ห้ามเป็น ฿0/0% (FR-EXP-15-AC-02) */
  cost: number | null
  type: 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'SUBSCRIPTION'
  isActive: boolean
  totalSold: number
  reviews: number
  rating: number
  /** ISO string — แปลงจาก Date ที่ server boundary ก่อนส่ง prop มา client */
  createdAt: string
  /** feature 00013 Pin Products — ISO string ถ้าปักหมุดอยู่, null ถ้าไม่ได้ปักหมุด */
  pinnedAt: string | null
}

/**
 * isMissingCost — "สินค้าตัวนี้ยังไม่ตั้งต้นทุน" (feature 00016 ส่วนขยาย)
 *
 * มีที่เดียวเพราะเงื่อนไขนี้ถูกใช้ 4 ที่ที่ต้องตรงกันเสมอ: ตัวนับบนชิปมือถือ · ตัวกรองมือถือ ·
 * ตัวนับบน dropdown เดสก์ท็อป · filterFn ของคอลัมน์ในตาราง — ถ้าเขียน `cost === null` ซ้ำ 4 รอบ
 * วันที่นิยามเปลี่ยน (เช่นวันหนึ่งตัดสินว่า 0 ก็นับว่ายังไม่ตั้ง) จะมีที่ที่ลืมแก้แน่นอน
 * แล้วตัวเลขบนชิปกับจำนวนแถวที่กรองได้จะไม่ตรงกันโดยไม่มีอะไรฟ้อง
 *
 * นิยาม: null = ยังไม่เคยตั้ง · 0 = ตั้งแล้วว่าไม่มีต้นทุน (คนละเรื่องกัน ห้ามยุบรวม)
 */
export const isMissingCost = (p: Pick<ProductRow, 'cost'>) => p.cost === null

/**
 * PRODUCT_TYPE_LABELS / PRODUCT_TYPE_ICONS — SSOT ป้าย+ไอคอนประเภทสินค้า
 * (ย้ายจาก ProductsListing.tsx มาไว้กลาง ป้องกัน drift แบบเดียวกับ SALES_CHANNEL_LABELS/ICONS
 * ใน orders/components/data.ts) — ใช้ร่วมกันทั้งตาราง desktop, การ์ดมือถือ, และตัวเลือกในโมดัลตัวกรอง
 */
export const PRODUCT_TYPE_LABELS: Record<ProductRow['type'], string> = {
  PHYSICAL: 'สินค้าจับต้องได้',
  DIGITAL: 'ดิจิทัล',
  SERVICE: 'บริการ',
  SUBSCRIPTION: 'สมาชิก/รอบ',
}

/**
 * ไอคอนชุดเดียวกับ stat cards ใน products/page.tsx
 *
 * 🛑 **derive จาก `PRODUCT_TYPES` ไม่ประกาศค่าซ้ำ** (Hard Rule 16) — เดิมเป็นตารางค่าคงที่
 * ของตัวเอง ขณะที่ registry ถือสัญลักษณ์ของตัวเองอีกชุด ⇒ ประเภทเดียวกันมีสัญลักษณ์ 2 แบบ
 * คนละหน้าจอ (ตาราง/การ์ดเห็นไอคอน · ตัวเลือกในฟอร์มเห็น emoji) โดยไม่มีอะไรฟ้อง
 */
export const PRODUCT_TYPE_ICONS: Record<ProductRow['type'], string> = {
  PHYSICAL: PRODUCT_TYPES.PHYSICAL.icon,
  DIGITAL: PRODUCT_TYPES.DIGITAL.icon,
  SERVICE: PRODUCT_TYPES.SERVICE.icon,
  SUBSCRIPTION: PRODUCT_TYPES.SUBSCRIPTION.icon,
}
