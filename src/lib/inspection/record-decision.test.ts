/**
 * [blocker] Unit tests — decideResultWrite() (feature 00060 · T6)
 *
 * ตรรกะนี้ตัดสินว่า "การตรวจครั้งนี้สร้างประวัติหรือไม่" ซึ่งพังได้ 2 ทางและทั้งสองทาง
 * ไม่มี error ไม่มี type ผิด ไม่มี gate ไหนจับได้:
 *   - ยืนยันซ้ำกลายเป็นแถวใหม่ → ไทม์ไลน์ท่วมด้วยบรรทัดซ้ำจนกลบรอบที่มีความหมาย
 *   - ผลเปลี่ยนกลายเป็นยืนยันซ้ำ → ประวัติหาย ขัด AC-INS-16-3/27-1
 */
import { describe, it, expect } from 'vitest'
import { decideResultWrite } from './record-decision'
import type { InspectionResultRow } from './result-status'

const T = (iso: string) => new Date(iso)
const NOW = T('2026-06-01T00:00:00.000Z')

function latest(over: Partial<InspectionResultRow> = {}): InspectionResultRow {
  return {
    id: 'row-1',
    checkKey: 'scam_db',
    roomId: null,
    outcome: 'PASS',
    checkedAt: T('2026-01-01T00:00:00.000Z'),
    lastConfirmedAt: T('2026-05-31T00:00:00.000Z'),
    expiresAt: T('2026-06-01T00:00:00.000Z'),
    invalidatedAt: null,
    ...over,
  }
}

describe('[blocker] decideResultWrite — สร้างประวัติ vs เลื่อนเวลา', () => {
  it('ตรวจครั้งแรก (ไม่มีแถวเดิม) = INSERT', () => {
    const d = decideResultWrite({ latest: null, outcome: 'PASS', checkKey: 'scam_db', planStep: 1, now: NOW })
    expect(d.kind).toBe('INSERT')
    if (d.kind !== 'INSERT') throw new Error('unreachable')
    expect(d.checkedAt).toEqual(NOW)
    expect(d.lastConfirmedAt).toEqual(NOW)
    expect(d.invalidatedAt).toBeNull()
  })

  it('🛑 mutation: ทำให้ผลเดิมกลายเป็น INSERT → เคสนี้ต้องแดง (ไทม์ไลน์จะท่วมบรรทัดซ้ำ)', () => {
    const d = decideResultWrite({ latest: latest({ outcome: 'PASS' }), outcome: 'PASS', checkKey: 'scam_db', planStep: 1, now: NOW })
    expect(d.kind).toBe('CONFIRM')
    if (d.kind !== 'CONFIRM') throw new Error('unreachable')
    expect(d.targetId).toBe('row-1')
    expect(d.lastConfirmedAt).toEqual(NOW)
    // 🛑 CONFIRM ต้องไม่มี checkedAt ในผลลัพธ์เลย — คงเวลาที่ผลนี้เกิดครั้งแรกไว้
    expect('checkedAt' in d).toBe(false)
  })

  it('🛑 mutation: ทำให้ผลเปลี่ยนกลายเป็น CONFIRM → เคสนี้ต้องแดง (ประวัติจะหาย)', () => {
    for (const [from, to] of [['PASS', 'FAIL'], ['FAIL', 'PASS'], ['PASS', 'NOT_APPLICABLE'], ['NOT_APPLICABLE', 'PASS']] as const) {
      const d = decideResultWrite({ latest: latest({ outcome: from }), outcome: to, checkKey: 'scam_db', planStep: 1, now: NOW })
      expect(d.kind, `${from} → ${to}`).toBe('INSERT')
    }
  })

  it('🛑 mutation: ละเลย invalidation → เคสนี้ต้องแดง (FR-INS-028 เปลี่ยนภาพประกาศ)', () => {
    // ผลเหมือนเดิมทุกประการ แต่ข้อมูลต้นทางเปลี่ยน = เหตุการณ์จริงที่ต้องอยู่ในไทม์ไลน์
    const d = decideResultWrite({
      latest: latest({ outcome: 'PASS' }),
      outcome: 'PASS',
      checkKey: 'photos_match',
      planStep: 4,
      now: NOW,
      invalidation: { at: NOW, reason: 'ROOM_IMAGES_CHANGED' },
    })
    expect(d.kind).toBe('INSERT')
    if (d.kind !== 'INSERT') throw new Error('unreachable')
    expect(d.invalidatedAt).toEqual(NOW)
    expect(d.invalidatedReason).toBe('ROOM_IMAGES_CHANGED')
  })

  it('🛑 แถวเดิมเป็นโมฆะอยู่แล้ว แล้วตรวจใหม่ได้ผลเดิม = INSERT ไม่ใช่ CONFIRM', () => {
    // ถ้า CONFIRM ทับ แถวนั้นจะยังมี invalidatedAt ค้าง = สถานะไม่มีวันกลับเป็น "ผ่าน"
    // อีกเลยไม่ว่าจะตรวจซ้ำกี่ครั้ง — ป้ายจะค้าง "รอตรวจซ้ำ" ตลอดกาลโดยไม่มีอะไรฟ้อง
    const d = decideResultWrite({
      latest: latest({ outcome: 'PASS', invalidatedAt: T('2026-05-20T00:00:00.000Z') }),
      outcome: 'PASS',
      checkKey: 'photos_match',
      planStep: 4,
      now: NOW,
    })
    expect(d.kind).toBe('INSERT')
    if (d.kind !== 'INSERT') throw new Error('unreachable')
    expect(d.invalidatedAt).toBeNull() // แถวใหม่ต้องสะอาด ไม่สืบทอดความเป็นโมฆะมาด้วย
  })

  it('🛑 mutation: คำนวณ expiresAt จาก checkedAt แทน now → เคสนี้ต้องแดง', () => {
    // ยืนยันซ้ำต้องต่ออายุจาก "ตอนนี้" ไม่ใช่จากตอนที่ผลเกิดครั้งแรกเมื่อ 5 เดือนก่อน
    const d = decideResultWrite({ latest: latest(), outcome: 'PASS', checkKey: 'scam_db', planStep: 1, now: NOW })
    if (d.kind !== 'CONFIRM') throw new Error('unreachable')
    expect(d.expiresAt.toISOString()).toBe('2026-06-02T00:00:00.000Z') // now + 1 วัน
  })

  it('🛑 อายุผลตรวจต้องมาจาก planStep ที่ส่งเข้ามา ไม่ใช่ค่าคงที่ต่อคีย์', () => {
    const at3 = decideResultWrite({ latest: null, outcome: 'PASS', checkKey: 'video_tour', planStep: 3, now: NOW })
    const at4 = decideResultWrite({ latest: null, outcome: 'PASS', checkKey: 'video_tour', planStep: 4, now: NOW })
    if (at3.kind !== 'INSERT' || at4.kind !== 'INSERT') throw new Error('unreachable')
    expect(at3.expiresAt.toISOString()).toBe('2026-11-28T00:00:00.000Z') // +180
    expect(at4.expiresAt.toISOString()).toBe('2026-08-30T00:00:00.000Z') // +90
    expect(at3.expiresAt.getTime()).toBeGreaterThan(at4.expiresAt.getTime())
  })
})
