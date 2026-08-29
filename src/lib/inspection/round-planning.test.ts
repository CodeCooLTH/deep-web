/**
 * [blocker] Unit tests — planDueRounds() (feature 00060 · T5)
 *
 * ตรรกะนี้คือกลไกเดียวที่ทำให้ "ตรวจสอบอย่างต่อเนื่อง" เกิดขึ้นจริง — ถ้ามันไม่ทำงาน
 * ระบบจะไม่ error ไม่ crash ไม่มี log อะไรผิด แต่ป้ายของร้านที่จ่ายเงินจะร่วงทีละข้อ
 * จนหมดใน 6-12 เดือน ⇒ เทสต้อง "เดินเวลา" ไม่ใช่ทดสอบแค่ ณ จุดเดียว
 */
import { describe, it, expect } from 'vitest'
import { planDueRounds, roundGroupKey, isRoundOverdue, ROUND_LEAD_DAYS, type DueCheck } from './round-planning'

const T = (iso: string) => new Date(iso)
const NOW = T('2026-06-01T00:00:00.000Z')
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000)
const NONE = new Set<string>()

describe('[blocker] planDueRounds — เปิดรอบล่วงหน้าตาม lead time', () => {
  it('🛑 mutation: ถอดกิ่ง AUTO ออก → เคสนี้ต้องแดง (ขั้น 1 ต้องไม่เปิดรอบ)', () => {
    const due: DueCheck[] = [{ roomId: null, checkKey: 'scam_db', expiresAt: days(0) }]
    expect(planDueRounds({ dueChecks: due, openRoundKeys: NONE, now: NOW })).toEqual([])
    expect(ROUND_LEAD_DAYS.AUTO).toBeNull()
  })

  it('🛑 mutation: สลับ lead time ของ ONSITE กับ DOCUMENT → เคสนี้ต้องแดง', () => {
    // ONSITE ต้องเปิดล่วงหน้า 30 วัน · DOCUMENT 14 วัน — ที่ 20 วันข้างหน้าจึงต่างกันชัด
    const at20 = days(20)
    const onsite = planDueRounds({
      dueChecks: [{ roomId: 'r1', checkKey: 'location_exists', expiresAt: at20 }],
      openRoundKeys: NONE, now: NOW,
    })
    const doc = planDueRounds({
      dueChecks: [{ roomId: 'r1', checkKey: 'lease_right_document', expiresAt: at20 }],
      openRoundKeys: NONE, now: NOW,
    })
    expect(onsite).toHaveLength(1) // 20 <= 30 → ถึงเวลาเปิด
    expect(doc).toHaveLength(0)    // 20 > 14 → ยังไม่ถึง
  })

  it('ยังไม่เคยตรวจเลย (expiresAt = null) = ถึงกำหนดทันที', () => {
    const out = planDueRounds({
      dueChecks: [{ roomId: 'r1', checkKey: 'video_tour', expiresAt: null }],
      openRoundKeys: NONE, now: NOW,
    })
    expect(out).toHaveLength(1)
    expect(out[0]!.dueAt).toEqual(NOW)
  })

  it('🛑 mutation: จัดกลุ่มรายข้อแทนรายรอบ → เคสนี้ต้องแดง (ลงพื้นที่ครั้งเดียวได้ 6 ข้อ)', () => {
    const step4: DueCheck[] = (
      ['location_exists', 'photos_match', 'room_count', 'facilities', 'accessibility', 'deep_photo_album'] as const
    ).map((k) => ({ roomId: 'r1', checkKey: k, expiresAt: days(10) }))
    const out = planDueRounds({ dueChecks: step4, openRoundKeys: NONE, now: NOW })
    expect(out).toHaveLength(1) // ไม่ใช่ 6
    expect(out[0]!.checkKeys).toHaveLength(6)
    expect(out[0]!.method).toBe('ONSITE')
    expect(out[0]!.step).toBe(4)
  })

  it('🛑 คีย์จัดกลุ่มต้องรวม method — ขั้น 3 มี 2 วิธีตรวจ ต้องได้ 2 รอบ ไม่ใช่ 1', () => {
    // ถ้ากันซ้ำ/จัดกลุ่มด้วย (roomId, step) อย่างเดียว operating_evidence จะไม่มีวันได้
    // รอบของตัวเอง = หมดอายุค้างเป็น "รอตรวจซ้ำ" ตลอดไป ซึ่งคือบั๊กที่ไฟล์นี้ถูกสร้างมากัน
    const out = planDueRounds({
      dueChecks: [
        { roomId: 'r1', checkKey: 'video_tour', expiresAt: days(5) },
        { roomId: 'r1', checkKey: 'operating_evidence', expiresAt: days(3) },
      ],
      openRoundKeys: NONE, now: NOW,
    })
    expect(out).toHaveLength(2)
    expect(new Set(out.map((r) => r.method))).toEqual(new Set(['VIDEO_CALL', 'DOCUMENT']))
  })

  it('dueAt ของรอบ = ข้อที่ด่วนที่สุดในกลุ่ม ไม่ใช่ข้อแรกที่เจอ', () => {
    const out = planDueRounds({
      dueChecks: [
        { roomId: 'r1', checkKey: 'location_exists', expiresAt: days(25) },
        { roomId: 'r1', checkKey: 'photos_match', expiresAt: days(4) }, // ด่วนสุด
        { roomId: 'r1', checkKey: 'room_count', expiresAt: days(12) },
      ],
      openRoundKeys: NONE, now: NOW,
    })
    expect(out).toHaveLength(1)
    expect(out[0]!.dueAt).toEqual(days(4))
  })

  it('🛑 mutation: ถอดการกันซ้ำออก → เคสนี้ต้องแดง (คิวจะบวมทุกวัน)', () => {
    const open = new Set([roundGroupKey('r1', 4, 'ONSITE')])
    const out = planDueRounds({
      dueChecks: [{ roomId: 'r1', checkKey: 'location_exists', expiresAt: days(5) }],
      openRoundKeys: open, now: NOW,
    })
    expect(out).toEqual([])
  })

  it('ที่พักคนละหลังได้รอบของตัวเองแยกกัน (FR-INS-029)', () => {
    const out = planDueRounds({
      dueChecks: [
        { roomId: 'r1', checkKey: 'photos_match', expiresAt: days(5) },
        { roomId: 'r2', checkKey: 'photos_match', expiresAt: days(5) },
      ],
      openRoundKeys: NONE, now: NOW,
    })
    expect(out).toHaveLength(2)
    expect(new Set(out.map((r) => r.roomId))).toEqual(new Set(['r1', 'r2']))
  })

  it('🛑 เดินเวลา 400 วันโดยไม่มีใครมอบหมายด้วยมือ — ต้องมีรอบถูกเปิดอัตโนมัติ', () => {
    // นี่คือเคสที่จับ "ฟีเจอร์เสื่อมเองเงียบ ๆ" — ถ้าไม่มีเคสนี้ บั๊กนั้นจะไม่มีวันถูกจับ
    const start = T('2026-01-01T00:00:00.000Z')
    const expires = new Date(start.getTime() + 365 * 86_400_000) // ตรวจถึงที่ อายุ 1 ปี
    let opened = 0
    for (let d = 0; d <= 400; d++) {
      const now = new Date(start.getTime() + d * 86_400_000)
      const out = planDueRounds({
        dueChecks: [{ roomId: 'r1', checkKey: 'location_exists', expiresAt: expires }],
        openRoundKeys: NONE, now,
      })
      if (out.length > 0) opened++
    }
    // ต้องเริ่มเปิดตั้งแต่ 30 วันก่อนหมดอายุ (วันที่ 335) ไปจนจบ = 66 วัน
    expect(opened).toBe(66)
    expect(opened).toBeGreaterThan(0)
  })
})

describe('[blocker] isRoundOverdue', () => {
  it('รอบที่เสร็จแล้วไม่นับว่าเลยกำหนด', () => {
    expect(isRoundOverdue({ dueAt: days(-5), completedAt: days(-1) }, NOW)).toBe(false)
  })
  it('🛑 รอบที่ไม่มี dueAt (สร้างด้วยมือ) ไม่นับว่าเลยกำหนด — ไม่มีกำหนดให้เลย', () => {
    expect(isRoundOverdue({ dueAt: null, completedAt: null }, NOW)).toBe(false)
  })
  it('เลยกำหนดแล้วยังไม่เสร็จ = นับ', () => {
    expect(isRoundOverdue({ dueAt: days(-1), completedAt: null }, NOW)).toBe(true)
    expect(isRoundOverdue({ dueAt: days(1), completedAt: null }, NOW)).toBe(false)
  })
})
