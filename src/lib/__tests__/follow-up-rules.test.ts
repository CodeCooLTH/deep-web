import { describe, it, expect } from 'vitest'
import {
  isOverdue,
  bucketOf,
  countOpenAndLate,
  filterStateOf,
  isReminderDue,
  initialRemindedFor,
  isUnassigned,
  panelModel,
  bubbleRows,
  bubbleModel,
  groupReminders,
  buildReminderPush,
} from '@/lib/follow-up-rules'

const T = (s: string) => new Date(s)
// 10:00 ไทย 2026-09-30 = 03:00Z · allDay วันที่ 09-30 = 09-29T17:00Z
const timed = (dueAt: string, status = 'OPEN') => ({ status, dueAt: T(dueAt), allDay: false })
const allDay = (dueAt: string, status = 'OPEN') => ({ status, dueAt: T(dueAt), allDay: true })

describe('isOverdue [blocker AC-ACT-16/17/19]', () => {
  const f = timed('2026-09-30T03:00:00Z')
  it('มีเวลา: 09:59:59 ไม่เลย · 10:00:00 ไม่เลย · 10:00:00.001 เลย', () => {
    expect(isOverdue(f, T('2026-09-30T02:59:59Z'))).toBe(false)
    expect(isOverdue(f, T('2026-09-30T03:00:00.000Z'))).toBe(false)
    expect(isOverdue(f, T('2026-09-30T03:00:00.001Z'))).toBe(true)
  })
  it('ทั้งวัน D=09-30: D 00:00 ไม่เลย · 23:59:59.999 ไม่เลย · D+1 00:00 เลย', () => {
    const d = allDay('2026-09-29T17:00:00Z')
    expect(isOverdue(d, T('2026-09-29T17:00:00Z'))).toBe(false)
    expect(isOverdue(d, T('2026-09-30T16:59:59.999Z'))).toBe(false)
    expect(isOverdue(d, T('2026-09-30T17:00:00Z'))).toBe(true)
  })
  it('DONE ไม่เคยเลยกำหนด แม้กำหนดผ่านมานานทั้งมีเวลา/ทั้งวัน', () => {
    expect(isOverdue(timed('2026-09-01T03:00:00Z', 'DONE'), T('2026-09-30T00:00:00Z'))).toBe(false)
    expect(isOverdue(allDay('2026-08-31T17:00:00Z', 'DONE'), T('2026-09-30T00:00:00Z'))).toBe(false)
  })
})

describe('bucketOf [blocker AC-ACT-19/20]', () => {
  // now = 2026-09-30 12:00 ไทย (05:00Z) → สิ้นวันนี้ไทย = 09-30T17:00Z
  const now = T('2026-09-30T05:00:00Z')
  it('DONE → done เสมอ (เมื่อวาน/วันนี้/พรุ่งนี้/+30 วัน)', () => {
    for (const d of ['2026-09-29T03:00:00Z', '2026-09-30T10:00:00Z', '2026-10-01T03:00:00Z', '2026-10-30T03:00:00Z']) {
      expect(bucketOf(timed(d, 'DONE'), now)).toBe('done')
    }
  })
  it('ขอบวันนี้/7 วัน/ภายหลัง', () => {
    expect(bucketOf(timed('2026-09-30T16:59:00Z'), now)).toBe('today') // 23:59 ไทย
    expect(bucketOf(timed('2026-09-30T17:00:00Z'), now)).toBe('week') // 00:00 พรุ่งนี้
    expect(bucketOf(allDay('2026-09-30T17:00:00Z'), now)).toBe('week')
    // วันที่ 7 หลังสิ้นวันนี้ = 10-07 (00:00 ไทย = 10-06T17:00Z) ยังอยู่ week; วันที่ 8 = later
    expect(bucketOf(allDay('2026-10-06T17:00:00Z'), now)).toBe('week')
    expect(bucketOf(timed('2026-10-07T16:59:59Z'), now)).toBe('week')
    expect(bucketOf(allDay('2026-10-07T17:00:00Z'), now)).toBe('later')
    expect(bucketOf(timed('2026-10-07T17:00:00Z'), now)).toBe('later')
  })
  it('เลยกำหนด → late ก่อน today (มีเวลาเมื่อชั่วโมงก่อน)', () => {
    expect(bucketOf(timed('2026-09-30T04:00:00Z'), now)).toBe('late')
    // ทั้งวันของวันนี้ยังไม่เลย → today
    expect(bucketOf(allDay('2026-09-29T17:00:00Z'), now)).toBe('today')
  })
})

describe('countOpenAndLate [blocker AC-ACT-22]', () => {
  const now = T('2026-09-30T05:00:00Z')
  it('นับ OPEN เท่านั้น; late = isOverdue; DONE ไม่นับทั้งคู่', () => {
    const rows = [
      timed('2026-09-30T04:00:00Z'), // late
      timed('2026-09-30T10:00:00Z'), // ยังไม่เลย
      timed('2026-09-01T03:00:00Z', 'DONE'), // DONE เก่า ต้องไม่เข้า late
      allDay('2026-09-29T17:00:00Z'), // today ทั้งวัน ไม่เลย
    ]
    expect(countOpenAndLate(rows, now)).toEqual({ open: 3, late: 1 })
  })
})

