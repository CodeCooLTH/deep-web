import { describe, expect, it } from 'vitest'
import { capMessages, firstPageReplacement, mergeMessages, resolveOpeningMessages } from '@/lib/chat-message-merge'
import type { ChatMessageView } from '@/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread'

// ponytail: brief ต้นฉบับซ้ำคีย์ id/createdAt ทั้งก่อนและหลัง ...over (tsc TS2783) — ...over
// มีสองคีย์นี้อยู่แล้วตามชนิดพารามิเตอร์ ตัดคีย์ซ้ำออก พฤติกรรมเดิมทุกประการ
function msg(over: Partial<ChatMessageView> & { id: string; createdAt: string }): ChatMessageView {
  return {
    conversationId: 'c1',
    senderUserId: null,
    senderRole: 'BUYER',
    type: 'TEXT',
    body: over.body ?? over.id,
    imageUrl: null,
    ...over,
  } as ChatMessageView
}

describe('[blocker] mergeMessages', () => {
  it('แทรกใบที่เวลาเก่ากว่าไว้ตรงตำแหน่งเวลา ไม่ใช่ต่อท้าย (D-8)', () => {
    // ใบ backfill: seq สูงสุด (เพิ่ง insert) แต่ createdAt เก่าสุด
    const prev = [
      msg({ id: 'b', createdAt: '2026-09-14T10:00:00.000Z', seq: 10 }),
      msg({ id: 'c', createdAt: '2026-09-14T11:00:00.000Z', seq: 11 }),
    ]
    const incoming = [msg({ id: 'a', createdAt: '2026-09-14T09:00:00.000Z', seq: 99 })]
    expect(mergeMessages(prev, incoming).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('ใบที่ไม่มีอะไรเปลี่ยน ต้องเป็น object เดิมเป๊ะ (React จะได้ไม่ re-render ทั้งลิสต์)', () => {
    const keep = msg({ id: 'a', createdAt: '2026-09-14T09:00:00.000Z', seq: 1 })
    const prev = [keep, msg({ id: 'b', createdAt: '2026-09-14T10:00:00.000Z', seq: 2 })]
    const out = mergeMessages(prev, [msg({ id: 'b', createdAt: '2026-09-14T10:00:00.000Z', seq: 2, reactionEmoji: '❤' })])
    expect(out[0]).toBe(keep) // toBe = identity ไม่ใช่ toEqual
    expect(out[1]).not.toBe(prev[1])
    expect(out[1]!.reactionEmoji).toBe('❤')
  })

  it('ใบที่ถูกลบต้องแทนที่ในตำแหน่งเดิม ไม่ใช่หายไปจาก array', () => {
    const prev = [
      msg({ id: 'a', createdAt: '2026-09-14T09:00:00.000Z', seq: 1 }),
      msg({ id: 'b', createdAt: '2026-09-14T10:00:00.000Z', seq: 2 }),
    ]
    const out = mergeMessages(prev, [msg({ id: 'a', createdAt: '2026-09-14T09:00:00.000Z', seq: 1, isDeleted: true })])
    expect(out.map((m) => m.id)).toEqual(['a', 'b'])
    expect(out[0]!.isDeleted).toBe(true)
  })

  it('เวลาเท่ากันใช้ seq ตัดสิน และข้อความ optimistic ที่ยังไม่มี seq อยู่ท้ายสุดของกลุ่มนั้น', () => {
    const t = '2026-09-14T09:00:00.000Z'
    const prev = [msg({ id: 'local-1', createdAt: t })]
    const out = mergeMessages(prev, [msg({ id: 'a', createdAt: t, seq: 5 })])
    expect(out.map((m) => m.id)).toEqual(['a', 'local-1'])
  })

  it('บางใบเปลี่ยน บางใบไม่เปลี่ยน — ใบที่ไม่เปลี่ยนต้องเป็น object เดิมแม้ถูกส่งซ้ำใน incoming', () => {
    // ต่างจากเคส "ใบที่ไม่มีอะไรเปลี่ยน" ด้านบน (ใบนั้นไม่ถูกส่งใน incoming เลย จึงยืนยันแค่ว่า
    // "ไม่แตะ = ไม่เปลี่ยน" ซึ่งเป็นจริงเสมอไม่ว่า sameMessage() จะทำงานถูกหรือผิด — เคสนี้ส่งใบที่
    // เหมือนเดิมทุกประการเข้าไปคู่กับใบที่เปลี่ยนจริง เพื่อบังคับให้ผ่าน branch sameMessage()===true
    // จริง ๆ (ดู docs/conventions/mutation-silence-means-weak-corpus.md — มิวเทชันเดิมไม่แดงถ้าไม่มีเคสนี้)
    const t1 = '2026-09-14T09:00:00.000Z'
    const t2 = '2026-09-14T10:00:00.000Z'
    const unchanged = msg({ id: 'a', createdAt: t1, seq: 1 })
    const prev = [unchanged, msg({ id: 'b', createdAt: t2, seq: 2 })]
    const out = mergeMessages(prev, [
      msg({ id: 'a', createdAt: t1, seq: 1 }),
      msg({ id: 'b', createdAt: t2, seq: 2, reactionEmoji: '❤' }),
    ])
    expect(out[0]).toBe(unchanged)
    expect(out[1]).not.toBe(prev[1])
  })

  it('สองใบเหมือนกันทุกฟิลด์ยกเว้น updatedAt ต้องไม่ใช่ object เดิม (R3)', () => {
    const prev = [msg({ id: 'a', createdAt: '2026-09-14T09:00:00.000Z', seq: 1, updatedAt: '2026-09-14T09:00:00.000Z' })]
    const out = mergeMessages(prev, [
      msg({ id: 'a', createdAt: '2026-09-14T09:00:00.000Z', seq: 1, updatedAt: '2026-09-14T09:05:00.000Z' }),
    ])
    expect(out[0]).not.toBe(prev[0])
  })
})

describe('[blocker] capMessages', () => {
  it('เกินเพดานให้ตัดใบเก่าสุดทิ้ง เก็บใบใหม่สุดไว้', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      msg({ id: `m${i}`, createdAt: `2026-09-14T0${i}:00:00.000Z`, seq: i }),
    )
    expect(capMessages(items, 3).map((m) => m.id)).toEqual(['m2', 'm3', 'm4'])
  })

  it('ไม่เกินเพดานต้องคืน array เดิมเป๊ะ', () => {
    const items = [msg({ id: 'a', createdAt: '2026-09-14T09:00:00.000Z' })]
    expect(capMessages(items, 3)).toBe(items)
  })
})

describe('[blocker] resolveOpeningMessages — cache กับ initial ตอนเปิดห้อง (R14)', () => {
  const at = (h: number) => `2026-09-14T${String(h).padStart(2, '0')}:00:00.000Z`

  it('คาบเกี่ยวกัน → merge (ได้ของเก่าจาก cache + ของสดจาก initial)', () => {
    const cached = {
      items: [msg({ id: 'a', createdAt: at(1), seq: 1 }), msg({ id: 'b', createdAt: at(2), seq: 2 })],
      oldestCursor: 'cursor-a',
    }
    const initial = {
      items: [msg({ id: 'b', createdAt: at(2), seq: 2 }), msg({ id: 'c', createdAt: at(3), seq: 3 })],
      nextCursor: 'cursor-b',
    }
    const out = resolveOpeningMessages({ cached, initial })
    expect(out.items.map((m) => m.id)).toEqual(['a', 'b', 'c'])
    expect(out.oldestCursor).toBe('cursor-a')
    expect(out.replaceStore).toBe(false)
  })

  it('ไม่คาบเกี่ยว (initial ใหม่กว่า cache ทั้งชุด) → initial อย่างเดียว + เขียนทับ store', () => {
    // ต่อกันจะได้ช่องว่างระหว่าง b กับ x ที่ไม่มีใครถืออยู่ และ loadOlder ไม่มีวันเติม
    const cached = {
      items: [msg({ id: 'a', createdAt: at(1), seq: 1 }), msg({ id: 'b', createdAt: at(2), seq: 2 })],
      oldestCursor: 'cursor-a',
    }
    const initial = {
      items: [msg({ id: 'x', createdAt: at(5), seq: 50 }), msg({ id: 'y', createdAt: at(6), seq: 51 })],
      nextCursor: 'cursor-x',
    }
    const out = resolveOpeningMessages({ cached, initial })
    expect(out.items.map((m) => m.id)).toEqual(['x', 'y'])
    expect(out.oldestCursor).toBe('cursor-x')
    expect(out.replaceStore).toBe(true)
  })

  it('R29: id เดียวกันทั้งสองชุด — cache ใหม่กว่า (รีแอ็กชันหลัง RSC ถ่ายภาพ) ต้องชนะ initial ที่ค้างใน router cache', () => {
    const cachedB = msg({ id: 'b', createdAt: at(2), seq: 2, reactionEmoji: '❤', updatedAt: at(4) })
    const cached = { items: [msg({ id: 'a', createdAt: at(1), seq: 1 }), cachedB], oldestCursor: 'cursor-a' }
    const initial = {
      items: [msg({ id: 'b', createdAt: at(2), seq: 2, updatedAt: at(2) }), msg({ id: 'c', createdAt: at(3), seq: 3 })],
      nextCursor: 'cursor-b',
    }
    const out = resolveOpeningMessages({ cached, initial })
    expect(out.items.map((m) => m.id)).toEqual(['a', 'b', 'c'])
    expect(out.items[1]).toBe(cachedB)
  })

  it('R29: initial ใหม่กว่า cache → initial ชนะ', () => {
    const cached = {
      items: [msg({ id: 'b', createdAt: at(2), seq: 2, _status: 'sending', updatedAt: at(2) })],
      oldestCursor: null,
    }
    const initialB = msg({ id: 'b', createdAt: at(2), seq: 2, reactionEmoji: '❤', updatedAt: at(5) })
    const out = resolveOpeningMessages({ cached, initial: { items: [initialB], nextCursor: null } })
    expect(out.items[0]).toBe(initialB)
  })

  it('R29: รุ่นเท่ากัน (ค่าต่างกันแค่ฝั่ง client) → ใช้ของ cache', () => {
    // updatedAt=1970 ของแถวเก่า (R6) ⇒ รุ่น = createdAt ทั้งคู่ — ห้ามให้ initial ชนะเพราะเป็นตัวที่สอง
    const cachedB = msg({ id: 'b', createdAt: at(2), seq: 2, body: 'cache', updatedAt: '1970-01-01T00:00:00.000Z' })
    const out = resolveOpeningMessages({
      cached: { items: [cachedB], oldestCursor: null },
      initial: { items: [msg({ id: 'b', createdAt: at(2), seq: 2, body: 'rsc', updatedAt: '1970-01-01T00:00:00.000Z' })], nextCursor: null },
    })
    expect(out.items[0]).toBe(cachedB)
  })

  it('มีแต่ cache → cache (ไม่เขียนทับ store)', () => {
    const out = resolveOpeningMessages({
      cached: { items: [msg({ id: 'a', createdAt: at(1), seq: 1 })], oldestCursor: null },
      initial: null,
    })
    expect(out.items.map((m) => m.id)).toEqual(['a'])
    expect(out.replaceStore).toBe(false)
  })
})

describe('[blocker] firstPageReplacement — แทนที่จอด้วยหน้าแรก (R28)', () => {
  const at = (h: number) => `2026-09-14T${String(h).padStart(2, '0')}:00:00.000Z`

  it('ใบที่เหมือนบนจอคง object เดิม · ใบที่เปลี่ยนเป็นของใหม่ · เรียงเก่า→ใหม่', () => {
    const keep = msg({ id: 'a', createdAt: at(1), seq: 1 })
    const screen = [keep, msg({ id: 'b', createdAt: at(2), seq: 2 })]
    const pageDesc = [
      msg({ id: 'c', createdAt: at(3), seq: 3 }),
      msg({ id: 'b', createdAt: at(2), seq: 2, reactionEmoji: '❤' }),
      msg({ id: 'a', createdAt: at(1), seq: 1 }),
    ]
    const { items, fetched } = firstPageReplacement({ screen, pageDesc, triggeredBy: [] })
    expect(items.map((m) => m.id)).toEqual(['a', 'b', 'c'])
    expect(items[0]).toBe(keep)
    expect(items[1]).not.toBe(screen[1])
    expect(fetched).toHaveLength(3)
  })

  it('fetched รวมแถวของ delta ที่ทำให้แทนที่ด้วย', () => {
    const bf = msg({ id: 'bf', createdAt: at(0), seq: 99 })
    const { fetched } = firstPageReplacement({ screen: [], pageDesc: [msg({ id: 'a', createdAt: at(1), seq: 1 })], triggeredBy: [bf] })
    expect(fetched).toContain(bf)
  })
})
