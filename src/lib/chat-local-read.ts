/**
 * chat-local-read — เวลาที่ผู้ใช้เปิดห้องแชทในหน้านี้ (mark-read เชิงบวกฝั่ง client)
 *
 * 🛑 ต้องอยู่ระดับ module ไม่ใช่ state ของ InboxList: บนมือถือรายการ unmount ทุกครั้งที่เข้าห้อง แล้ว
 *    remount ด้วย initialItems จาก router cache ที่ยังมี unread เก่า — state ในคอมโพเนนต์หายไปพร้อม
 *    unmount ⇒ badge เก่าโผล่ ~1 วิจนกว่า refresh ตอน mount จะตอบ (user ส่งคลิป 2026-09-30)
 *    ห้องแชทเขียนค่านี้ตอนยิง POST /read (ซึ่งรายการบนมือถือไม่ได้ mount อยู่ให้เห็น)
 * อยู่ใน memory ของแท็บเท่านั้น (ปิดแอป = หาย ซึ่งตอนนั้นข้อมูลจาก server ถูกแล้ว)
 */
const readAt = new Map<string, string>()

export function markLocalRead(conversationId: string, at: Date = new Date()): void {
  readAt.set(conversationId, at.toISOString())
}

export function localReadAtOf(conversationId: string): string | undefined {
  return readAt.get(conversationId)
}
