import { describe, expect, it } from 'vitest'
import { isHumanAgentReply } from '@/lib/agent-performance'
import { classifyRoom, isOverdue, pickDesk, previewBodyLabel, resolveInitialView, startOfBangkokDay, type ClassifyInput } from '../rules'

const NOW = Date.parse('2026-10-16T07:00:00.000Z')
const ago = (sec: number) => new Date(NOW - sec * 1000)
const waiting: ClassifyInput = {
  resolvedAt: null, isHidden: false, isSpam: false, lastSenderRole: 'BUYER', lastInboundAt: ago(60), lastShopMessageAt: ago(3600),
}
const atDesk: ClassifyInput = { ...waiting, lastSenderRole: 'SHOP', lastShopMessageAt: ago(60) }

describe('classifyRoom (AC-CD-01/03/09)', () => {
  it('ครบเงื่อนไข = WAITING', () => expect(classifyRoom(waiting, NOW)).toBe('WAITING'))
  it.each([
    ['ปิดงาน', { resolvedAt: ago(5) }],
    ['hidden', { isHidden: true }],
    ['spam', { isSpam: true }],
    ['เกิน 7 วัน', { lastInboundAt: ago(7 * 86400 + 1) }],
    ['ไม่มี lastInboundAt', { lastInboundAt: null }],
  ])('%s = NONE (เปลี่ยนทีละเงื่อนไข)', (_n, patch) => {
    expect(classifyRoom({ ...waiting, ...patch }, NOW)).toBe('NONE')
  })
  it('ขอบ 7 วันพอดียังรอ', () => expect(classifyRoom({ ...waiting, lastInboundAt: ago(7 * 86400) }, NOW)).toBe('WAITING'))
  it('ลูกค้าส่งหลังร้านตอบ 30 วิ = WAITING ไม่ใช่ AT_DESK', () => {
    expect(classifyRoom({ ...waiting, lastShopMessageAt: ago(90), lastInboundAt: ago(60) }, NOW)).toBe('WAITING')
  })
  it('ขอบ 179/180/181 วินาที', () => {
    expect(classifyRoom({ ...atDesk, lastShopMessageAt: ago(179) }, NOW)).toBe('AT_DESK')
    expect(classifyRoom({ ...atDesk, lastShopMessageAt: ago(180) }, NOW)).toBe('AT_DESK')
    expect(classifyRoom({ ...atDesk, lastShopMessageAt: ago(181) }, NOW)).toBe('NONE')
  })
  it('ไม่มีข้อความร้านที่นับได้ = NONE', () => {
    expect(classifyRoom({ ...atDesk, lastShopMessageAt: null }, NOW)).toBe('NONE')
    expect(classifyRoom({ ...atDesk, lastSenderRole: null }, NOW)).toBe('NONE')
  })
  it('ห้องปิด/hidden/spam ไม่เข้าหน้าโต๊ะ', () => {
    expect(classifyRoom({ ...atDesk, resolvedAt: ago(1) }, NOW)).toBe('NONE')
    expect(classifyRoom({ ...atDesk, isSpam: true }, NOW)).toBe('NONE')
  })
})

