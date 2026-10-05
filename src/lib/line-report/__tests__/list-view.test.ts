import { describe, expect, it } from 'vitest'
import {
  createBlockedReason,
  deliveryStatusView,
  groupKindLabel,
  lastDeliveryView,
  sortGroups,
  statusLine,
  type ListGroupItem,
} from '../list-view'

// 2026-10-05 12:00 เวลาไทย
const NOW = new Date('2026-10-05T05:00:00.000Z')
const g = (id: string, o: Partial<ListGroupItem> = {}): ListGroupItem => ({
  id,
  groupName: id,
  status: 'ACTIVE',
  paused: false,
  shopCount: 1,
  mixedVertical: false,
  shops: [],
  nextSendAt: null,
  lastDelivery: null,
  alert: null,
  bind: { codeExpiresAt: null },
  ...o,
})

describe('sortGroups', () => {
  it('มีปัญหา → รอผูก → ปกติ · ภายในชั้นเรียงเวลาส่งถัดไป · ไม่มีเวลาไว้ท้าย · เสมอกันคงลำดับเดิม', () => {
    const sorted = sortGroups([
      g('ok-late', { nextSendAt: '2026-10-06T00:00:00Z' }),
      g('ok-none'),
      g('pending', { status: 'PENDING' }),
      g('ok-soon', { nextSendAt: '2026-10-05T11:00:00Z' }),
      g('removed', { status: 'INACTIVE' }),
      g('alerted', { alert: { kind: 'SEND_FAILED', at: null, acked: false } }),
      g('acked', { alert: { kind: 'SEND_FAILED', at: null, acked: true }, nextSendAt: '2026-10-05T10:00:00Z' }),
    ]).map((x) => x.id)
    expect(sorted).toEqual(['removed', 'alerted', 'pending', 'acked', 'ok-soon', 'ok-late', 'ok-none'])
  })
  it('ไม่แก้อาร์เรย์เดิม', () => {
    const src = [g('b', { status: 'PENDING' }), g('a', { status: 'INACTIVE' })]
    sortGroups(src)
    expect(src.map((x) => x.id)).toEqual(['b', 'a'])
  })
})

describe('createBlockedReason', () => {
  const base = { canCreate: false, paused: false, botReady: true, count: 3, limit: 10 }
  it('กดได้ = null', () => expect(createBlockedReason({ ...base, canCreate: true })).toBeNull())
  it('ลำดับเหตุ: แพ็กเกจหยุด > บอทไม่พร้อม > ครบเพดาน', () => {
    expect(createBlockedReason({ ...base, paused: true, botReady: false, count: 10 })).toBe('เพิ่มกลุ่มใหม่ได้เมื่อแพ็กเกจกลับมาใช้งาน')
    expect(createBlockedReason({ ...base, botReady: false, count: 10 })).toBe('ฟีเจอร์ยังไม่พร้อมใช้งาน')
    expect(createBlockedReason({ ...base, count: 10 })).toBe('ครบ 10 กลุ่มแล้ว ยกเลิกการผูกกลุ่มที่ไม่ได้ใช้ก่อน แล้วค่อยเพิ่มกลุ่มใหม่')
    expect(createBlockedReason({ ...base, count: 9 })).toBe('เพิ่มกลุ่มใหม่ไม่ได้ในขณะนี้')
  })
})

