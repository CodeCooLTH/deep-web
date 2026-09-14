/**
 * chat-thread-scroll — การตัดสินใจเรื่องจอของห้องแชท (ส่วนขยาย 00018, 2026-09-14)
 *
 * ทำไมต้องยกออกมาเป็นฟังก์ชัน: boolean ที่ตัดสินว่า UI จะทำหรือไม่ทำอะไร ต้องมีที่ให้เทสจับ
 * (docs/conventions/ui-boolean-needs-a-testable-home.md) — เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม"
 * แต่คือ "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม" ซึ่งเคยพลาดมาแล้วกับปุ่มย่อกลับที่เขียน
 * กลับด้านแล้วผ่านทุก gate (2026-08-09)
 */

/** ข้อความใหม่เข้ามาแล้วควรเลื่อนจอตามไหม */
export function shouldFollowNewMessages(input: {
  /** จออยู่ล่างสุด (หรือใกล้ล่างสุดในระยะที่ถือว่ากำลังอ่านของล่าสุดอยู่) */
  atBottom: boolean
  /** ในชุดที่เพิ่งเข้ามา มีข้อความ **ใหม่** ที่ร้านเป็นคนส่งเองหรือไม่ (แถวเดิมที่ถูกแก้ไม่นับ) */
  hasIncomingFromSelf: boolean
}): boolean {
  // ร้านกดส่งเอง = เจตนาชัดว่าอยากเห็นผลลัพธ์ ต้องเลื่อนตามแม้กำลังอ่านของเก่าอยู่
  if (input.hasIncomingFromSelf) return true
  return input.atBottom
}

/** sentinel บนสุดถูกมองเห็นแล้ว — โหลดของเก่าต่อได้ไหม */
export function canAutoLoadOlder(input: {
  /**
   * ผู้ใช้เคยเลื่อนจอด้วยตัวเองแล้วอย่างน้อยหนึ่งครั้งในห้องนี้
   * 🛑 ถ้าไม่มีเงื่อนไขนี้ IntersectionObserver จะยิง loadOlder ทันทีที่ mount เมื่อเนื้อหา
   *    ไม่สูงพอจะดัน sentinel ให้พ้นจอ (เธรดสั้น / จอสูง) = โหลดของเก่าเองโดยผู้ใช้ไม่ได้ขอ
   */
  userHasScrolled: boolean
  hasCursor: boolean
  loading: boolean
}): boolean {
  return input.userHasScrolled && input.hasCursor && !input.loading
}

/**
 * จำนวนข้อความ "ใหม่จริง" ในชุดที่เพิ่งเข้ามา — ตัวนับของปุ่ม "ข้อความใหม่" (spec §5.4, R4)
 *
 * 🛑 delta คืนทั้งแถวใหม่ (seq > watermark) และแถวเก่าที่ค่าเปลี่ยน (updatedAt > watermark)
 *    แถวที่มีบนจออยู่แล้วคือการแก้ ไม่ใช่ข้อความใหม่ — นับเข้าไปปุ่มจะชวนให้เลื่อนลงไปหาของที่ไม่มี
 */
export function countNewIncoming(prevIds: Set<string>, incoming: { id: string }[]): number {
  let n = 0
  for (const m of incoming) if (!prevIds.has(m.id)) n++
  return n
}
