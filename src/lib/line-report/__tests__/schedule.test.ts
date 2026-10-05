import { describe, expect, it } from 'vitest'
import { monthlyFire } from '../cycle'
import { dailySlotKey, dueSlots, fireAt, fireOrder, nextSendAt, parseSlot, resolveDailyWindow, SLOT_OPTIONS, slotLabel } from '../schedule'

// เวลาไทย → instant (UTC+7 คงที่)
const th = (iso: string, hm: string) => new Date(`${iso}T${hm}:00+07:00`)
const g = (times: number[], boundAt: Date | null = new Date('2026-09-01T00:00:00+07:00')) => ({ dailyEnabled: true, dailyTimes: times, boundAt })

describe('SLOT_OPTIONS (AC-10-1)', () => {
  it('48 ค่า 00:30..23:30 + 24:00 ไม่มี 00:00', () => {
    expect(SLOT_OPTIONS).toHaveLength(48)
    const labels = SLOT_OPTIONS.map((o) => o.label)
    expect(labels[0]).toBe('00:30')
    expect(labels[46]).toBe('23:30')
    expect(labels[47]).toBe('24:00')
    expect(labels).not.toContain('00:00')
    expect(new Set(labels).size).toBe(48)
    expect(slotLabel(1440)).toBe('24:00')
    expect(parseSlot('24:00')).toBe(1440)
    expect(parseSlot('18:30')).toBe(1110)
    expect(parseSlot('00:00')).toBeNull()
    expect(parseSlot('18:15')).toBeNull()
  })
})

describe('dueSlots (AC-19-3)', () => {
  const D = '2026-10-05'
  it('18:00 → tick 18:00 ส่ง · 18:30 ส่ง (หน้าต่าง retry) · 19:00 ไม่ส่ง และเป็น missed', () => {
    expect(dueSlots(g([1080]), th(D, '18:00')).send.map((s) => s.slotKey)).toEqual([`D:${D}@18:00`])
    expect(dueSlots(g([1080]), th(D, '18:30')).send).toHaveLength(1)
    const at1900 = dueSlots(g([1080]), th(D, '19:00'))
    expect(at1900.send).toHaveLength(0)
    expect(at1900.missed.map((s) => s.slotKey)).toEqual([`D:${D}@18:00`])
    expect(dueSlots(g([1080]), th(D, '17:59')).send).toHaveLength(0)
  })
  it('missed หมดอายุหลัง 180 นาที และไม่ย้อนไปก่อน boundAt', () => {
    expect(dueSlots(g([1080]), th(D, '21:00')).missed).toHaveLength(0)
    expect(dueSlots(g([1080], th(D, '18:30')), th(D, '19:30')).missed).toHaveLength(0)
    expect(dueSlots(g([1080], null), th(D, '19:30')).missed).toHaveLength(0)
    // ขอบเท่ากันพอดี (fireAt === boundAt) ต้องนับเป็น missed — กัน mutation >= → >
    expect(dueSlots(g([1080], th(D, '18:00')), th(D, '19:30')).missed).toHaveLength(1)
  })
  it('ปิดรายวัน = ไม่มีอะไร', () => {
    expect(dueSlots({ ...g([1080]), dailyEnabled: false }, th(D, '18:00'))).toEqual({ send: [], missed: [] })
  })
  it('24:00 ของเมื่อวานยิง 00:00 วันนี้ + fireOrder ก่อนรอบอื่น', () => {
    const r = dueSlots(g([30, 1440]), th(D, '00:35'))
    expect(r.send.map((s) => s.slotKey)).toEqual([`D:2026-10-04@24:00`, `D:${D}@00:30`])
    expect(r.send[0].fireAtMs).toBe(th(D, '00:00').getTime())
    const [a, b] = r.send
    expect(fireOrder(b, a)).toBeGreaterThan(0)
  })
  it('fireAt: 1440 ของวัน D = 00:00 ของ D+1', () => {
    expect(fireAt('2026-10-04', 1440)).toBe(th('2026-10-05', '00:00').getTime())
  })
})

describe('resolveDailyWindow (AC-10-4)', () => {
  it('18:00 รัน 18:02 → วัน D สะสมถึงเวลาคำนวณ', () => {
    const now = th('2026-10-05', '18:02')
    const w = resolveDailyWindow(1080, '2026-10-05', now)
    expect(w).toEqual({ startIso: '2026-10-05', endIso: '2026-10-05', computedAt: now.toISOString() })
  })
  it('24:00 รัน 00:03 ของ D+1 → ทั้งวัน D', () => {
    const now = th('2026-10-06', '00:03')
    const w = resolveDailyWindow(1440, '2026-10-05', now)
    expect(w).toMatchObject({ startIso: '2026-10-05', endIso: '2026-10-05', fullDay: true })
  })
  it('dailySlotKey / nextSendAt', () => {
    expect(dailySlotKey('2026-10-05', 1440)).toBe('D:2026-10-05@24:00')
    const now = th('2026-10-05', '10:00')
    expect(nextSendAt(g([540, 1080]), now)).toBe(th('2026-10-05', '18:00').getTime())
    expect(nextSendAt(g([540]), now)).toBe(th('2026-10-06', '09:00').getTime())
    expect(nextSendAt(g([1440]), now)).toBe(th('2026-10-06', '00:00').getTime())
    expect(nextSendAt({ dailyEnabled: false, dailyTimes: [540] }, now)).toBeNull()
  })
})

// AC-10-3: ผลต้องไม่ขึ้นกับ TZ ของโปรเซส — Node อ่าน process.env.TZ ใหม่ทุกครั้งที่ตั้งค่า
describe('ไม่ขึ้นกับ timezone เซิร์ฟเวอร์ (AC-10-3)', () => {
  const underTz = <T,>(tz: string, fn: () => T): T => {
    const prev = process.env.TZ
    process.env.TZ = tz
    try {
      return fn()
    } finally {
      if (prev === undefined) delete process.env.TZ
      else process.env.TZ = prev
    }
  }
  it('TZ=UTC กับ America/Los_Angeles ได้ผลเดียวกัน (dueSlots + nextSendAt + monthlyFire)', () => {
    const calc = () => {
      const now = th('2026-10-06', '00:35')
      return JSON.stringify([
        dueSlots(g([30, 1080, 1440]), now),
        nextSendAt(g([30, 1080]), now),
        monthlyFire({ monthlyEnabled: true, cutoffDay: 5, dailyTimes: [30] }, now),
      ])
    }
    const utc = underTz('UTC', calc)
    expect(underTz('America/Los_Angeles', calc)).toBe(utc)
    expect(utc).toContain('D:2026-10-05@24:00')
    expect(utc).toContain('M:2026-10-05')
  })
})
