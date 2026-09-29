import { describe, expect, it } from 'vitest'
import {
  buildMonthGrid,
  countActiveFilters,
  defaultBoardTab,
  groupByDay,
  parsePageQuery,
  scopeCounts,
  shiftDay,
  shiftMonth,
  shopHasNoFollowUps,
  toApiSearch,
  toPageSearch,
} from './follow-up-page'

const get = (o: Record<string, string>) => (k: string) => o[k] ?? null
const U = '0f8fad5b-d9cb-469f-a165-70867728950e'
const base = { late: 0, today: 0, week: 0, later: 0, done7d: 0, byUser: {}, unassigned: 0 }

describe('parsePageQuery', () => {
  it('ค่าตั้งต้น = ทั้งร้าน กระดาน เดือนปัจจุบัน', () => {
    expect(parsePageQuery(get({}), '2026-09')).toEqual({
      view: 'board', mine: false, assignee: null, tags: [], q: '', month: '2026-09',
    })
  })
  it('?mine=1 = ของฉัน และทิ้ง assignee', () => {
    const q = parsePageQuery(get({ mine: '1', assignee: U }), '2026-09')
    expect(q.mine).toBe(true)
    expect(q.assignee).toBeNull()
  })
  it('ค่าแปลก = ไม่กรอง (assignee/month/view/mine)', () => {
    const q = parsePageQuery(get({ mine: 'yes', assignee: 'abc', month: '2026-13', view: 'x' }), '2026-09')
    expect(q).toMatchObject({ mine: false, assignee: null, month: '2026-09', view: 'board' })
  })
  it('รับ unassigned/uuid/tags/q', () => {
    expect(parsePageQuery(get({ assignee: 'unassigned' }), 'm').assignee).toBe('unassigned')
    expect(parsePageQuery(get({ assignee: U }), 'm').assignee).toBe(U)
    expect(parsePageQuery(get({ tags: ' a, ,b ', q: '  สม ' }), 'm')).toMatchObject({ tags: ['a', 'b'], q: 'สม' })
  })
})

describe('toPageSearch / toApiSearch', () => {
  const q = parsePageQuery(get({ view: 'calendar', mine: '1', tags: 'a,b', q: 'x', month: '2026-10' }), '2026-09')
  it('URL หน้า: ค่าตั้งต้นไม่ลง URL · เดือนปัจจุบันไม่ลง URL', () => {
    expect(toPageSearch(parsePageQuery(get({}), '2026-09'), '2026-09')).toBe('')
    expect(toPageSearch({ ...q, month: '2026-09' }, '2026-09')).not.toContain('month')
    expect(toPageSearch(q, '2026-09')).toBe('view=calendar&mine=1&tags=a%2Cb&q=x&month=2026-10')
  })
  it('API: board ไม่ส่ง month · calendar ส่ง month · shopId ผ่านถ้ามี', () => {
    expect(toApiSearch(q, 'board')).not.toContain('month')
    expect(toApiSearch(q, 'calendar', 'S1')).toContain('month=2026-10')
    expect(toApiSearch(q, 'calendar', 'S1')).toContain('shopId=S1')
  })
  it('round-trip: parse(toPageSearch(q)) = q', () => {
    const sp = new URLSearchParams(toPageSearch(q, '2026-09'))
    expect(parsePageQuery((k) => sp.get(k), '2026-09')).toEqual(q)
  })
})

describe('defaultBoardTab / counts', () => {
  it('คอลัมน์แรกที่ไม่ว่างตามลำดับ', () => {
    expect(defaultBoardTab({ ...base, today: 2, later: 1 })).toBe('today')
    expect(defaultBoardTab({ ...base, done7d: 3 })).toBe('done7d')
    expect(defaultBoardTab({ ...base, late: 1, today: 5 })).toBe('late')
  })
  it('ว่างหมด = เลยกำหนด', () => expect(defaultBoardTab(base)).toBe('late'))
  it('scopeCounts นับเฉพาะที่ยังเปิด · ทำแล้วไม่รวมทั้งร้าน', () => {
    expect(scopeCounts({ ...base, late: 1, today: 2, week: 3, later: 4, done7d: 9, byUser: { [U]: 2 } }, U)).toEqual({ mine: 2, all: 10 })
    expect(scopeCounts(base, U)).toEqual({ mine: 0, all: 0 })
  })
  it('shopHasNoFollowUps: ทำแล้วอย่างเดียวก็ไม่ใช่ร้านว่าง', () => {
    expect(shopHasNoFollowUps(base)).toBe(true)
    expect(shopHasNoFollowUps({ ...base, done7d: 1 })).toBe(false)
    expect(shopHasNoFollowUps({ ...base, later: 1 })).toBe(false)
  })
  it('countActiveFilters ไม่นับ mine/view/month', () => {
    expect(countActiveFilters(parsePageQuery(get({ mine: '1', view: 'calendar', month: '2026-01' }), 'm'))).toBe(0)
    expect(countActiveFilters(parsePageQuery(get({ assignee: 'unassigned', tags: 'a,b', q: 'x' }), 'm'))).toBe(3)
  })
})

describe('ปฏิทิน', () => {
  it('shiftMonth ข้ามปี', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })
  it('shiftDay ข้ามเดือน/ปี', () => {
    expect(shiftDay('2026-09-30', 1)).toBe('2026-10-01')
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31')
  })
  it('buildMonthGrid: เริ่มวันจันทร์ · 7 ช่องต่อสัปดาห์ · กันยายน 2569(ค.ศ.2026) เริ่มวันอังคาร', () => {
    const g = buildMonthGrid('2026-09')
    expect(g.every((w) => w.length === 7)).toBe(true)
    expect(g[0]![0]!.key).toBe('2026-08-31') // จันทร์
    expect(g[0]![1]).toMatchObject({ key: '2026-09-01', inMonth: true })
    expect(g[0]![0]!.inMonth).toBe(false)
    expect(g.flat().filter((c) => c.inMonth)).toHaveLength(30)
  })
  it('buildMonthGrid: เดือนที่เริ่มวันจันทร์พอดีไม่มีช่องนำ', () => {
    const g = buildMonthGrid('2026-06') // 1 มิ.ย. 2026 = จันทร์
    expect(g[0]![0]).toMatchObject({ key: '2026-06-01', inMonth: true })
  })
  it('groupByDay: จัดวันไทย (17:30Z = ข้ามเที่ยงคืนไทย) + นับโทน', () => {
    const rows = [
      { dueAt: '2026-09-29T17:30:00.000Z', status: 'OPEN', overdue: true, bucket: 'late' },
      { dueAt: '2026-09-30T03:00:00.000Z', status: 'OPEN', overdue: false, bucket: 'today' },
      { dueAt: '2026-09-30T04:00:00.000Z', status: 'DONE', overdue: false, bucket: 'done' },
    ]
    const { byDay, tally } = groupByDay(rows)
    expect(byDay.get('2026-09-30')).toHaveLength(3)
    expect(tally.get('2026-09-30')).toEqual({ late: 1, today: 1, normal: 0, done: 1 })
  })
})
