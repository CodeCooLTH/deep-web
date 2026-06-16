/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/data.ts
 * (OrderRow/OrderStatus เป็น SafePay-specific; OrderStatCardData copy pattern จาก RevenueStat)
 */

export type OrderStatus = 'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED'

// วิธีชำระเงิน — mirror PAYMENT_LABELS ใน orders/[token]/components/CustomerDetails.tsx
// (display-only; sync กับ create form PaymentChannelBlock)
export const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'เงินสด',
  TRANSFER: 'โอนเงิน',
  PROMPTPAY: 'พร้อมเพย์',
  CARD: 'บัตรเครดิต/เดบิต',
  COD: 'เก็บปลายทาง',
  OTHER: 'อื่นๆ',
}
// tabler icon ต่อวิธีชำระเงิน
export const PAYMENT_ICONS: Record<string, string> = {
  CASH: 'cash',
  TRANSFER: 'building-bank',
  PROMPTPAY: 'qrcode',
  CARD: 'credit-card',
  COD: 'truck-delivery',
  OTHER: 'wallet',
}

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
  /** วิธีชำระเงิน (code) — map ผ่าน PAYMENT_LABELS/PAYMENT_ICONS */
  paymentMethod: string | null
  /** F2: รายการสินค้า — map จาก OrderItem + product.images (ถ้ามี) */
  items: OrderItemRow[]
}

// OrderStatCardData — RevenueStat layout (sparkline bar trend)
// Base: theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/data.ts (RevenueStatisticType pattern)
export type OrderStatCardData = {
  title: string                                              // 'รอดำเนินการ' ฯลฯ
  status: 'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED'
  totalCount: number                                         // ยอดรวมทั้งหมดของ status (headline h3)
  changePct: number                                          // %, +/-/0 (7วันล่าสุด vs 7วันก่อนหน้า)
  trendSeries: number[]                                      // length 7 (sparkline) — number ล้วน ข้าม RSC boundary ปลอดภัย
}
