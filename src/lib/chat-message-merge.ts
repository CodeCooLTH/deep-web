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

/**
 * "รุ่น" ของแถว = max(createdAt, updatedAt) เป็น ISO string — ใช้เทียบว่าสำเนาไหนใหม่กว่า และเป็นฐานของ
 * watermark แกน updatedAt (watermarksOf ใน chat-message-store.ts) — HR16: นิยามเดียว
 *
 * 🛑 ต้องเป็น max ไม่ใช่ `updatedAt ?? createdAt` — แถวที่มีก่อน migration ได้ updatedAt = 1970
 *    (fast default, R6) และข้อความ optimistic ไม่มี updatedAt เลย
 * เทียบสตริงได้ตรง ๆ เพราะทั้งสองทางเข้า (API/RSC) ส่ง `toISOString()` รูปแบบเดียวกัน (R2)
 */
export function messageVersion(m: { createdAt: string; updatedAt?: string }): string {
  return m.updatedAt && m.updatedAt > m.createdAt ? m.updatedAt : m.createdAt
}

/**
 * ลำดับของข้อความทั้งระบบ [createdAt asc, seq asc] — seq ที่ไม่มี (optimistic) อยู่ท้ายกลุ่มเวลาเดียวกัน
 * export ให้ผู้ตัดสิน "ใบนี้อยู่หลังใบล่าสุดบนจอไหม" ใช้ตัวเดียวกัน (chat-thread-scroll.ts) — HR16
 */
export function compareMessages(
  a: { createdAt: string; seq?: number },
  b: { createdAt: string; seq?: number },
): number {
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
  return Array.from(byId.values()).sort(compareMessages)
}

/**
 * แทนที่จอด้วยหน้าแรกที่เพิ่งโหลด (R13/R28/R33) — ได้ทั้งรายการที่จะแสดงและชุดแถวที่ใช้ตั้ง watermark
 *
 * 🛑 R28: `fetched` ต้องรวมแถวของ delta ที่ทำให้เกิดการแทนที่ด้วย ไม่ใช่หน้าแรกอย่างเดียว — แถวที่ไล่ดึง
 *    ย้อนหลังจาก Meta ได้ seq สูง + updatedAt = ตอน insert แต่ createdAt เก่า ⇒ ไม่อยู่ในหน้าแรก 30 ใบ
 *    ถ้า watermark มาจากหน้าแรกอย่างเดียว แถวพวกนั้นยังเข้าเงื่อนไข delta ทุกรอบ poll ⇒ delta เต็มเพดาน
 *    ⇒ แทนที่จออีก วนทุก 12 วินาทีไม่มีวันจบ (พร้อมยิง sync ใหม่ + re-render ทั้งลิสต์ + ของเก่าที่
 *    โหลดไว้หาย) · จอยังแสดงแค่หน้าแรก แถวที่เก่ากว่านั้น loadOlder ดึงจาก DB ตรงอยู่แล้ว
 * แถวที่ไม่เปลี่ยนจากบนจอคง object เดิม (กติกาเดียวกับ mergeMessages) ⇒ ไม่ re-render ใบที่เหมือนเดิม
 */
export function firstPageReplacement(input: {
  /** ข้อความบนจอตอนนี้ */
  screen: ChatMessageView[]
  /** หน้าแรกจาก API — เรียงใหม่→เก่า */
  pageDesc: ChatMessageView[]
  /** แถวของ delta ที่ทำให้ต้องแทนที่ ([] ถ้าเหตุมาจากหน้าแรกเอง) */
  triggeredBy: ChatMessageView[]
}): { items: ChatMessageView[]; fetched: ChatMessageView[] } {
  const onScreen = new Map(input.screen.map((m) => [m.id, m]))
  const items = [...input.pageDesc].reverse().map((m) => {
    const current = onScreen.get(m.id)
    return current && sameMessage(current, m) ? current : m
  })
  return { items, fetched: [...input.pageDesc, ...input.triggeredBy] }
}

