import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/dictionaries/th'
import {
  buildPayload,
  cardBadges,
  defaultFormValues,
  doneButtonIsSolid,
  formatCount,
  formatDueLabel,
  needsNoteToggle,
  relativeDay,
  saveErrorKey,
  typeIcon,
  validateForm,
  validateSnoozeCustom,
  valuesFromItem,
} from '@/lib/follow-up-view'

const t = th.followUps
// 2026-09-29 12:00 น. ไทย (05:00Z)
const NOW = new Date('2026-09-29T05:00:00.000Z')
const fmtDay = () => 'D'

describe('formatCount', () => {
  it('[blocker] ≥100 = 99+ (LIST_MAX=200 ต้องไม่โผล่เป็น 200)', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(99)).toBe('99')
    expect(formatCount(100)).toBe('99+')
    expect(formatCount(200)).toBe('99+')
  })
})

describe('needsNoteToggle', () => {
  it('นับตัวอักษร (code point) ไม่ใช่ความยาว UTF-16 — 80 พอดียังไม่มีปุ่ม, 81 มี', () => {
    expect(needsNoteToggle('ก'.repeat(80))).toBe(false)
    expect(needsNoteToggle('ก'.repeat(81))).toBe(true)
    // emoji 1 ตัว = length 2 แต่เป็น 1 ตัวอักษร: 80 ตัว (length 160) ต้องยังไม่มีปุ่ม
    expect(needsNoteToggle('\u{1F600}'.repeat(80))).toBe(false)
    expect(needsNoteToggle(null)).toBe(false)
  })
})

describe('cardBadges / doneButtonIsSolid', () => {
  const base = { status: 'OPEN', overdue: false, bucket: 'week', snoozeCount: 0 }
  it('[blocker] เลยกำหนดชนะครบวันนี้ และป้ายเกิดเฉพาะรายการที่ยังเปิด', () => {
    expect(cardBadges({ ...base, overdue: true, bucket: 'late' })).toEqual({ overdue: true, dueToday: false, snoozed: null })
    // input ที่ทำให้ mutation "ไม่กัน overdue" โผล่ (bucket ของ server ไม่ควรเป็น today ตอน overdue แต่ป้ายต้องไม่ซ้อนสองใบ)
    expect(cardBadges({ ...base, overdue: true, bucket: 'today' })).toEqual({ overdue: true, dueToday: false, snoozed: null })
    expect(cardBadges({ ...base, bucket: 'today' })).toEqual({ overdue: false, dueToday: true, snoozed: null })
    expect(cardBadges({ ...base, status: 'DONE', overdue: true, bucket: 'done', snoozeCount: 5 })).toEqual({
      overdue: false,
      dueToday: false,
      snoozed: null,
    })
  })
  it('เลื่อนมาป้ายขึ้นเมื่อ ≥2 ครั้ง (1 ครั้งยังปกติ)', () => {
    expect(cardBadges({ ...base, snoozeCount: 1 }).snoozed).toBeNull()
    expect(cardBadges({ ...base, snoozeCount: 2 }).snoozed).toBe(2)
  })
  it('[blocker] ปุ่มทำแล้วทึบเฉพาะเลยกำหนดที่ยังเปิด (One Voice)', () => {
    expect(doneButtonIsSolid({ status: 'OPEN', overdue: true })).toBe(true)
    expect(doneButtonIsSolid({ status: 'OPEN', overdue: false })).toBe(false)
    expect(doneButtonIsSolid({ status: 'DONE', overdue: true })).toBe(false)
  })
})

describe('relativeDay / formatDueLabel', () => {
  it('ใช้วันตามปฏิทินไทย: 00:30 ไทยของพรุ่งนี้ (17:30Z วันนี้) ต้องเป็น "พรุ่งนี้" ไม่ใช่ "วันนี้"', () => {
    expect(relativeDay('2026-09-29T17:30:00.000Z', NOW)).toBe('tomorrow')
    expect(relativeDay('2026-09-29T16:59:00.000Z', NOW)).toBe('today') // 23:59 ไทย
    expect(relativeDay('2026-09-28T17:00:00.000Z', NOW)).toBe('today') // 00:00 ไทยวันนี้
    expect(relativeDay('2026-09-28T16:59:00.000Z', NOW)).toBe('yesterday')
    expect(relativeDay('2026-10-01T05:00:00.000Z', NOW)).toBeNull()
  })
  it('[blocker] งานทั้งวันไม่แสดงเวลาที่ใดเลย (BR-ACT-03)', () => {
    const allDay = (iso: string) => formatDueLabel(t, { dueAt: iso, allDay: true }, NOW, fmtDay)
    expect(allDay('2026-09-28T17:00:00.000Z')).toBe('วันนี้ · ทั้งวัน')
    expect(allDay('2026-09-29T17:00:00.000Z')).toBe('พรุ่งนี้ · ทั้งวัน')
    expect(allDay('2026-09-27T17:00:00.000Z')).toBe('เมื่อวาน · ทั้งวัน')
    expect(allDay('2026-10-05T17:00:00.000Z')).toBe('D · ทั้งวัน')
    for (const iso of ['2026-09-28T17:00:00.000Z', '2026-10-05T17:00:00.000Z']) expect(allDay(iso)).not.toMatch(/\d{2}:\d{2}/)
  })
  it('มีเวลา: แสดงเวลาไทย', () => {
    expect(formatDueLabel(t, { dueAt: '2026-09-29T03:00:00.000Z', allDay: false }, NOW, fmtDay)).toBe('วันนี้ 10:00')
    expect(formatDueLabel(t, { dueAt: '2026-10-05T03:00:00.000Z', allDay: false }, NOW, fmtDay)).toBe('D 10:00')
  })
})

