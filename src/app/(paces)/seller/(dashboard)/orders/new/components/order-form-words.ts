/**
 * คำที่ฟอร์มสร้างใบใช้ซ้ำหลาย block (ลูกค้าเก่า N ออเดอร์ / ผู้ซื้อ / ออเดอร์นี้…)
 *
 * ผันเฉพาะร้านบริการ (user 2026-10-10) · ร้านอื่นรวม LODGING คงคำเดิมเป๊ะ — LODGING ยังไม่ได้ทบทวน
 * (CUSTOMER_LIST_VOCAB.LODGING.unit = "บิล" จึงใช้ตรง ๆ ไม่ได้: จะเปลี่ยนข้อความของที่พัก)
 * คำทั้งหมดอ่านจาก SSOT เดิม ไม่ประกาศชุดคู่ขนาน
 */
import { resolveCustomerListVocab } from '@/lib/customer-directory'
import type { OrderVocab } from '@/lib/seller-menu'

export type OrderFormWords = {
  /** "ออเดอร์" ในประโยค — ร้านบริการ = ORDER_VOCAB.noun */
  orderWord: string
  /** หน่วยนับหลังตัวเลข "ลูกค้าเก่า · N ___" — ร้านบริการ = CUSTOMER_LIST_VOCAB.unit */
  orderUnit: string
  /** "ผู้ซื้อ" — ร้านบริการ = ORDER_VOCAB.buyerNoun */
  buyerNoun: string
}

export const DEFAULT_ORDER_FORM_WORDS: OrderFormWords = { orderWord: 'ออเดอร์', orderUnit: 'ออเดอร์', buyerNoun: 'ผู้ซื้อ' }

export function orderFormWords(vertical: string, vocab: Pick<OrderVocab, 'noun' | 'buyerNoun'>): OrderFormWords {
  return vertical === 'SERVICE_QUEUE'
    ? { orderWord: vocab.noun, orderUnit: resolveCustomerListVocab(vertical).unit, buyerNoun: vocab.buyerNoun }
    : DEFAULT_ORDER_FORM_WORDS
}
