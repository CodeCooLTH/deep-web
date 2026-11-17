// 00095 TC-085..087 — findChannelConflicts (FR-FA-8: ชุดสถานะที่อาจตรงมาจากกฎแถว)
import { describe, expect, it } from 'vitest'
import type { ConditionRule } from '../conditions'
import { findChannelConflicts, type ConflictBot, type ConflictOther } from '../conflicts'

const is = (...values: string[]): ConditionRule => ({ field: 'stage', op: 'is', values: values as never })
const isNot = (...values: string[]): ConditionRule => ({ field: 'stage', op: 'is_not', values: values as never })
const tag = (op: 'has_any' | 'has_all' | 'has_none', ...values: string[]): ConditionRule => ({ field: 'tag', op, values })

const cand = (o: Partial<ConflictBot> = {}): ConflictBot => ({ id: 'cand', name: 'ตัวใหม่', channelIds: ['ch1'], conditionMatch: 'ALL', rules: [is('NOT_BOUGHT')], ...o })
const other = (o: Partial<ConflictOther> = {}): ConflictOther => ({
  id: 'b1',
  name: 'บอทเดิม',
  channelIds: ['ch1'],
  conditionMatch: 'ALL',
  rules: [is('NOT_BOUGHT')],
  status: 'ACTIVE',
  deletedAt: null,
  ...o,
})

describe('TC-085 ชน/ไม่ชน', () => {
  it('ช่องเดียวกัน + สถานะซ้อน = ชน (บอก channelId/botId/botName)', () => {
    expect(findChannelConflicts(cand(), [other()])).toEqual([{ channelId: 'ch1', botId: 'b1', botName: 'บอทเดิม' }])
  })
  it('ช่องเดียวกัน + สถานะไม่ซ้อน = ไม่ชน', () => {
    expect(findChannelConflicts(cand(), [other({ rules: [is('BILLED')] })])).toEqual([])
  })
  it('ช่องต่างกัน = ไม่ชน', () => {
    expect(findChannelConflicts(cand(), [other({ channelIds: ['ch2'] })])).toEqual([])
  })
  it('ฝ่ายหนึ่งสถานะว่าง (= ทุกสถานะ) = ชน — ทั้งสองทิศ (M-26)', () => {
    expect(findChannelConflicts(cand({ rules: [tag('has_any', 'a')] }), [other({ rules: [is('BILLED')] })])).toHaveLength(1)
    expect(findChannelConflicts(cand({ rules: [is('BILLED')] }), [other({ rules: [tag('has_any', 'a')] })])).toHaveLength(1)
  })
  it('ทั้งคู่ว่าง = ชน', () => {
    expect(findChannelConflicts(cand({ rules: [tag('has_any', 'a', 'b')] }), [other({ rules: [tag('has_all', 'c')] })])).toHaveLength(1)
  })
  it('หลายช่อง/หลายบอท: คืนทุกคู่ที่ชน', () => {
    const r = findChannelConflicts(cand({ channelIds: ['ch1', 'ch2', 'ch3'] }), [
      other({ id: 'b1', channelIds: ['ch1', 'ch2'] }),
      other({ id: 'b2', name: 'สอง', channelIds: ['ch2', 'ch9'] }),
    ])
    expect(r).toEqual([
      { channelId: 'ch1', botId: 'b1', botName: 'บอทเดิม' },
      { channelId: 'ch2', botId: 'b1', botName: 'บอทเดิม' },
      { channelId: 'ch2', botId: 'b2', botName: 'สอง' },
    ])
  })
  it('ไม่ชนตัวเอง (แก้บอทเดิม)', () => {
    expect(findChannelConflicts(cand({ id: 'b1' }), [other({ id: 'b1' })])).toEqual([])
  })
})

describe('TC-086 สถานะของบอทอื่น', () => {
  it.each([
    ['CLOSED', null, 0],
    ['ACTIVE', new Date(), 0],
    ['TESTING', null, 1],
    ['ACTIVE', null, 1],
    ['ACTIVE', '2026-11-01T00:00:00Z', 0],
  ] as const)('status=%s deletedAt=%s → ชน %i', (status, deletedAt, n) => {
    expect(findChannelConflicts(cand(), [other({ status, deletedAt })])).toHaveLength(n)
  })
})

describe('TC-087 บอทที่ไม่เหลือเงื่อนไข', () => {
  it('บอทอื่นไม่มีแถวจำกัดวง (มีแต่ is_not/has_none) = ไม่นับเป็นตัวชน', () => {
    expect(findChannelConflicts(cand(), [other({ rules: [isNot('BILLED')], conditionMatch: 'ALL' })])).toEqual([])
  })
  it('ตัวที่กำลังบันทึกไม่มีเงื่อนไข = ไม่ชน (validate ปฏิเสธ NO_CONDITION อยู่แล้ว)', () => {
    expect(findChannelConflicts(cand({ rules: [tag('has_none', 'a')] }), [other()])).toEqual([])
  })
})

describe('FR-FA-8 ชุดสถานะที่อาจตรง', () => {
  it('is_not = ส่วนเติมเต็ม: "ไม่ใช่ ยังไม่ซื้อ" ชนกับ "เปิดบิล" แต่ไม่ชน "ยังไม่ซื้อ"', () => {
    const c = cand({ rules: [isNot('NOT_BOUGHT'), tag('has_any', 'a')] })
    expect(findChannelConflicts(c, [other({ rules: [is('BILLED')] })])).toHaveLength(1)
    expect(findChannelConflicts(c, [other({ rules: [is('NOT_BOUGHT')] })])).toEqual([])
  })
  it('ALL ตัดกันของแถวสถานะ: [เป็น ส่ง/สำเร็จ] และ [ไม่ใช่ ส่ง] = เหลือ สำเร็จ', () => {
    const c = cand({ rules: [is('SHIPPED', 'COMPLETED'), isNot('SHIPPED')] })
    expect(findChannelConflicts(c, [other({ rules: [is('COMPLETED')] })])).toHaveLength(1)
    expect(findChannelConflicts(c, [other({ rules: [is('SHIPPED')] })])).toEqual([])
  })
  it('ANY ที่มีแถวแท็กปน = อาจตรงทุกสถานะ (ชนกับทุกสถานะ)', () => {
    const c = cand({ conditionMatch: 'ANY', rules: [is('NOT_BOUGHT'), tag('has_any', 'a')] })
    expect(findChannelConflicts(c, [other({ rules: [is('CANCELLED')] })])).toHaveLength(1)
  })
  it('ANY ที่มีแต่แถวสถานะ = รวมกัน ไม่ชนสถานะนอกชุด', () => {
    const c = cand({ conditionMatch: 'ANY', rules: [is('NOT_BOUGHT'), is('BILLED')] })
    expect(findChannelConflicts(c, [other({ rules: [is('SHIPPED')] })])).toEqual([])
    expect(findChannelConflicts(c, [other({ rules: [is('BILLED')] })])).toHaveLength(1)
  })
})
