import { describe, expect, it } from 'vitest'
import { buildDeskView, deskKeyOf, diffSnapshots, layoutDesk, layoutLounge, splitEvents, summarizeDesk } from '../scene-model'
import { EMPTY_FILTERS } from '../filters'
import type { DeskMember, DeskRoom, DeskSnapshot } from '../types'

const NOW = Date.parse('2026-10-16T07:00:00.000Z')
const iso = (secAgo: number) => new Date(NOW - secAgo * 1000).toISOString()
const member = (i: number, o: Partial<DeskMember> = {}): DeskMember => ({
  userId: `u${i}`, name: `แอดมิน${String(i).padStart(2, '0')}`, role: 'ADMIN', canChat: true, presenceKey: `k${i}`, ...o,
})
const wait = (id: string, secAgo = 10): DeskRoom => ({
  id, name: id, platform: 'LINE', pageId: null, state: 'WAITING', askedAt: iso(secAgo), lastInboundAt: iso(secAgo), repliedAt: null, desk: null,
})
const desk = (id: string, d: DeskRoom['desk'], secAgo = 30): DeskRoom => ({
  id, name: id, platform: 'MESSENGER', pageId: null, state: 'AT_DESK', askedAt: null, lastInboundAt: iso(secAgo + 5), repliedAt: iso(secAgo), desk: d,
})
const snap = (rooms: DeskRoom[], members: DeskMember[] = [member(1)]): DeskSnapshot => ({
  v: 1, serverNow: NOW, shop: { id: 's', name: 'ร้าน', kind: 'BUSINESS' }, sla: { firstResponseSec: 300, source: 'SYSTEM_DEFAULT' },
  filters: EMPTY_FILTERS, awaiting: { capped: false }, rooms, members, channels: [],
  daily: { status: 'OK', asOf: iso(0), firstResponseAvgSec: null, responseAvgSec: null, responseSampleCount: 0, unattributedReplyCount: 0, answeredOutsideSystemConversations: 0, resolvedToday: 0 },
})
const view = (s: DeskSnapshot, online: string[] | null = [], filters = EMPTY_FILTERS) =>
  buildDeskView({ snapshot: s, filters, onlineKeys: online ? new Set(online) : null, now: NOW })

describe('layoutDesk (AC-CD-10)', () => {
  it.each([[0, 0, 0], [3, 3, 0], [4, 3, 1], [10, 3, 7]])('%i คน → แสดง %i +%i', (n, shown, over) => {
    const r = layoutDesk(Array.from({ length: n }, (_, i) => i))
    expect(r.shown).toHaveLength(shown)
    expect(r.overflow).toBe(over)
  })
})

describe('layoutLounge (AC-CD-50)', () => {
  it.each([[24, 24, 0], [25, 24, 1], [60, 24, 36]])('%i คน → นั่ง %i เหลือ %i', (n, seats, over) => {
    const r = layoutLounge(Array.from({ length: n }, (_, i) => i))
    expect(r.seats).toHaveLength(seats)
    expect(r.overflow).toBe(over)
  })
})

describe('buildDeskView', () => {
  it('ร้านเจ้าของคนเดียว (AC-CD-11): โต๊ะเจ้าของ + ตอบนอก Deep ครบ ไม่ error', () => {
    const v = view(snap([wait('w1'), desk('d1', { kind: 'EXTERNAL' }), desk('d2', { kind: 'ADMIN', userId: 'u1' })], [member(1, { role: 'OWNER' })]))
    expect(v.tables.map((t) => t.key)).toEqual(['admin:u1', 'external', 'meta_ai', 'bot'])
    expect(v.tables[0].total).toBe(1)
    expect(v.tables[1].total).toBe(1)
    expect(v.lounge.total).toBe(1)
  })
  it('ไม่มีห้องเลย: โต๊ะสมาชิก + โต๊ะ 3 ชนิดที่เหลือยังอยู่ครบ (0 คน)', () => {
    const v = view(snap([]))
    expect(v.tables.map((t) => t.key)).toEqual(['admin:u1', 'external', 'meta_ai', 'bot'])
    expect(v.tables.slice(1).map((t) => t.total)).toEqual([0, 0, 0])
  })
  it('Meta AI / บอท มีลูกค้ายืนหน้าโต๊ะได้', () => {
    const v = view(snap([desk('a', { kind: 'META_AI' }), desk('b', { kind: 'BOT' })]))
    expect(v.tables.map((t) => t.key)).toEqual(['admin:u1', 'external', 'meta_ai', 'bot'])
  })
  it('โต๊ะแอดมินบนฉาก ≤ 8 เกิน = hiddenAdminTables (มติข้อ 7)', () => {
    const members = Array.from({ length: 11 }, (_, i) => member(i + 1))
    const v = view(snap([], members))
    expect(v.tables.filter((t) => t.kind === 'ADMIN')).toHaveLength(8)
    expect(v.hiddenAdminTables).toHaveLength(3)
  })
  it('โต๊ะที่มีลูกค้าไม่ถูกซ่อนหลัง +N', () => {
    const members = Array.from({ length: 10 }, (_, i) => member(i + 1))
    const v = view(snap([desk('d', { kind: 'ADMIN', userId: 'u10' })], members))
    expect(v.tables.some((t) => t.key === 'admin:u10')).toBe(true)
  })
  it('หน้าโต๊ะ >3 → +N · เรียงเลานจ์รอนานสุดก่อน · สถานะเกินเวลา', () => {
    const rooms = [wait('new', 10), wait('old', 400), ...['a', 'b', 'c', 'd'].map((x, i) => desk(x, { kind: 'ADMIN', userId: 'u1' }, 20 + i))]
    const v = view(snap(rooms))
    expect(v.lounge.seats.map((c) => c.id)).toEqual(['old', 'new'])
    expect(v.lounge.seats[0].status).toBe('OVERDUE')
    expect(v.lounge.seats[1].status).toBe('WAITING')
    const t = v.tables[0]
    expect(t.shown).toHaveLength(3)
    expect(t.overflow).toBe(1)
    expect(t.shown[0].status).toBe('RECENT')
  })
  it('ตัวกรองแอดมินเหลือโต๊ะที่เลือก · เลานจ์ยังอยู่', () => {
    const v = view(snap([wait('w')], [member(1), member(2)]), [], { ...EMPTY_FILTERS, admins: ['u2'] })
    expect(v.tables.filter((t) => t.kind === 'ADMIN').map((t) => t.userId)).toEqual(['u2'])
    expect(v.lounge.total).toBe(1)
  })
  it('presence ใช้ไม่ได้ → online null (ไม่ใช่ false)', () => {
    const v = view(snap([]), null)
    expect(v.tables[0].online).toBeNull()
    expect(v.summary.online).toBeNull()
  })
})

