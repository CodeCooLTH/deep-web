/**
 * chat-bubble-frame — "ข้อความนี้ต้องมีกรอบบับเบิลครอบไหม" (ฟังก์ชันบริสุทธิ์)
 *
 * ที่มา 2026-08-11 (ux retroactive review): เดิมเงื่อนไขนี้เป็น OR ห้าก้อนเขียนคาไว้กลาง JSX ของ
 * `ChatThread.tsx` ชื่อ `bareImage` — ไม่มีที่ให้เทสจับ และมันตัดสินหน้าตาของ **ทุกข้อความในเธรด**
 *
 * บั๊กที่เจอตอนตรวจย้อนหลัง: การ์ดสินค้า **ใบเดียว** ไม่ได้อยู่ใน allow-list ทั้งที่ตัวการ์ดเอง
 * (`ProductCardBubble` = `bg-light w-56 rounded-lg`) มีกรอบครบในตัวเหมือนการ์ดหลายใบทุกประการ
 * ผลคือใบเดียวถูกครอบด้วย `rounded px-6 py-3 bg-light` อีกชั้น = การ์ดซ้อนการ์ด และการ์ดสินค้า
 * ชนิดเดียวกันในเธรดเดียวกันมีระยะขอบไม่เท่ากันขึ้นกับว่าส่งไปกี่ใบ
 *
 * 🛑 ข้อยกเว้นที่ห้ามหาย: การ์ดใบเดียวที่ **สินค้าถูกลบไปแล้ว** (resolve ไม่ได้) เรนเดอร์เป็นแถว
 * ไอคอน+ข้อความเปล่า ๆ ไม่มีกรอบ/พื้นหลังในตัวเลย — ตัวนั้นยัง **ต้อง** มีบับเบิลครอบ ไม่งั้นข้อความ
 * "ไม่พบสินค้านี้แล้ว" จะลอยอยู่บนพื้นเธรดโดยไม่มีอะไรบอกว่าเป็นข้อความหนึ่งใบ
 * (นี่คือเหตุผลที่เกณฑ์เป็น "การ์ดที่ resolve ได้" ไม่ใช่ "ชนิด = PRODUCT")
 */

export type ChatBubbleFrameInput = {
  /** `ChatMessage.type` — ค่าอิสระเป็น string เพราะชนิดใหม่ถูกเพิ่มบ่อยและต้องตกเข้ากรณี default */
  type: string
  /** มี body เป็นข้อความจริงไหม (caption ของรูป/วิดีโอ) */
  hasBody: boolean
  hasImageUrl: boolean
  /** ข้อความ TEXT ที่ถอดได้ว่าเป็นการ์ดคำขอชำระเงินของ Meta */
  isMetaOrderCard: boolean
  /** การ์ด carousel ที่ Meta ส่งเข้ามา (ขาเข้า) */
  hasGenericCards: boolean
  /** จำนวนการ์ดสินค้าที่ "ร้านส่งเอง" ในข้อความนี้ (`productCards`) — >1 = carousel */
  productCardsCount: number
  /** การ์ดสินค้าใบเดียวที่ยัง resolve ได้ (สินค้ายังไม่ถูกลบ) */
  hasResolvedSoloCard: boolean
}

/**
 * true = เนื้อหามีกรอบ/พื้นหลังครบในตัวเองแล้ว **ห้าม** ครอบบับเบิลซ้ำ
 * false = เป็นเนื้อหาเปล่า ต้องมีบับเบิลครอบให้
 */
export function isSelfContainedBubble(m: ChatBubbleFrameInput): boolean {
  // การ์ดออเดอร์ของเรา + การ์ดคำขอชำระเงิน/carousel ที่ Meta ส่งมา — ทั้งหมดมีกรอบในตัว
  if (m.type === 'ORDER') return true
  if (m.isMetaOrderCard) return true
  if (m.hasGenericCards) return true
  // การ์ดสินค้าที่ร้านส่งเอง — ทั้ง carousel และใบเดียว ตราบใดที่ยัง resolve ได้ (ดูหัวไฟล์)
  if (m.type === 'PRODUCT') return m.productCardsCount > 1 || m.hasResolvedSoloCard
  // รูป/วิดีโอที่ไม่มี caption — ตัวสื่อเองคือกรอบ; มี caption เมื่อไหร่ต้องมีบับเบิลอุ้มข้อความ
  if (m.type === 'IMAGE' || m.type === 'VIDEO') return m.hasImageUrl && !m.hasBody
  return false
}