describe('ฟอร์ม', () => {
  it('[blocker] ค่าตั้งต้น = พรุ่งนี้ 09:00 เวลาไทย — คำนวณจากวันไทย ไม่ใช่วัน UTC', () => {
    expect(defaultFormValues(NOW)).toMatchObject({ date: '2026-09-30', time: '09:00', allDay: false, type: 'FOLLOW_UP', assigneeUserId: '' })
    // 02:00 ไทยวันที่ 30 = 19:00Z วันที่ 29 → พรุ่งนี้ต้องเป็น 10-01
    expect(defaultFormValues(new Date('2026-09-29T19:00:00.000Z')).date).toBe('2026-10-01')
  })
  it('validateForm: หัวข้อ/โน้ต/วัน/เวลา', () => {
    const ok = { ...defaultFormValues(NOW), title: 'โทรกลับ' }
    expect(validateForm(ok, false)).toEqual({})
    expect(validateForm({ ...ok, title: '   ' }, false).title).toBe('errTitleRequired')
    expect(validateForm({ ...ok, title: 'ก'.repeat(201) }, false).title).toBe('errTitleMax')
    expect(validateForm({ ...ok, title: 'ก'.repeat(200) }, false).title).toBeUndefined()
    expect(validateForm({ ...ok, note: 'ก'.repeat(1001) }, false).note).toBe('errNoteMax')
    expect(validateForm({ ...ok, date: '' }, false).date).toBe('errDateRequired')
    expect(validateForm({ ...ok, time: '' }, false).time).toBe('errTimeRequired')
    // ติ๊กทั้งวัน = ไม่ต้องมีเวลา
    expect(validateForm({ ...ok, time: '', allDay: true }, false).time).toBeUndefined()
  })
  it('[blocker] รายการที่ปิดแล้ว: ไม่ตรวจวัน/เวลา (ช่องล็อก) แต่ยังตรวจหัวข้อ', () => {
    const closedVals = { ...defaultFormValues(NOW), title: 'x', date: '', time: '' }
    expect(validateForm(closedVals, true)).toEqual({})
    expect(validateForm({ ...closedVals, title: '' }, true).title).toBe('errTitleRequired')
  })
  it('[blocker] buildPayload: ทั้งวัน=time null · ผู้รับว่าง=ไม่ส่งคีย์ (ห้าม null) · ปิดแล้วส่งเฉพาะ title/note', () => {
    const v = { ...defaultFormValues(NOW), title: '  หัวข้อ  ', note: '' }
    expect(buildPayload({ ...v, allDay: true }, 'create', false)).toEqual({
      title: 'หัวข้อ',
      type: 'FOLLOW_UP',
      date: '2026-09-30',
      time: null,
      note: null,
    })
    const withAssignee = buildPayload({ ...v, assigneeUserId: 'u1' }, 'create', false)
    expect(withAssignee).toHaveProperty('assigneeUserId', 'u1')
    expect(buildPayload(v, 'create', false)).not.toHaveProperty('assigneeUserId')
    expect(buildPayload({ ...v, note: 'n' }, 'edit', true)).toEqual({ title: 'หัวข้อ', note: 'n' })
  })
  it('valuesFromItem: dueAt → วัน/เวลาไทย (ไม่ใช้ TZ เครื่อง) · ทั้งวันเวลาตั้งต้น 09:00', () => {
    const base = { title: 't', type: 'OTHER' as const, note: null, assignee: null }
    expect(valuesFromItem({ ...base, dueAt: '2026-09-29T17:30:00.000Z', allDay: false })).toMatchObject({ date: '2026-09-30', time: '00:30', assigneeUserId: '', note: '' })
    expect(valuesFromItem({ ...base, dueAt: '2026-09-29T17:00:00.000Z', allDay: true })).toMatchObject({ date: '2026-09-30', time: '09:00', allDay: true })
  })
  it('saveErrorKey แมปรหัส API → ข้อความที่บอกทางออก', () => {
    expect(saveErrorKey('INVALID_DUE')).toBe('errDateRequired')
    expect(saveErrorKey('ASSIGNEE_NOT_MEMBER')).toBe('errAssignee')
    expect(saveErrorKey('NOT_FOUND')).toBe('errNotFound')
    expect(saveErrorKey(undefined)).toBe('errSaveFailed')
    expect(saveErrorKey('อะไรก็ไม่รู้')).toBe('errSaveFailed')
  })
  it('validateSnoozeCustom ใช้กฎเดียวกับฟอร์ม', () => {
    expect(validateSnoozeCustom('', '09:00', false)).toBe('errDateRequired')
    expect(validateSnoozeCustom('2026-10-01', '', false)).toBe('errTimeRequired')
    expect(validateSnoozeCustom('2026-10-01', '', true)).toBeNull()
    expect(validateSnoozeCustom('2026-10-01', '09:00', false)).toBeNull()
  })
})

describe('typeIcon (มติ user 2026-09-29)', () => {
  it('ตามเรื่อง=message-circle · นัดคุย=phone-call · อื่น ๆ=list-check', () => {
    expect(typeIcon('FOLLOW_UP')).toBe('message-circle')
    expect(typeIcon('MEET_CUSTOMER')).toBe('phone-call')
    expect(typeIcon('OTHER')).toBe('list-check')
  })
})
