import { describe, expect, it } from 'vitest'
import { patchConversationRows } from '@/lib/inbox-row-patch'

type Row = { id: string; lastMessagePreview: string; unreadCount: number }

describe('[blocker] patchConversationRows', () => {
  it('แถวที่ค่าไม่เปลี่ยนต้องเป็น object เดิมเป๊ะ', () => {
    const a: Row = { id: 'a', lastMessagePreview: 'x', unreadCount: 0 }
    const b: Row = { id: 'b', lastMessagePreview: 'y', unreadCount: 1 }
    const out = patchConversationRows([a, b], [{ ...a }, { ...b }])
    expect(out[0]).toBe(a)
    expect(out[1]).toBe(b)
  })

  it('ทั้งลิสต์ไม่เปลี่ยนเลย ต้องคืน array เดิมเป๊ะ (React จะได้ข้ามทั้งบล็อก)', () => {
    const prev: Row[] = [{ id: 'a', lastMessagePreview: 'x', unreadCount: 0 }]
    expect(patchConversationRows(prev, [{ ...prev[0]! }])).toBe(prev)
  })

  it('แถวที่ค่าเปลี่ยนต้องเป็น object ใหม่ และค่าต้องเป็นของใหม่', () => {
    const a: Row = { id: 'a', lastMessagePreview: 'x', unreadCount: 0 }
    const out = patchConversationRows([a], [{ id: 'a', lastMessagePreview: 'x', unreadCount: 3 }])
    expect(out[0]).not.toBe(a)
    expect(out[0]!.unreadCount).toBe(3)
  })

  it('แถวใหม่ที่ยังไม่เคยมี ต้องถูกเพิ่มตามลำดับของชุดใหม่', () => {
    const a: Row = { id: 'a', lastMessagePreview: 'x', unreadCount: 0 }
    const out = patchConversationRows([a], [{ id: 'z', lastMessagePreview: 'new', unreadCount: 1 }, { ...a }])
    expect(out.map((r) => r.id)).toEqual(['z', 'a'])
    expect(out[1]).toBe(a)
  })

  it('แถวเดิมที่ไม่อยู่ในชุดใหม่ ต้องยังอยู่ต่อท้าย (ชุดใหม่คือหน้าแรก ไม่ใช่ทั้งหมด)', () => {
    const old: Row = { id: 'old', lastMessagePreview: 'o', unreadCount: 0 }
    const out = patchConversationRows([old], [{ id: 'n', lastMessagePreview: 'n', unreadCount: 0 }])
    expect(out.map((r) => r.id)).toEqual(['n', 'old'])
    expect(out[1]).toBe(old)
  })

  // แถวจริงของ ConversationListItem มีฟิลด์ที่เป็น object (`counterparty`) และ array-of-object
  // (`threadAgents`) — เทียบด้วย `!==` ตรง ๆ จะเห็นว่า "เปลี่ยน" ทุกรอบเพราะ fetch ใหม่สร้าง
  // object ใหม่เสมอแม้ค่าข้างในเท่าเดิม ทำให้ patch ไม่มีผลอะไรเลยกับข้อมูลจริง
  type NestedRow = {
    id: string
    counterparty: { displayName: string; avatar: string | null } | null
    threadAgents: { userId: string; name: string; avatar: string | null }[]
  }

  it('ฟิลด์ object/array-of-object ที่ค่าไม่เปลี่ยน (แต่เป็น object ใหม่จาก fetch) ต้องยังเป็นแถวเดิม', () => {
    const a: NestedRow = {
      id: 'a',
      counterparty: { displayName: 'ร้านเอ', avatar: null },
      threadAgents: [{ userId: 'u1', name: 'แอดมิน 1', avatar: null }],
    }
    // จำลอง response ใหม่จาก API — ค่าเดียวกันเป๊ะแต่เป็น object/array คนละ reference
    const freshSameValue: NestedRow = {
      id: 'a',
      counterparty: { displayName: 'ร้านเอ', avatar: null },
      threadAgents: [{ userId: 'u1', name: 'แอดมิน 1', avatar: null }],
    }
    const out = patchConversationRows([a], [freshSameValue])
    expect(out[0]).toBe(a)
  })

  it('ฟิลด์ array-of-object ที่ค่าเปลี่ยนจริง (threadAgents 1 รายการต่าง) ต้องได้ object ใหม่', () => {
    const a: NestedRow = {
      id: 'a',
      counterparty: { displayName: 'ร้านเอ', avatar: null },
      threadAgents: [{ userId: 'u1', name: 'แอดมิน 1', avatar: null }],
    }
    const fresh: NestedRow = {
      id: 'a',
      counterparty: { displayName: 'ร้านเอ', avatar: null },
      threadAgents: [{ userId: 'u2', name: 'แอดมิน 2', avatar: null }],
    }
    const out = patchConversationRows([a], [fresh])
    expect(out[0]).not.toBe(a)
    expect(out[0]!.threadAgents[0]!.userId).toBe('u2')
  })
})
