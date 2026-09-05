// [blocker] มุมมองฝั่งร้าน — จุดที่สลับสายแล้วโกหกผู้ใช้โดยไม่มีอะไรฟ้อง (feature 00060 · T9)

import { describe, expect, it } from 'vitest'
import { buildOwnerInspectionSections, toApiDisplayStatus, availableIntakeSteps } from './owner-view'
import { SYSTEM_INSPECTOR_NAME } from './round-planning'
import type { OwnerResultRow, OwnerRoundRow } from './owner-view'

const NOW = new Date('2026-09-05T00:00:00.000Z')
const ROOM_A = 'room-a'
const ROOM_B = 'room-b'
const rooms = [
  { id: ROOM_A, name: 'บ้านริมเขา หลัง A' },
  { id: ROOM_B, name: 'บ้านริมเขา หลัง B' },
]

const result = (o: Partial<OwnerResultRow> & { checkKey: OwnerResultRow['checkKey'] }): OwnerResultRow => ({
  id: `r-${o.checkKey}-${o.roomId ?? 'shop'}`,
  roomId: null,
  roundId: null,
  outcome: 'PASS',
  checkedAt: new Date('2026-05-14T01:00:00.000Z'),
  lastConfirmedAt: new Date('2026-09-04T01:00:00.000Z'),
  expiresAt: new Date('2026-09-06T01:00:00.000Z'),
  invalidatedAt: null,
  ...o,
})

const round = (o: Partial<OwnerRoundRow> & { id: string }): OwnerRoundRow => ({
  roomId: ROOM_A,
  step: 3,
  method: 'VIDEO_CALL',
  assignedAt: new Date('2026-02-01T00:00:00.000Z'),
  completedAt: null,
  inspectorDisplayName: 'สมชาย ก.',
  ...o,
})

describe('ผลปัจจุบันรายข้อ', () => {
  it('🛑 mutation: สลับ lastCheckedAt กับ outcomeSince → เคสนี้ต้องแดง', () => {
    // fixture จงใจให้สองค่าต่างกัน: ผลเป็น "ผ่าน" มาตั้งแต่ 14 พ.ค. และเพิ่งยืนยันซ้ำเมื่อวาน
    // ถ้าต่อสายสลับกัน ป้ายจะขึ้นว่า "ตรวจล่าสุด 14 พ.ค." = บอกผู้ซื้อว่าร้านนี้ถูกทิ้งไม่ตรวจ
    // มา 3 เดือนครึ่ง ทั้งที่ระบบตรวจให้ทุกวัน — fixture ที่สองค่าเท่ากันจะผ่านเทสทั้งที่สลับสาย
    const s = buildOwnerInspectionSections({
      rooms: [],
      results: [result({ checkKey: 'scam_db' })],
      rounds: [],
      now: NOW,
    })
    const row = s.shopResults.find((r) => r.checkKey === 'scam_db')!
    expect(row.lastCheckedAt).toEqual(new Date('2026-09-04T01:00:00.000Z'))
    expect(row.outcomeSince).toEqual(new Date('2026-05-14T01:00:00.000Z'))
  })

  it('ข้อที่ไม่เคยมีผล → NO_DATA ครบทุกช่อง (ไม่ใช่หายไปจากรายการ)', () => {
    const s = buildOwnerInspectionSections({ rooms, results: [], rounds: [], now: NOW })
    expect(s.shopResults).toHaveLength(7)
    expect(s.roomResults[0]!.results).toHaveLength(11)
    expect(s.shopResults.every((r) => r.displayStatus === 'NO_DATA')).toBe(true)
  })

  it('ผลที่หมดอายุแล้ว → RECHECK_DUE ไม่ใช่ PASS (และชื่อสถานะเป็นชื่อของ API)', () => {
    const s = buildOwnerInspectionSections({
      rooms: [],
      results: [result({ checkKey: 'scam_db', expiresAt: new Date('2026-09-01T00:00:00.000Z') })],
      rounds: [],
      now: NOW,
    })
    expect(s.shopResults.find((r) => r.checkKey === 'scam_db')!.displayStatus).toBe('RECHECK_DUE')
    expect(toApiDisplayStatus('RECHECK')).toBe('RECHECK_DUE')
  })

  it('🛑 mutation: ผลของหลัง A ไปโผล่ที่หลัง B → เคสนี้ต้องแดง (AC-INS-29-4)', () => {
    const s = buildOwnerInspectionSections({
      rooms,
      results: [result({ checkKey: 'video_tour', roomId: ROOM_A })],
      rounds: [],
      now: NOW,
    })
    const a = s.roomResults.find((r) => r.roomId === ROOM_A)!.results.find((r) => r.checkKey === 'video_tour')!
    const b = s.roomResults.find((r) => r.roomId === ROOM_B)!.results.find((r) => r.checkKey === 'video_tour')!
    expect(a.displayStatus).toBe('PASS')
    expect(b.displayStatus).toBe('NO_DATA')
  })

  it('ข้ออัตโนมัติที่ไม่มีรอบผูก แสดงว่าระบบเป็นคนตรวจ ไม่ใช่ช่องว่าง', () => {
    const s = buildOwnerInspectionSections({
      rooms: [],
      results: [result({ checkKey: 'scam_db', roundId: null })],
      rounds: [],
      now: NOW,
    })
    expect(s.shopResults.find((r) => r.checkKey === 'scam_db')!.inspectorDisplayName).toBe(SYSTEM_INSPECTOR_NAME)
  })
})

