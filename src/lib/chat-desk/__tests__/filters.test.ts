import { describe, expect, it } from 'vitest'
import { parseDeskFilters, roomMatchesFilters, sanitizeDeskFilters, serializeDeskFilters, EMPTY_FILTERS } from '../filters'
import type { DeskRoom } from '../types'

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const U1 = '33333333-3333-4333-8333-333333333333'

describe('parseDeskFilters (AC-CD-48/49)', () => {
  it('อ่าน CSV ทั้งสามคีย์', () => {
    expect(parseDeskFilters({ platforms: 'LINE,DEEP', pages: `${P1},${P2}`, admins: U1 })).toEqual({
      platforms: ['LINE', 'DEEP'], pages: [P1, P2], admins: [U1],
    })
  })
  it('ค่าแปลกปลอมถูกทิ้งเงียบ ไม่ throw', () => {
    expect(parseDeskFilters({ platforms: 'TIKTOK,LINE', pages: `x,${P1},';drop`, admins: '  ' })).toEqual({
      platforms: ['LINE'], pages: [P1], admins: [],
    })
  })
  it('ไม่มีค่า / array / URLSearchParams / ซ้ำ', () => {
    expect(parseDeskFilters({})).toEqual(EMPTY_FILTERS)
    expect(parseDeskFilters({ pages: [P1, P1] }).pages).toEqual([P1])
    expect(parseDeskFilters(new URLSearchParams(`platforms=MESSENGER&admins=${U1}`))).toEqual({ platforms: ['MESSENGER'], pages: [], admins: [U1] })
  })
  it('เพดาน 50 id', () => {
    const many = Array.from({ length: 80 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`).join(',')
    expect(parseDeskFilters({ pages: many }).pages).toHaveLength(50)
  })
})

describe('sanitizeDeskFilters (TD-15)', () => {
  it('ทิ้ง id นอกร้าน · ทิ้งหมด = ไม่กรอง', () => {
    expect(sanitizeDeskFilters({ platforms: ['LINE'], pages: [P1, P2], admins: [U1] }, { channelIds: [P1], memberIds: [] })).toEqual({
      platforms: ['LINE'], pages: [P1], admins: [],
    })
  })
})

describe('serializeDeskFilters', () => {
  it('ข้ามคีย์ว่าง และ round-trip', () => {
    const f = { platforms: ['LINE' as const], pages: [P1], admins: [] }
    expect(serializeDeskFilters(f)).toEqual({ platforms: 'LINE', pages: P1 })
    expect(serializeDeskFilters(EMPTY_FILTERS)).toEqual({})
    expect(parseDeskFilters(serializeDeskFilters(f))).toEqual(f)
  })
})

describe('roomMatchesFilters', () => {
  const room = (o: Partial<DeskRoom>): DeskRoom => ({
    id: 'r', name: 'n', platform: 'LINE', pageId: P1, state: 'AT_DESK', askedAt: null, lastInboundAt: null, repliedAt: null,
    desk: { kind: 'ADMIN', userId: U1 }, ...o,
  })
  const f = (o: object) => ({ ...EMPTY_FILTERS, ...o })
  it('ไม่กรอง = ผ่านหมด', () => expect(roomMatchesFilters(room({}), EMPTY_FILTERS)).toBe(true))
  it('แพลตฟอร์ม/เพจ', () => {
    expect(roomMatchesFilters(room({}), f({ platforms: ['DEEP'] }))).toBe(false)
    expect(roomMatchesFilters(room({}), f({ pages: [P2] }))).toBe(false)
    expect(roomMatchesFilters(room({ pageId: null }), f({ pages: [P1] }))).toBe(false)
    expect(roomMatchesFilters(room({}), f({ platforms: ['LINE'], pages: [P1] }))).toBe(true)
  })
  it('แอดมินกรองเฉพาะห้องหน้าโต๊ะแอดมิน', () => {
    expect(roomMatchesFilters(room({}), f({ admins: ['other'] }))).toBe(false)
    expect(roomMatchesFilters(room({}), f({ admins: [U1] }))).toBe(true)
  })
  it('เลานจ์ไม่ถูกกรองด้วยแอดมิน (S-10) และโต๊ะที่ไม่ใช่แอดมินไม่ถูกกรอง', () => {
    expect(roomMatchesFilters(room({ state: 'WAITING', desk: null }), f({ admins: ['other'] }))).toBe(true)
    expect(roomMatchesFilters(room({ desk: { kind: 'EXTERNAL' } }), f({ admins: ['other'] }))).toBe(true)
  })
})
