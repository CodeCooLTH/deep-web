/**
 * cycle.ts — รอบรายเดือนตามวันตัดรอบ (FR-LGS-11 · SRS TFR-10) · pure
 * cutoffDay: 1..31 หรือ null = สิ้นเดือน · วันที่ไม่มีในเดือนใช้วันสุดท้ายของเดือน
 */
import { shiftIsoDate, todayThaiIsoDate } from '@/lib/date-range'
import { fireAt, SLOT_WINDOW_MIN } from './schedule'

const pad = (n: number) => String(n).padStart(2, '0')
const daysInMonth = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)).getUTCDate()
const iso = (y: number, m1: number, d: number) => `${y}-${pad(m1)}-${pad(d)}`
const prevMonth = (y: number, m1: number): [number, number] => (m1 === 1 ? [y - 1, 12] : [y, m1 - 1])
const nextMonth = (y: number, m1: number): [number, number] => (m1 === 12 ? [y + 1, 1] : [y, m1 + 1])

/** วันตัดรอบจริงของเดือน (month 1..12) = min(cutoffDay ?? 31, วันในเดือน) */
export function effectiveCutoff(year: number, month1: number, cutoffDay: number | null): number {
  return Math.min(cutoffDay ?? 31, daysInMonth(year, month1))
}

export function cycleContaining(dateIso: string, cutoffDay: number | null): { startIso: string; endIso: string } {
  const [y, m, d] = dateIso.split('-').map(Number)
  const eff = effectiveCutoff(y, m, cutoffDay)
  if (d <= eff) {
    const [py, pm] = prevMonth(y, m)
    return { startIso: shiftIsoDate(iso(py, pm, effectiveCutoff(py, pm, cutoffDay)), 1), endIso: iso(y, m, eff) }
  }
  const [ny, nm] = nextMonth(y, m)
  return { startIso: shiftIsoDate(iso(y, m, eff), 1), endIso: iso(ny, nm, effectiveCutoff(ny, nm, cutoffDay)) }
}

export function cycleSlotKey(endIso: string): string {
  return `M:${endIso}`
}

/** เดือนปฏิทินที่ช่วงคร่อมถึง (เรียงเก่า→ใหม่) — month0 ตามที่ getSalesSeries รับ */
export function monthsInRange(startIso: string, endIso: string): { year: number; month0: number }[] {
  const out: { year: number; month0: number }[] = []
  let [y, m] = startIso.split('-').map(Number)
  const [ey, em] = endIso.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    out.push({ year: y, month0: m - 1 })
    ;[y, m] = nextMonth(y, m)
  }
  return out
}

/**
 * รายงานรายเดือนที่ถึงกำหนด ณ `now` — ส่งวัน F เมื่อ F−1 เป็นวันตัดรอบ · สรุปรอบที่ F−1 เป็นวันสุดท้าย
 * เวลา = slot แรกสุดตามเวลาจริง (มี 24:00 = 00:00 ของ F) · due เมื่อ `0 ≤ now − fire < 60 นาที`
 * ผู้สมัคร F ∈ {เมื่อวาน, วันนี้} (offset อาจข้ามเที่ยงคืน) · ไม่ due/ไม่เปิด = null
 */
export function monthlyFire(
  g: { monthlyEnabled: boolean; cutoffDay: number | null; dailyTimes: readonly number[] },
  now: Date,
): { cycle: { startIso: string; endIso: string }; fireAtMs: number; slotKey: string } | null {
  if (!g.monthlyEnabled || g.dailyTimes.length === 0) return null
  const firstOffset = g.dailyTimes.includes(1440) ? 0 : Math.min(...g.dailyTimes)
  const t = todayThaiIsoDate(now)
  for (const f of [shiftIsoDate(t, -1), t]) {
    const last = shiftIsoDate(f, -1)
    const [y, m, d] = last.split('-').map(Number)
    if (d !== effectiveCutoff(y, m, g.cutoffDay)) continue
    const fireAtMs = fireAt(f, firstOffset)
    const ageMin = (now.getTime() - fireAtMs) / 60_000
    if (ageMin < 0 || ageMin >= SLOT_WINDOW_MIN) continue
    return { cycle: cycleContaining(last, g.cutoffDay), fireAtMs, slotKey: cycleSlotKey(last) }
  }
  return null
}

/**
 * เวลาส่งรายเดือนรอบถัดไป (ms) หลัง `now` — สูตรเวลาเดียวกับ monthlyFire (วัน F ที่ F−1 เป็นวันตัดรอบ · slot แรกสุด)
 * ไม่เปิด/ไม่มีเวลา = null · ค้นล่วงหน้า 62 วัน (ครอบทุกวันตัดรอบ แม้ ก.พ.)
 */
export function nextMonthlyFireAt(
  g: { monthlyEnabled: boolean; cutoffDay: number | null; dailyTimes: readonly number[] },
  now: Date,
): number | null {
  if (!g.monthlyEnabled || g.dailyTimes.length === 0) return null
  const firstOffset = g.dailyTimes.includes(1440) ? 0 : Math.min(...g.dailyTimes)
  const t = todayThaiIsoDate(now)
  for (let i = 0; i <= 62; i++) {
    const f = shiftIsoDate(t, i)
    const [y, m, d] = shiftIsoDate(f, -1).split('-').map(Number)
    if (d !== effectiveCutoff(y, m, g.cutoffDay)) continue
    const at = fireAt(f, firstOffset)
    if (at > now.getTime()) return at
  }
  return null
}
