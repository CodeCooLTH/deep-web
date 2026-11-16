import { describe, it, expect } from 'vitest'
import { capsuleSegments, followBotBadgeIds } from '@/lib/follow-bot-ui'

const f = (id: string, followStep: number | null = 0) => ({ id, autoReplyKind: 'AUTO_FOLLOW', followStep })
const h = (id: string) => ({ id, autoReplyKind: null })

describe('followBotBadgeIds', () => {
  it('ฟองแรกของรอบติดป้าย ฟองที่สองของรอบเดียวกัน (ข้อความ+รูป) ไม่ติด', () => {
    expect([...followBotBadgeIds([h('a'), f('b', 0), f('c', 0)])]).toEqual(['b'])
  })
  it('คนละรอบติดกัน = ติดทั้งคู่ (ควบคุมของข้อด้านบน)', () => {
    expect([...followBotBadgeIds([f('b', 0), f('c', 1)])]).toEqual(['b', 'c'])
  })
  it('มีข้อความอื่นคั่น = รอบเดียวกันก็ติดใหม่', () => {
    expect([...followBotBadgeIds([f('b', 0), h('x'), f('c', 0)])]).toEqual(['b', 'c'])
  })
  it('ไม่มี followStep = ถือรอบเดียวกัน · ข้อความที่ไม่ใช่ AUTO_FOLLOW ไม่ติด', () => {
    expect([...followBotBadgeIds([h('a'), f('b', null), f('c', null)])]).toEqual(['b'])
    expect(followBotBadgeIds([{ id: 'z', autoReplyKind: 'AUTO' }]).size).toBe(0)
  })
})

describe('capsuleSegments', () => {
  it('ส่งแล้ว 1 จาก 3 = sent,next,rest', () => expect(capsuleSegments(1, 3)).toEqual(['sent', 'next', 'rest']))
  it('ยังไม่ส่ง = next ที่ช่องแรก', () => expect(capsuleSegments(0, 2)).toEqual(['next', 'rest']))
  it('ส่งครบ = sent ทั้งหมด ไม่มี next', () => expect(capsuleSegments(3, 3)).toEqual(['sent', 'sent', 'sent']))
  it('ค่านอกช่วงถูกหนีบ', () => {
    expect(capsuleSegments(9, 2)).toEqual(['sent', 'sent'])
    expect(capsuleSegments(-1, 2)).toEqual(['next', 'rest'])
    expect(capsuleSegments(1, 0)).toEqual([])
  })
})
