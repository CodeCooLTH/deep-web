'use client'

import type { ChatMessageView } from '@/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread'
import { capMessages } from '@/lib/chat-message-merge'

/**
 * chat-message-store — cache ข้อความรายห้อง ฝั่ง browser (ส่วนขยาย 00018, 2026-09-14)
 *
 * ทำไมต้องมี: การเปิดห้องที่เคยเปิดแล้วต้องเห็นข้อความ **ทันทีโดยไม่ยิงอะไรเลย** แล้วค่อย
 * reconcile ด้วย delta เบื้องหลัง — เดิมทุกการเปิดห้องต้องรอ RSC payload (ซึ่ง prefetch ไว้
 * แต่ค้างได้ถึง 30 วินาทีตาม staleTimes.dynamic ใน next.config.ts)
 *
 * 🛑 store นี้เป็น **ภาพนิ่ง ไม่ใช่แหล่งความจริง** (HR16) — ทุกครั้งที่เปิดห้องต้องยิง delta
 *    ไป reconcile เสมอ ห้ามเชื่อ cache อย่างเดียว
 *
 * 🛑 **ไม่ลง localStorage โดยตั้งใจ** — ข้อความลูกค้าเป็น PII ไม่ควรค้างบนดิสก์เครื่องร้าน
 *    อยู่ใน memory ของแท็บเท่านั้น ปิดแท็บแล้วหายไปพร้อมกัน
 */

export const MAX_MESSAGES_PER_THREAD = 100
export const MAX_THREADS = 20
export const THREAD_TTL_MS = 30 * 60_000

export type ThreadCache = {
  /** เรียงเก่า→ใหม่เสมอ (ทิศเดียวกับที่จอ render) */
  items: ChatMessageView[]
  /** watermark แกนที่ 1 — ใบใหม่คือใบที่ seq มากกว่านี้ */
  lastSeq: number
  /** watermark แกนที่ 2 (ISO) — ใบเก่าที่ค่าเปลี่ยนคือใบที่ updatedAt ใหม่กว่านี้ */
  lastUpdatedAt: string
  /** cursor ของ "ข้อความเก่ากว่านี้" ไว้ต่อ loadOlder — null = ไม่มีของเก่ากว่าแล้ว */
  oldestCursor: string | null
  /** realtime บอกว่ามีของใหม่ ตอนผู้ใช้ยังไม่ได้เปิดห้องนี้ */
  stale: boolean
  touchedAt: number
}

const store = new Map<string, ThreadCache>()

/** ใช้ในเทสเท่านั้น — ล้าง state ระดับโมดูลระหว่างเคส (ไม่แตะฐานข้อมูลใด ๆ) */
export function resetThreadStoreForTest(): void {
  store.clear()
}

function evictIfNeeded(): void {
  if (store.size <= MAX_THREADS) return
  let oldestId: string | null = null
  let oldestAt = Number.POSITIVE_INFINITY
  for (const [id, entry] of store) {
    if (entry.touchedAt < oldestAt) {
      oldestAt = entry.touchedAt
      oldestId = id
    }
  }
  if (oldestId) store.delete(oldestId)
}

// ponytail: touchedAt ใช้ตัดสิน 2 เรื่อง (TTL จริง + ลำดับ LRU) — `Date.now()` ความละเอียด
// เป็น ms เดียวเท่านั้น เขียน 20 ห้องในลูปเดียวกันมักได้ ms เดียวกันหมด ⇒ evictIfNeeded เทียบ
// `<` ล้วนแล้วไล่ผิดห้อง (ห้องที่เพิ่ง touch โดน evict เพราะ timestamp ผูกเท่ากับห้องเก่ากว่า)
// `performance.now()` คืนหน่วย ms เหมือนกันแต่ทศนิยมระดับไมโครวินาที ⇒ ไม่มีค่าเท่ากันจริง
// ใช้แทน Date.now() ได้ตรงตัวเพราะ TTL เช็คแค่ผลต่างสัมพัทธ์ ไม่ได้อิง epoch จริง
function now(): number {
  return performance.now()
}

export function readThread(conversationId: string): ThreadCache | null {
  const entry = store.get(conversationId)
  if (!entry) return null
  if (now() - entry.touchedAt > THREAD_TTL_MS) {
    store.delete(conversationId)
    return null
  }
  entry.touchedAt = now() // การอ่านนับเป็นการแตะ (LRU)
  return entry
}

export function writeThread(
  conversationId: string,
  patch: Partial<ThreadCache> & { items: ChatMessageView[] },
): void {
  const prev = store.get(conversationId)
  store.set(conversationId, {
    items: capMessages(patch.items, MAX_MESSAGES_PER_THREAD),
    lastSeq: patch.lastSeq ?? prev?.lastSeq ?? 0,
    lastUpdatedAt: patch.lastUpdatedAt ?? prev?.lastUpdatedAt ?? new Date(0).toISOString(),
    oldestCursor: patch.oldestCursor !== undefined ? patch.oldestCursor : (prev?.oldestCursor ?? null),
    stale: patch.stale ?? false,
    touchedAt: now(),
  })
  evictIfNeeded()
}

