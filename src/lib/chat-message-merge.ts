import type { ChatMessageView } from '@/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread'

/**
 * chat-message-merge — กฎการรวมข้อความเข้ากับของที่จออ่านอยู่ (ส่วนขยาย 00018, 2026-09-14)
 *
 * 🛑 กฎที่ห้ามผิด 2 ข้อ:
 *
 * 1) **แทรกตามเวลา ไม่ใช่ต่อท้าย** — ข้อความที่ไล่ดึงย้อนหลังมาจาก Meta ได้ `seq` ใหม่
 *    (autoincrement ตอน insert) แต่ `createdAt` เป็นเวลาจริงซึ่งเก่า ถ้า merge แบบต่อท้าย
 *    มันจะไปโผล่ล่างสุดทั้งที่ควรอยู่กลางเธรด
 *
 * 2) **ใบที่ไม่เปลี่ยนต้องเป็น object เดิม** — ถ้าสร้าง object ใหม่ให้ทุกใบ React จะ
 *    re-render ทั้งลิสต์ทุกครั้งที่ delta กลับมา ซึ่งคือต้นเหตุอาการ "เด้ง" ที่ฟีเจอร์นี้
 *    ตั้งใจแก้ (ผู้ใช้รายงาน 2026-09-14: "กล่องแชทมันรู้สึกเหมือนเด้งตลอดเวลา")
 *
 * ลำดับยึด [createdAt asc, seq asc] ให้ตรงกับ orderBy ฝั่ง server (chat.service.ts) เป๊ะ
 * ข้อความ optimistic ยังไม่มี seq → ถือว่าอยู่ท้ายสุดของกลุ่มเวลาเดียวกัน
 */

/**
 * true = สองใบนี้เหมือนกันทุกฟิลด์ที่จอสนใจ ⇒ ไม่ต้องสร้าง object ใหม่
 *
 * หมายเหตุ: brief ต้นฉบับอ้างฟิลด์ `deliveryStatus`/`failureReason` ซึ่งไม่มีอยู่จริงบน
 * `ChatMessageView` (tsc ฟ้อง TS2339/TS2551 — ยืนยันกับ useSellerChatThread.ts แล้ว)
 * ชื่อจริงคือ `_status`/`_failReason` (สถานะ optimistic ของบับเบิลที่ยังไม่บันทึกจริง)
 */
function sameMessage(a: ChatMessageView, b: ChatMessageView): boolean {
  return (
    a.body === b.body &&
    a.imageUrl === b.imageUrl &&
    a.reactionEmoji === b.reactionEmoji &&
    a.isDeleted === b.isDeleted &&
    a.edited === b.edited &&
    a._status === b._status &&
    a._failReason === b._failReason &&
    a.createdAt === b.createdAt &&
    a.seq === b.seq &&
    // updatedAt = สัญญาณ "แถวนี้เปลี่ยน" ที่ครอบคลุมฟิลด์ที่ไม่ได้ list ไว้ข้างบน
    // (cards/productCard ฯลฯ, R3 2026-09-14) — ไม่มีมันเทียบไม่ครบ
    a.updatedAt === b.updatedAt
  )
}

function compare(a: ChatMessageView, b: ChatMessageView): number {
  const dt = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  if (dt !== 0) return dt
  return (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER)
}

export function mergeMessages(
  prev: ChatMessageView[],
  incoming: ChatMessageView[],
): ChatMessageView[] {
  if (incoming.length === 0) return prev

  const byId = new Map(prev.map((m) => [m.id, m]))
  let changed = false

  for (const next of incoming) {
    const current = byId.get(next.id)
    if (!current) {
      byId.set(next.id, next)
      changed = true
      continue
    }
    if (sameMessage(current, next)) continue // object เดิมอยู่ใน map แล้ว ไม่ต้องทำอะไร
    byId.set(next.id, next)
    changed = true
  }

  if (!changed) return prev
  return Array.from(byId.values()).sort(compare)
}

/** เก็บได้ไม่เกิน `max` ใบ — ตัดใบเก่าสุดทิ้ง เพราะจอเปิดที่ล่างสุดเสมอ */
export function capMessages(items: ChatMessageView[], max: number): ChatMessageView[] {
  if (items.length <= max) return items
  return items.slice(items.length - max)
}
