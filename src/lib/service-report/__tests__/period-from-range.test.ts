import { describe, expect, it } from 'vitest'
import { serviceReportPeriodFromRange } from '../period-from-range'

describe('serviceReportPeriodFromRange', () => {
  it('ทั้งปี → รายเดือน', () => {
    expect(serviceReportPeriodFromRange({ start: '2026-01-01', end: '2026-12-31' })).toEqual({ mode: 'monthly', year: 2026 })
  })
  it('ทั้งเดือน/เดือนนี้ถึงวันนี้ → รายวันของเดือนนั้น', () => {
    expect(serviceReportPeriodFromRange({ start: '2026-09-01', end: '2026-09-30' })).toEqual({ mode: 'daily', year: 2026, month: 9 })
    expect(serviceReportPeriodFromRange({ start: '2026-10-01', end: '2026-10-25' })).toEqual({ mode: 'daily', year: 2026, month: 10 })
  })
  it('ช่วงคร่อมเดือน → เดือนของวันสุดท้าย', () => {
    expect(serviceReportPeriodFromRange({ start: '2026-09-26', end: '2026-10-25' })).toEqual({ mode: 'daily', year: 2026, month: 10 })
  })
})
