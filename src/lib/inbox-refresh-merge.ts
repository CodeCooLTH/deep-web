/**
 * รวมผล "รีเฟรชหน้าแรก" ของรายการแชท (poll 20 วิ + realtime) เข้ากับแถวที่แสดงอยู่
 *
 * merge (ไม่ replace) มีไว้ไม่ให้แถวจาก loadMore หน้าถัด ๆ ไปหายกลางคัน — แต่แถวเดิมที่
 * **หลุดจากตัวกรองไปแล้ว** ก็ถูกเก็บไว้ด้วย และไม่มีวันถูกเอาออก (prod 2026-09-21: เปิดตัวกรอง
 * "พัสดุมีปัญหา" ค้างไว้ พัสดุส่งสำเร็จไปแล้ว แถวยังค้างพร้อมชิป "พัสดุมีปัญหา" ข้ามคืน)
 *
 * กติกา: หน้าแรกที่ **ไม่มีหน้าถัดไป** (`hasMore=false`) = ได้ทุกแถวที่ตรงตัวกรองครบแล้ว
 * ⇒ แถวเดิมที่ไม่อยู่ในนั้นคือแถวที่ไม่ตรงแล้ว ต้องทิ้ง · มีหน้าถัดไป = ยังตัดสินไม่ได้ เก็บไว้
 * `comparable=false` (แถวเดิมเป็นของตัวกรองอื่น) = ใช้ผลใหม่ล้วนเหมือนเดิม
 *
 * ponytail: แถวที่อยู่หลังหน้าแรกของรายการยาวยังค้างข้อมูลเก่าได้จนกว่าจะมีข้อความใหม่ —
 * แก้เต็มต้องมี delta จาก server (ดู branch feat/chat-instant-render-delta)
 */
import { patchConversationRows } from './inbox-row-patch'

export function mergeRefreshedFirstPage<T extends { id: string }>(
  prev: T[],
  fresh: T[],
  opts: { comparable: boolean; hasMore: boolean },
): T[] {
  // กติกาเก็บ/ทิ้งแถวอยู่ที่นี่ · การคงตัวตนของแถวที่ค่าไม่เปลี่ยน (ไม่ให้ทั้งลิสต์ re-render) อยู่ที่
  // patchConversationRows — รวมสองงานที่เคยแก้บรรทัดเดียวกันคนละ branch (HR17, 2026-09-29)
  return patchConversationRows(opts.comparable ? prev : [], fresh, { keepTail: opts.hasMore })
}
