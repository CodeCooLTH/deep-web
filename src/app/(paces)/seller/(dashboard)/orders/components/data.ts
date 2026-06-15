/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/data.ts
 * (OrderStatType นำมาจาก theme; OrderRow/OrderStatus เป็น SafePay-specific)
 */

export type OrderStatus = 'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED'

/** item แต่ละรายการใน order — map จาก OrderItem + product.images[0] */
export type OrderItemRow = {
  id: string
  name: string
  qty: number
  price: number         // Decimal → number ที่ RSC boundary
  /** imageUrl = /api/files/{images[0]} ถ้า product มีรูป; null = placeholder */
  imageUrl: string | null
}

export type OrderRow = {
  id: string            // publicToken short (8-char)
  publicToken: string
  buyer: string         // masked contact หรือ '—'
  orderType: string     // PHYSICAL | DIGITAL | SERVICE
  total: number
  status: OrderStatus
  createdAtISO: string  // ISO 8601 string — convert to Date ใน client เพื่อ format
  // Phase A Unit A: buyer identity fields (null = guest ยังไม่ register)
  // component จะ fallback เป็น masked contact / placeholder เอง (T3-T6)
  buyerName: string | null
  buyerUsername: string | null
  /** เบอร์จริง (ไม่ mask) สำหรับ tap-to-call — seller เป็นเจ้าของออเดอร์/ลูกค้าตัวเอง
   *  (user decision 2026-06-15: เปิดเบอร์จริงให้ seller โทรลูกค้าตัวเองได้) */
  buyerPhone: string | null
  /** F2: รายการสินค้า — map จาก OrderItem + product.images (ถ้ามี) */
  items: OrderItemRow[]
}

// รูปแบบข้อมูลสำหรับ OrdersStatCard (ตาม theme OrderStatType)
export type OrderStatType = {
  title: string
  value: number
  change: number
  icon: string
  prefix?: string
  suffix?: string
  className: string
}
