import { describe, expect, it } from 'vitest'
import { lateDays, parseFollowUpQuery, rowBadge } from '../follow-up-inbox'

describe('parseFollowUpQuery [blocker]', () => {
  it('ค่าที่รู้จัก → รายการ (ตัดซ้ำ/ช่องว่าง)', () => {
    expect(parseFollowUpQuery('late, upcoming,late')).toEqual(['late', 'upcoming'])
  })
  it('ค่าแปลกล้วน/ว่าง/ไม่มี = ไม่กรอง (undefined)', () => {
    expect(parseFollowUpQuery('foo,,bar')).toBeUndefined()
    expect(parseFollowUpQuery('')).toBeUndefined()
    expect(parseFollowUpQuery(null)).toBeUndefined()
  })
  it('ค่าแปลกปนค่าจริง → ทิ้งเฉพาะค่าแปลก', () => {
    expect(parseFollowUpQuery('done,zzz')).toEqual(['done'])
  })
})

describe('rowBadge [blocker]', () => {
  it('เลยกำหนดชนะค้างอยู่', () => {
    expect(rowBadge({ open: 3, late: 2 })).toBe('late')
  })
  it('ค้างแต่ไม่เลย = open · ไม่มีเปิด/ไม่มีข้อมูล = null', () => {
    expect(rowBadge({ open: 3, late: 0 })).toBe('open')
    expect(rowBadge({ open: 0, late: 0 })).toBeNull()
    expect(rowBadge(undefined)).toBeNull()
  })
})

describe('lateDays', () => {
  // 2026-10-05 10:00 เวลาไทย
  const now = new Date('2026-10-05T03:00:00.000Z')
  it('ยังไม่เลย = null', () => {
    expect(lateDays({ dueAt: '2026-10-05T07:00:00.000Z', late: false }, now)).toBeNull()
  })
  it('เลยเวลาแต่ยังวันนี้ = 0 · นับวันตามปฏิทินไทย (23:30 เมื่อวาน = 1 วัน ไม่ใช่ 0)', () => {
    expect(lateDays({ dueAt: '2026-10-05T01:00:00.000Z', late: true }, now)).toBe(0)
    expect(lateDays({ dueAt: '2026-10-04T16:30:00.000Z', late: true }, now)).toBe(1)
  })
  it('ทั้งวันของ 5 วันก่อน = 5', () => {
    // dueAt ของรายการทั้งวัน = เที่ยงคืนไทยของวันนั้น
    expect(lateDays({ dueAt: '2026-09-29T17:00:00.000Z', late: true }, now)).toBe(5)
  })
})
