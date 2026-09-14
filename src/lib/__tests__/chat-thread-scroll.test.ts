import { describe, expect, it } from 'vitest'
import {
  canAutoLoadOlder,
  pickNewIncoming,
  shouldDeferFullDeltaReplace,
  shouldFollowNewMessages,
} from '@/lib/chat-thread-scroll'

describe('[blocker] กฎการเลื่อนจอในห้องแชท', () => {
  it('อยู่ล่างสุด = เลื่อนตามข้อความใหม่', () => {
    expect(shouldFollowNewMessages({ atBottom: true })).toBe(true)
  })

  it('เลื่อนขึ้นไปอ่านของเก่าอยู่ = ห้ามเลื่อนจอ (ขึ้นปุ่มข้อความใหม่แทน)', () => {
    expect(shouldFollowNewMessages({ atBottom: false })).toBe(false)
  })

  it('ห้ามโหลดของเก่าเองก่อนที่ผู้ใช้จะเลื่อนสักครั้ง', () => {
    expect(canAutoLoadOlder({ userHasScrolled: false, hasCursor: true, loading: false })).toBe(false)
  })

  it('ผู้ใช้เลื่อนแล้วและยังมีของเก่า = โหลดได้', () => {
    expect(canAutoLoadOlder({ userHasScrolled: true, hasCursor: true, loading: false })).toBe(true)
  })

  it('กำลังโหลดอยู่ หรือไม่มี cursor แล้ว = ไม่โหลด', () => {
    expect(canAutoLoadOlder({ userHasScrolled: true, hasCursor: true, loading: true })).toBe(false)
    expect(canAutoLoadOlder({ userHasScrolled: true, hasCursor: false, loading: false })).toBe(false)
  })
})

describe('[blocker] pickNewIncoming — แถวใหม่จริง (R10)', () => {
  const row = (id: string, h: number, seq?: number) => ({
    id,
    createdAt: `2026-09-14T${String(h).padStart(2, '0')}:00:00.000Z`,
    seq,
  })
  const prev = [row('a', 9, 1), row('b', 10, 2)]

  it('แถวที่ใหม่กว่าใบล่าสุดบนจอ = ใหม่', () => {
    expect(pickNewIncoming(prev, [row('c', 11, 3)]).map((m) => m.id)).toEqual(['c'])
  })

  it('แถวเดิมที่ถูกแก้ (รีแอ็กชัน/สถานะส่ง) = ไม่ใหม่', () => {
    expect(pickNewIncoming(prev, [row('b', 10, 2)])).toEqual([])
  })

  it('แถว backfill ที่แทรกกลางเธรด (seq ใหม่ เวลาเก่า) = ไม่ใหม่', () => {
    expect(pickNewIncoming(prev, [row('old', 9, 99)])).toEqual([])
  })

  it('บับเบิล optimistic ไม่ใช่เส้นแบ่ง — แถวที่เวลาก่อนบับเบิลแต่หลังแถวจริงล่าสุดยังนับ', () => {
    // นาฬิกาเครื่อง client เร็วกว่า server ได้ ถ้าใช้บับเบิลเป็นเส้นแบ่ง ข้อความลูกค้าที่มาคั่นจะหาย
    const withLocal = [...prev, row('local-0-1', 12)]
    expect(pickNewIncoming(withLocal, [row('c', 11, 3)]).map((m) => m.id)).toEqual(['c'])
  })

  it('จอยังว่าง = ทุกแถวใหม่', () => {
    expect(pickNewIncoming([], [row('a', 9, 1)]).map((m) => m.id)).toEqual(['a'])
  })
})

describe('[blocker] shouldDeferFullDeltaReplace — delta ครบเพดานแล้วแทนที่จอตอนไหน (R16)', () => {
  it('กำลังอ่านของเก่าอยู่ = เลื่อนการแทนที่ออกไป (แทนตอนนี้จอเด้ง)', () => {
    expect(shouldDeferFullDeltaReplace({ atBottom: false })).toBe(true)
  })

  it('อยู่ล่างสุด = แทนที่ได้ทันที', () => {
    expect(shouldDeferFullDeltaReplace({ atBottom: true })).toBe(false)
  })
})
