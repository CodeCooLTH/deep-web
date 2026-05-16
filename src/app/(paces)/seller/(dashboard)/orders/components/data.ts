/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/data.ts
 * (OrderStatType นำมาจาก theme; OrderRow/OrderStatus เป็น SafePay-specific)
 */

export type OrderStatus = 'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED'

export type OrderRow = {
  id: string            // publicToken short (8-char)
  publicToken: string
  buyer: string         // masked contact หรือ '—'
  orderType: string     // PHYSICAL | DIGITAL | SERVICE
  total: number
  status: OrderStatus
  createdAtISO: string  // ISO 8601 string — convert to Date ใน client เพื่อ format
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
