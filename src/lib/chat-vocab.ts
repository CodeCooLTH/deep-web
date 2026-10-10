/**
 * คำเรียก "ของที่คุยในแชท" ผันตามประเภทกิจการ — ใช้ทั้งหน้าจอ (ปุ่ม/แผงเลือกสินค้า) และ server
 * (preview/quote ที่ถูกเก็บลง Conversation.lastMessagePreview)
 *
 * ทำไมไม่ส่งตรง `resolveProductVocab(v).itemColLabel`: LODGING มีคำของตัวเองใน PRODUCT_VOCAB
 * ('ห้องพัก') แต่งานนี้ตกลงให้เปลี่ยนเฉพาะร้านบริการ (SERVICE_QUEUE) ส่วนร้านอื่นต้องแสดงคำเดิมเป๊ะ
 * จึงให้ทุก vertical ที่ไม่ใช่ร้านบริการถอยไปใช้ชุดของ ONLINE_SALES — คำทั้งหมดยังมาจาก
 * seller-menu.ts (SSOT) ไม่มีรายการคำคู่ขนานที่นี่ (HR16)
 */
import { resolveOrderVocab, resolveProductVocab } from '@/lib/seller-menu'

function chatVertical(vertical: string | null | undefined): string {
  return vertical === 'SERVICE_QUEUE' ? 'SERVICE_QUEUE' : 'ONLINE_SALES'
}

/** ชื่อของที่ร้านขายในแชท — "สินค้า" / ร้านบริการ "บริการ" */
export function chatItemLabel(vertical: string | null | undefined): string {
  return resolveProductVocab(chatVertical(vertical)).itemColLabel
}

/** ชื่อสั้นของใบรายการ (ออเดอร์) ใน preview/quote — "คำสั่งซื้อ" / ร้านบริการ "บริการ" */
export function chatOrderLabel(vertical: string | null | undefined): string {
  return resolveOrderVocab(chatVertical(vertical)).nounShort
}

/** ป้ายแทนการ์ดที่ไม่มี body ใน preview/quote */
export function chatCardPreview(kind: 'ORDER' | 'PRODUCT', vertical: string | null | undefined): string {
  return `[${kind === 'ORDER' ? chatOrderLabel(vertical) : chatItemLabel(vertical)}]`
}

/** บรรทัดยอดสะสมบนการ์ดในแผงเลือกสินค้า — "สั่งซื้อแล้ว N ชิ้น" / ร้านบริการ "ใช้บริการแล้ว N ครั้ง" */
export function chatSoldLine(vertical: string | null | undefined, formattedCount: string): string {
  return resolveProductVocab(chatVertical(vertical)).soldLine(formattedCount)
}
