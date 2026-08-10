/**
 * facebook-post — กติกาเล็ก ๆ ที่ใช้ร่วมกันเวลาแสดง "โพสต์ของเพจ" (feature 00029/00038)
 *
 * 🛑 สกัดออกมาเป็นที่เดียวเพราะกำลังจะมีผู้เรียกรายที่สอง (Hard Rule 16)
 *
 * เดิม `isVideoPost` อยู่เป็น local function ใน `inbox/comments/CommentsClient.tsx` ที่เดียว
 * ตอนการ์ด "คอมเมนต์ต้นเหตุ" ในห้องแชทต้องใช้กติกาเดียวกัน ทางที่ง่ายที่สุดคือก็อปไปวาง —
 * ซึ่งจะได้นิยาม "โพสต์นี้เป็นวิดีโอไหม" สองชุดที่เพี้ยนจากกันได้เงียบ ๆ (ปุ่มเล่นขึ้นในรายการ
 * แต่ไม่ขึ้นในห้องแชท บนโพสต์ใบเดียวกัน) โดยไม่มี tsc/เทสตัวไหนฟ้อง
 *
 * pure module — ไม่ import อะไรเลย ใช้ได้ทั้ง server และ client
 */

/**
 * โพสต์วิดีโอหรือเปล่า
 *
 * Graph ส่ง `media_type` เป็น `'video'` ส่วนโพสต์เก่าที่มาจาก `status_type` ใช้ `'added_video'`
 * จึงต้องเช็คทั้งค่าตรงตัวและแบบมีคำว่า video อยู่ข้างใน
 */
export function isVideoPost(mediaType: string | null | undefined): boolean {
  return !!mediaType && (mediaType === 'video' || mediaType.includes('video'))
}