describe('summarizeDesk (AC-CD-17/18/19)', () => {
  const members = [member(1), member(2), member(3, { canChat: false })]
  const base = { members, now: NOW, slaSec: 300 }
  it('ออนไลน์ n/N นับเฉพาะ canChat', () => {
    const s = summarizeDesk({ ...base, rooms: [], onlineKeys: new Set(['k1', 'k3']) })
    expect(s.online).toBe(1)
    expect(s.chatters).toBe(2)
  })
  it('ว่างรับแชท = ออนไลน์ ∧ ในมือ 0', () => {
    const rooms = [desk('d', { kind: 'ADMIN', userId: 'u1' })]
    const s = summarizeDesk({ ...base, rooms, onlineKeys: new Set(['k1', 'k2']) })
    expect(s.free).toBe(1) // u1 มีแชทในมือ
    expect(summarizeDesk({ ...base, rooms, onlineKeys: new Set() }).free).toBe(0) // ออฟไลน์ไม่ว่าง
  })
  it('กำลังคุยไม่นับ Meta AI / บอท', () => {
    const rooms = [desk('a', { kind: 'ADMIN', userId: 'u1' }), desk('b', { kind: 'EXTERNAL' }), desk('c', { kind: 'META_AI' }), desk('d', { kind: 'BOT' })]
    expect(summarizeDesk({ ...base, rooms, onlineKeys: new Set() }).talking).toBe(2)
  })
  it('รอ/เกินเวลา · askedAt ว่างใช้ lastInboundAt (KL-1)', () => {
    const rooms = [wait('a', 400), wait('b', 10), { ...wait('c', 10), askedAt: null, lastInboundAt: iso(500) }]
    const s = summarizeDesk({ ...base, rooms, onlineKeys: new Set(), awaitingCapped: true })
    expect([s.waiting, s.overdue, s.awaitingCapped]).toEqual([3, 2, true])
  })
  it('presence null → online/free null', () => {
    const s = summarizeDesk({ ...base, rooms: [], onlineKeys: null })
    expect([s.online, s.free, s.chatters]).toEqual([null, null, 2])
  })
})

describe('diffSnapshots (AC-CD-35/36/37)', () => {
  const a = snap([wait('r1'), desk('r2', { kind: 'EXTERNAL' })])
  it('prev=null → [] · diff(a,a) → []', () => {
    expect(diffSnapshots(null, a)).toEqual([])
    expect(diffSnapshots(a, a)).toEqual([])
  })
  it('ENTER / TO_DESK / TO_LOUNGE / LEAVE ตาม id ห้อง', () => {
    const next = snap([wait('r2'), desk('r1', { kind: 'ADMIN', userId: 'u1' }), wait('r3')])
    const ev = diffSnapshots(a, next)
    const by = Object.fromEntries(ev.map((e) => [e.roomId, e]))
    expect(by.r1.type).toBe('TO_DESK')
    expect(by.r1.to).toEqual({ kind: 'DESK', key: 'admin:u1' })
    expect(by.r1.from).toEqual({ kind: 'LOUNGE' })
    expect(by.r2.type).toBe('TO_LOUNGE')
    expect(by.r3.type).toBe('ENTER')
    expect(diffSnapshots(a, snap([wait('r1')])).map((e) => [e.type, e.roomId])).toEqual([['LEAVE', 'r2']])
  })
  it('ย้ายโต๊ะ = TO_DESK · โต๊ะเดิม = ไม่มีเหตุการณ์', () => {
    const p = snap([desk('r', { kind: 'ADMIN', userId: 'u1' })])
    expect(diffSnapshots(p, snap([desk('r', { kind: 'ADMIN', userId: 'u2' })])).map((e) => e.type)).toEqual(['TO_DESK'])
    expect(diffSnapshots(p, snap([desk('r', { kind: 'ADMIN', userId: 'u1' }, 5)]))).toEqual([])
  })
  it('splitEvents: 25 → เล่น 20 ที่เหลือ 5 วางทันที', () => {
    const next = snap(Array.from({ length: 25 }, (_, i) => wait(`n${i}`)))
    const r = splitEvents(diffSnapshots(snap([]), next))
    expect(r.animate).toHaveLength(20)
    expect(r.settle).toHaveLength(5)
  })
})

describe('deskKeyOf', () => {
  it('คีย์โต๊ะ', () => {
    expect(deskKeyOf({ kind: 'ADMIN', userId: 'x' })).toBe('admin:x')
    expect(deskKeyOf({ kind: 'BOT' })).toBe('bot')
  })
})
