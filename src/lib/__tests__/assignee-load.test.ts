/**
 * assignee-load — เลือกผู้รับผิดชอบเมื่อร้านมีช่างเยอะ (00086 · มติ user 2026-10-30 · prototype v14)
 *
 * mutation ที่ต้องแดง (ทำแล้วตอนเขียน):
 *  - usesAssigneeSearch ใช้ >= แทน > → 6 คนกลายเป็นช่องค้นหา
 *  - computeStaffLoad นับงานทำเสร็จ/ปิด/ไม่มาเป็น "ติดงาน" → ช่างที่ว่างแล้วถูกดันลงล่าง
 *  - computeStaffLoad ไม่ข้าม excludeToken → งานที่กำลังมอบชนตัวเอง
 *  - sortStaffByAvailability สลับเกณฑ์ (งานน้อยก่อนว่าง) → คนติดงานขึ้นบน
 */
import { describe, expect, it } from 'vitest'
import {
  ASSIGNEE_CHIPS_MAX,
  assigneeFormWindow,
  computeStaffLoad,
  loadDayBounds,
  matchesStaffQuery,
  parseLoadWindow,
  sortStaffByAvailability,
  staffQuery,
  usesAssigneeSearch,
  type LoadJobRow,
} from '../assignee-load'

// 2031-03-05 ตามเวลาไทย
const at = (h: number, m = 0) => new Date(Date.UTC(2031, 2, 5, h - 7, m))

describe('เกณฑ์ชิป → ช่องค้นหา', () => {
  it('ไม่เกิน 6 คน = ชิปแบบเดิม · 7 คนขึ้นไป = ช่องค้นหา', () => {
    expect(ASSIGNEE_CHIPS_MAX).toBe(6)
    expect(usesAssigneeSearch(0)).toBe(false)
    expect(usesAssigneeSearch(6)).toBe(false)
    expect(usesAssigneeSearch(7)).toBe(true)
    expect(usesAssigneeSearch(10)).toBe(true)
  })
})

describe('ค้นชื่อ', () => {
  it('คำค้นว่าง/ช่องว่าง = ทุกคน · มีคำ = ชื่อที่มีคำนั้น · ไม่สนตัวพิมพ์', () => {
    expect(matchesStaffQuery('นิด', '')).toBe(true)
    expect(matchesStaffQuery('นิด', '   ')).toBe(true)
    expect(matchesStaffQuery('แบงค์', 'บ')).toBe(true)
    expect(matchesStaffQuery('นิด', 'บ')).toBe(false)
    expect(matchesStaffQuery('Boy', ' bo ')).toBe(true)
  })
})

