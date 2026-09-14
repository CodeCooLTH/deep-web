import { describe, expect, it } from 'vitest'
import {
  canAutoLoadOlder,
  firstPageLeavesGap,
  planDeltaApply,
  countUnseenIncrement,
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

describe('[blocker] countUnseenIncrement — ตัวนับปุ่ม "ข้อความใหม่" นับเฉพาะลูกค้า (R24)', () => {
  it('แถวร้าน (บอท/เพื่อนร่วมทีม/Meta AI) ไม่เพิ่มตัวนับ', () => {
    expect(countUnseenIncrement([{ senderRole: 'SHOP' }, { senderRole: 'SHOP' }])).toBe(0)
  })

  it('นับเท่าจำนวนข้อความลูกค้าในชุดผสม', () => {
    expect(
      countUnseenIncrement([{ senderRole: 'BUYER' }, { senderRole: 'SHOP' }, { senderRole: 'BUYER' }]),
    ).toBe(2)
  })

  it('ชุดว่าง = 0 (ทาง R16 ไม่มีขั้นต่ำ 1 แล้ว)', () => {
    expect(countUnseenIncrement([])).toBe(0)
  })
})

describe('[blocker] planDeltaApply — delta ไหนต้องแทนที่จอ / แถวไหนเข้าจอ (R13 + R28 + R31)', () => {
  const row = (id: string, h: number, seq?: number) => ({
    id,
    createdAt: `2026-09-14T${String(h).padStart(2, '0')}:00:00.000Z`,
    seq,
  })
  // จอหลังแทนที่: หน้าแรก 30 ใบ ช่วง 10:00–?? (ใช้ 3 ใบแทน) และยังมีของเก่ากว่าใน DB
  const screen = [row('p1', 10, 101), row('p2', 11, 102), row('p3', 12, 103)]

  it('เต็มเพดานโดยทุกแถวอยู่ในหน้าต่างของจอ = อาจมีช่องว่าง → แทนที่', () => {
    const incoming = [row('n1', 13, 200), row('n2', 12, 201), row('p3', 12, 103)]
    expect(planDeltaApply({ screen, hasOlder: true, incoming, take: 3 }).replace).toBe(true)
  })

  it('C1: หลังแทนที่ แถว backfill เก่า (คืนซ้ำเพราะระยะเผื่อ) เต็มเพดาน → ห้ามแทนที่ซ้ำ + ไม่เข้าจอ', () => {
    const backfill = [row('bf1', 3, 900), row('bf2', 2, 901), row('bf3', 1, 902)]
    const plan = planDeltaApply({ screen, hasOlder: true, incoming: backfill, take: 3 })
    expect(plan.replace).toBe(false)
    expect(plan.inWindow).toEqual([])
  })

  it('ใบใหม่ปนแถวเก่ากว่าหน้าต่าง เต็มเพดาน → ไม่แทนที่ (ที่ถูกตัดเก่ากว่าหน้าต่างทั้งหมด) · เข้าจอเฉพาะใบในหน้าต่าง', () => {
    const incoming = [row('n1', 13, 200), row('bf1', 3, 900), row('bf2', 2, 901)]
    const plan = planDeltaApply({ screen, hasOlder: true, incoming, take: 3 })
    expect(plan.replace).toBe(false)
    expect(plan.inWindow.map((m) => m.id)).toEqual(['n1'])
  })

  it('ไม่มีของเก่ากว่าใน DB (ประวัติครบบนจอ) → ทุกแถวเข้าจอ และเต็มเพดาน = แทนที่', () => {
    const incoming = [row('bf1', 3, 900), row('bf2', 2, 901), row('bf3', 1, 902)]
    const plan = planDeltaApply({ screen, hasOlder: false, incoming, take: 3 })
    expect(plan.inWindow).toHaveLength(3)
    expect(plan.replace).toBe(true)
  })

  it('ไม่เต็มเพดาน = ไม่แทนที่ (ทราฟฟิกปกติ + แถวซ้ำจากระยะเผื่อ)', () => {
    const incoming = [row('p3', 12, 103), row('n1', 13, 200)]
    const plan = planDeltaApply({ screen, hasOlder: true, incoming, take: 100 })
    expect(plan.replace).toBe(false)
    expect(plan.inWindow.map((m) => m.id)).toEqual(['p3', 'n1'])
  })
})

describe('[blocker] firstPageLeavesGap — poll ที่ไม่มี watermark ได้หน้าแรกที่ต่อกับจอไม่ติด (R33)', () => {
  const row = (id: string, h: number, seq?: number) => ({
    id,
    createdAt: `2026-09-14T${String(h).padStart(2, '0')}:00:00.000Z`,
    seq,
  })
  const screen = [row('a', 9, 1), row('b', 10, 2), row('local-1', 23)]

  it('ใบเก่าสุดของหน้าใหม่กว่าใบล่าสุดบนจอ + ยังมีของเก่ากว่า = ช่องว่าง → แทนที่', () => {
    const pageDesc = [row('y', 15, 51), row('x', 14, 50)]
    expect(firstPageLeavesGap({ screen, pageDesc, nextCursor: 'x|50' })).toBe(true)
  })

  it('คาบเกี่ยวกัน = merge ได้', () => {
    const pageDesc = [row('c', 11, 3), row('b', 10, 2)]
    expect(firstPageLeavesGap({ screen, pageDesc, nextCursor: 'b|2' })).toBe(false)
  })

  it('ไม่มีของเก่ากว่าหน้านั้นแล้ว = ไม่มีช่องว่าง', () => {
    const pageDesc = [row('y', 15, 51), row('x', 14, 50)]
    expect(firstPageLeavesGap({ screen, pageDesc, nextCursor: null })).toBe(false)
  })

  it('บับเบิล optimistic ไม่ใช่เส้นแบ่ง — เวลาของมันเป็นนาฬิกาเครื่อง client', () => {
    // local-1 เวลา 23:00 ใหม่กว่าหน้าเสมอ ถ้าใช้เป็นใบล่าสุดจะตัดสินว่าคาบเกี่ยวทั้งที่มีช่องว่าง
    const pageDesc = [row('y', 15, 51), row('x', 14, 50)]
    expect(firstPageLeavesGap({ screen, pageDesc, nextCursor: 'x|50' })).toBe(true)
  })
})
