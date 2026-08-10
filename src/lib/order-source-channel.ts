/**
 * resolveOrderSource — "ที่มา" ของออเดอร์หนึ่งใบ (คอลัมน์ "ที่มา" ในหน้า `/orders` + หัวการ์ด
 * order detail) — user สั่ง 2026-08-10: "ในหน้า Order ตรงนี้ขึ้น icon line พร้อมรูป line official
 * account นั้น"
 *
 * ทำไมต้องมีไฟล์นี้: เดิม `orders/page.tsx` และ `orders/[token]/page.tsx` เขียนท่าเดียวกันซ้ำสองที่
 * (`fbChannels.length === 1 ? fbChannels[0].avatarUrl : null` แล้ว hardcode
 * `o.salesChannel === 'FACEBOOK' ? fbPageAvatar : null`) ⇒ ร้านที่มี ≥2 เพจไม่เคยเห็นรูปเพจเลย
 * สักใบ และ LINE ไม่เคยเห็นรูปเลย (ไม่ใช่ปัญหาของ LINE อย่างเดียว — ของเดิมพังกับ FB หลายเพจด้วย)
 *
 * 🛑 "รูป" และ "แพลตฟอร์มของ badge" ต้องมาจากแหล่งเดียวกันเสมอ ห้ามผสม (เช่น รูปจาก shopChannel
 * แต่ badge จาก salesChannel) เพราะ `salesChannel` เป็นค่าที่ร้านแก้เองทีหลังได้ตามใจ ไม่ตรงกับ
 * `shopChannel` ที่ผูกไว้ตอนสร้างได้ (ดูคอมเมนต์ที่ field `Order.shopChannelId` ใน schema.prisma)
 * ผสมกันจะได้ "รูป LINE OA คู่กับ badge Facebook" ซึ่งผิดแบบที่คนดูจะไม่เชื่ออะไรเลยทั้งคู่
 */

import { chatChannelToSalesChannel } from '@/lib/chat-sales-channel'
import { CHAT_CHANNELS, type ChatChannel } from '@/lib/chat-channel'

export interface OrderSourceChannel {
  /** รูปช่องทาง (avatar เพจ/LINE OA) — null = ไม่มีรูปให้ ตกไปโลโก้แพลตฟอร์มใน OrderSourceLogo */
  logoUrl: string | null
  /** ค่าที่ OrderSourceLogo ใช้ทั้งเลือกโลโก้แพลตฟอร์ม + label (STOREFRONT/FACEBOOK/LINE/TIKTOK/OTHER) */
  channel: string | null
}

/**
 * ลำดับการตัดสิน:
 * 1. `shopChannel` ที่ผูกไว้ตอนสร้างออเดอร์ (feature 2026-08-10+) — รูป+badge มาจากตัวเดียวกันเป๊ะ
 *    ตรงตามช่องทางที่ลูกค้าทักเข้ามาจริง ไม่ต้องเดา
 * 2. legacy fallback (ออเดอร์ก่อน 2026-08-10 ไม่มี `shopChannelId`) — เดารูปได้เฉพาะออเดอร์
 *    FACEBOOK ของร้านที่เชื่อมเพจ MESSENGER ที่ ACTIVE อยู่ "เพจเดียว" (หลายเพจ = กำกวม ห้ามเดา)
 *    badge ยังอ้างจาก `salesChannel` เหมือนเดิมทุกประการ (ท่าเดิมก่อนรอบนี้ — ต้องไม่แย่ลงกว่าเดิม)
 */
export function resolveOrderSource(params: {
  salesChannel: string | null
  shopChannel: { avatarUrl: string | null; provider: string } | null
  /** legacy fallback (2026-08-06): รูปเพจเดียวของร้าน ถ้าร้านเชื่อม MESSENGER ACTIVE พอดี 1 เพจ */
  legacyFacebookPageAvatar: string | null
}): OrderSourceChannel {
  const { salesChannel, shopChannel, legacyFacebookPageAvatar } = params

  if (shopChannel) {
    const provider = (CHAT_CHANNELS as readonly string[]).includes(shopChannel.provider)
      ? (shopChannel.provider as ChatChannel)
      : null
    return {
      logoUrl: shopChannel.avatarUrl,
      // ปกติ resolve ได้เสมอ (ShopChannel.provider มีแค่ MESSENGER/INSTAGRAM/LINE — ทุกตัวแมปแล้ว
      // ใน chatChannelToSalesChannel) — fallback ไป salesChannel เผื่อ provider แปลกที่ไม่รู้จัก
      channel: (provider ? chatChannelToSalesChannel(provider) : undefined) ?? salesChannel,
    }
  }

  return {
    logoUrl: salesChannel === 'FACEBOOK' ? legacyFacebookPageAvatar : null,
    channel: salesChannel,
  }
}
