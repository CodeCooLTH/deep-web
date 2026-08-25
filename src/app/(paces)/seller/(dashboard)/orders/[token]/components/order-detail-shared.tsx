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

/**
 * Thumbnail สินค้า — ใช้ร่วมกันทั้งรายการมือถือและตารางเดสก์ท็อป
 *
 * `fallback` = จะแสดงอะไรเมื่อไม่มีรูป:
 *   `'icon'` (ค่าตั้งต้น) — กล่องเทา + ไอคอนรูปภาพ · ใช้ในตาราง/การ์ดออเดอร์ทุกจุดเหมือนเดิม
 *   `'blank'` — **กล่องเทาเปล่า** · ใช้ในชีตคืนของตาม D-9 ที่หัวหน้าสั่งตรง ("ไม่มีรูป =
 *     กล่องเทาเปล่า ห้ามใช้ไอคอนแทน") เหตุผล: ในชีตนั้นทุกแถวมีรูปเป็นตัวแยกของ ไอคอน
 *     รูปภาพซ้ำ ๆ ทุกแถวจะอ่านเป็น "ของชนิดนี้" แทนที่จะเป็น "ยังไม่มีรูป"
 *
 * 🛑 เป็น prop บน component เดิม ไม่ใช่เขียนกล่องใหม่ที่ชีต — ทั้งสองที่ต้องมีขนาด/มุมโค้ง/
 * สีพื้นชุดเดียวกันตลอดไป (`sibling-surface-parity.md`) ค่าตั้งต้นคงพฤติกรรมเดิมทุกจุด
 */
export function ItemThumbnail({
  imageUrl,
  name,
  fallback = 'icon',
}: {
  imageUrl: string | null
  name: string
  fallback?: 'icon' | 'blank'
}) {
  if (imageUrl) {
    return (
      // 40px แทน 56px ของเดิม — แถวตารางเคยสูง 81px ต่อสินค้า 1 ชิ้น ทำให้การ์ดยืดเกินจำเป็น
      <Image alt={name} className="size-10 shrink-0 rounded-lg object-cover" height={40} src={imageUrl} width={40} />
    )
  }
  return (
    <div
      className="bg-default-100 flex size-10 shrink-0 items-center justify-center rounded-lg"
      /* กล่องเปล่าไม่มีเนื้อหาให้ screen reader อ่าน — บอกไปตรง ๆ ว่าไม่มีรูป ดีกว่าเงียบ
         (`img` ต้องการชื่อจากผู้เขียน ซึ่ง role นี้รองรับ — ต่างจาก div เปล่า) */
      role="img"
      aria-label={`${name} — ไม่มีรูปสินค้า`}
    >
      {fallback === 'icon' && <Icon icon="photo" className="text-default-500 size-4.5" aria-hidden="true" />}
    </div>
  )
}

/** ชื่อผู้ซื้อที่จะแสดง — ลงทะเบียนแล้วมาก่อน แล้วค่อยชื่อที่ร้านบันทึกเอง */
export function resolveBuyerNames(buyer: OrderFactsBuyer) {
  const registeredName = buyer.buyerDisplayName || buyer.buyerUsername || null
  const displayName = registeredName || buyer.buyerName || null
  return { registeredName, displayName, hasBuyerInfo: Boolean(buyer.buyerContact || displayName) }
}