describe('statusLine', () => {
  it('แพ็กเกจหยุดชนะทุกสถานะ', () => {
    for (const status of ['ACTIVE', 'PENDING', 'INACTIVE'] as const)
      expect(statusLine(g('x', { status, paused: true }), NOW)).toEqual({ kind: 'text', text: 'รายงานหยุดส่งไว้ก่อน จนกว่าแพ็กเกจจะกลับมาใช้งาน' })
  })
  it('บอทถูกนำออก', () => expect(statusLine(g('x', { status: 'INACTIVE' }), NOW)).toEqual({ kind: 'text', text: 'เชิญบอทกลับเข้ากลุ่ม แล้วกดผูกใหม่' }))
  it('รอผูก: โค้ดยังไม่หมด = countdown · หมด/ไม่มี = ข้อความหมดอายุ', () => {
    const live = '2026-10-05T05:07:12.000Z'
    expect(statusLine(g('x', { status: 'PENDING', bind: { codeExpiresAt: live } }), NOW)).toEqual({ kind: 'countdown', expiresAt: live })
    const expired = { kind: 'text', text: 'รอผูก · โค้ดหมดอายุ ต้องสร้างโค้ดใหม่' }
    expect(statusLine(g('x', { status: 'PENDING', bind: { codeExpiresAt: NOW.toISOString() } }), NOW)).toEqual(expired)
    expect(statusLine(g('x', { status: 'PENDING' }), NOW)).toEqual(expired)
  })
  it('ผูกแล้ว: วันนี้ / วันอื่น / ไม่มีเวลา', () => {
    expect(statusLine(g('x', { nextSendAt: '2026-10-05T11:00:00Z' }), NOW)).toEqual({ kind: 'text', text: 'ส่งถัดไป วันนี้ 18:00' })
    // 17:00Z = 00:00 ไทยของ 6 ต.ค.
    expect(statusLine(g('x', { nextSendAt: '2026-10-05T17:00:00Z' }), NOW)).toEqual({ kind: 'text', text: 'ส่งถัดไป 6 ต.ค. 00:00' })
    expect(statusLine(g('x'), NOW)).toEqual({ kind: 'text', text: 'ยังไม่ได้ตั้งเวลาส่ง' })
  })
})

describe('lastDeliveryView', () => {
  const at = (iso: string, status = 'SENT') => ({ at: iso, kind: 'DAILY', status })
  it('ยังไม่เคยส่ง = null', () => expect(lastDeliveryView(null, NOW)).toBeNull())
  it('วันนี้/เมื่อวาน/วันอื่น ตามปฏิทินไทย (ไม่ใช่ UTC)', () => {
    expect(lastDeliveryView(at('2026-10-05T02:00:00Z'), NOW)?.when).toBe('วันนี้ 09:00')
    // 4 ต.ค. 18:00 ไทย = 11:00Z
    expect(lastDeliveryView(at('2026-10-04T11:00:00Z'), NOW)?.when).toBe('เมื่อวาน 18:00')
    // 4 ต.ค. 23:00Z = 5 ต.ค. 06:00 ไทย = วันนี้ (ขอบ UTC/ไทย)
    expect(lastDeliveryView(at('2026-10-04T23:00:00Z'), NOW)?.when).toBe('วันนี้ 06:00')
    expect(lastDeliveryView(at('2026-09-30T05:00:00Z'), NOW)?.when).toBe('30 ก.ย. 12:00')
  })
  it('เขียวเฉพาะส่งสำเร็จ · แดงเฉพาะล้มจริง', () => {
    const tones = Object.fromEntries(
      ['SENT', 'FAILED', 'REPLY_FAILED', 'SKIPPED_NO_ORDERS', 'MISSED', 'RETRY_PENDING', 'CLAIMED', 'NO_SENDABLE_SHOPS'].map((s) => [s, deliveryStatusView(s).tone]),
    )
    expect(tones).toEqual({
      SENT: 'success', FAILED: 'danger', REPLY_FAILED: 'danger', SKIPPED_NO_ORDERS: 'neutral', MISSED: 'neutral',
      RETRY_PENDING: 'warning', CLAIMED: 'neutral', NO_SENDABLE_SHOPS: 'warning',
    })
    expect(deliveryStatusView('???').tone).toBe('neutral')
  })
})

describe('groupKindLabel', () => {
  it('1 ร้าน = สาขา · หลายร้าน = รวม N ร้าน', () => {
    expect(groupKindLabel(1)).toBe('กลุ่มสาขา')
    expect(groupKindLabel(5)).toBe('กลุ่มรวม 5 ร้าน')
  })
})