/** realtime บอกว่ามีของใหม่ — ไม่ยิงอะไร แค่ปักธงไว้ให้ตอนเปิดห้องรู้ว่าต้อง reconcile */
export function markThreadStale(conversationId: string): void {
  const entry = store.get(conversationId)
  if (!entry) return // ห้ามสร้างแถวเปล่า — ไม่มี cache ก็ไม่มีอะไรให้ทำให้เก่า
  entry.stale = true
}

/**
 * watermark ใหม่ที่คำนวณจากชุดข้อความ — ใช้หลัง merge ทุกครั้ง
 *
 * 🛑 R6 (2026-09-14): แถวที่มีอยู่ก่อน migration `ChatMessage.updatedAt` ได้ค่า fast default
 *    `1970-01-01` (ดู Task 1) — ถ้าใช้ `m.updatedAt ?? m.createdAt` ตรง ๆ แถวเก่าจะลาก watermark
 *    ย้อนกลับไป 1970 ทำให้ delta คิดว่าต้องดึงทั้งเธรดใหม่ทุกรอบ poll ต้องเทียบเอา **max** เสมอ
 */
export function watermarksOf(items: ChatMessageView[]): { lastSeq: number; lastUpdatedAt: string } {
  let lastSeq = 0
  let lastUpdatedAt = new Date(0).toISOString()
  for (const m of items) {
    if (typeof m.seq === 'number' && m.seq > lastSeq) lastSeq = m.seq
    // updatedAt ของแถวเก่าคือ 1970 (fast default ตอน migration) ⇒ ต้องเป็น max ไม่ใช่ ??
    const u = m.updatedAt && m.updatedAt > m.createdAt ? m.updatedAt : m.createdAt
    if (u > lastUpdatedAt) lastUpdatedAt = u
  }
  return { lastSeq, lastUpdatedAt }
}

/**
 * เขียนภาพของห้องจาก state ของ hook — ทางเดียวที่ `useSellerChatThread` ใช้เขียน store (Task 4)
 *
 * แยกจาก `writeThread` เพราะ state บนจอมีของ 2 อย่างที่ store ห้ามเก็บตรง ๆ:
 *
 * 1) 🛑 **ข้อความ optimistic (`local-*`)** — hook ที่ถือบับเบิลนั้นอยู่จะถูก unmount ตอนเปลี่ยนห้อง
 *    ไม่มีใครมาเปลี่ยน `'sending'` ให้จบอีก เปิดห้องจาก cache ครั้งหน้าจะได้บับเบิลค้างคู่กับแถวจริง
 *    และ `createdAt` ของมันคือนาฬิกาเครื่อง client — นับเข้า watermark แล้ว delta จะข้ามการแก้
 *    ฝั่ง server ที่เวลาเก่ากว่านาฬิกาเครื่อง (ก่อนนี้ remount ก็ทิ้งบับเบิลเหล่านี้อยู่แล้ว ไม่ได้เสียอะไรเพิ่ม)
 *
 * 2) 🛑 **จอถือได้เกิน MAX ใบ** (ผู้ใช้เลื่อนโหลดของเก่า) แต่ store ตัดเหลือใบใหม่สุด — cursor ที่
 *    hook ถืออยู่ชี้ก่อนใบเก่าสุดที่เคยโหลด ถ้าเก็บคู่กับรายการที่ถูกตัดแล้ว loadOlder ครั้งหน้าจะ
 *    กระโดดข้ามช่วงที่ถูกตัดทั้งช่วง ⇒ ต้องชี้ที่ใบเก่าสุดที่ยังเก็บไว้แทน
 *    รูปแบบ `<createdAt ISO>|<seq>` ต้องตรงกับที่ `getMessages()` ใน `src/services/chat.service.ts`
 *    สร้าง `nextCursor` (keyset "เก่ากว่าแถวนี้") — แก้ฝั่งนั้นต้องแก้ตรงนี้ด้วย
 */
export function saveThreadView(
  conversationId: string,
  items: ChatMessageView[],
  oldestCursor: string | null,
): void {
  const real = items.filter((m) => !m.id.startsWith('local-'))
  const kept = capMessages(real, MAX_MESSAGES_PER_THREAD)
  const oldest = kept[0]
  const cursor =
    kept.length < real.length && oldest
      ? oldest.seq === undefined
        ? oldest.createdAt
        : `${oldest.createdAt}|${oldest.seq}`
      : oldestCursor
  writeThread(conversationId, { items: kept, oldestCursor: cursor, ...watermarksOf(kept) })
}
