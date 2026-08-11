/**
 * guest-order-data — ประกอบข้อมูลที่ guest เห็นได้บนหน้า `/o/{token}` (feature 00041, TFR-001)
 *
 * 🛑 ทำไมต้องเป็นไฟล์แยกและเป็น allow-list ไม่ใช่ deny-list:
 * ของเดิม `PublicOrderData` ถูกประกอบจาก order ทั้งก้อนหลังผ่าน grant แล้ว — ปลอดภัยเพราะคนที่
 * เห็นคือเจ้าของ. พอเปิด guest view (D-1) คนที่เห็นคือ "ใครก็ตามที่ถือลิงก์" ถ้าเขียนเป็น
 * "เอาทั้งหมดแล้วลบบางฟิลด์ออก" ฟิลด์ใหม่ที่ใครเพิ่มทีหลังจะรั่วโดยอัตโนมัติและไม่มีใครรู้
 * — ที่นี่จึงระบุทีละฟิลด์ว่าอะไรผ่านได้ ฟิลด์ใหม่ต้องมาเพิ่มที่นี่โดยตั้งใจเท่านั้น
 *
 * PII ถูก mask ที่นี่ (server) ก่อนข้าม RSC → client เสมอ ไม่ใช่ซ่อนที่ client
 * (memory `feedback_rsc_pii_neutralize_at_source`)
 */

import { maskPhoneForGuest, maskShippingAddressForGuest, type MaskedShippingAddress } from '@/lib/order-pii-mask'
import type { ShippingAddressLike } from '@/lib/shipping-address-status'

export type GuestOrderData = {
  publicToken: string
  status: 'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED'
  createdAtIso: string
  totalAmount: number
  items: Array<{ id: string; name: string; qty: number; price: number; imageUrl: string | null }>
  shop: {
    shopName: string
    user: { displayName: string | null; username: string; trustScore: number; avatar: string | null }
  }
  maxVerifyLevel: number
  /**
   * หลักฐานของร้าน — ยกชุดเดียวกับที่หน้า sign-in (OrderLinkShell) แสดงอยู่แล้ว
   *
   * 🛑 ทั้งหมดเป็นตัวเลขรวมของ "ร้าน" ไม่ใช่ของออเดอร์ใบนี้ จึงไม่ใช่ PII ของผู้ซื้อ และเป็น
   * ข้อมูลที่เปิดสาธารณะอยู่แล้วบนโปรไฟล์ร้าน /u/{username} — เอามาแสดงตรงนี้ไม่ได้เปิดอะไรใหม่
   * แค่ย้ายมาไว้ตรงจุดที่ผู้ซื้อกำลังตัดสินใจจริง
   *
   * เหตุผลที่ต้องมี: เดิมจอนี้โชว์แค่ชิป "ยืนยันแล้ว" แบบมี/ไม่มี ⇒ ร้านที่ยืนยันแค่เบอร์
   * หน้าตาเหมือนร้านจดทะเบียนบริษัท บนจอที่ตัดสินว่าเงินจะโอนหรือไม่ ขณะที่หน้า sign-in
   * ซึ่งอยู่ *ถัดจากนี้* มีครบอยู่แล้ว — เท่ากับเอาจอที่อ่อนกว่าไปวางไว้หน้าจอที่แข็งกว่า
   */
  completedOrders: number | null
  avgRating: number | null
  reviewCount: number
  channels: { provider: string; name: string; avatarUrl: string | null }[]
  latestReview: { rating: number; comment: string } | null
  shipmentTracking: { provider: string; trackingNo: string } | null
  /** สถานะพัสดุจากขนส่ง — ใช้คำนวณ stage ด้วยตรรกะเดียวกับฝั่งร้าน (BR-BOE-12) */
  carrierStatus: string | null
  paymentMethod: string | null
  /** เห็นได้เฉพาะ 3 ตัวท้าย — null = ไม่แสดงแถวนี้เลย (ไม่ใช่ "ไม่ระบุ") */
  maskedPhone: string | null
  maskedShippingAddress: MaskedShippingAddress | null
}

/**
 * รูปร่างขั้นต่ำที่ต้องการจากผลลัพธ์ของ `getOrderByToken()` — ประกาศเองแทนการ import type
 * ของ Prisma เพื่อให้เห็นชัดว่าฟังก์ชันนี้ "แตะ" อะไรบ้าง (และ tsc จะฟ้องถ้ามีคนส่งของขาดมา)
 */
type OrderLike = {
  publicToken: string
  status: string
  createdAt: Date
  totalAmount: unknown
  buyerContact: string | null
  shippingAddress: unknown
  paymentMethod: string | null
  items: Array<{
    id: string
    name: string
    qty: number
    price: unknown
    product?: { images: unknown } | null
  }>
  shop: {
    shopName: string
    /** โลโก้ร้าน — มาก่อนรูปส่วนตัวของเจ้าของเสมอ (ดูหมายเหตุที่จุด map) */
    logo: string | null
    user: { displayName: string | null; username: string; trustScore: number; avatar: string | null }
  }
  shipmentTracking: { provider: string; trackingNo: string } | null
  shipments: Array<{
    trackingNo: string | null
    courierName: string | null
    courierCode: string | null
    carrierStatus: string | null
  }>
}

