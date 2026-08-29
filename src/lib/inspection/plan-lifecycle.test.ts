/**
 * [blocker] Unit tests — วงจรชีวิตแผน + คีย์รอบโควตา (feature 00060 · T4)
 *
 * ไฟล์นี้มีข้อที่ผิดแล้วเป็น "เรื่องเงิน" ไม่ใช่เรื่องแสดงผล — การหักเงินร้านที่กดยกเลิก
 * ไปแล้วคือการเก็บเงินโดยไม่มีสิทธิ์ และร้านจะรู้ตัวก็ต่อเมื่อเปิดดูกระเป๋าเครดิตเอง
 */
import { describe, it, expect } from 'vitest'
import {
  decidePlanRenewal, intakePeriodKey, nextIntakePeriodKey, intakeAvailability,
  addDays, INSPECTION_RENEWAL_PERIOD_DAYS, INSPECTION_GRACE_DAYS,
} from './plan-lifecycle'

const T = (iso: string) => new Date(iso)
const NOW = T('2026-06-15T03:00:00.000Z')

function plan(over: Partial<Parameters<typeof decidePlanRenewal>[0]> = {}) {
  return decidePlanRenewal({
    status: 'ACTIVE',
    nextRenewalAt: T('2026-06-15T00:00:00.000Z'), // ถึงรอบแล้ว
    canceledAt: null,
    graceUntil: null,
    hasEnoughCredit: true,
    now: NOW,
    ...over,
  })
}

describe('[blocker] decidePlanRenewal', () => {
  it('ยังไม่ถึงรอบ = ไม่ทำอะไร', () => {
    expect(plan({ nextRenewalAt: T('2026-07-01T00:00:00.000Z') }).kind).toBe('NOOP')
  })

  it('ถึงรอบ + เครดิตพอ = ต่ออายุ 30 วัน', () => {
    const d = plan()
    expect(d.kind).toBe('RENEW')
    if (d.kind !== 'RENEW') throw new Error('unreachable')
    expect(d.nextRenewalAt).toEqual(addDays(NOW, INSPECTION_RENEWAL_PERIOD_DAYS))
  })

  it('🛑 mutation: สลับลำดับ เช็คเครดิตก่อนเช็คยกเลิก → เคสนี้ต้องแดง (หักเงินร้านที่ยกเลิกแล้ว)', () => {
    // เครดิตพอ แต่ร้านกดยกเลิกไปแล้ว — ต้องพ้นสถานะ ไม่ใช่ต่ออายุแล้วหักเงิน
    const d = plan({ canceledAt: T('2026-06-02T00:00:00.000Z'), hasEnoughCredit: true })
    expect(d.kind).toBe('LAPSE')
    if (d.kind !== 'LAPSE') throw new Error('unreachable')
    expect(d.reason).toBe('OWNER_CANCELLED')
  })

  it('🛑 ยกเลิกแล้วแต่ยังไม่สิ้นรอบบิล = ยังไม่ทำอะไร ป้ายยังอยู่ (AC-INS-26-3)', () => {
    const d = plan({ canceledAt: NOW, nextRenewalAt: T('2026-06-30T00:00:00.000Z') })
    expect(d.kind).toBe('NOOP')
  })

  it('🛑 mutation: เครดิตไม่พอแล้วตัดป้ายทันที → เคสนี้ต้องแดง (ต้องผ่อนผันก่อน)', () => {
    const d = plan({ hasEnoughCredit: false })
    expect(d.kind).toBe('START_GRACE')
    if (d.kind !== 'START_GRACE') throw new Error('unreachable')
    expect(d.graceUntil).toEqual(addDays(NOW, INSPECTION_GRACE_DAYS))
  })

  it('อยู่ในช่วงผ่อนผัน: เครดิตยังไม่พอและยังไม่ถึงเส้นตาย = รอต่อ', () => {
    expect(plan({ hasEnoughCredit: false, graceUntil: addDays(NOW, 3) }).kind).toBe('NOOP')
  })

  it('อยู่ในช่วงผ่อนผัน: เติมเงินแล้ว = ต่ออายุทันที ไม่ต้องรอรอบถัดไป', () => {
    const d = plan({ hasEnoughCredit: true, graceUntil: addDays(NOW, 3) })
    expect(d.kind).toBe('RENEW')
  })

  it('🛑 mutation: เปลี่ยน < เป็น <= ที่เส้นตายผ่อนผัน → เคสค่าขอบต้องแดง', () => {
    expect(plan({ hasEnoughCredit: false, graceUntil: addDays(NOW, -1) }).kind).toBe('LAPSE')
    expect(plan({ hasEnoughCredit: false, graceUntil: NOW }).kind).toBe('NOOP') // เท่ากันพอดี = ยังไม่พ้น
  })

  it('แผนที่ LAPSED ไปแล้วไม่ถูกแตะซ้ำ', () => {
    expect(plan({ status: 'LAPSED', hasEnoughCredit: false }).kind).toBe('NOOP')
  })
})

describe('[blocker] intakePeriodKey — ตัดเดือนด้วยเวลาไทย', () => {
  it('🛑 mutation: ตัดเดือนด้วย UTC → เคสนี้ต้องแดง', () => {
    // 2026-08-31 18:00 UTC = 2026-09-01 01:00 น. เวลาไทย ⇒ ต้องเป็นโควตาเดือน 09 ไม่ใช่ 08
    expect(intakePeriodKey(T('2026-08-31T18:00:00.000Z'))).toBe('2026-09')
    // 2026-09-01 00:30 UTC = 2026-09-01 07:30 น. ไทย ⇒ ยังเป็นเดือน 09 เหมือนกัน
    expect(intakePeriodKey(T('2026-09-01T00:30:00.000Z'))).toBe('2026-09')
  })

  it('เดือนถัดไปข้ามปีได้ถูก', () => {
    expect(nextIntakePeriodKey(T('2026-06-15T00:00:00.000Z'))).toBe('2026-07')
    expect(nextIntakePeriodKey(T('2026-12-15T00:00:00.000Z'))).toBe('2027-01')
    // 31 ธ.ค. 18:00 UTC = 1 ม.ค. 01:00 น. ไทย ⇒ เดือนปัจจุบันคือ 2027-01 แล้ว ถัดไปจึงเป็น 2027-02
    expect(nextIntakePeriodKey(T('2026-12-31T18:00:00.000Z'))).toBe('2027-02')
  })
})

describe('[blocker] intakeAvailability — "เต็ม" กับ "ยังไม่เปิดรับ" ต้องแยกกัน', () => {
  it('🛑 mutation: ไม่มีแถวโควตา = FULL → เคสนี้ต้องแดง (โกหกด้วยความจริง)', () => {
    // วันที่ทีมลืมตั้งโควตา ทุกขั้นจะขึ้นว่า "เต็มแล้ว" ทั้งที่ยังไม่มีใครสมัครสักคน
    // และจะไม่มีใครเอะใจไปสืบต่อ
    expect(intakeAvailability(null)).toBe('NOT_OPEN')
  })
  it('ยังไม่เต็ม = OPEN · เต็มพอดี = FULL', () => {
    expect(intakeAvailability({ capacity: 10, usedCount: 9 })).toBe('OPEN')
    expect(intakeAvailability({ capacity: 10, usedCount: 10 })).toBe('FULL')
    expect(intakeAvailability({ capacity: 0, usedCount: 0 })).toBe('FULL') // ตั้งโควตาเป็น 0 = ปิดรับโดยตั้งใจ
  })
})
