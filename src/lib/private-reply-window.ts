/**
 * หน้าต่าง "ทักแชทส่วนตัวจากคอมเมนต์" ของ Meta = 7 วันนับจากเวลาที่ลูกค้าคอมเมนต์ (feature 00038)
 *
 * 🛑 SSOT ของตัวเลขนี้ทั้งระบบ — ห้ามเขียน `7 * 24 * 60 * 60 * 1000` ซ้ำที่อื่นอีก
 *
 * ทำไมต้องแยกออกมาเป็น lib: SRS ของ 00038 (§FR-CR-PR "ห้าม hardcode ตัวเลขซ้ำที่ 3") เขียนเตือน
 * ไว้ตั้งแต่วันแรก แต่สุดท้ายมันก็ถูกคัดลอกไป **3 ที่จริง ๆ** (`comment-private-reply.service.ts`
 * ที่ประกาศตัวเองเป็นเจ้าของ · `CommentsClient.tsx:165` ฝั่งจอ · `page-comment.service.ts:1015`
 * ที่นับ DM window) เพราะเจ้าของเดิม import ตรง ๆ ไม่ได้ — `comment-private-reply.service` เรียก
 * `resolveChannelToken` จาก `page-comment.service` อยู่แล้ว การ import กลับทางจะเป็นวงกลม.
 * ไฟล์นี้ไม่แตะ prisma/Graph เลย จึงเป็นที่ที่ทุกฝั่ง (service · route · client component)
 * import ได้โดยไม่ลากอะไรติดไปด้วย
 *
 * 🛑 เกณฑ์นี้ตอบเฉพาะ "ทักแชทส่วนตัวได้ไหม" — **ไม่ได้แปลว่าคอมเมนต์นั้นทำอะไรไม่ได้แล้ว**
 * การตอบใต้คอมเมนต์แบบสาธารณะไม่มีหน้าต่างเวลา ทำได้ตลอดไป (นั่นคือเหตุผลที่แท็บ "หมดอายุ"
 * เป็น *มุมมองซ้อน* ของ "ยังไม่ตอบ" ไม่ใช่ของที่ถูกหักออกไป)
 */
export const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * ยังทักได้ไหม
 *
 * เวลาคอมเมนต์ที่อยู่ในอนาคต (นาฬิกาเครื่องเพี้ยน / timezone) ถือว่ายังทักได้ ไม่ใช่ error
 */
export function isWithinPrivateReplyWindow(commentCreatedTime: Date, now: Date = new Date()): boolean {
  return now.getTime() - commentCreatedTime.getTime() < PRIVATE_REPLY_WINDOW_MS
}

/**
 * เส้นแบ่งเวลาสำหรับฝั่ง SQL — คอมเมนต์ที่ `createdTime < cutoff` คือใบที่พ้นหน้าต่างแล้ว
 *
 * ต้องเป็น `<` ให้ตรงกับ `isWithinPrivateReplyWindow` ที่ใช้ `<` (ที่ขอบพอดี = ยังทักได้)
 * — SQL กับ TS สองอันนี้ตอบคำถามเดียวกันคนละภาษา หลุดกันเมื่อไหร่ "ตัวเลขบนแท็บ" กับ
 * "รายการใต้มัน" จะไม่ตรงกันโดยไม่มีอะไรฟ้อง (จอนี้เคยโชว์ "ยังไม่ตอบ 7 กับ 8" มาแล้ว)
 */
export function privateReplyWindowCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - PRIVATE_REPLY_WINDOW_MS)
}
