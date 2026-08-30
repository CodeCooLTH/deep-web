/**
 * computeMenuScrollTarget — "เมนูข้างควรเลื่อนไปที่ตำแหน่งไหน (หรือไม่เลื่อนเลย)"
 *
 * ที่มา 2026-08-27: user เปิดหน้าแชทแล้วเจอว่าแถบเมนูซ้าย **เลื่อนลงมาเอง** จนหัวรายการ
 * ("ภาพรวมร้านค้า") หลุดจอตั้งแต่ครั้งแรกที่เข้า — *"ครั้งแรกที่เข้ามันจะไม่เห็นภาพรวมร้านค้า
 * (มันเหมือนมัน auto scroll ลงมา)"*
 *
 * ต้นเหตุคือสูตรเดิมใน `AppMenu.tsx`:
 *     offset = activeItem.offsetTop - window.innerHeight * 0.4
 * ซึ่งผิด 3 ชั้นพร้อมกัน:
 *   1. **เลื่อนเสมอ** ไม่ว่าเมนูที่ active จะอยู่ในสายตาอยู่แล้วหรือไม่ ⇒ เปิดหน้ามาแล้วจอขยับเอง
 *      ทุกครั้ง ทั้งที่ไม่มีอะไรต้องตามหา
 *   2. วัดด้วย `window.innerHeight` ซึ่งเป็น **ความสูงของจอ** ไม่ใช่ของกล่องที่กำลังเลื่อน —
 *      rail ของหน้าแชทเริ่มที่ `--topbar-height` จึงเตี้ยกว่าจอเสมอ ตัวเลข 40% เลยเพี้ยนตามไปด้วย
 *   3. ไม่ clamp — ค่าติดลบ/เกินท้ายรายการเป็นไปได้ทั้งคู่
 *
 * 🛑 แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพราะนี่คือ "ตรรกะที่ตัดสินว่า UI จะขยับหรือไม่ขยับ" ซึ่งเขียน
 * กลับด้านแล้วไม่มีอะไรจับได้ถ้าฝังอยู่ใน useEffect (docs/conventions/ui-boolean-needs-a-testable-home.md)
 * — รีโปนี้ไม่มี jsdom จึงทดสอบ DOM ตรง ๆ ไม่ได้ ต้องยกเลขออกมาเทสแทน
 */

export type MenuScrollGeometry = {
  /** ตำแหน่งบนของเมนูที่ active เทียบกับเนื้อหาทั้งก้อน (px) */
  itemTop: number
  itemHeight: number
  /** ตำแหน่งที่กล่องเลื่อนอยู่ตอนนี้ */
  scrollTop: number
  /** ความสูงที่ "มองเห็น" ของกล่องเลื่อน — ต้องเป็นของกล่อง ไม่ใช่ของ viewport */
  clientHeight: number
  /** ความสูงเนื้อหาทั้งหมด */
  scrollHeight: number
}

/**
 * คืน `null` = **ห้ามเลื่อน** (เห็นครบอยู่แล้ว หรือกล่องยังไม่มีขนาดจริง)
 * ไม่ใช่คืน `scrollTop` เดิม เพราะผู้เรียกต้องแยก "ไม่ต้องทำอะไร" ออกจาก "เลื่อนไปที่ 0" ให้ได้
 * (เลื่อนไป 0 ด้วยอนิเมชัน 500ms ก็ยังเป็นจอที่ขยับเอง)
 */
export function computeMenuScrollTarget(g: MenuScrollGeometry): number | null {
  // กล่องยังไม่ถูก layout (ความสูง 0) — คำนวณอะไรไปก็ผิดหมด
  if (g.clientHeight <= 0) return null

  const viewTop = g.scrollTop
  const viewBottom = g.scrollTop + g.clientHeight
  const itemBottom = g.itemTop + g.itemHeight

  // เห็นครบทั้งชิ้นอยู่แล้ว → ไม่ขยับ (นี่คือกรณีของหน้าแชท: เมนูที่ active อยู่ในจอแรกอยู่แล้ว)
  if (g.itemTop >= viewTop && itemBottom <= viewBottom) return null

  const max = Math.max(0, g.scrollHeight - g.clientHeight)
  // เลื่อน "น้อยที่สุดที่ทำให้เห็น" — อยู่เหนือกรอบ → ชิดบน · อยู่ใต้กรอบ → ชิดล่าง
  // ห้ามจัดกึ่งกลาง: มันขยับไกลกว่าที่จำเป็นเสมอ และเป็นเหตุผลที่หัวรายการหลุดจอมาแต่แรก
  const raw = g.itemTop < viewTop ? g.itemTop : itemBottom - g.clientHeight
  const target = Math.min(Math.max(raw, 0), max)

  // ปัดแล้วได้ที่เดิม → ไม่ต้องยิงอนิเมชันให้เปลือง
  return target === g.scrollTop ? null : target
}
