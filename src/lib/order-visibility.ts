// order-visibility.ts — SSOT เดียวของ "ออเดอร์แถวนี้นับเป็นออเดอร์จริงหรือยัง"
//
// ที่มา: 00061 เก็บ "ร่าง" ไว้ในตาราง `Order` แถวเดียวกับออเดอร์จริง (status='DRAFTED')
// แทนที่จะแยกตาราง ⇒ ทุก query ที่นับเงิน/นับจำนวน/แสดงรายการ **ต้องตัดร่างออกเอง**
// ไม่มีชั้นป้องกันที่สอง (DATABASE.md §C)
//
// 🛑 ใช้ "ควบคู่" กับตัวกรองเดิมเสมอ ไม่ใช่แทนที่ — สองอันตอบคนละคำถาม:
//     where: { ...excludeDraftedWhere, status: { not: 'CANCELLED' }, ... }   ← ผิด
// Prisma รับ key `status` ได้ครั้งเดียวต่ออ็อบเจกต์ ⇒ การเขียนแบบข้างบน **ตัวหลังทับตัวหน้า
// เงียบ ๆ** และร่างจะไหลกลับเข้ามาโดยไม่มีอะไรฟ้อง. ท่าที่ถูกคือรวมเป็น `notIn` ตัวเดียว
// ด้วย `withoutDrafted()` ข้างล่าง
export const excludeDraftedWhere = { status: { not: 'DRAFTED' } } as const

/** สถานะที่ "ไม่ใช่ออเดอร์จริง" — ร่างที่ยังไม่ถูกเลื่อนขั้น */
export const DRAFTED_STATUS = 'DRAFTED' as const

/**
 * รวม "ตัดร่างออก" เข้ากับตัวกรองสถานะที่มีอยู่เดิม โดยไม่ให้ key ทับกัน
 *
 * - `withoutDrafted()`                     → { status: { not: 'DRAFTED' } }
 * - `withoutDrafted('CANCELLED')`          → { status: { notIn: ['DRAFTED','CANCELLED'] } }
 * - `withoutDrafted(['CANCELLED','X'])`    → { status: { notIn: ['DRAFTED','CANCELLED','X'] } }
 */
export function withoutDrafted(alsoExclude?: string | string[]) {
  if (alsoExclude === undefined) return { status: { not: DRAFTED_STATUS } } as const
  const extra = Array.isArray(alsoExclude) ? alsoExclude : [alsoExclude]
  return { status: { notIn: [DRAFTED_STATUS, ...extra] } }
}
