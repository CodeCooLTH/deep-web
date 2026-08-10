/**
 * แปลง "ช่องทางแชท" (ChatChannel) → "ช่องทางการขาย" ที่ฟอร์มออเดอร์ใช้
 *
 * ทำไมต้องมีไฟล์นี้แทนที่จะฝังใน DraftOrderProvider.tsx เหมือนเดิม: มันคือการตัดสินใจที่กำหนด
 * **ข้อมูลที่ถูกบันทึกลงฐาน** (`Order.salesChannel` → รายงานยอดขายรายช่องทาง) แต่เดิมอยู่ใน client
 * component ที่ไม่มีเทสคลุม แล้วก็เกิดสิ่งที่กติกา docs/conventions/ui-boolean-needs-a-testable-home.md
 * เตือนไว้เป๊ะ ๆ: **LINE ตกหล่นไปเงียบ ๆ**
 *
 * 🛑 บั๊กที่ไฟล์นี้ถูกสร้างขึ้นมาแก้ (2026-08-10): ฟังก์ชันเดิมมี branch ให้ MESSENGER/INSTAGRAM
 * เท่านั้น LINE จึงคืน `undefined` → ฟอร์มใช้ค่าตั้งต้น `STOREFRONT` ⇒ **ออเดอร์ทุกใบที่สร้างจากแชท
 * LINE ถูกบันทึกว่ามาจาก "หน้าร้าน"** ทั้งที่ `'LINE'` เป็นค่าที่ถูกต้องของฟอร์มอยู่แล้ว
 * (`oneOf(['STOREFRONT','FACEBOOK','LINE','TIKTOK','OTHER'])` ใน OrderCreateForm) และ
 * `OrderSourceLogo` ก็มีโลโก้ LINE รออยู่แล้ว — ขาดแค่บรรทัดเดียวตรงนี้
 *
 * ความเสียหายของบั๊กแบบนี้คือ **ข้อมูลที่ผิดแล้วผิดเลย** ไม่มีอะไรฟ้อง: ออเดอร์ยังสร้างได้ ยอดยังตรง
 * มีแต่ "มาจากช่องทางไหน" ที่ผิด ซึ่งเป็นตัวเลขที่ร้านใช้ตัดสินว่าจะลงแรงกับช่องทางไหนต่อ
 */

import { CHAT_CHANNELS, type ChatChannel } from '@/lib/chat-channel'

/** ค่าที่ `Order.salesChannel` รับได้ (ตรงกับ Yup ของ OrderCreateForm) */
export type OrderSalesChannel = 'STOREFRONT' | 'FACEBOOK' | 'INSTAGRAM' | 'LINE' | 'TIKTOK' | 'OTHER'

/**
 * ประกาศเป็น `Record<ChatChannel, …>` โดยตั้งใจ — **ไม่ใช่ if/else**
 *
 * 🛑 นี่คือด่านที่กันบั๊กเดิมไม่ให้เกิดซ้ำ: วันที่ใครเพิ่มช่องทางใหม่เข้า `CHAT_CHANNELS` (เช่น TIKTOK)
 * `tsc` จะบังคับให้เติมคีย์ที่นี่ทันที ต่างจาก if/else เดิมที่ค่าใหม่จะไหลไป `undefined` เงียบ ๆ แล้ว
 * กลายเป็น STOREFRONT เหมือนที่ LINE เพิ่งโดนมา (คลาสเดียวกับบทเรียน 00028 เรื่อง enum ค่าที่ 3)
 *
 * `undefined` = ไม่ prefill ปล่อยให้ฟอร์มใช้ค่าตั้งต้น/ค่าที่ร้านเคยเลือกไว้ใน localStorage
 * — ใช้กับ DEEP เท่านั้น เพราะแชทในแอปเราเองไม่ได้บอกว่าลูกค้ามาจากช่องทางขายไหน
 */
const CHAT_TO_SALES: Record<ChatChannel, OrderSalesChannel | undefined> = {
  DEEP: undefined,
  // Messenger → FACEBOOK: คนทักเข้ามาที่ "เพจ Facebook" ไม่ใช่ "แอป Messenger"
  // (เหตุผลเดียวกับที่ ChannelBadge.tsx เลือกโลโก้ f ตั้งแต่ 2026-07-23)
  MESSENGER: 'FACEBOOK',
  // 🛑 IG แยกเป็นช่องทางของตัวเองแล้ว (user เคาะ 2026-08-10) — เดิมยุบรวมเป็น FACEBOOK ทำให้ร้าน
  // แยกไม่ออกว่ายอดมาจากเพจหรือจาก IG ทั้งที่เป็นคนละกลุ่มลูกค้าคนละแคมเปญ. การเปลี่ยนค่านี้มีผลถึง
  // `resolveOrderSource()` ด้วย (badge/โลโก้ในคอลัมน์ "ที่มา" ของหน้า orders อ่านผ่านฟังก์ชันนี้)
  // จึงต้องมี 'INSTAGRAM' ครบทั้ง SALES_CHANNEL_LABELS/ICONS + PLATFORM_LOGO/CHANNEL_LOGO
  // ไม่งั้น badge จะหายทั้งแถว (label ไม่เจอ = hasChannel false) — เติมไปพร้อมกันในคอมมิตเดียว
  INSTAGRAM: 'INSTAGRAM',
  LINE: 'LINE',
}

/** ค่าที่ไม่รู้จัก (ข้อมูลเพี้ยน/ช่องทางในอนาคตที่ยังไม่ได้ประกาศ) → `undefined` ห้าม crash */
export function chatChannelToSalesChannel(channel: string): OrderSalesChannel | undefined {
  return (CHAT_CHANNELS as readonly string[]).includes(channel)
    ? CHAT_TO_SALES[channel as ChatChannel]
    : undefined
}