/** สถิติร้านที่ page คำนวณมาให้ — แยก parameter เพราะไม่ได้อยู่บน order */
export type GuestShopStats = {
  completedOrders: number | null
  avgRating: number | null
  reviewCount: number
  channels: { provider: string; name: string; avatarUrl: string | null }[]
  latestReview: { rating: number; comment: string } | null
}

/** ค่าตั้งต้นเมื่อ query สถิติล้ม — หน้ายังแสดงได้ครบ แค่ไม่มีบล็อกหลักฐาน (graceful degrade) */
export const EMPTY_SHOP_STATS: GuestShopStats = {
  completedOrders: null,
  avgRating: null,
  reviewCount: 0,
  channels: [],
  latestReview: null,
}

export function buildGuestOrderData(
  order: OrderLike,
  maxVerifyLevel: number,
  stats: GuestShopStats = EMPTY_SHOP_STATS,
): GuestOrderData {
  const shipment = order.shipments?.[0]

  return {
    publicToken: order.publicToken,
    status: order.status as GuestOrderData['status'],
    createdAtIso: order.createdAt.toISOString(),
    totalAmount: Number(order.totalAmount),
    items: order.items.map((it) => ({
      id: it.id,
      name: it.name,
      qty: it.qty,
      price: Number(it.price),
      imageUrl: (it.product?.images as string[] | undefined)?.[0] ?? null,
      // 🛑 ไม่ส่ง `description` — เป็น free-text ที่ร้านพิมพ์เอง เคยมีเคสใส่ข้อมูลติดต่อ/
      // เงื่อนไขเฉพาะลูกค้ารายนั้นลงไป ซึ่งไม่ควรให้คนที่ถือลิงก์ต่อเห็น
    })),
    shop: {
      shopName: order.shop.shopName,
      user: {
        displayName: order.shop.user.displayName,
        username: order.shop.user.username,
        trustScore: order.shop.user.trustScore,
        /* 🛑 โลโก้ร้านมาก่อนรูปส่วนตัวของเจ้าของเสมอ — ลำดับเดียวกับ /u/[username]/page.tsx
           ("toFileUrl(user.shop?.logo) ?? profileHeader.profileImg")

           เดิมจอนี้หยิบ `user.avatar` อย่างเดียว ทั้งที่ query มี `shop.logo` มาให้อยู่แล้ว
           (มาจาก `include: { shop: { include: { user } } }` ซึ่งคืน scalar ของ Shop ครบทุกตัว)
           ⇒ ผู้ซื้อที่กำลังจะโอนเงินเห็น "รูปส่วนตัวของเจ้าของร้าน" แทนโลโก้ร้าน แล้วพอกดปุ่ม
           ไปจอถัดไป (sign-in) ซึ่ง select ถูกอยู่แล้ว จะเห็นโลโก้ร้านจริง = ร้านเดียวกัน คนละรูป
           ห่างกันไม่กี่วินาที ตรงจุดที่ระบบต้องพิสูจน์ตัวตนที่สุด

           คง fallback ไป avatar ไว้เป็นชั้นสอง เพราะร้านบุคคลที่ยังไม่อัปโหลดโลโก้มีจริง */
        avatar: order.shop.logo ?? order.shop.user.avatar ?? null,
      },
    },
    maxVerifyLevel,
    completedOrders: stats.completedOrders,
    avgRating: stats.avgRating,
    reviewCount: stats.reviewCount,
    channels: stats.channels,
    // 🛑 ส่งเฉพาะ rating + comment — ไม่ส่งชื่อผู้รีวิวหรือวันที่ ซึ่งประกอบกับ "ร้านไหน"
    // แล้วชี้ตัวคนซื้อได้ในร้านที่ยังมีออเดอร์น้อย (บน prod ตอนนี้ร้านส่วนใหญ่เป็นแบบนั้น)
    latestReview: stats.latestReview,
    // ลำดับเดียวกับฝั่ง authenticated: สิ่งที่ร้านแจ้งเองมาก่อน แล้วค่อย fallback เป็นพัสดุ iShip
    shipmentTracking: order.shipmentTracking
      ? { provider: order.shipmentTracking.provider, trackingNo: order.shipmentTracking.trackingNo }
      : shipment?.trackingNo
        ? {
            provider: shipment.courierName ?? shipment.courierCode ?? 'ขนส่ง',
            trackingNo: shipment.trackingNo,
          }
        : null,
    carrierStatus: shipment?.carrierStatus ?? null,
    paymentMethod: order.paymentMethod ?? null,
    maskedPhone: maskPhoneForGuest(order.buyerContact),
    maskedShippingAddress: maskShippingAddressForGuest(
      (order.shippingAddress as ShippingAddressLike | null) ?? null,
    ),
  }
}
