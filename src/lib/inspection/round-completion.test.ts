// [blocker] เกณฑ์ปิดรอบ — ถ้าไฟล์นี้ผิด การตรวจของร้านจะหยุดถาวรโดยไม่มี error สักตัว (TD-018)

import { describe, expect, it } from 'vitest'
import { decideRoundCompletion } from './round-completion'
import type { InspectionCheckKey } from './checks'
import type { InspectionResultRow } from './result-status'

const ASSIGNED = new Date('2026-09-01T00:00:00.000Z')

function row(over: Partial<InspectionResultRow> & { checkKey: InspectionCheckKey }): InspectionResultRow {
  return {
    id: 'r-1',
    roomId: 'room-a',
    outcome: 'PASS',
    checkedAt: new Date('2026-09-02T00:00:00.000Z'),
    lastConfirmedAt: new Date('2026-09-02T00:00:00.000Z'),
    expiresAt: null,
    invalidatedAt: null,
    ...over,
  }
}

const mapOf = (...rows: InspectionResultRow[]) =>
  new Map<InspectionCheckKey, InspectionResultRow | null>(rows.map((r) => [r.checkKey, r]))

describe('decideRoundCompletion', () => {
  it('ยืนยันครบทุกข้อหลังรอบเปิด → ปิดได้', () => {
    const required: InspectionCheckKey[] = ['location_exists', 'photos_match']
    const d = decideRoundCompletion({
      requiredChecks: required,
      latestByCheck: mapOf(row({ checkKey: 'location_exists' }), row({ checkKey: 'photos_match', id: 'r-2' })),
      assignedAt: ASSIGNED,
    })
    expect(d.ok).toBe(true)
  })

  it('🛑 mutation: เปลี่ยนเกณฑ์เป็น "มีแถวที่ roundId = รอบนี้" → เคสนี้ต้องแดง', () => {
    // รอบทวนสอบที่ผลออกมา **เหมือนเดิมทุกข้อ** = ไม่มีแถวใหม่ถูกสร้างเลย (TD-002)
    // แถวเดิมถูกเขียนไว้ตั้งแต่ปีที่แล้ว มีแต่ lastConfirmedAt ที่ถูกเลื่อนมาในรอบนี้
    // ⇒ ไม่มีแถวไหนถือ roundId ของรอบนี้เลยแม้แต่แถวเดียว แต่รอบนี้ "ตรวจเสร็จแล้วจริง"
    // นี่คือผลลัพธ์ปกติของร้านที่ดี ไม่ใช่เคสขอบ — ถ้าปิดไม่ได้ การตรวจจะหยุดถาวร
    const d = decideRoundCompletion({
      requiredChecks: ['video_tour'],
      latestByCheck: mapOf(
        row({
          checkKey: 'video_tour',
          checkedAt: new Date('2025-03-01T00:00:00.000Z'),
          lastConfirmedAt: new Date('2026-09-03T00:00:00.000Z'),
        }),
      ),
      assignedAt: ASSIGNED,
    })
    expect(d.ok).toBe(true)
  })

  it('ข้อที่ถูกยืนยันก่อนรอบเปิด ไม่นับ — ไม่งั้นรอบปิดตัวเองด้วยผลชุดที่เป็นเหตุให้ต้องเปิดรอบ', () => {
    const d = decideRoundCompletion({
      requiredChecks: ['video_tour'],
      latestByCheck: mapOf(
        row({ checkKey: 'video_tour', lastConfirmedAt: new Date('2026-08-31T23:59:59.000Z') }),
      ),
      assignedAt: ASSIGNED,
    })
    expect(d).toEqual({ ok: false, reason: 'NOT_CONFIRMED', missing: ['video_tour'] })
  })

  it('ยืนยันพอดีวินาทีที่รอบเปิด → นับว่าอยู่ในรอบนี้', () => {
    const d = decideRoundCompletion({
      requiredChecks: ['video_tour'],
      latestByCheck: mapOf(row({ checkKey: 'video_tour', lastConfirmedAt: ASSIGNED })),
      assignedAt: ASSIGNED,
    })
    expect(d.ok).toBe(true)
  })

  it('ข้อที่ยังไม่เคยมีผลเลย → ปิดไม่ได้ และต้องบอกได้ว่าขาดข้อไหน', () => {
    const d = decideRoundCompletion({
      requiredChecks: ['location_exists', 'photos_match', 'room_count'],
      latestByCheck: mapOf(row({ checkKey: 'location_exists' })),
      assignedAt: ASSIGNED,
    })
    expect(d).toEqual({ ok: false, reason: 'NOT_CONFIRMED', missing: ['photos_match', 'room_count'] })
  })

  it('🛑 รอบที่ไม่ครอบข้อตรวจใดเลย ปิดไม่ได้ — ปิดได้จะแปลว่า "ตรวจแล้ว" ทั้งที่ไม่มีอะไรถูกตรวจ', () => {
    const d = decideRoundCompletion({ requiredChecks: [], latestByCheck: new Map(), assignedAt: ASSIGNED })
    expect(d).toEqual({ ok: false, reason: 'NO_CHECKS', missing: [] })
  })

  it('ผลที่ถูก invalidate หลังยืนยันในรอบนี้ ยังปิดรอบได้ (เหตุการณ์ใหม่จะเปิดรอบใหม่เอง)', () => {
    const d = decideRoundCompletion({
      requiredChecks: ['photos_match'],
      latestByCheck: mapOf(
        row({ checkKey: 'photos_match', invalidatedAt: new Date('2026-09-04T00:00:00.000Z') }),
      ),
      assignedAt: ASSIGNED,
    })
    expect(d.ok).toBe(true)
  })
})
