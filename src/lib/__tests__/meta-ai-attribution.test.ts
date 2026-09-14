import { describe, expect, it } from 'vitest'
import { attributeMetaAi } from '@/lib/meta-system-notice'

type M = Parameters<typeof attributeMetaAi>[0][number]
const m = (over: Partial<M> & { id: string }): M => ({
  body: null,
  senderRole: 'SHOP',
  senderUserId: null,
  autoReplyKind: null,
  ...over,
})

describe('[blocker] attributeMetaAi', () => {
  it('ไม่มี marker เลย = ไม่ติดป้ายสักใบ (ห้ามเดา)', () => {
    expect(attributeMetaAi([m({ id: 'a' }), m({ id: 'b' })]).size).toBe(0)
  })

  it('ใบฝั่งร้านที่อยู่ใต้ marker AI = ติดป้าย', () => {
    const set = attributeMetaAi([
      m({ id: 'notice', body: 'Your AI agent will respond.' }),
      m({ id: 'a' }),
    ])
    expect(set.has('a')).toBe(true)
  })

  it('ใบที่อยู่หลัง marker HUMAN = ไม่ติดป้าย', () => {
    const set = attributeMetaAi([
      m({ id: 'n1', body: 'Your AI agent will respond.' }),
      m({ id: 'a' }),
      m({ id: 'n2', body: 'You took over this chat from your AI agent.' }),
      m({ id: 'b' }),
    ])
    expect(set.has('a')).toBe(true)
    expect(set.has('b')).toBe(false)
  })

  it('ใบที่ส่งจากแอปเรา (มี senderUserId) ไม่ติดป้ายแม้อยู่ใต้ marker AI', () => {
    const set = attributeMetaAi([
      m({ id: 'n', body: 'Your AI agent will respond.' }),
      m({ id: 'a', senderUserId: 'u1' }),
    ])
    expect(set.has('a')).toBe(false)
  })

  it('ใบที่บอทของเราตอบ (มี autoReplyKind) ไม่ติดป้าย', () => {
    const set = attributeMetaAi([
      m({ id: 'n', body: 'Your AI agent will respond.' }),
      m({ id: 'a', autoReplyKind: 'KEYWORD' }),
    ])
    expect(set.has('a')).toBe(false)
  })

  it('ข้อความของลูกค้าไม่ติดป้าย', () => {
    const set = attributeMetaAi([
      m({ id: 'n', body: 'Your AI agent will respond.' }),
      m({ id: 'a', senderRole: 'BUYER' }),
    ])
    expect(set.has('a')).toBe(false)
  })
})