/** เก็บได้ไม่เกิน `max` ใบ — ตัดใบเก่าสุดทิ้ง เพราะจอเปิดที่ล่างสุดเสมอ */
export function capMessages(items: ChatMessageView[], max: number): ChatMessageView[] {
  if (items.length <= max) return items
  return items.slice(items.length - max)
}

/**
 * ข้อความชุดแรกตอนเปิดห้อง เมื่อมีได้ทั้ง cache ใน store และข้อความชุดแรกจาก RSC (R14, 2026-09-14)
 *
 * 🛑 ห้ามให้ cache ชนะ `initial` เฉย ๆ — cache เก่าได้ถึง 30 นาที ส่วน initial เก่าไม่เกิน ~30 วินาที
 *    (router cache) ⇒ ข้อความล่าสุดที่รายการแชทเพิ่งโชว์จะหายจากห้องจนกว่า delta จะกลับมา
 *
 * - สองชุดคาบเกี่ยวกัน (ใบเก่าสุดของ initial ไม่ใหม่กว่าใบล่าสุดของ cache) → merge: ได้ทั้งของเก่า
 *   ใน cache และของสดจาก initial ต่อกันไม่มีช่องว่าง
 *   🛑 R29: id ที่มีทั้งสองชุด ใช้สำเนาที่ `messageVersion` ใหม่กว่า (เท่ากันใช้ของ cache) — ห้ามให้ initial
 *   ชนะเฉย ๆ: กดกลับมาห้องเดิมภายใน 30 วิ router cache คืน RSC payload เก่าที่ถ่ายไว้ก่อนรีแอ็กชัน/สถานะ
 *   ส่งล่าสุด และ watermark ของ store (R15) อยู่เลยการแก้นั้นไปแล้ว ⇒ delta ไม่มีวันคืนแถวนั้นมาแก้ให้
 *   = รีแอ็กชันหาย/ค้าง "กำลังส่ง" ถาวร
 * - ไม่คาบเกี่ยว (initial ใหม่กว่า cache ทั้งชุด) → ใช้ initial อย่างเดียว เพราะระหว่างสองชุดมี
 *   ข้อความที่ไม่มีใครถืออยู่ ต่อกันจะได้ช่องว่างกลางเธรดที่ loadOlder ไม่มีวันเติม
 *   (`replaceStore: true` = ผู้เรียกต้องเขียนทับ store จาก initial)
 */
export function resolveOpeningMessages(input: {
  cached: { items: ChatMessageView[]; oldestCursor: string | null } | null
  /** เรียงเก่า→ใหม่แล้ว */
  initial: { items: ChatMessageView[]; nextCursor: string | null } | null
}): { items: ChatMessageView[]; oldestCursor: string | null; replaceStore: boolean } {
  const { cached, initial } = input
  if (!initial) return { items: cached?.items ?? [], oldestCursor: cached?.oldestCursor ?? null, replaceStore: false }
  const initialOnly = { items: initial.items, oldestCursor: initial.nextCursor, replaceStore: true }
  if (!cached) return initialOnly
  const oldestInitial = initial.items[0]
  if (!oldestInitial) return { items: cached.items, oldestCursor: cached.oldestCursor, replaceStore: false }
  let newestCached: ChatMessageView | undefined
  for (const m of cached.items) {
    if (m.id.startsWith('local-')) continue
    if (!newestCached || compareMessages(m, newestCached) > 0) newestCached = m
  }
  if (!newestCached || compareMessages(oldestInitial, newestCached) > 0) return initialOnly
  // cursor ของชุดที่ใบเก่าสุดเก่ากว่า — merge แล้วใบบนสุดบนจอมาจากชุดนั้น
  const oldestCached = cached.items[0]
  const oldestCursor =
    oldestCached && compareMessages(oldestCached, oldestInitial) <= 0 ? cached.oldestCursor : initial.nextCursor
  const cachedById = new Map(cached.items.map((m) => [m.id, m]))
  const newerFromInitial = initial.items.filter((m) => {
    const c = cachedById.get(m.id)
    return !c || messageVersion(m) > messageVersion(c)
  })
  return { items: mergeMessages(cached.items, newerFromInitial), oldestCursor, replaceStore: false }
}
