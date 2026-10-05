import { describe, expect, it } from 'vitest'
import { cycleContaining, cycleSlotKey, effectiveCutoff, monthlyFire, monthsInRange, nextMonthlyFireAt } from '../cycle'

const th = (iso: string, hm: string) => new Date(`${iso}T${hm}:00+07:00`)

describe('cycleContaining — ตาราง BRD FR-LGS-11 (AC-11-2/11-3)', () => {
  it.each([
    [5, '2026-10-20', '2026-10-06', '2026-11-05'],
    [5, '2026-10-05', '2026-09-06', '2026-10-05'],
    [null, '2026-10-20', '2026-10-01', '2026-10-31'],
    [31, '2026-02-10', '2026-02-01', '2026-02-28'],
    [30, '2026-02-10', '2026-01-31', '2026-02-28'],
  ])('cutoff %s, %s → %s..%s', (cutoff, date, start, end) => {
    expect(cycleContaining(date, cutoff)).toEqual({ startIso: start, endIso: end })
  })
  it('ข้ามปี + ขอบวันตัดรอบ', () => {
    expect(cycleContaining('2026-12-20', 5)).toEqual({ startIso: '2026-12-06', endIso: '2027-01-05' })
    expect(cycleContaining('2027-01-03', 5)).toEqual({ startIso: '2026-12-06', endIso: '2027-01-05' })
    expect(cycleContaining('2026-10-06', 5).startIso).toBe('2026-10-06')
    // ตัดรอบ 29 ใน ก.พ. ปีปกติ → วันสุดท้ายของเดือน
    expect(cycleContaining('2027-02-10', 29)).toEqual({ startIso: '2027-01-30', endIso: '2027-02-28' })
  })
  it('effectiveCutoff ปีอธิกสุรทิน', () => {
    expect(effectiveCutoff(2028, 2, 31)).toBe(29)
    expect(effectiveCutoff(2027, 2, null)).toBe(28)
    expect(effectiveCutoff(2026, 4, 31)).toBe(30)
  })
})

describe('monthsInRange / cycleSlotKey', () => {
  it('คร่อมเดือน/ปี', () => {
    expect(monthsInRange('2026-10-06', '2026-10-20')).toEqual([{ year: 2026, month0: 9 }])
    expect(monthsInRange('2026-10-06', '2026-11-05')).toEqual([
      { year: 2026, month0: 9 },
      { year: 2026, month0: 10 },
    ])
    expect(monthsInRange('2026-12-06', '2027-01-05').map((m) => m.month0)).toEqual([11, 0])
    expect(cycleSlotKey('2026-11-05')).toBe('M:2026-11-05')
  })
})

describe('monthlyFire (AC-11-4)', () => {
  const g = (times: number[], cutoffDay: number | null = 5) => ({ monthlyEnabled: true, cutoffDay, dailyTimes: times })
  it('ตั้ง 09:00, 21:00 → ส่ง 09:00 ของวันถัดจากวันตัดรอบ สรุปรอบที่เพิ่งปิด', () => {
    const r = monthlyFire(g([540, 1260]), th('2026-10-06', '09:00'))
    expect(r).toEqual({
      cycle: { startIso: '2026-09-06', endIso: '2026-10-05' },
      fireAtMs: th('2026-10-06', '09:00').getTime(),
      slotKey: 'M:2026-10-05',
    })
    expect(monthlyFire(g([540, 1260]), th('2026-10-06', '08:59'))).toBeNull()
    expect(monthlyFire(g([540, 1260]), th('2026-10-06', '10:00'))).toBeNull()
    expect(monthlyFire(g([540, 1260]), th('2026-10-06', '21:00'))).toBeNull()
  })
  it('ตั้ง 24:00, 21:00 → ส่ง 00:00', () => {
    const r = monthlyFire(g([1260, 1440]), th('2026-10-06', '00:05'))
    expect(r?.fireAtMs).toBe(th('2026-10-06', '00:00').getTime())
    expect(monthlyFire(g([1260, 1440]), th('2026-10-06', '21:00'))).toBeNull()
  })
  it('slot แรก 23:30 ข้ามเที่ยงคืน (F=เมื่อวาน) ยังส่งได้', () => {
    const r = monthlyFire(g([1410]), th('2026-10-07', '00:10'))
    expect(r?.slotKey).toBe('M:2026-10-05')
  })
  it('ไม่ใช่วันถัดจากวันตัดรอบ / ปิด / ไม่มีเวลา → null', () => {
    expect(monthlyFire(g([540]), th('2026-10-07', '09:00'))).toBeNull()
    expect(monthlyFire({ ...g([540]), monthlyEnabled: false }, th('2026-10-06', '09:00'))).toBeNull()
    expect(monthlyFire(g([]), th('2026-10-06', '09:00'))).toBeNull()
  })
  it('สิ้นเดือน/วันตัดรอบที่ไม่มีในเดือน (31 ใน ก.พ. → ส่ง 1 มี.ค.)', () => {
    const r = monthlyFire(g([540], 31), th('2026-03-01', '09:00'))
    expect(r?.cycle).toEqual({ startIso: '2026-02-01', endIso: '2026-02-28' })
    expect(monthlyFire(g([540], null), th('2026-11-01', '09:00'))?.cycle.endIso).toBe('2026-10-31')
  })
})

