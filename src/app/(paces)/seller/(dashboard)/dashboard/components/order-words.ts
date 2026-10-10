/**
 * คำเรียก "ออเดอร์" บนการ์ดสถิติของหน้าแรก — เฉพาะร้านบริการที่ผันเป็น "งานบริการ"
 * (user 2026-10-10: ร้านบริการต้องไม่เห็นคำของร้านขายของ) ร้านอื่นรวม LODGING คงคำเดิมเป๊ะ
 * (LODGING ยังไม่ได้ทบทวน) · คำทั้งหมดอ่านจาก t.vocab ซึ่งสะท้อน ORDER_VOCAB อยู่แล้ว ไม่ประกาศซ้ำ
 */
import { byVertical } from '@/i18n/vertical'
import type { Dictionary } from '@/i18n/dictionaries/th'

export function dashboardOrderWords(t: Dictionary, vertical: string | null | undefined) {
  const svc = vertical === 'SERVICE_QUEUE'
  return {
    /** "ออเดอร์" ในประโยค/หน่วยนับ */
    word: svc ? byVertical(t.vocab.orderNoun, vertical) : t.dashboard.ordersWord,
    /** "คำสั่งซื้อ" ในประโยค */
    noun: byVertical(t.vocab.orderNoun, svc ? vertical : 'ONLINE_SALES'),
    /** ป้ายหัวข้อ/ซีรีส์ที่เดิมเป็น "ออเดอร์" */
    title: svc ? byVertical(t.vocab.orderNounTitle, vertical) : t.dashboard.statOrders,
  }
}
