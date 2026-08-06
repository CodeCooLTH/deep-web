export type ProductRow = {
  id: string
  name: string
  description: string
  image: string
  price: number
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

// ไอคอนชุดเดียวกับ stat cards ใน products/page.tsx — ใช้ชื่อเดิมซ้ำ ไม่ตั้งใหม่
export const PRODUCT_TYPE_ICONS: Record<ProductRow['type'], string> = {
  PHYSICAL: 'box',
  DIGITAL: 'device-laptop',
  SERVICE: 'tools',
  SUBSCRIPTION: 'repeat',
}