describe('nextMonthlyFireAt', () => {
  const g = { monthlyEnabled: true, cutoffDay: 5, dailyTimes: [540, 1260] }
  it('รายเดือนอย่างเดียว ไม่เป็น null — วัน F = 6 เวลา 09:00', () => {
    expect(nextMonthlyFireAt(g, th('2026-10-01', '12:00'))).toBe(th('2026-10-06', '09:00').getTime())
  })
  it('ผ่านรอบเดือนนี้แล้ว → เดือนหน้า', () => {
    expect(nextMonthlyFireAt(g, th('2026-10-06', '10:00'))).toBe(th('2026-11-06', '09:00').getTime())
  })
  it('มี 24:00 → 00:00 ของ F · สิ้นเดือน (null) → วันที่ 1', () => {
    expect(nextMonthlyFireAt({ monthlyEnabled: true, cutoffDay: null, dailyTimes: [540, 1440] }, th('2026-10-10', '12:00'))).toBe(th('2026-11-01', '00:00').getTime())
  })
  it('ปิด/ไม่มีเวลา → null', () => {
    expect(nextMonthlyFireAt({ ...g, monthlyEnabled: false }, new Date())).toBeNull()
    expect(nextMonthlyFireAt({ ...g, dailyTimes: [] }, new Date())).toBeNull()
  })
})

describe('nextMonthlyFireAt — วันตัดรอบ 29/30/31 ในเดือนสั้น', () => {
  const at = (cutoffDay: number, nowIso: string) =>
    nextMonthlyFireAt({ monthlyEnabled: true, cutoffDay, dailyTimes: [540] }, th(nowIso, '12:00'))
  it.each([
    // [cutoff, now, วัน F ที่ควรยิง] — ก.พ. ปีปกติ (28 วัน): ทุกค่า ≥28 ตัดที่ 28 → ยิง 1 มี.ค.
    [29, '2027-02-10', '2027-03-01'],
    [30, '2027-02-10', '2027-03-01'],
    [31, '2027-02-10', '2027-03-01'],
    // ก.พ. อธิกสุรทิน (29 วัน): 29/30/31 ตัดที่ 29 → ยิง 1 มี.ค.
    [29, '2028-02-10', '2028-03-01'],
    [31, '2028-02-10', '2028-03-01'],
    // เดือน 30 วัน (เม.ย.): 29 → ยิง 30 เม.ย. · 30/31 → ยิง 1 พ.ค.
    [29, '2027-04-10', '2027-04-30'],
    [30, '2027-04-10', '2027-05-01'],
    [31, '2027-04-10', '2027-05-01'],
  ])('cutoff %s จาก %s → ยิง %s 09:00', (cutoff, now, fire) => {
    expect(at(cutoff, now)).toBe(th(fire, '09:00').getTime())
  })
})
