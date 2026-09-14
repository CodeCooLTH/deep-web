import { describe, expect, it } from 'vitest'
import { canAutoLoadOlder, countNewIncoming, shouldFollowNewMessages } from '@/lib/chat-thread-scroll'

describe('[blocker] กฎการเลื่อนจอในห้องแชท', () => {
  it('อยู่ล่างสุด = เลื่อนตามข้อความใหม่', () => {
    expect(shouldFollowNewMessages({ atBottom: true, hasIncomingFromSelf: false })).toBe(true)
  })

  it('เลื่อนขึ้นไปอ่านของเก่าอยู่ = ห้ามเลื่อนจอ (ขึ้นปุ่มข้อความใหม่แทน)', () => {
    expect(shouldFollowNewMessages({ atBottom: false, hasIncomingFromSelf: false })).toBe(false)
  })

  it('ข้อความที่ร้านเพิ่งกดส่งเอง = เลื่อนตามเสมอ แม้กำลังอ่านของเก่า', () => {
    expect(shouldFollowNewMessages({ atBottom: false, hasIncomingFromSelf: true })).toBe(true)
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

describe('[blocker] countNewIncoming — ตัวนับของปุ่ม "ข้อความใหม่"', () => {
  it('นับเฉพาะแถวที่ไม่เคยมีบนจอ — แถวเดิมที่ถูกแก้ (รีแอ็กชัน/สถานะส่ง) ห้ามนับ', () => {
    // delta คืนทั้งแถวใหม่และแถวเก่าที่ updatedAt ขยับ ⇒ ถ้านับทุกแถว ลูกค้ากดรีแอ็กชันใบเก่า
    // ปุ่มจะขึ้น "ข้อความใหม่ 1" ทั้งที่ไม่มีอะไรใหม่ให้เลื่อนลงไปดู
    const prev = new Set(['a', 'b'])
    expect(countNewIncoming(prev, [{ id: 'b' }, { id: 'c' }, { id: 'd' }])).toBe(2)
  })

  it('ชุดที่มีแต่แถวเดิมที่ถูกแก้ = 0', () => {
    expect(countNewIncoming(new Set(['a']), [{ id: 'a' }])).toBe(0)
  })
})