describe('pickDesk (AC-CD-05..08) BOT > META_AI > ADMIN > EXTERNAL', () => {
  const members = new Set(['u1'])
  const base = { autoReplyKind: null, viaStandby: false, senderUserId: null }
  it('ตาราง', () => {
    expect(pickDesk({ ...base, autoReplyKind: 'GREETING' }, members)).toEqual({ kind: 'BOT' })
    expect(pickDesk({ ...base, viaStandby: true }, members)).toEqual({ kind: 'META_AI' })
    expect(pickDesk({ ...base, senderUserId: 'u1' }, members)).toEqual({ kind: 'ADMIN', userId: 'u1' })
    expect(pickDesk(base, members)).toEqual({ kind: 'EXTERNAL' })
  })
  it('สมาชิกที่ถอดแล้ว/ไม่รู้จัก = EXTERNAL', () => {
    expect(pickDesk({ ...base, senderUserId: 'gone' }, members)).toEqual({ kind: 'EXTERNAL' })
  })
  it('เคสชน: autoReplyKind+viaStandby = BOT · viaStandby+สมาชิก = META_AI · autoReply+สมาชิก = BOT', () => {
    expect(pickDesk({ autoReplyKind: 'X', viaStandby: true, senderUserId: 'u1' }, members)).toEqual({ kind: 'BOT' })
    expect(pickDesk({ autoReplyKind: null, viaStandby: true, senderUserId: 'u1' }, members)).toEqual({ kind: 'META_AI' })
  })
  it('รับ array ได้', () => expect(pickDesk({ ...base, senderUserId: 'u1' }, ['u1'])).toEqual({ kind: 'ADMIN', userId: 'u1' }))
  it('ตรงกับ isHumanAgentReply เมื่อไม่มี viaStandby (กัน drift)', () => {
    const cases = [
      { autoReplyKind: null, senderUserId: 'u1' },
      { autoReplyKind: 'GREETING', senderUserId: 'u1' },
      { autoReplyKind: null, senderUserId: null },
    ]
    for (const c of cases) {
      const human = isHumanAgentReply({ senderRole: 'SHOP', isDeleted: false, ...c } as never)
      expect(pickDesk({ ...c, viaStandby: false }, members).kind === 'ADMIN').toBe(human)
    }
  })
})

describe('isOverdue (AC-CD-15) ใช้ >', () => {
  const sla = 300
  it('SLA-1 / SLA / SLA+1', () => {
    expect(isOverdue(ago(299), NOW, sla)).toBe(false)
    expect(isOverdue(ago(300), NOW, sla)).toBe(false)
    expect(isOverdue(ago(301), NOW, sla)).toBe(true)
  })
  it('askedAt ว่าง = ไม่เกิน', () => expect(isOverdue(null, NOW, sla)).toBe(false))
})

describe('startOfBangkokDay (AC-CD-16)', () => {
  it('16:59:59Z ยังเป็นวันเดิม · 17:00:00Z เริ่มวันใหม่ตามเวลาไทย', () => {
    expect(startOfBangkokDay(Date.parse('2026-10-16T16:59:59Z')).toISOString()).toBe('2026-10-15T17:00:00.000Z')
    expect(startOfBangkokDay(Date.parse('2026-10-16T17:00:00Z')).toISOString()).toBe('2026-10-16T17:00:00.000Z')
  })
})

describe('previewBodyLabel', () => {
  it('ลบ/ข้อความ/ชนิดอื่น', () => {
    expect(previewBodyLabel('TEXT', 'hi', true)).toBe('ข้อความถูกลบ')
    expect(previewBodyLabel('TEXT', 'สวัสดี', false)).toBe('สวัสดี')
    expect(previewBodyLabel('IMAGE', null, false)).toBe('ส่งรูปภาพ')
    expect(previewBodyLabel('WEIRD', null, false)).toBe('ข้อความ')
  })
})

describe('resolveInitialView (AC-CD-52)', () => {
  it('กว้าง <768 → 2d · ≥768 → 3d', () => {
    expect(resolveInitialView(390)).toBe('2d')
    expect(resolveInitialView(767)).toBe('2d')
    expect(resolveInitialView(768)).toBe('3d')
  })
  it('ไม่มี WebGL → 2d เสมอแม้ URL ขอ 3d', () => expect(resolveInitialView(1440, false, '3d')).toBe('2d'))
  it('URL ชนะความกว้าง · ค่าแปลกถูกทิ้ง', () => {
    expect(resolveInitialView(390, true, '3d')).toBe('3d')
    expect(resolveInitialView(1440, true, '2d')).toBe('2d')
    expect(resolveInitialView(1440, true, 'zzz')).toBe('3d')
  })
})
