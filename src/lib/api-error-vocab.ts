import { ORDER_VOCAB, PRODUCT_VOCAB } from '@/lib/seller-menu'

/**
 * คำในข้อความ error ของ API ที่ผู้ใช้เห็นเป็น toast — ร้านบริการ (SERVICE_QUEUE) ต้องไม่เห็นคำขายของ
 *
 * ทำไมรับ `legacy`: ข้อความเดิมของ API ใช้ "คำสั่งซื้อ"/"ออเดอร์" ปนกัน ร้านอื่น (ONLINE_SALES, LODGING)
 * ต้องได้ข้อความเดิมเป๊ะ จึงสลับเฉพาะ SERVICE_QUEUE และคืน legacy ให้ที่เหลือ
 * ที่มาของคำ = ORDER_VOCAB / PRODUCT_VOCAB (SSOT) ไม่ตั้งรายการคำซ้ำ
 */
const isService = (vertical: string | null | undefined) => vertical === 'SERVICE_QUEUE'

export const orderNounFor = (vertical: string | null | undefined, legacy = 'คำสั่งซื้อ') =>
  isService(vertical) ? ORDER_VOCAB.SERVICE_QUEUE.noun : legacy

export const buyerNounFor = (vertical: string | null | undefined, legacy = 'ผู้ซื้อ') =>
  isService(vertical) ? ORDER_VOCAB.SERVICE_QUEUE.buyerNoun : legacy

/** "สินค้า" ในข้อความ error → itemSingular ของร้านบริการ ("รายการ") */
export const itemNounFor = (vertical: string | null | undefined, legacy = 'สินค้า') =>
  isService(vertical) ? PRODUCT_VOCAB.SERVICE_QUEUE.itemSingular : legacy
