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

import { toFileUrl } from '@/lib/file-url'
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
    vertical: string
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
  channels: { provider: string; name: string; avatarUrl: string | null; externalId: string; followerCount: number | null }[]
  latestReview: { rating: number; comment: string } | null
  /**
   * ขนส่ง + เลขพัสดุที่ผู้ซื้อเห็น
   *
   * `courierCode` มีเฉพาะทางเข้าที่เปิดพัสดุผ่าน iShip — ที่ร้านแจ้งเลขเอง (`ShipmentTracking`)
   * เก็บแต่ชื่อที่พิมพ์มา ไม่มีรหัส (docs/conventions/one-value-many-entry-points.md)
   * ส่งไปเพื่อให้ `courierLogoUrl` จับแบรนด์ได้แม่นเท่าฝั่งร้าน ซึ่งเทียบกับทั้ง code และ name
   */
  shipmentTracking: { provider: string; trackingNo: string; courierCode: string | null } | null
  /** สถานะพัสดุจากขนส่ง — ใช้คำนวณ stage ด้วยตรรกะเดียวกับฝั่งร้าน (BR-BOE-12) */
  carrierStatus: string | null
  returnStartedAt: string | null
  returnedAt: string | null
  paymentMethod: string | null
  /** เห็นได้เฉพาะ 3 ตัวท้าย — null = ไม่แสดงแถวนี้เลย (ไม่ใช่ "ไม่ระบุ") */
  maskedPhone: string | null
  maskedShippingAddress: MaskedShippingAddress | null
  /**
   * เวลานัดของงานบริการ — `null` เมื่อร้านไม่ใช่ SERVICE_QUEUE หรือใบนี้ยังไม่ระบุเวลา
   *
   * 🛑 เพิ่มเข้า allow-list อย่างตั้งใจ (ไฟล์นี้เป็น allow-list ไม่ใช่ deny-list): ก่อนหน้านี้
   * ผู้ซื้อร้านบริการที่เปิดลิงก์ก่อนล็อกอิน **ไม่เห็นวันนัดของตัวเองเลยสักที่ในหน้า** ทั้งที่
   * นั่นคือข้อเท็จจริงเดียวที่เขาเปิดหน้านี้มาหา — เห็นแค่ "รอดำเนินการ" กับยอดเงิน
   *
   * ที่รับความเสี่ยงได้: ค่านี้บอก *เวลาของบิลใบนี้* ไม่ได้บอกว่าใคร (ชื่อไม่เคยส่งมาที่จอนี้
   * เบอร์ mask เหลือ 3 ตัวท้าย) คนที่ถือลิงก์ต่อจึงไม่ได้ตัวตนเพิ่มจากที่ลิงก์ให้อยู่แล้ว
   *
   * กั้นด้วย **vertical** ไม่ใช่ "มี serviceStart ไหม" (AC-SQ-07) — คอลัมน์นี้เป็นของ
   * ร้านบริการ แต่ไม่มีอะไรใน schema ห้ามร้านประเภทอื่นมีค่าค้างอยู่
   */
  serviceStartIso: string | null
  serviceEndIso: string | null
}

/**
 * รูปร่างขั้นต่ำที่ต้องการจากผลลัพธ์ของ `getOrderByToken()` — ประกาศเองแทนการ import type
 * ของ Prisma เพื่อให้เห็นชัดว่าฟังก์ชันนี้ "แตะ" อะไรบ้าง (และ tsc จะฟ้องถ้ามีคนส่งของขาดมา)
 */
type OrderLike = {
  publicToken: string
  status: string
  createdAt: Date
  /** งานบริการ: ช่วงเวลานัด (scalar ของ Order — มากับ findUnique อยู่แล้ว ไม่เพิ่ม query) */
  serviceStart: Date | null
  serviceEnd: Date | null
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
    /** ประเภทกิจการ — ตัวผันคำทั้งหน้าฝั่งผู้ซื้อ (ORDER_VOCAB) */
    vertical: string
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
    /** เวลาของ "ขากลับ" — null = ขนส่งไม่ได้แจ้งเวลา ไม่ใช่ "ไม่เกิด" */
    returnStartedAt: Date | null
    returnedAt: Date | null
  }>
}

