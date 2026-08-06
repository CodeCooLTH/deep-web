import type { ShippingStageKey } from '@/lib/order-stage'
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
  CARD: 'บัตรยอดเงิน/เดบิต',
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
  /**
   * กองงานตามสถานะพัสดุ (user สั่ง 2026-08-04: กดไทล์บน Command Center แล้วรายการต้องกรองตรงกัน)
   * คำนวณที่ server ด้วย deriveShippingStage ตัวเดียวกับที่ตัวนับบนไทล์ใช้ — undefined = ร้านที่
   * ไม่ใช่ ONLINE_SALES (ไม่มีพัสดุให้ไล่ จึงไม่มีตัวกรองนี้)
   */
  shippingStage?: ShippingStageKey
  /**
   * พัสดุใบล่าสุดที่ยัง active — null = ยังไม่ได้เปิดพัสดุ (แถวจะไม่ขึ้นบรรทัดพัสดุเลย)
   * user สั่ง 2026-08-04: กดจากไทล์เข้ามาแล้วต้องเห็นเลขพัสดุชัด ๆ ว่าเจ้าไหน เปิดผ่านอะไร
   */
  shipment?: {
    /** OrderShipment.id — null = พัสดุที่ร้านแจ้งเลขเอง (ไม่มี traces ให้ถาม iShip) */
    id: string | null
    trackingNo: string | null
    courierCode: string | null
    courierName: string | null
    /** "ISHIP" | ... — ใช้เลือกไอคอนแพลตฟอร์ม */
    provider: string
  } | null
  id: string            // publicToken short (8-char)
  publicToken: string
  /** short-code 8 ตัวสำหรับ copy/share link; null = order เก่าก่อน backfill (fallback publicToken) */
  shortCode: string | null
  buyer: string         // masked contact หรือ '—'
  orderType: string     // PHYSICAL | DIGITAL | SERVICE
  total: number
  status: OrderStatus
  createdAtISO: string  // ISO 8601 string — convert to Date ใน client เพื่อ format
  // Phase A Unit A: buyer identity fields (null = guest ยังไม่ register)
  // component จะ fallback เป็น masked contact / placeholder เอง (T3-T6)
  buyerName: string | null
  buyerUsername: string | null
  /** avatar ของ registered buyer (User.avatar) — null = guest → fallback initial */
  buyerAvatar: string | null
  /** ช่องทางการขาย (STOREFRONT|FACEBOOK|LINE|TIKTOK|OTHER) → icon ผ่าน SALES_CHANNEL_ICONS */
  salesChannel: string | null
  /**
   * รูปเพจที่ลูกค้าทักมา (ShopChannel.avatarUrl) — null = ไม่รู้เพจ ให้ UI ตกไปใช้
   * โลโก้แพลตฟอร์มแทน (user สั่ง 2026-08-06: คอลัมน์ที่มาของออเดอร์)
   * ตอนนี้เติมได้เฉพาะออเดอร์ FACEBOOK ของร้านที่เชื่อมเพจ ACTIVE เพจเดียว —
   * Order ไม่ได้เก็บว่ามาจากเพจไหน (มีแค่ salesChannel) ร้านหลายเพจจึงชี้เพจไม่ได้
   */
  sourceLogoUrl?: string | null
  /** true = order เกิดจากการชนะประมูล (มี auctionId) — แสดง badge ค้อนประมูล */
  isFromAuction: boolean
  /** เบอร์จริง (ไม่ mask) สำหรับ tap-to-call — seller เป็นเจ้าของออเดอร์/ลูกค้าตัวเอง
   *  (user decision 2026-06-15: เปิดเบอร์จริงให้ seller โทรลูกค้าตัวเองได้) */
  buyerPhone: string | null
  /** วิธีชำระเงิน (code) — map ผ่าน PAYMENT_LABELS/PAYMENT_ICONS */
  paymentMethod: string | null
  /**
   * ปลายทางแยกเป็นส่วน ๆ (2026-08-06 — user สั่งให้รหัสไปรษณีย์อยู่บรรทัดล่างสุดเสมอ
   * "จะได้ก้อบง่าย ๆ") — ประกอบเป็นบรรทัดที่ฝั่งจอ ไม่ใช่ต่อสตริงมาจาก server เพราะ
   * การขึ้นบรรทัดเป็นเรื่องของการแสดงผล ไม่ใช่ของข้อมูล
   *
   * PII: หน้านี้อยู่ใต้ client layout ทุก field ถูก serialize เข้า flight payload ของทุกแถว
   * ที่โหลดมา (feedback_rsc_pii_neutralize_at_source) — user เคาะ 2026-08-06 ให้แสดงที่อยู่
   * เต็มเพราะร้านใช้จ่าหน้าซองจริง ผู้ที่เห็นคือเจ้าของออเดอร์เท่านั้น
   * null ทั้งก้อน = ยังไม่มีที่อยู่
   */
  shipTo: {
    /** บ้านเลขที่/อาคาร */
    line1: string | null
    /** หมู่/ตำบล/อำเภอ รวมบรรทัดเดียว */
    locality: string | null
    province: string | null
    postcode: string | null
  } | null
  /**
   * ห้องแชทของลูกค้ารายนี้ (null = ไม่มี/หาไม่เจอ) — ใช้ทำปุ่ม "เปิดแชท" บนแถบหัว
   *
   * Order ไม่ได้เก็บว่ามาจากห้องไหนโดยตรง (ไม่มี FK) — resolve ที่ server ผ่าน
   * Order.customerId → ExternalContact.customerId → Conversation หรือทาง
   * Order.buyerUserId → Conversation.buyerUserId สำหรับแชทในระบบ
   */
  conversationId: string | null
  /** ร้านได้รับเงินเก็บปลายทางแล้วเมื่อไร (null = ยังไม่ได้รับ) — ใช้ทำเช็กลิสต์สถานะ */
  codReceivedAtISO: string | null
  /** F2: รายการสินค้า — map จาก OrderItem + product.images (ถ้ามี) */
  items: OrderItemRow[]
}

// ช่องทางการขาย → icon (tabler, ผ่าน Icon wrapper) + label ไทย — order list
export const SALES_CHANNEL_ICONS: Record<string, string> = {
  STOREFRONT: 'building-store',
  FACEBOOK: 'brand-facebook',
  LINE: 'brand-line',
  TIKTOK: 'brand-tiktok',
  OTHER: 'world',
}
export const SALES_CHANNEL_LABELS: Record<string, string> = {
  STOREFRONT: 'หน้าร้าน',
  FACEBOOK: 'Facebook',
  LINE: 'Line',
  TIKTOK: 'TikTok',
  OTHER: 'อื่นๆ',
}

// OrderStatCardData — การ์ดสถิติหัวหน้า orders (ตัวเลข + ไอคอนวงกลม + %เปลี่ยนแปลง)
// Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/data.ts
//       (OrderStatType) — เดิมยึด RevenueStat (sparkline) ซึ่งเป็นคนละหน้า ดู OrdersStatCard.tsx
export type OrderStatCardData = {
  title: string                                              // 'รอดำเนินการ' ฯลฯ
  status: 'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED'
  totalCount: number                                         // ยอดรวมทั้งหมดของ status (headline h3)
  changePct: number                                          // %, +/-/0 (30วันล่าสุด vs 30วันก่อนหน้า)
}