describe('filterStateOf [blocker AC-ACT-43]', () => {
  it('3 สถานะ + ไม่เคยมี = null', () => {
    expect(filterStateOf({ open: 0, late: 0, done: 0 })).toBeNull()
    expect(filterStateOf({ open: 2, late: 1, done: 0 })).toBe('late')
    expect(filterStateOf({ open: 2, late: 0, done: 0 })).toBe('upcoming')
    expect(filterStateOf({ open: 0, late: 0, done: 3 })).toBe('done')
    // เติมไว้ฆ่า mutation "done ชนะ open": มีทั้งเปิดและปิด ต้องเป็น upcoming
    expect(filterStateOf({ open: 1, late: 0, done: 2 })).toBe('upcoming')
  })
})

describe('isReminderDue / initialRemindedFor [blocker AC-ACT-31/33/34/39]', () => {
  const fire = T('2026-09-30T03:00:00Z')
  const row = (over: Partial<{ remindedFor: Date | null; status: string }> = {}) => ({
    ...timed('2026-09-30T03:00:00Z'),
    remindedFor: null as Date | null,
    ...over,
  })
  it('มีเวลา: fire−1s ไม่ due · fire due · fire+6h due · fire+6h+1s ไม่ due', () => {
    expect(isReminderDue(row(), T('2026-09-30T02:59:59Z'))).toBe(false)
    expect(isReminderDue(row(), fire)).toBe(true)
    expect(isReminderDue(row(), T('2026-09-30T09:00:00Z'))).toBe(true)
    expect(isReminderDue(row(), T('2026-09-30T09:00:01Z'))).toBe(false)
  })
  it('ทั้งวัน: 08:59 ไม่ due · 09:00 due · 23:59:59 ไทยยัง due · วันถัดไป 00:00 ไม่ due', () => {
    const r = { ...allDay('2026-09-29T17:00:00Z'), remindedFor: null as Date | null }
    expect(isReminderDue(r, T('2026-09-30T01:59:59Z'))).toBe(false)
    expect(isReminderDue(r, T('2026-09-30T02:00:00Z'))).toBe(true)
    expect(isReminderDue(r, T('2026-09-30T16:59:59Z'))).toBe(true)
    expect(isReminderDue(r, T('2026-09-30T17:00:00Z'))).toBe(false)
  })
  it('remindedFor = fireAt → ไม่ due · remindedFor เก่า (หลังเลื่อน) → due · DONE ไม่ due', () => {
    expect(isReminderDue(row({ remindedFor: fire }), fire)).toBe(false)
    expect(isReminderDue(row({ remindedFor: T('2026-09-29T03:00:00Z') }), fire)).toBe(true)
    expect(isReminderDue(row({ status: 'DONE' }), fire)).toBe(false)
  })
  it('initialRemindedFor: ย้อนหลัง = fireAt · อนาคต = null · ทั้งวันใช้ fire 09:00', () => {
    const now = T('2026-09-30T05:00:00Z')
    expect(initialRemindedFor({ dueAt: T('2026-09-30T03:00:00Z'), allDay: false }, now)).toEqual(T('2026-09-30T03:00:00Z'))
    expect(initialRemindedFor({ dueAt: T('2026-09-30T06:00:00Z'), allDay: false }, now)).toBeNull()
    // ทั้งวัน: เที่ยงคืนไทยผ่านแล้ว แต่ fire 09:00 (=02:00Z) ยังไม่ถึงที่ 01:00Z ⇒ ต้อง null (ฆ่า mutation ใช้ dueAt แทน fireAt)
    expect(initialRemindedFor({ dueAt: T('2026-09-29T17:00:00Z'), allDay: true }, T('2026-09-30T01:00:00Z'))).toBeNull()
    expect(initialRemindedFor({ dueAt: T('2026-09-29T17:00:00Z'), allDay: true }, T('2026-09-30T02:00:00Z'))).toEqual(
      T('2026-09-30T02:00:00Z'),
    )
  })
})

describe('isUnassigned', () => {
  const members = new Set(['a', 'b'])
  it('null / ไม่ใช่สมาชิก = ยังไม่มีคนรับ; สมาชิก = มี', () => {
    expect(isUnassigned({ assigneeUserId: null }, members)).toBe(true)
    expect(isUnassigned({ assigneeUserId: 'x' }, members)).toBe(true)
    expect(isUnassigned({ assigneeUserId: 'a' }, members)).toBe(false)
  })
})