/** สถิติร้านที่ page คำนวณมาให้ — แยก parameter เพราะไม่ได้อยู่บน order */
export type GuestShopStats = {
  completedOrders: number | null
  avgRating: number | null
  reviewCount: number
  channels: { provider: string; name: string; avatarUrl: string | null; externalId: string; followerCount: number | null }[]
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
  const isServiceShop = order.shop.vertical === 'SERVICE_QUEUE'

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
      /* 🛑 ต้องผ่าน toFileUrl — ค่าที่เก็บใน DB เป็น **storage key** ("2026/08/08/uuid.jpg")
         ไม่ใช่ URL เต็ม ใส่ลง <img src> ตรง ๆ จะกลายเป็น path สัมพัทธ์ = 404 เงียบ ๆ
         (ไม่มี error ไม่มีอะไรฟ้อง มีแต่กล่องเทาว่าง — user เจอเองบน prod 2026-08-12)
         หัวไฟล์ file-url.ts เขียนเตือนไว้เองว่าคลาสนี้เกิดซ้ำมาแล้วกับ "หน้าลิงก์คำสั่งซื้อ"
         และ "หน้าร้านสาธารณะ" — นี่คือครั้งที่สาม */
      imageUrl: toFileUrl((it.product?.images as string[] | undefined)?.[0]),
      // 🛑 ไม่ส่ง `description` — เป็น free-text ที่ร้านพิมพ์เอง เคยมีเคสใส่ข้อมูลติดต่อ/
      // เงื่อนไขเฉพาะลูกค้ารายนั้นลงไป ซึ่งไม่ควรให้คนที่ถือลิงก์ต่อเห็น
    })),
    shop: {
      shopName: order.shop.shopName,
      /* ประเภทกิจการ — ตัวผันคำทั้งหน้า (ORDER_VOCAB) ร้านบริการต้องไม่เห็นคำว่า "สินค้า"
         ค่าที่ไม่รู้จักตกไป ONLINE_SALES ที่ฝั่งอ่าน (fail-safe เดียวกับ seller-menu) */
      vertical: order.shop.vertical,
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
        /* 🛑 toFileUrl ครอบทั้งก้อน — `shop.logo` เป็น storage key ส่วน `user.avatar` เป็น URL
           เต็มจาก OAuth (ขึ้นต้น https) toFileUrl คืนค่าเดิมให้ตัวหลังอยู่แล้ว จึงครอบได้ทั้งคู่
           เดิมไม่ครอบ ⇒ ร้านที่มีโลโก้กลับไม่มีรูปขึ้น ส่วนร้านที่ไม่มีโลโก้ (fallback ไป avatar
           ซึ่งเป็น URL เต็ม) กลับขึ้นปกติ — อาการกลับหัวจนดูเหมือนไม่ใช่บั๊กของโลโก้ */
        avatar: toFileUrl(order.shop.logo) ?? toFileUrl(order.shop.user.avatar),
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
      ? {
          provider: order.shipmentTracking.provider,
          trackingNo: order.shipmentTracking.trackingNo,
          // ทางเข้า "ร้านแจ้งเลขเอง" ไม่มีรหัสขนส่งให้เก็บตั้งแต่ต้นทาง — null คือความจริง
          // ของแถวนี้ ไม่ใช่ข้อมูลที่หายไประหว่างทาง
          courierCode: null,
        }
      : shipment?.trackingNo
        ? {
            provider: shipment.courierName ?? shipment.courierCode ?? 'ขนส่ง',
            trackingNo: shipment.trackingNo,
            courierCode: shipment.courierCode,
          }
        : null,
    carrierStatus: shipment?.carrierStatus ?? null,
    // แถวที่ 2 ของไทม์ไลน์ฝั่งผู้ซื้อ — ผู้ซื้อต้องรู้ว่าของที่ส่งไม่ถึงกำลังกลับไปที่ร้าน
    // หรือถึงแล้ว ก่อนจะไปทวงร้านว่าของหาย (feature 00055 นับใบตีกลับเป็นสถิติของเขาอยู่แล้ว)
    returnStartedAt: shipment?.returnStartedAt?.toISOString() ?? null,
    returnedAt: shipment?.returnedAt?.toISOString() ?? null,
    paymentMethod: order.paymentMethod ?? null,
    maskedPhone: maskPhoneForGuest(order.buyerContact),
    maskedShippingAddress: maskShippingAddressForGuest(
      (order.shippingAddress as ShippingAddressLike | null) ?? null,
    ),
    // ด่าน vertical มาก่อนเสมอ — เหตุผลเต็มอยู่ที่ประกาศฟิลด์ใน GuestOrderData
    serviceStartIso: isServiceShop && order.serviceStart ? order.serviceStart.toISOString() : null,
    serviceEndIso: isServiceShop && order.serviceEnd ? order.serviceEnd.toISOString() : null,
  }
}
