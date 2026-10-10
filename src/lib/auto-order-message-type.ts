// auto-order-message-type.ts — ค่าคงที่เดียวของ `ChatMessage.type` ที่การ์ดผลลัพธ์ 00061 ใช้
//
// 🛑 ไฟล์นี้ **ไม่ import อะไรเลย** แม้แต่ prisma โดยตั้งใจ — เพราะทั้งฝั่งเขียน
// (`auto-order-internal-message.service.ts`) และฝั่งกรองอ่านทุกจุด (chat.service::getMessages ·
// chat-metrics · auto-reply · ai-suggest) ต้องอ้างค่าเดียวกัน. การพิมพ์สตริง
// `'AUTO_ORDER_RESULT'` ซ้ำที่ปลายทางแต่ละที่ = typo-drift ที่ไม่มี gate ไหนจับได้
// (มันเป็นสตริงที่ถูกทั้งคู่ ต่างกันแค่ตัวสะกด แล้วการ์ดจะโผล่ในรายงานเงียบ ๆ)
export const AUTO_ORDER_RESULT_TYPE = 'AUTO_ORDER_RESULT' as const

// ข้อความภายในของ Meta ที่ Business Suite ใส่ลงเธรดในนามเพจ ("X replied to an ad." · "Lead stage set to …"
// · "Auto-label added: …" ฯลฯ) — ลูกค้าไม่เห็น ร้านไม่ได้พิมพ์ ⇒ ไม่ใช่ "ร้านตอบ" (2026-10-10)
// ตัดสินด้วย isMetaInternalNote (src/lib/meta-system-notice.ts) ตอนรับเข้า · แสดงเป็นบรรทัดกลางห้อง
export const META_NOTICE_TYPE = 'META_NOTICE' as const

/** ชนิดที่ไม่ใช่บทสนทนา — ห้ามนับเป็นข้อความร้าน/ลูกค้าใน AI · ความจำ · เวลาตอบ · รายงาน · บอท */
export const INTERNAL_MESSAGE_TYPES = [AUTO_ORDER_RESULT_TYPE, META_NOTICE_TYPE]
