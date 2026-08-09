import { describe, it, expect } from 'vitest'
import {
  LOG_STATUS_FILTER_OPTIONS,
  LOG_STATUS_META,
  logStatusWhere,
  parseLogStatusFilter,
} from '../comment-reply-log-status'

/**
 * feature 00038 — ตัวกรองสถานะในตารางประวัติ (impeccable critique 2026-08-09 P2)
 *
 * ความเสี่ยงจริงของโมดูลนี้มีสองอย่าง และเทสชุดนี้ผูกไว้ทั้งคู่:
 *   1. ลำดับ FAILED > SENT > SKIPPED — แถวที่ public สำเร็จแต่ private ล้ม ต้องนับเป็น "ไม่สำเร็จ"
 *      ไม่ใช่ "ส่งแล้ว" เพราะผู้ขายเปิดตารางนี้มาหาของที่ล้ม
 *   2. NULL — คอลัมน์ทั้งสองเป็น nullable และ `col <> 'X'` ใน SQL **ไม่คืนแถวที่ col เป็น NULL**
 *      แถวที่ถูกข้ามตั้งแต่ก่อนยิง Graph (NULL ทั้งคู่ = แถวส่วนใหญ่ของตาราง) จะหายไปจากตัวกรอง
 *      "ข้าม" ทั้งหมดโดยไม่มี error อะไรเลย
 */

/** ตรวจว่า where clause ยอมรับ NULL จริง — เดินโครงสร้างหา `{ field: null }` ที่คู่กับ `not` */
function allowsNull(where: unknown, field: string): boolean {
  const json = JSON.stringify(where)
  return json.includes(`{"${field}":null}`)
}

describe('LOG_STATUS_META — คำเดียวกันต้องมาจากที่เดียว (HR16)', () => {
  it('[blocker] ป้ายในตัวกรองประกอบจาก LOG_STATUS_META ไม่ใช่พิมพ์ซ้ำ', () => {
    // ถ้าใครไปแก้คำที่ badge แล้วลืมแก้ที่ตัวกรอง (หรือกลับกัน) เทสนี้ต้องแดง
    for (const key of ['FAILED', 'SENT', 'SKIPPED'] as const) {
      const opt = LOG_STATUS_FILTER_OPTIONS.find((o) => o.value === key)
      expect(opt?.label).toBe(`สถานะ: ${LOG_STATUS_META[key].label}`)
    }
  })

  it('badge บนพื้นสีจางต้องใช้ -ink เสมอ (paces-component-reference.md §6)', () => {
    for (const meta of Object.values(LOG_STATUS_META)) {
      if (/bg-\w+\/1[05]/.test(meta.className)) expect(meta.className).toMatch(/-ink\b/)
    }
  })
})

describe('logStatusWhere', () => {
  it('ALL / ค่าที่ไม่รู้จัก → ไม่กรองอะไรเลย', () => {
    expect(logStatusWhere('ALL')).toEqual({})
    expect(logStatusWhere(parseLogStatusFilter('เดาเอา'))).toEqual({})
    expect(logStatusWhere(parseLogStatusFilter(null))).toEqual({})
  })

  it('[blocker] ตัวกรอง "ข้าม" ต้องยอมรับแถวที่สถานะเป็น NULL ทั้งคู่', () => {
    // แถวส่วนใหญ่ของตารางเป็นแบบนี้ (ถูกข้ามก่อนยิง Graph จึงไม่เคยมีสถานะ) ถ้าลืม OR null
    // ตัวกรองนี้จะคืนศูนย์แถวเสมอ โดยไม่มีอะไรฟ้อง
    const where = logStatusWhere('SKIPPED')
    expect(allowsNull(where, 'publicReplyStatus')).toBe(true)
    expect(allowsNull(where, 'privateReplyStatus')).toBe(true)
  })

  it('[blocker] ตัวกรอง "ส่งแล้ว" ต้องกันแถวที่มีอะไรล้มออก ไม่ใช่แค่เช็คว่ามี SENT', () => {
    const json = JSON.stringify(logStatusWhere('SENT'))
    expect(json).toContain('SENT')
    // ต้องมีเงื่อนไข "ไม่ใช่ FAILED" อยู่ด้วย ไม่งั้นแถว SENT+FAILED จะโผล่ทั้งสองตัวกรอง
    expect(json).toContain('FAILED')
    expect(allowsNull(logStatusWhere('SENT'), 'publicReplyStatus')).toBe(true)
  })

  it('ตัวกรอง "ไม่สำเร็จ" ครอบทั้งสองคอลัมน์', () => {
    expect(logStatusWhere('FAILED')).toEqual({
      OR: [{ publicReplyStatus: 'FAILED' }, { privateReplyStatus: 'FAILED' }],
    })
  })
})

describe('parseLogStatusFilter — allow-list', () => {
  it('รับเฉพาะค่าที่รู้จัก ที่เหลือตกไป ALL (fail-open — เห็นทุกแถวไม่ใช่ความเสียหาย)', () => {
    expect(parseLogStatusFilter('FAILED')).toBe('FAILED')
    expect(parseLogStatusFilter('SENT')).toBe('SENT')
    expect(parseLogStatusFilter('SKIPPED')).toBe('SKIPPED')
    expect(parseLogStatusFilter('failed')).toBe('ALL')
    expect(parseLogStatusFilter(undefined)).toBe('ALL')
  })
})
