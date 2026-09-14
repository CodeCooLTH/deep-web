/**
 * inbox-row-patch — อัปเดตรายการแชทโดยไม่สร้าง object ใหม่ให้แถวที่ไม่ได้เปลี่ยน
 * (ส่วนขยาย 00018, 2026-09-14)
 *
 * ทำไมต้องมี: `refreshFirstPage` เดิมทำ `setItems([...ก้อนใหม่, ...ของเดิมที่ไม่ซ้ำ])` ทุกรอบ
 * poll 20 วินาที ⇒ ทุกแถวเป็น object ใหม่หมด ⇒ React re-render ทั้งลิสต์ ⇒ ผู้ใช้รายงานว่า
 * "กล่องแชทมันรู้สึกเหมือนเด้งตลอดเวลา" (2026-09-14)
 *
 * 🛑 ชุดใหม่ที่รับเข้ามาคือ **หน้าแรก** ไม่ใช่รายการทั้งหมด ⇒ แถวเดิมที่ไม่อยู่ในชุดใหม่
 *    ต้องไม่หายไป (ผู้ใช้อาจเลื่อนโหลดมาแล้วหลายหน้า)
 *
 * 🛑 `ConversationListItem` มีฟิลด์ที่เป็น object (`counterparty`/`orderStage`/`shop`/
 *    `customerBehavior`) และ array-of-object (`threadAgents`) — เทียบด้วย `!==` ตรง ๆ จะเห็น
 *    ว่า "เปลี่ยน" ทุกรอบเพราะ fetch ใหม่สร้าง object ใหม่เสมอแม้ค่าข้างในเท่าเดิม จึงต้องใช้
 *    deep-equal (`lodash.isEqual` — มีอยู่แล้วในโปรเจกต์) ไม่ใช่ shallow compare
 */
import { isEqual } from 'lodash'

export function patchConversationRows<T extends { id: string }>(prev: T[], fresh: T[]): T[] {
  const prevById = new Map(prev.map((r) => [r.id, r]))
  const freshIds = new Set(fresh.map((r) => r.id))
  const head = fresh.map((next) => {
    const current = prevById.get(next.id)
    return current && isEqual(current, next) ? current : next
  })
  const out = [...head, ...prev.filter((r) => !freshIds.has(r.id))]
  // ทุกตำแหน่งเป็น object เดิมเป๊ะ (ค่าเท่าเดิม + ลำดับเดิม) → คืน array เดิม React จะข้ามทั้งบล็อก
  return out.length === prev.length && out.every((r, i) => r === prev[i]) ? prev : out
}
