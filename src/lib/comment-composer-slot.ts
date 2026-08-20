/**
 * comment-composer-slot — "ช่องพิมพ์ควรอยู่ที่ไหน" ของเธรดคอมเมนต์
 *
 * ช่องพิมพ์มีที่ยืนได้ 2 ที่ แต่มีได้ทีละที่:
 *   `inline` = แทรกใต้บับเบิลที่กำลังตอบ (user สั่ง 2026-08-04 ตามภาพ Business Suite)
 *   `bottom` = แถบล่างสุดของแผง
 *
 * 🛑 **ทำไมต้องเป็นฟังก์ชันแยกที่มีเทส แทนที่จะเป็นเงื่อนไข 2 ก้อนใน JSX**
 *
 * ของเดิมตัดสินแยกกันคนละที่: แถบล่างเช็ค `!replyTo` ส่วน inline เช็คว่าบับเบิลนั้น
 * **อยู่ใน `visibleTree`** — สองเงื่อนไขนี้ไม่ใช่ส่วนเติมเต็มของกัน ทำให้มีช่องว่างที่
 * **ไม่มีช่องพิมพ์เลยทั้งจอ**:
 *
 *   กด "ตอบ" บนคอมเมนต์ที่ตอบไปแล้ว → พิมพ์ค้างไว้ครึ่งประโยค → กดชิป "ยังไม่ตอบ N"
 *   → กลุ่มนั้นหลุดจาก `visibleTree` → inline unmount แต่แถบล่างยังซ่อนเพราะ `replyTo`
 *   ยังไม่ null ⇒ ไม่มีที่พิมพ์ และปุ่ม ✕ "ยกเลิกการตอบ" ก็อยู่ *ข้างใน* composer ที่หายไปแล้ว
 *   ⇒ ไม่มีทางออกในจอ ต้องเดากดชิปกลับเอง
 *
 * เส้นทางเดียวกันเกิดเองได้จาก realtime ด้วย (เพื่อนร่วมทีมตอบคอมเมนต์ที่เรากำลังจ่อตอบอยู่
 * → `loadThread(silent)` ทำให้กลุ่มนั้นกลายเป็น answered → composer หายกลางประโยค)
 *
 * เกณฑ์ไม่ใช่ "ซับซ้อนพอไหม" แต่คือ **"ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม"** — เงื่อนไขนี้
 * ตัดสินว่า UI จะ *มีหรือไม่มี* ช่องพิมพ์ ซึ่งเขียนผิดแล้วยังเป็น JSX ที่ถูกชนิดทุกประการ
 * (`docs/conventions/ui-boolean-needs-a-testable-home.md` · impeccable critique 2026-08-20 P1-A)
 */

export type ComposerSlot = 'inline' | 'bottom'

/**
 * คืนว่าช่องพิมพ์ควรอยู่ที่ไหน — **คืนค่าเสมอ ไม่มี `null`** นั่นคือหัวใจของการแก้:
 * ผู้ใช้ต้องมีที่พิมพ์เสมอ ไม่ว่าเป้าหมายที่กำลังตอบจะยังมองเห็นอยู่ไหม
 *
 * @param replyToId  คอมเมนต์ที่กำลังจ่อตอบ (null = ยังไม่ได้เลือกใคร)
 * @param isReplyTargetVisible  เป้าหมายนั้นยัง render อยู่ในรายการที่มองเห็นไหม
 *        (ผู้เรียกต้อง derive จาก `visibleTree` **ตัวเดียวกับที่ใช้ render** ห้ามคำนวณคู่ขนาน)
 */
export function resolveComposerSlot(replyToId: string | null, isReplyTargetVisible: boolean): ComposerSlot {
  if (replyToId && isReplyTargetVisible) return 'inline'
  return 'bottom'
}

/**
 * เป้าหมายที่กำลังตอบยังมองเห็นอยู่ไหม — ไล่ทั้งคอมเมนต์ระดับบนและลูกของมัน
 *
 * รับ `visibleTree` รูปเดียวกับที่ JSX วนแสดง เพื่อให้ "สิ่งที่เห็น" กับ "สิ่งที่ตัดสิน" มาจาก
 * แหล่งเดียวกันเสมอ (HR16 — คำถามเดียวกันต้องมีคำตอบเดียว)
 */
export function isReplyTargetVisible(
  replyToId: string | null,
  visibleTree: ReadonlyArray<{ comment: { id: string }; replies: ReadonlyArray<{ id: string }> }>,
): boolean {
  if (!replyToId) return false
  return visibleTree.some((t) => t.comment.id === replyToId || t.replies.some((r) => r.id === replyToId))
}
