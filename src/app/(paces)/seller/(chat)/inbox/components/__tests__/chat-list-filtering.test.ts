/**
 * isChatListFiltering — ตัดสินว่ารายการที่ว่างจะพูดว่าอะไร (bugfix 2026-08-13)
 *
 * ทำไมต้องมีเทส: มันเลือกระหว่างข้อความ 2 อย่างที่ความหมายตรงข้ามกัน — "ยังไม่มีใครทักเลย"
 * กับ "กรองแล้วไม่เจอ" ถ้าเขียนกลับด้าน ผู้ใช้ที่เพิ่งเปิดร้านจะถูกบอกให้ล้างตัวกรองที่เขา
 * ไม่เคยตั้ง และไม่มี gate ไหนจับได้เพราะเป็น boolean ที่ถูกต้องตามชนิดทุกประการ
 * (docs/conventions/ui-boolean-needs-a-testable-home.md)
 */
import { describe, expect, it } from 'vitest'

import { DEFAULT_CHAT_FILTER, isChatListFiltering } from '../chat-list-query'

const base = { filter: DEFAULT_CHAT_FILTER, channelTab: 'ALL', pageFilter: '', query: '', chatGroupId: null }

describe('isChatListFiltering', () => {
  it('[blocker] เพิ่งเปิดหน้ามา ยังไม่แตะอะไร = ไม่ได้กรอง', () => {
    expect(isChatListFiltering(base)).toBe(false)
  })

  it('[blocker] แตะแกนไหนก็นับว่ากำลังกรอง', () => {
    expect(isChatListFiltering({ ...base, channelTab: 'MESSENGER' })).toBe(true)
    expect(isChatListFiltering({ ...base, pageFilter: 'ch_1' })).toBe(true)
    expect(isChatListFiltering({ ...base, query: 'สมชาย' })).toBe(true)
    expect(isChatListFiltering({ ...base, chatGroupId: 'g_1' })).toBe(true)
    expect(isChatListFiltering({ ...base, filter: { ...DEFAULT_CHAT_FILTER, status: 'resolved' } })).toBe(true)
    expect(isChatListFiltering({ ...base, filter: { ...DEFAULT_CHAT_FILTER, spam: true } })).toBe(true)
    expect(isChatListFiltering({ ...base, filter: { ...DEFAULT_CHAT_FILTER, hidden: true } })).toBe(true)
    expect(isChatListFiltering({ ...base, filter: { ...DEFAULT_CHAT_FILTER, readState: 'unread' } })).toBe(true)
    expect(isChatListFiltering({ ...base, filter: { ...DEFAULT_CHAT_FILTER, shipment: 'problem' } })).toBe(true)
    expect(isChatListFiltering({ ...base, filter: { ...DEFAULT_CHAT_FILTER, tags: ['vip'] } })).toBe(true)
    expect(isChatListFiltering({ ...base, filter: { ...DEFAULT_CHAT_FILTER, customerLinked: 'linked' } })).toBe(true)
  })

  it('ช่องค้นหาที่มีแต่ช่องว่าง ไม่นับว่ากรอง — ไม่งั้นเผลอเคาะ space แล้วข้อความเปลี่ยนความหมาย', () => {
    expect(isChatListFiltering({ ...base, query: '   ' })).toBe(false)
  })
})
