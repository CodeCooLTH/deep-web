/**
 * schedule.ts — ตารางเวลาส่งรายวัน (FR-LGS-10 · SRS TFR-09) · pure
 *
 * เวลาทุกค่าเป็น Asia/Bangkok ผ่าน `thaiMidnightUtc`/`todayThaiIsoDate` ของ date-range.ts เท่านั้น
 * (ห้ามคำนวณ offset เอง · ไม่อ่าน timezone ของโปรเซส)
 */
import { shiftIsoDate, thaiMidnightUtc, todayThaiIsoDate } from '@/lib/date-range'
import type { DueSlot, Window } from './types'

export const SLOT_WINDOW_MIN = 60
export const RETRY_WINDOW_MIN = 90
export const MISSED_LOOKBACK_MIN = 180
const MIN_MS = 60_000

/** นาที → "HH:MM" · 1440 → "24:00" (ไม่มี "00:00") */
export function slotLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** SSOT ตัวเลือกเวลา 48 ค่า: 00:30 … 23:30, 24:00 */
export const SLOT_OPTIONS: readonly { minutes: number; label: string }[] = Array.from({ length: 48 }, (_, i) => {
  const minutes = (i + 1) * 30
  return { minutes, label: slotLabel(minutes) }
})

/** "HH:MM" → นาที · ค่านอกชุด (รวม "00:00") → null */
export function parseSlot(label: string): number | null {
  return SLOT_OPTIONS.find((o) => o.label === label)?.minutes ?? null
}

/** instant ที่ slot ของวัน D ยิง — 1440 ของวัน D = 00:00 ของ D+1 */
export function fireAt(dateIso: string, minutes: number): number {
  const [y, m, d] = dateIso.split('-').map(Number)
  return thaiMidnightUtc(y, m - 1, d).getTime() + minutes * MIN_MS
}

export function dailySlotKey(dateIso: string, minutes: number): string {
  return `D:${dateIso}@${slotLabel(minutes)}`
}

/** เรียงตามเวลายิงจริง — 24:00 ของเมื่อวาน (= 00:00 วันนี้) มาก่อนรอบอื่นของวันนี้เสมอ (AC-10-5) */
export function fireOrder(a: DueSlot, b: DueSlot): number {
  return a.fireAtMs - b.fireAtMs || a.minutes - b.minutes
}

/**
 * slot ที่ถึงกำหนด/พลาด ณ `now`
 * - send: `0 ≤ now − fireAt < 60 นาที` (ไม่ดู boundAt — known limitation ข้อ 9 ของ SDS §12)
 * - missed: `60 ≤ now − fireAt < 180 นาที` ∧ `fireAt ≥ boundAt` → บันทึก MISSED ไม่ส่งย้อนหลัง
 * วันตั้งต้น D ∈ {เมื่อวาน, วันนี้} (24:00 ของเมื่อวานยิงวันนี้ 00:00)
 */
export function dueSlots(
  g: { dailyEnabled: boolean; dailyTimes: readonly number[]; boundAt: Date | null },
  now: Date,
): { send: DueSlot[]; missed: DueSlot[] } {
  const send: DueSlot[] = []
  const missed: DueSlot[] = []
  if (!g.dailyEnabled) return { send, missed }
  const today = todayThaiIsoDate(now)
  const boundMs = g.boundAt?.getTime() ?? null
  for (const dateIso of [shiftIsoDate(today, -1), today]) {
    for (const minutes of g.dailyTimes) {
      const fireAtMs = fireAt(dateIso, minutes)
      const ageMin = (now.getTime() - fireAtMs) / MIN_MS
      const slot: DueSlot = { slotKey: dailySlotKey(dateIso, minutes), dateIso, minutes, fireAtMs }
      if (ageMin >= 0 && ageMin < SLOT_WINDOW_MIN) send.push(slot)
      else if (ageMin >= SLOT_WINDOW_MIN && ageMin < MISSED_LOOKBACK_MIN && boundMs !== null && fireAtMs >= boundMs)
        missed.push(slot)
    }
  }
  return { send: send.sort(fireOrder), missed: missed.sort(fireOrder) }
}

/**
 * ช่วงตัวเลขของ slot รายวัน — `dateIso` = วันที่ของ slot (D)
 * - HH:MM (ไม่ใช่ 24:00) → [D, D] สะสม 00:00 ถึงเวลาคำนวณ
 * - 24:00 → [D, D] ครบทั้งวัน (ส่งตอน 00:00 ของ D+1) ป้าย "สรุปวันที่ D (ครบทั้งวัน)"
 */
export function resolveDailyWindow(minutes: number, dateIso: string, now: Date): Window {
  return { startIso: dateIso, endIso: dateIso, computedAt: now.toISOString(), ...(minutes === 1440 ? { fullDay: true } : {}) }
}

/** เวลาส่งรอบถัดไป (ms) ของรายวัน สำหรับหน้ารายการ · ไม่มี/ปิด = null */
export function nextSendAt(g: { dailyEnabled: boolean; dailyTimes: readonly number[] }, now: Date): number | null {
  if (!g.dailyEnabled || g.dailyTimes.length === 0) return null
  const today = todayThaiIsoDate(now)
  let best: number | null = null
  for (const dateIso of [today, shiftIsoDate(today, 1)]) {
    for (const minutes of g.dailyTimes) {
      const t = fireAt(dateIso, minutes)
      if (t > now.getTime() && (best === null || t < best)) best = t
    }
  }
  return best
}
