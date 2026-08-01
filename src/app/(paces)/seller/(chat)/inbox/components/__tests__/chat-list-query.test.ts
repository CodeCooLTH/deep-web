/**
 * chat-list-query — invariant ที่พังมาแล้ว 2 รอบ (2026-07-31 SSR, 2026-08-01 ChatRail)
 *
 * บั๊กเดิม: หน้าแชทเปิดมาไฮไลต์แท็บ "ทั้งหมด" แต่ชุดข้อมูลชุดแรกถูกดึงด้วย status ที่เป็น
 * default ของ backend ('open' = เฉพาะเธรดที่ยังไม่ปิดงาน) → เธรดที่ปิดงานแล้วหายไปตอนเข้า
 * ครั้งแรก แล้วโผล่หลังกดสลับแท็บไป-กลับ (เพราะการสลับแท็บทำให้ client refetch ด้วย status=all)
 *
 * เทสนี้ล็อกไว้ว่า "query ชุดแรกต้องสะกด DEFAULT_CHAT_FILTER ออกมาเสมอ" — ผู้เรียกทุกจุด
 * (SSR page, ChatRail, InboxList) ต้องผ่าน builder ตัวเดียวกันนี้ ห้ามประกอบ URL เอง
 */
import { describe, it, expect } from 'vitest'
import { buildChatListParams, DEFAULT_CHAT_FILTER } from '../chat-list-query'

describe('buildChatListParams', () => {
  it('ค่าเริ่มต้นของหน้า (DEFAULT_CHAT_FILTER) ต้องส่ง status=all — ไม่งั้นเธรดที่ปิดงานแล้วหายจากแท็บ "ทั้งหมด"', () => {
    const params = buildChatListParams(DEFAULT_CHAT_FILTER, { take: 20 })
    expect(params.get('status')).toBe('all')
    expect(params.get('take')).toBe('20')
  })

  it("status='open' = default ของ backend → ไม่ต้องส่ง param (ลด query string ที่ไม่มีความหมาย)", () => {
    const params = buildChatListParams({ ...DEFAULT_CHAT_FILTER, status: 'open' }, { take: 20 })
    expect(params.get('status')).toBeNull()
  })

  it('ส่งเฉพาะตัวกรองที่ไม่ใช่ค่า default ของ backend', () => {
    const params = buildChatListParams(DEFAULT_CHAT_FILTER, { take: 20 })
    expect(params.get('customerLinked')).toBeNull()
    expect(params.get('hidden')).toBeNull()
    expect(params.get('spam')).toBeNull()
    expect(params.get('readState')).toBeNull()
    expect(params.get('tags')).toBeNull()
    expect(params.get('shipment')).toBeNull()
  })

  it('ตัวกรองที่ผู้ใช้เลือกเองถูกส่งครบ', () => {
    const params = buildChatListParams(
      {
        ...DEFAULT_CHAT_FILTER,
        status: 'resolved',
        customerLinked: 'linked',
        hidden: true,
        spam: true,
        readState: 'unread',
        tags: ['สนใจ', 'DEV'],
        shipment: 'problem',
      },
      { take: 20, cursor: 'c1', channelTab: 'INSTAGRAM', pageFilter: 'ch1', q: 'โซ่', chatGroupId: 'g1' },
    )
    expect(params.get('status')).toBe('resolved')
    expect(params.get('customerLinked')).toBe('linked')
    expect(params.get('hidden')).toBe('true')
    expect(params.get('spam')).toBe('true')
    expect(params.get('readState')).toBe('unread')
    expect(params.get('tags')).toBe('สนใจ,DEV')
    expect(params.get('shipment')).toBe('problem')
    expect(params.get('cursor')).toBe('c1')
    expect(params.get('channel')).toBe('INSTAGRAM')
    expect(params.get('shopChannelId')).toBe('ch1')
    expect(params.get('q')).toBe('โซ่')
    expect(params.get('chatGroupId')).toBe('g1')
  })

  it("channelTab='ALL' คือ 'ไม่กรองช่องทาง' — ต้องไม่ส่ง channel param", () => {
    const params = buildChatListParams(DEFAULT_CHAT_FILTER, { take: 20, channelTab: 'ALL' })
    expect(params.get('channel')).toBeNull()
  })
})
