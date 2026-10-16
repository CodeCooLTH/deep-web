import { describe, expect, it } from 'vitest'
import { LOUNGE_SEATS } from '../constants'
import { EXIT, HALL_X, deskSlots, layoutActors, loungeSeat, routeBetween } from '../scene-layout'
import type { DeskCustomer, DeskTable, DeskView } from '../types'

const cust = (id: string): DeskCustomer => ({ id, name: id, platform: 'LINE', pageId: null, status: 'WAITING', since: null })
const table = (key: string, kind: DeskTable['kind'], n = 0): DeskTable => ({
  key, kind, userId: null, name: key, role: null, online: null, canChat: null,
  shown: Array.from({ length: n }, (_, i) => cust(`${key}-${i}`)), overflow: 0, total: n,
})

describe('scene-layout', () => {
  it('เก้าอี้เลานจ์ครบ 24 ตัวไม่ซ้ำตำแหน่ง', () => {
    const keys = new Set(Array.from({ length: LOUNGE_SEATS }, (_, i) => loungeSeat(i).join()))
    expect(keys.size).toBe(LOUNGE_SEATS)
  })
  it('แอดมิน ≤3 ตรง mockup · โต๊ะอื่นแถวหน้า', () => {
    const s = deskSlots([table('a', 'ADMIN'), table('b', 'ADMIN'), table('external', 'EXTERNAL'), table('meta_ai', 'META_AI'), table('bot', 'BOT')])
    expect(s.get('a')).toEqual([1.6, -4.6])
    expect(s.get('b')).toEqual([5.6, -4.6])
    expect(s.get('bot')).toEqual([9.6, 3.4])
  })
  it('แอดมิน 8 → 2 แถว 4 คอลัมน์ ไม่ซ้อนกัน', () => {
    const t = Array.from({ length: 8 }, (_, i) => table(`a${i}`, 'ADMIN'))
    const s = deskSlots([...t, table('external', 'EXTERNAL')])
    expect(new Set([...s.values()].map((v) => v.join())).size).toBe(9)
    expect(s.get('a7')![1]).toBeGreaterThan(s.get('a0')![1])
  })
  it('ลูกค้าหน้าโต๊ะ ≤3 หันหาโต๊ะ · เลานจ์นั่ง', () => {
    const view = {
      lounge: { seats: [cust('w')], overflow: 0, total: 1 },
      tables: [table('a', 'ADMIN', 3)], hiddenAdminTables: [], summary: {} as DeskView['summary'],
    } satisfies DeskView
    const a = layoutActors(view)
    expect(a.find((x) => x.id === 'w')?.seated).toBe(true)
    expect(a.filter((x) => !x.seated)).toHaveLength(3)
  })
  it('route จบที่ปลายทางเสมอ · ในเลานจ์เดินตรง', () => {
    expect(routeBetween([-8, 0], [-5, 1])).toEqual([[-5, 1]])
    const r = routeBetween([-8, 0], [5.6, 4.9])
    expect(r.at(-1)).toEqual([5.6, 4.9])
    expect(r[0][0]).toBe(HALL_X)
    expect(routeBetween([5, 5], EXIT).at(-1)).toEqual(EXIT)
  })
})
