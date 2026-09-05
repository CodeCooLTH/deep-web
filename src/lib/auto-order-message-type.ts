// auto-order-message-type.ts — ค่าคงที่เดียวของ `ChatMessage.type` ที่การ์ดผลลัพธ์ 00061 ใช้
//
// 🛑 ไฟล์นี้ **ไม่ import อะไรเลย** แม้แต่ prisma โดยตั้งใจ — เพราะทั้งฝั่งเขียน
// (`auto-order-internal-message.service.ts`) และฝั่งกรองอ่านทุกจุด (chat.service::getMessages ·
// chat-metrics · auto-reply · ai-suggest) ต้องอ้างค่าเดียวกัน. การพิมพ์สตริง
// `'AUTO_ORDER_RESULT'` ซ้ำที่ปลายทางแต่ละที่ = typo-drift ที่ไม่มี gate ไหนจับได้
// (มันเป็นสตริงที่ถูกทั้งคู่ ต่างกันแค่ตัวสะกด แล้วการ์ดจะโผล่ในรายงานเงียบ ๆ)
export const AUTO_ORDER_RESULT_TYPE = 'AUTO_ORDER_RESULT' as const
