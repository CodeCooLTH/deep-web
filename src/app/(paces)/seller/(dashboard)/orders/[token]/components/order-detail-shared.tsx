/**
 * ชิ้นส่วนที่การ์ดหลายใบของหน้า order detail ใช้ร่วมกัน
 *
 * แยกออกมาตอนรื้อหน้าเป็นโครงธีม Paces (2026-08-05) — เดิมทุกอย่างอยู่ใน OrderFactsCard.tsx
 * ใบเดียว พอแตกเป็น 5 การ์ดตามธีมแล้ว type/helper พวกนี้มีผู้ใช้มากกว่า 1 ที่ ถ้าปล่อยให้แต่ละ
 * การ์ดเขียนเอง สูตรคิดเงินจะเพี้ยนกันเองวันใดวันหนึ่งโดยไม่มีอะไรเตือน
 */

import Image from 'next/image'
import Icon from '@/components/wrappers/Icon'

export type ShippingAddressData = {
  line1?: string | null
  subdistrict?: string | null
  district?: string | null
  province?: string | null
  postcode?: string | null
  note?: string | null
}

export type OrderFactsBuyer = {
  /** เบอร์/อีเมลผู้ซื้อ (เต็ม) — user decision 2026-07-30: ร้านต้องกดโทรหาลูกค้าได้ */
  buyerContact: string | null
  buyerDisplayName: string | null
  buyerUsername: string | null
  /** ชื่อที่ร้านบันทึกตอนสร้างออเดอร์ (ผู้ซื้ออาจยังไม่ลงทะเบียน) */
  buyerName: string | null
  /** avatar URL (Facebook CDN / null) — ไม่ใช่ PII เพราะเป็น URL สาธารณะ */
  avatar: string | null
  shippingAddr: ShippingAddressData | null
}

export type OrderFactsItem = {
  id: string
  name: string
  description?: string | null
  qty: number
  price: unknown
  /** resolve ที่ server จาก product.images[0] — null = ใช้ placeholder */
  imageUrl: string | null
}

export type OrderFactsShipping = {
  courier: string
  trackingNo: string
  /** ISO string — ที่มา OrderShipment.createdAt หรือ ShipmentTracking.createdAt */
  shippedAtISO: string | null
  /** true = พัสดุมาจาก iShip (ระบบสร้างให้) · false = ร้านกรอกเอง */
  isIship?: boolean
}

export function formatAmount(amount: unknown) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(Number(amount))
}

/** Decimal|null → number (null/NaN → 0) — ใช้ตัดสินว่าแถวไหนใน breakdown ควรโผล่ */
export function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export type BreakdownRow = {
  key: string
  label: string
  value: number
  show: boolean
  tone?: 'danger'
  prefix?: string
  emphasis?: boolean
}

/**
 * breakdown array เดียว ใช้ทั้งมือถือและเดสก์ท็อปผ่าน .map()
 * ห้ามเขียน JSX คำนวณ label/value ซ้ำ 2 ชุด (ของเดิมเคยมีปัญหานี้แล้วตัวเลข 2 จอไม่ตรงกัน)
 */
export function buildBreakdown(params: {
  subtotal: number
  discount: number
  vatAmount: number
  vatPct: number
  total: number
}): BreakdownRow[] {
  const { subtotal, discount, vatAmount, vatPct, total } = params
  return [
    { key: 'subtotal', label: 'ยอดสินค้า', value: subtotal, show: true },
    { key: 'discount', label: 'ส่วนลด', value: discount, show: discount > 0, tone: 'danger' as const, prefix: '- ' },
    { key: 'vat', label: `VAT${vatPct > 0 ? ` ${vatPct}%` : ''}`, value: vatAmount, show: vatAmount > 0 },
    { key: 'total', label: 'ยอดรวมทั้งหมด', value: total, show: true, emphasis: true },
  ].filter((r) => r.show)
}

/** Thumbnail สินค้า — ใช้ร่วมกันทั้งรายการมือถือและตารางเดสก์ท็อป */
export function ItemThumbnail({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  if (imageUrl) {
    return (
      <Image alt={name} className="size-14 shrink-0 rounded-lg object-cover" height={56} src={imageUrl} width={56} />
    )
  }
  return (
    <div className="bg-default-100 flex size-14 shrink-0 items-center justify-center rounded-lg">
      <Icon icon="photo" className="text-default-400 size-6" />
    </div>
  )
}

/** ชื่อผู้ซื้อที่จะแสดง — ลงทะเบียนแล้วมาก่อน แล้วค่อยชื่อที่ร้านบันทึกเอง */
export function resolveBuyerNames(buyer: OrderFactsBuyer) {
  const registeredName = buyer.buyerDisplayName || buyer.buyerUsername || null
  const displayName = registeredName || buyer.buyerName || null
  return { registeredName, displayName, hasBuyerInfo: Boolean(buyer.buyerContact || displayName) }
}
