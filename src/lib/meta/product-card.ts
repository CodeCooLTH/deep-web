/**
 * product-card — การ์ดสินค้าแบบ Generic Template ของ Messenger/Instagram (2026-08-11)
 *
 * เทียบเท่ากับ Flex ของ LINE: เนื้อหายึด **การ์ดในแอป** (`ProductCardBubble`) ให้ตรงกันทุกช่องทาง —
 * รูป · ชื่อ · ราคา · "หยุดขายแล้ว" และ **ไม่มีปุ่ม** (ระบบไม่มีหน้าสาธารณะของสินค้ารายชิ้นให้ลิงก์ไป)
 *
 * เพดานจากเอกสาร Messenger (ยืนยัน 2026-08-11 — ห้ามแก้ตัวเลขจากความจำ):
 *   elements ≤ 10 · title ≤ 80 · subtitle ≤ 80 · ปุ่ม ≤ 3 ต่อ element · รูปควรเป็น 1.91:1
 * IG ใช้โครงเดียวกันเป๊ะ (developers.facebook.com/documentation/instagram-platform → generic-template)
 *
 * ข้อบังคับ: pure — คืน payload object ล้วน ไม่ยิง HTTP (ผู้ส่งคือ graph.ts)
 */

/** เพดานตัวอักษรของ Meta — เกินแล้ว **Meta ตัดให้เองแบบไม่บอก** จึงต้องตัดเองเพื่อคุมจุดตัด */
export const META_TITLE_MAX = 80
export const META_SUBTITLE_MAX = 80

/**
 * ตัดข้อความให้พอดีเพดาน โดยพยายามตัดที่ **ช่องว่างคำสุดท้าย** ก่อน
 *
 * ที่มา: user เจอเองบน prod 2026-08-04 กับ `image_grid` (title 45 ตัว) — ประโยคถูกตัดคากลางคำ
 * ("เพิ่มความนุ่") อ่านแล้วเหมือนระบบพัง. ภาษาไทยไม่มีช่องว่างระหว่างคำ กรณีนั้นจึงตัดตรงกลางได้อยู่ดี
 * แต่ชื่อสินค้าจริงมักมีช่องว่างคั่นรุ่น/ไซส์ ("เสื้อยืดคอกลม สีขาว ไซส์ L") — ตัดที่ช่องว่างจึงช่วยได้จริง
 * และเติม `…` เพื่อให้ผู้อ่านรู้ว่ายังมีต่อ ไม่ใช่คิดว่าชื่อสินค้าลงท้ายแบบนั้น
 */
export function truncateForMeta(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  const room = max - 1 // เผื่อที่ให้ …
  const cut = t.slice(0, room)
  const lastSpace = cut.lastIndexOf(' ')
  // ตัดที่ช่องว่างเฉพาะเมื่อไม่ทำให้สั้นจนเสียความหมาย (เหลือ ≥60% ของที่มีที่ว่าง)
  const body = lastSpace >= room * 0.6 ? cut.slice(0, lastSpace) : cut
  return `${body.trimEnd()}…`
}

export interface MetaProductCardInput {
  name: string
  /** ราคาที่ผ่าน `formatBaht` มาแล้ว (HR16 — ไฟล์นี้ไม่ฟอร์แมตเงินเอง) */
  priceText: string
  /** URL รูป 1.91:1 ที่ Meta ดึงได้ — `null` = การ์ดไม่มีรูป */
  imageUrl: string | null
  isActive: boolean
}

/** เพดานจำนวนการ์ดต่อข้อความของ Meta — ตัวเลขสำหรับ "แบ่งกี่ข้อความ" อยู่ที่
 *  `lib/chat-product-card-batch.ts` (SSOT ฝั่งผู้เรียก) ที่นี่เก็บไว้เป็นด่านสุดท้ายกันส่งเกินจริง */
export const META_CAROUSEL_MAX = 10

/** 1 element ของ generic template — นิยามเดียวที่ทั้งการ์ดเดี่ยวและ carousel ใช้ร่วมกัน */
function toElement(input: MetaProductCardInput): Record<string, unknown> {
  // subtitle รวมราคาและสถานะไว้บรรทัดเดียว — generic template ไม่มีที่ให้บรรทัดที่สาม
  // "หยุดขายแล้ว" เป็น **คำ** ไม่ใช่สี (Meta ไม่ให้คุมสีอยู่แล้ว) จึงไม่มีปัญหาคอนทราสต์เหมือนฝั่ง LINE
  const subtitle = input.isActive ? input.priceText : `${input.priceText} · หยุดขายแล้ว`

  const element: Record<string, unknown> = {
    title: truncateForMeta(input.name, META_TITLE_MAX),
    subtitle: truncateForMeta(subtitle, META_SUBTITLE_MAX),
  }
  // ไม่ใส่คีย์ image_url เลยเมื่อไม่มีรูป — ส่งค่าว่างไป Meta ตีเป็น payload ผิดรูปแล้วตกทั้งข้อความ
  if (input.imageUrl) element.image_url = input.imageUrl
  return element
}

/**
 * การ์ดสินค้าหลายชิ้นในข้อความเดียว — ลูกค้าเลื่อนซ้ายขวาได้ (ส่วนขยาย 2026-08-11)
 *
 * โครงเดียวกับการ์ดเดี่ยวทุกประการ ต่างแค่จำนวน element — Messenger เรนเดอร์เป็น carousel เองเมื่อมี
 * มากกว่า 1 ใบ ไม่ต้องเปลี่ยน template_type
 *
 * 🛑 ตัดที่ 10 ใบเป็นด่านสุดท้าย: ผู้เรียกควรแบ่งชุดมาให้ถูกตั้งแต่ต้น (chunkProductCards) แต่ถ้าหลุด
 * มาเกิน Meta จะ **ปฏิเสธทั้งข้อความ** ไม่ใช่ตัดให้ — ยอมส่ง 10 ใบแรกดีกว่าลูกค้าไม่ได้อะไรเลย
 */
export function buildMetaProductCarousel(inputs: MetaProductCardInput[]): Record<string, unknown> {
  const elements = inputs.slice(0, META_CAROUSEL_MAX).map(toElement)
  return {
    type: 'template',
    payload: { template_type: 'generic', elements },
  }
}

/** payload ของ `message.attachment` ที่พร้อมยิงเข้า Send API (การ์ดใบเดียว) */
export function buildMetaProductCard(input: MetaProductCardInput): Record<string, unknown> {
  return buildMetaProductCarousel([input])
}