describe('เรียงคนว่างก่อน', () => {
  const s = (id: string, load?: { dayJobs: number; busy?: boolean }) => ({
    id,
    load: load ? { dayJobs: load.dayJobs, clash: load.busy ? { start: 'a', end: 'b' } : null } : undefined,
  })
  it('ว่างก่อนติดงาน · ว่างด้วยกัน งานน้อยก่อน · เท่ากันคงลำดับชื่อ', () => {
    const out = sortStaffByAvailability([
      s('a', { dayJobs: 1, busy: true }),
      s('b', { dayJobs: 3 }),
      s('c', { dayJobs: 0 }),
      s('d', { dayJobs: 0 }),
      s('e', { dayJobs: 0, busy: true }),
    ])
    expect(out.map((x) => x.id)).toEqual(['c', 'd', 'b', 'e', 'a'])
  })
  it('ไม่มีภาระงาน (ไม่ได้ส่งช่วง) = ลำดับเดิมทุกตัว · ไม่แก้ array เดิม', () => {
    const input = [s('b'), s('a'), s('c')]
    expect(sortStaffByAvailability(input).map((x) => x.id)).toEqual(['b', 'a', 'c'])
    expect(input.map((x) => x.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('อ่านช่วงจาก query', () => {
  it('ถูกต้อง → LoadWindow', () => {
    expect(parseLoadWindow(at(14).toISOString(), at(16).toISOString())).toEqual({ from: at(14), to: at(16) })
  })
  it.each([
    ['ไม่ส่ง', null, null],
    ['ส่งครึ่งเดียว', at(14).toISOString(), null],
    ['ผิดรูป', 'x', 'y'],
    ['กลับด้าน', at(16).toISOString(), at(14).toISOString()],
    ['ศูนย์นาที', at(14).toISOString(), at(14).toISOString()],
    ['กว้างเกิน 2 วัน', at(0).toISOString(), new Date(+at(0) + 3 * 86_400_000).toISOString()],
  ])('%s → null (รายชื่ออย่างเดียว)', (_n, f, t) => {
    expect(parseLoadWindow(f, t)).toBeNull()
  })
})

describe('query ของ service-staff', () => {
  it('ไม่มีอะไร = "" · shopId อย่างเดียว · ช่วง + exclude', () => {
    expect(staffQuery({})).toBe('')
    expect(staffQuery({ shopId: 's1' })).toBe('?shopId=s1')
    const q = new URLSearchParams(staffQuery({ shopId: 's1', window: { from: at(14), to: at(16) }, excludeToken: 'tok' }).slice(1))
    expect(Object.fromEntries(q)).toEqual({ shopId: 's1', from: at(14).toISOString(), to: at(16).toISOString(), exclude: 'tok' })
  })
  it('exclude ไม่มีช่วง = ไม่ส่ง (ไม่มีอะไรให้ยกเว้น)', () => {
    expect(staffQuery({ excludeToken: 'tok' })).toBe('')
  })
})

describe('ขอบวันของ "วันนี้ N งาน" = ปฏิทินไทย', () => {
  it('00:30 น. ไทย ยังเป็นวันเดียวกัน (ไม่ใช่วัน UTC ก่อนหน้า)', () => {
    expect(loadDayBounds({ from: at(0, 30), to: at(1, 30) })).toEqual({ from: at(0), to: new Date(+at(0) + 86_400_000) })
  })
})

describe('computeStaffLoad', () => {
  const row = (o: Partial<LoadJobRow> & { who: string; s: number; e: number }): LoadJobRow => ({
    assignedUserId: o.who,
    publicToken: o.publicToken ?? `${o.who}-${o.s}`,
    serviceStart: at(o.s),
    serviceEnd: at(o.e),
    serviceFinishedAt: o.serviceFinishedAt ?? null,
    serviceClosedAt: o.serviceClosedAt ?? null,
    appointmentStatus: o.appointmentStatus ?? null,
  })
  const win = { from: at(14), to: at(16) }

  it('นับงานทั้งวัน · ชน = งานยังไม่จบที่ซ้อนช่วง (ตัวแรกตามเวลา)', () => {
    const m = computeStaffLoad(['nid'], [row({ who: 'nid', s: 15, e: 17 }), row({ who: 'nid', s: 9, e: 10 }), row({ who: 'nid', s: 13, e: 15 })], win)
    expect(m.get('nid')).toEqual({ dayJobs: 3, clash: { start: at(13).toISOString(), end: at(15).toISOString() } })
  })
  it('ชนขอบพอดี (จบ 14:00 / เริ่ม 16:00) = ไม่ชน', () => {
    const m = computeStaffLoad(['nid'], [row({ who: 'nid', s: 12, e: 14 }), row({ who: 'nid', s: 16, e: 17 })], win)
    expect(m.get('nid')!.clash).toBeNull()
  })
  it.each([
    ['ทำเสร็จแล้ว', { serviceFinishedAt: at(15) }],
    ['ปิดงานแล้ว', { serviceClosedAt: at(15) }],
    ['ไม่มาตามนัด', { appointmentStatus: 'NO_SHOW' }],
    ['ให้บริการแล้ว', { appointmentStatus: 'COMPLETED' }],
  ])('%s = นับในวัน แต่ไม่ติดงาน', (_n, extra) => {
    const m = computeStaffLoad(['nid'], [row({ who: 'nid', s: 14, e: 15, ...extra })], win)
    expect(m.get('nid')).toEqual({ dayJobs: 1, clash: null })
  })
  it('งานที่กำลังมอบ (exclude) ไม่นับทั้งจำนวนและการชน', () => {
    const m = computeStaffLoad(['nid'], [row({ who: 'nid', s: 14, e: 16, publicToken: 'self' })], win, 'self')
    expect(m.get('nid')).toEqual({ dayJobs: 0, clash: null })
  })
  it('ทุกคนในรายชื่อมีค่าเสมอ (ไม่มีงาน = 0 / ว่าง) · แถวของคนนอกรายชื่อถูกข้าม', () => {
    const m = computeStaffLoad(['nid', 'ae'], [row({ who: 'ghost', s: 14, e: 15 })], win)
    expect(m.get('nid')).toEqual({ dayJobs: 0, clash: null })
    expect(m.get('ae')).toEqual({ dayJobs: 0, clash: null })
    expect(m.has('ghost')).toBe(false)
  })
})

describe('ช่วงเวลาของฟอร์มสร้าง (สูตรเดียวกับ onSubmit)', () => {
  const now = new Date(Date.UTC(2031, 2, 5, 3, 7, 42)) // 10:07:42 ไทย
  it('หน้าร้าน = walkInWindow (ปัดวินาที · ใช้นาทีของคิว · ไม่มี = ค่าตั้งต้น)', () => {
    const w = assigneeFormWindow({ arrival: 'WALK_IN', granularity: 'TIME', walkInMinutes: 90, now })
    expect(w).toEqual({ from: at(10, 7), to: at(11, 37) })
    expect(assigneeFormWindow({ arrival: 'WALK_IN', granularity: 'TIME', now })!.from).toEqual(at(10, 7))
  })
  it('นัดรายเวลา = วันที่ + เวลาเริ่ม/จบ (เวลาเครื่อง)', () => {
    const w = assigneeFormWindow({ arrival: 'BOOKED', date: '2031-03-05', startTime: '14:00', endTime: '16:00', granularity: 'TIME', now })
    expect(w).toEqual({ from: new Date('2031-03-05T14:00'), to: new Date('2031-03-05T16:00') })
  })
  it('นัดรายวัน = ทั้งวัน', () => {
    const w = assigneeFormWindow({ arrival: 'BOOKED', date: '2031-03-05', granularity: 'DAY', now })
    expect(w).toEqual({ from: new Date('2031-03-05T00:00'), to: new Date(+new Date('2031-03-05T00:00') + 86_400_000) })
  })
  it.each([
    ['ยังไม่เลือกวัน', { date: undefined, startTime: '14:00', endTime: '16:00' }],
    ['เวลาไม่ครบ', { date: '2031-03-05', startTime: '14:00', endTime: undefined }],
    ['จบก่อนเริ่ม', { date: '2031-03-05', startTime: '16:00', endTime: '14:00' }],
  ])('%s → null (ชื่ออย่างเดียว)', (_n, v) => {
    expect(assigneeFormWindow({ arrival: 'BOOKED', granularity: 'TIME', now, ...v })).toBeNull()
  })
  it('ร้านที่ไม่มีปุ่ม "มาแบบไหน" (arrival undefined) ใช้สูตรนัด', () => {
    expect(assigneeFormWindow({ arrival: undefined, date: '2031-03-05', startTime: '14:00', endTime: '15:00', granularity: 'TIME', now })).not.toBeNull()
  })
})
