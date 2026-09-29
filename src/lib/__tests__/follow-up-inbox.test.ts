import { describe, expect, it } from 'vitest'
import { parseFollowUpQuery, rowBadge } from '../follow-up-inbox'

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
