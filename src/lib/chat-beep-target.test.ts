import { describe, it, expect } from 'vitest'
import { pickBeepTarget, type BeepCandidate } from './chat-beep-target'

const row = (o: Partial<BeepCandidate> & { id: string }): BeepCandidate => ({
  shopId: 'shop-1',
  lastSenderRole: 'BUYER',
  lastMessageAt: '2026-08-10T10:00:00.000Z',
  ...o,
})

describe('pickBeepTarget — [blocker] เสียงต้องดังเฉพาะตอนมีข้อความใหม่จริง', () => {
  // 🛑 เคสที่ทำให้ฟังก์ชันนี้เกิดขึ้น (user report 2026-08-10): สลับแท็บ/ตัวกรอง/ค้นหา แล้ว `prev`
  // เป็นแถวของลิสต์คนละชุด ทุกแถวดู "ไม่เคยมี" พร้อมกันหมด → ดังทั้งที่อ่านหมดแล้ว unread = 0
  it('[blocker] ยังไม่มีฐานให้เทียบ (เพิ่งสลับตัวกรอง/แท็บ) → ห้ามมีเสียง แม้ทุกแถวจะดูใหม่หมด', () => {
    expect(
      pickBeepTarget({
        comparable: false,
        items: [row({ id: 'c1' }), row({ id: 'c2' })],
        previous: [],
      }),
    ).toBeUndefined()
  })

  it('[blocker] ลิสต์ชุดเดียวกัน + ลูกค้าใหม่เพิ่งทักครั้งแรก → ต้องมีเสียง', () => {
    const hit = pickBeepTarget({
      comparable: true,
      items: [row({ id: 'ใหม่' })],
      previous: [],
    })
    expect(hit?.id).toBe('ใหม่')
  })

  it('[blocker] เธรดเดิมที่เวลาข้อความล่าสุดขยับ → ต้องมีเสียง', () => {
    const hit = pickBeepTarget({
      comparable: true,
      items: [row({ id: 'c1', lastMessageAt: '2026-08-10T10:05:00.000Z' })],
      previous: [{ id: 'c1', lastMessageAt: '2026-08-10T10:00:00.000Z' }],
    })
    expect(hit?.id).toBe('c1')
  })

  it('[blocker] เวลาเท่าเดิม (แค่ refetch/poll ซ้ำ) → ห้ามมีเสียง', () => {
    expect(
      pickBeepTarget({
        comparable: true,
        items: [row({ id: 'c1' })],
        previous: [{ id: 'c1', lastMessageAt: '2026-08-10T10:00:00.000Z' }],
      }),
    ).toBeUndefined()
  })

  it('[blocker] ข้อความล่าสุดเป็นของร้านเอง → ห้ามมีเสียง (แม้เวลาจะขยับ)', () => {
    expect(
      pickBeepTarget({
        comparable: true,
        items: [
          row({ id: 'c1', lastSenderRole: 'SHOP', lastMessageAt: '2026-08-10T11:00:00.000Z' }),
        ],
        previous: [{ id: 'c1', lastMessageAt: '2026-08-10T10:00:00.000Z' }],
      }),
    ).toBeUndefined()
  })

  it('คืนเธรดที่เข้าเกณฑ์เพื่อให้ throttle ใช้ shopId ของเธรดนั้น ไม่ใช่ร้าน active', () => {
    const hit = pickBeepTarget({
      comparable: true,
      items: [
        row({ id: 'c1', lastSenderRole: 'SHOP' }),
        row({ id: 'c2', shopId: 'shop-อื่น', lastMessageAt: '2026-08-10T12:00:00.000Z' }),
      ],
      previous: [
        { id: 'c1', lastMessageAt: '2026-08-10T10:00:00.000Z' },
        { id: 'c2', lastMessageAt: '2026-08-10T10:00:00.000Z' },
      ],
    })
    expect(hit?.shopId).toBe('shop-อื่น')
  })

  it('ลิสต์ว่าง → ไม่มีอะไรให้ดัง', () => {
    expect(pickBeepTarget({ comparable: true, items: [], previous: [] })).toBeUndefined()
  })
})