describe('panelModel / bubbleModel / bubbleRows [blocker BR-ACT-21]', () => {
  const now = T('2026-09-30T05:00:00Z')
  it('panel: มี late → expanded, ไม่มี → พับ; นับผ่านตัวเดียวกับ countOpenAndLate', () => {
    expect(panelModel([timed('2026-09-30T04:00:00Z'), timed('2026-09-30T10:00:00Z')], now)).toEqual({
      openCount: 2,
      lateCount: 1,
      expanded: true,
    })
    expect(panelModel([timed('2026-09-30T10:00:00Z')], now).expanded).toBe(false)
    expect(panelModel([], now)).toEqual({ openCount: 0, lateCount: 0, expanded: false })
  })
  it('bubble: ไม่มีรายการ = none/ไม่แสดง · today = normal · late = late', () => {
    expect(bubbleModel({ total: 0, lateCount: 0, isMobile: false, inThread: false })).toEqual({ tone: 'none', visible: false })
    expect(bubbleModel({ total: 2, lateCount: 0, isMobile: false, inThread: false })).toEqual({ tone: 'normal', visible: true })
    expect(bubbleModel({ total: 2, lateCount: 1, isMobile: false, inThread: false })).toEqual({ tone: 'late', visible: true })
  })
  it('bubble: มือถือ+ในห้อง ซ่อน; มือถือนอกห้อง/เดสก์ท็อปในห้อง แสดง', () => {
    const base = { total: 1, lateCount: 0 }
    expect(bubbleModel({ ...base, isMobile: true, inThread: true }).visible).toBe(false)
    expect(bubbleModel({ ...base, isMobile: true, inThread: false }).visible).toBe(true)
    expect(bubbleModel({ ...base, isMobile: false, inThread: true }).visible).toBe(true)
  })
  it('bubbleRows: เฉพาะ late/today · late ก่อน · ตัด 8 แต่ total นับก่อนตัด', () => {
    const rows = [
      timed('2026-09-30T10:00:00Z'), // today (ไม่เลย)
      timed('2026-09-30T04:00:00Z'), // late
      timed('2026-10-05T03:00:00Z'), // week ต้องไม่เข้า
      timed('2026-09-01T03:00:00Z', 'DONE'), // done ต้องไม่เข้า
    ]
    const r = bubbleRows(rows, now)
    expect(r.total).toBe(2)
    expect(r.lateCount).toBe(1)
    expect(r.rows.map((x) => x.dueAt.toISOString())).toEqual(['2026-09-30T04:00:00.000Z', '2026-09-30T10:00:00.000Z'])
    const many = Array.from({ length: 12 }, (_, i) => timed(`2026-09-30T0${i % 5}:00:00Z`))
    const m = bubbleRows(many, now)
    expect(m.rows).toHaveLength(8)
    expect(m.total).toBe(12)
  })
})

describe('groupReminders / buildReminderPush [blocker AC-ACT-37/38]', () => {
  const mk = (id: string, shopId: string, over: Record<string, unknown> = {}) => ({
    id,
    shopId,
    assigneeUserId: 'u1' as string | null,
    conversationId: `c-${id}`,
    title: 'ถามลูกค้า',
    customerName: 'สมชาย',
    ...over,
  })
  it('จัดกลุ่มตาม (ร้าน, ผู้รับ); ข้ามร้าน = คนละกลุ่ม; ไม่มีผู้รับ = ข้าม', () => {
    const g = groupReminders([mk('1', 's1'), mk('2', 's1'), mk('3', 's2'), mk('4', 's1', { assigneeUserId: null })])
    expect(g.map((x) => [x.shopId, x.items.length])).toEqual([['s1', 2], ['s2', 1]])
  })
  it('1 รายการ: หัวข้อ+ชื่อลูกค้า+url ห้อง; ไม่มี note/เบอร์ ต่อให้ input มี note', () => {
    const it1 = mk('1', 's1', { note: 'โทร 0812345678', title: 'ก'.repeat(100) })
    const p = buildReminderPush([it1])
    expect(p.data).toEqual({ type: 'follow-up', url: '/inbox/c-1', shopId: 's1', conversationId: 'c-1', followUpId: '1' })
    expect(p.subtitle).toBe('สมชาย')
    expect(Array.from(p.body)).toHaveLength(60)
    expect(JSON.stringify(p)).not.toMatch(/0812345678|note|โทร/)
  })
  it('>1 รายการ: สรุปจำนวน + url หน้ารวมกรองของฉัน + ไม่รั่วหัวข้อ', () => {
    const p = buildReminderPush([mk('1', 's1', { title: 'ลับ 0899999999' }), mk('2', 's1')])
    expect(p.body).toBe('มี 2 รายการถึงกำหนด')
    expect(p.data).toEqual({ type: 'follow-up', url: '/follow-ups?mine=1&shopId=s1', shopId: 's1' })
    expect(JSON.stringify(p)).not.toContain('0899999999')
  })
  it('หัวข้อสั้น ≤60 ไม่ถูกตัด', () => {
    expect(buildReminderPush([mk('1', 's1', { title: 'สั้น' })]).body).toBe('สั้น')
  })
})
