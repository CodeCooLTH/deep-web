import { describe, expect, it } from 'vitest'
import { channelMix, countActiveFilterGroups, eventsToActivity, freshnessOf, listDeskRooms, prependActivity } from '../page-model'
import { diffSnapshots } from '../scene-model'
import type { DeskRoom, DeskSnapshot } from '../types'

const U1 = '11111111-1111-4111-8111-111111111111'
const room = (id: string, over: Partial<DeskRoom> = {}): DeskRoom => ({
  id, name: `ลูกค้า ${id}`, platform: 'MESSENGER', pageId: null, state: 'WAITING',
  askedAt: '2026-10-16T07:00:00.000Z', lastInboundAt: '2026-10-16T07:00:00.000Z', repliedAt: null, desk: null, ...over,
})
const snap = (rooms: DeskRoom[], serverNow = Date.parse('2026-10-16T07:10:00.000Z')): DeskSnapshot => ({
  v: 1, serverNow, shop: { id: 's', name: 'ร้าน', kind: 'BUSINESS' }, sla: { firstResponseSec: 300, source: 'default' },
  filters: { platforms: [], pages: [], admins: [] }, awaiting: { capped: false }, rooms,
  members: [{ userId: U1, name: 'Palmy', role: 'ADMIN', canChat: true, presenceKey: 'k1' }], channels: [],
  daily: { status: 'OK', asOf: '', firstResponseAvgSec: null, responseAvgSec: null, responseSampleCount: 0, unattributedReplyCount: 0, answeredOutsideSystemConversations: 0, resolvedToday: 0 },
})

describe('freshnessOf', () => {
  it('ขอบเขต > 30 = เก่า · > 60 = เชื่อมต่อไม่ได้ (30/60 พอดียังปกติ/เก่า)', () => {
    expect([0, 30, 30.1, 60, 60.1].map(freshnessOf)).toEqual(['ok', 'ok', 'old', 'old', 'lost'])
  })
})

describe('countActiveFilterGroups', () => {
  it('นับจำนวนกลุ่มที่ถูกใช้ ไม่ใช่จำนวนค่า', () => {
    expect(countActiveFilterGroups({ platforms: ['LINE', 'DEEP'], pages: [], admins: [U1] })).toBe(2)
    expect(countActiveFilterGroups({ platforms: [], pages: [], admins: [] })).toBe(0)
  })
})

describe('eventsToActivity (ฟีดความเคลื่อนไหว)', () => {
  const a = snap([room('r1')], 1000)
  const b = snap([room('r1', { state: 'AT_DESK', repliedAt: '2026-10-16T07:09:00.000Z', desk: { kind: 'ADMIN', userId: U1 } }), room('r2')], 2000)
  it('ไปโต๊ะ = ชื่อโต๊ะ · เข้าเลานจ์ = เข้ามารอคำตอบ · หายไป = ออกจากฉาก (ไม่ใช่ปิดงาน)', () => {
    const toDesk = eventsToActivity(diffSnapshots(a, b), b)
    expect(toDesk.map((x) => [x.kind, x.deskName])).toEqual([['ENTER_LOUNGE', null], ['TO_DESK', 'Palmy']])
    const gone = eventsToActivity(diffSnapshots(b, snap([], 3000)), snap([], 3000))
    expect(gone.every((x) => x.kind === 'LEAVE')).toBe(true)
  })
  it('โต๊ะนอกระบบใช้คำเดียวกับหน้ารายงาน · snapshot แรก (prev=null) ไม่มีเหตุการณ์', () => {
    const c = snap([room('r1', { state: 'AT_DESK', desk: { kind: 'EXTERNAL' }, repliedAt: '2026-10-16T07:09:00.000Z' })], 2000)
    expect(eventsToActivity(diffSnapshots(a, c), c)[0].deskName).toBe('ตอบจากนอกระบบ')
    expect(diffSnapshots(null, c)).toEqual([])
  })
  it('prependActivity ตัดที่ 12 แถว ล่าสุดบน', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `k${n}-${i}`, kind: 'LEAVE' as const, roomId: 'r', name: 'x', deskName: null, at: 0 }))
    const out = prependActivity(mk(10), mk(5))
    expect(out).toHaveLength(12)
    expect(out[0].key).toBe('k5-0')
  })
})

describe('listDeskRooms / channelMix', () => {
  it('เลานจ์เรียงรอนานสุดก่อน · โต๊ะครบทุกคนไม่ตัดที่ 3', () => {
    const rooms = [
      room('late', { askedAt: '2026-10-16T07:08:00.000Z' }),
      room('early', { askedAt: '2026-10-16T07:01:00.000Z' }),
      ...['a', 'b', 'c', 'd', 'e'].map((i) => room(i, { state: 'AT_DESK', repliedAt: '2026-10-16T07:09:00.000Z', desk: { kind: 'ADMIN', userId: U1 } })),
    ]
    const s = snap(rooms)
    const l = listDeskRooms(s, s.filters, s.serverNow)
    expect(l.lounge.map((c) => c.id)).toEqual(['early', 'late'])
    expect(l.byTable[`admin:${U1}`]).toHaveLength(5)
    expect(l.all).toHaveLength(7)
    expect(l.lounge[0].status).toBe('OVERDUE') // รอ 9 นาที > SLA 300 วิ
  })
  it('สัดส่วนช่องทาง: ไม่มีห้อง = ไม่มีแถว · เรียงมาก→น้อย · ปัดเปอร์เซ็นต์', () => {
    expect(channelMix([])).toEqual([])
    const s = snap([room('1'), room('2'), room('3', { platform: 'LINE' })])
    const mix = channelMix(listDeskRooms(s, s.filters, s.serverNow).all)
    expect(mix).toEqual([{ platform: 'MESSENGER', count: 2, pct: 67 }, { platform: 'LINE', count: 1, pct: 33 }])
  })
})
