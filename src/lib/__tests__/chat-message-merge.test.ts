import { describe, expect, it } from 'vitest'
import { capMessages, mergeMessages } from '@/lib/chat-message-merge'
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