describe('ไทม์ไลน์', () => {
  it('🛑 mutation: รอบที่ผลไม่เปลี่ยนกลายเป็นบรรทัดว่าง → เคสนี้ต้องแดง', () => {
    // รอบที่ตรวจแล้วทุกอย่างเหมือนเดิมจะไม่มีแถวผลเป็นของตัวเองเลย ⇒ ถ้าไทม์ไลน์แสดงเฉพาะ
    // แถวที่ผูกรอบ บรรทัดนั้นจะว่าง ซึ่งอ่านได้ว่า "ผู้ตรวจมาแล้วไม่ได้ทำอะไร" ทั้งที่ความจริงคือ
    // "มาแล้วยืนยันว่าทุกอย่างยังเหมือนเดิม" — ซึ่งเป็นข้อความที่ผู้ซื้ออยากอ่านที่สุดอย่างหนึ่ง
    const s = buildOwnerInspectionSections({
      rooms,
      results: [],
      rounds: [round({ id: 'rd-1', completedAt: new Date('2026-08-02T04:10:00.000Z') })],
      now: NOW,
    })
    expect(s.timeline[0]!.changedResults).toEqual([])
    expect(s.timeline[0]!.confirmedCheckKeys).toEqual(['video_tour'])
    expect(s.timeline[0]!.roomName).toBe('บ้านริมเขา หลัง A')
  })

  it('ข้อที่รอบนี้ทำให้ผลเปลี่ยน อยู่ใน changedResults และหายจาก confirmedCheckKeys', () => {
    const s = buildOwnerInspectionSections({
      rooms,
      results: [result({ checkKey: 'video_tour', roomId: ROOM_A, roundId: 'rd-1', outcome: 'FAIL' })],
      rounds: [round({ id: 'rd-1', completedAt: new Date('2026-08-02T04:10:00.000Z') })],
      now: NOW,
    })
    expect(s.timeline[0]!.changedResults).toEqual([
      { checkKey: 'video_tour', outcome: 'FAIL', outcomeSince: new Date('2026-05-14T01:00:00.000Z') },
    ])
    expect(s.timeline[0]!.confirmedCheckKeys).toEqual([])
  })

  it('🛑 mutation: เอารอบที่ยังไม่ปิดมาใส่ไทม์ไลน์ → เคสนี้ต้องแดง', () => {
    const s = buildOwnerInspectionSections({
      rooms,
      results: [],
      rounds: [
        round({ id: 'rd-open' }),
        round({ id: 'rd-old', completedAt: new Date('2026-02-11T08:30:00.000Z') }),
        round({ id: 'rd-new', completedAt: new Date('2026-08-02T04:10:00.000Z') }),
      ],
      now: NOW,
    })
    expect(s.timeline.map((t) => t.roundId)).toEqual(['rd-new', 'rd-old'])
    expect(s.pendingRounds.map((p) => p.roundId)).toEqual(['rd-open'])
  })

  it('changedResults ใช้ outcome ดิบ ไม่ใช่ displayStatus — ไม่งั้นไทม์ไลน์เก่าจะเป็น RECHECK_DUE ทั้งเส้น', () => {
    const s = buildOwnerInspectionSections({
      rooms,
      results: [
        result({
          checkKey: 'video_tour',
          roomId: ROOM_A,
          roundId: 'rd-1',
          expiresAt: new Date('2026-03-01T00:00:00.000Z'),
        }),
      ],
      rounds: [round({ id: 'rd-1', completedAt: new Date('2026-02-11T08:30:00.000Z') })],
      now: NOW,
    })
    expect(s.timeline[0]!.changedResults[0]!.outcome).toBe('PASS')
  })
})

describe('โควตารับสมัคร', () => {
  it('ขั้นที่เต็มแล้วต้องไม่อยู่ในรายการที่เปิดรับ และไม่มีแถว = ไม่เปิด', () => {
    expect(
      availableIntakeSteps([
        { step: 1, capacity: 10, usedCount: 3 },
        { step: 2, capacity: 5, usedCount: 5 },
      ]),
    ).toEqual([1])
    expect(availableIntakeSteps([])).toEqual([])
  })
})
