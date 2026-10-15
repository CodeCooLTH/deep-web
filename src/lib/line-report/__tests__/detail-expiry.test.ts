import { describe, expect, it } from 'vitest'
import { detailExpiresAt } from '../detail-expiry'

// เวลาไทย = UTC+7 → 00:00 ไทยของวัน D คือ (D-1)T17:00Z
describe('detailExpiresAt', () => {
  it('00:00:00 ไทย → หมด 00:00 ไทยอีก 2 วัน', () => {
    expect(detailExpiresAt(new Date('2026-10-14T17:00:00Z')).toISOString()).toBe('2026-10-16T17:00:00.000Z')
  })
  it('23:59:59 ไทย วันเดียวกัน → ผลเดียวกัน', () => {
    expect(detailExpiresAt(new Date('2026-10-15T16:59:59Z')).toISOString()).toBe('2026-10-16T17:00:00.000Z')
  })
  it('00:00:01 ไทยวันถัดไป → เลื่อนไป 1 วัน', () => {
    expect(detailExpiresAt(new Date('2026-10-15T17:00:01Z')).toISOString()).toBe('2026-10-17T17:00:00.000Z')
  })
  it('สิ้นเดือน/สิ้นปี', () => {
    expect(detailExpiresAt(new Date('2026-01-30T05:00:00Z')).toISOString()).toBe('2026-01-31T17:00:00.000Z') // 30 ม.ค. → 1 ก.พ. 00:00
    expect(detailExpiresAt(new Date('2026-12-31T05:00:00Z')).toISOString()).toBe('2027-01-01T17:00:00.000Z') // 31 ธ.ค. → 2 ม.ค. 00:00
  })
})
