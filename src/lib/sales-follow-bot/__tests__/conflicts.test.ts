// 00095 TC-085..087 — findChannelConflicts
import { describe, expect, it } from 'vitest'
import { findChannelConflicts, type ConflictBot, type ConflictOther } from '../conflicts'

const cand = (o: Partial<ConflictBot> = {}): ConflictBot => ({ id: 'cand', name: 'ตัวใหม่', channelIds: ['ch1'], salesStatuses: ['NOT_BOUGHT'], usableTagCount: 0, ...o })
const other = (o: Partial<ConflictOther> = {}): ConflictOther => ({
  id: 'b1',
  name: 'บอทเดิม',
  channelIds: ['ch1'],
  salesStatuses: ['NOT_BOUGHT'],
  usableTagCount: 0,
  status: 'ACTIVE',
  deletedAt: null,
  ...o,
})

describe('TC-085 ชน/ไม่ชน', () => {
  it('ช่องเดียวกัน + สถานะซ้อน = ชน (บอก channelId/botId/botName)', () => {
    expect(findChannelConflicts(cand(), [other()])).toEqual([{ channelId: 'ch1', botId: 'b1', botName: 'บอทเดิม' }])
  })
  it('ช่องเดียวกัน + สถานะไม่ซ้อน = ไม่ชน', () => {
    expect(findChannelConflicts(cand(), [other({ salesStatuses: ['BILLED'] })])).toEqual([])
  })
  it('ช่องต่างกัน = ไม่ชน', () => {
    expect(findChannelConflicts(cand(), [other({ channelIds: ['ch2'] })])).toEqual([])
  })
  it('ฝ่ายหนึ่งสถานะว่าง (= ทุกสถานะ) = ชน — ทั้งสองทิศ (M-26)', () => {
    expect(findChannelConflicts(cand({ salesStatuses: [], usableTagCount: 1 }), [other({ salesStatuses: ['BILLED'] })])).toHaveLength(1)
    expect(findChannelConflicts(cand({ salesStatuses: ['BILLED'] }), [other({ salesStatuses: [], usableTagCount: 1 })])).toHaveLength(1)
  })
  it('ทั้งคู่ว่าง = ชน', () => {
    expect(findChannelConflicts(cand({ salesStatuses: [], usableTagCount: 2 }), [other({ salesStatuses: [], usableTagCount: 1 })])).toHaveLength(1)
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
  it('บอทอื่นไม่มีสถานะและไม่มีแท็กที่ใช้ได้ = ไม่นับเป็นตัวชน', () => {
    expect(findChannelConflicts(cand(), [other({ salesStatuses: [], usableTagCount: 0 })])).toEqual([])
  })
  it('ตัวที่กำลังบันทึกไม่มีเงื่อนไข = ไม่ชน (validate ปฏิเสธ NO_CONDITION อยู่แล้ว)', () => {
    expect(findChannelConflicts(cand({ salesStatuses: [], usableTagCount: 0 }), [other()])).toEqual([])
  })
})
