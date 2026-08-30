/**
 * [blocker] Unit tests — toPublicInspectionView() (feature 00060 · T7)
 *
 * ไฟล์นี้คือเส้นแบ่งระหว่าง "ข้อมูลภายใน" กับ "สิ่งที่ทั้งอินเทอร์เน็ตอ่านได้"
 * หน้าโปรไฟล์อยู่ใต้ client layout ⇒ ทุกค่าที่ผ่านออกไปถูก serialize ลง HTML เสมอ
 * แม้ component จะไม่ render มัน ⇒ เทสที่นี่ตรวจ "สิ่งที่ออกไป" ไม่ใช่ "สิ่งที่แสดง"
 */
import { describe, it, expect } from 'vitest'
import { toPublicInspectionView, toPublicStatus, type PublicViewInput } from './public-view'
import type { InspectionResultRow } from './result-status'
import { checksForStep, INSPECTION_CHECKS } from './checks'

const T = (iso: string) => new Date(iso)
const NOW = T('2026-06-01T00:00:00.000Z')

function res(over: Partial<InspectionResultRow> & Pick<InspectionResultRow, 'id' | 'checkKey'>): InspectionResultRow {
  return {
    roomId: null, outcome: 'PASS',
    checkedAt: T('2026-01-01T00:00:00.000Z'),
    lastConfirmedAt: T('2026-05-30T00:00:00.000Z'),
    expiresAt: T('2027-01-01T00:00:00.000Z'),
    invalidatedAt: null,
    ...over,
  }
}

function build(over: Partial<PublicViewInput> = {}) {
  return toPublicInspectionView({
    plan: { step: 4, active: true },
    results: [], rooms: [{ id: 'room-a', name: 'บ้านริมเขา A' }], rounds: [], now: NOW,
    ...over,
  })
}

describe('[blocker] ไม่เคยสมัครแผน = ไม่ส่งอะไรออกไปเลย', () => {
  it('plan = null → คืน null (ไม่ render บล็อก ไม่ใช่ส่งกล่องเปล่า)', () => {
    expect(build({ plan: null })).toBeNull()
  })
})

describe('[blocker] "ไม่ผ่าน" ต้องแยกไม่ออกจาก "ยังไม่มีข้อมูล"', () => {
  it('🛑 mutation: ปล่อย FAIL ข้ามเส้นไป → เคสนี้ต้องแดง (view-source จะรู้ว่าตกข้อไหน)', () => {
    const v = build({ results: [res({ id: 'r1', checkKey: 'scam_db', outcome: 'FAIL' })] })!
    const line = v.shopChecks.find((c) => c.checkKey === 'scam_db')!
    expect(line.status).toBe('NO_DATA')
    expect(JSON.stringify(v)).not.toContain('FAIL')
    expect(JSON.stringify(v)).not.toContain('ไม่ผ่าน')
  })

  it('🛑 mutation: ส่งวันที่ติดไปกับข้อที่ตก → เคสนี้ต้องแดง (แยกออกได้จากการมีวันที่)', () => {
    const failed = build({ results: [res({ id: 'r1', checkKey: 'scam_db', outcome: 'FAIL' })] })!
    const never = build({ results: [] })!
    const a = failed.shopChecks.find((c) => c.checkKey === 'scam_db')!
    const b = never.shopChecks.find((c) => c.checkKey === 'scam_db')!
    // สองเคสนี้ต้องออกมาเหมือนกันทุกฟิลด์ ไม่ใช่แค่ status เท่ากัน
    expect(a).toEqual(b)
  })

  it('toPublicStatus ยุบเฉพาะ FAIL ค่าอื่นไม่แตะ', () => {
    expect(toPublicStatus('FAIL')).toBe('NO_DATA')
    expect(toPublicStatus('PASS')).toBe('PASS')
    expect(toPublicStatus('RECHECK')).toBe('RECHECK')
    expect(toPublicStatus('NOT_APPLICABLE')).toBe('NOT_APPLICABLE')
    expect(toPublicStatus('NO_DATA')).toBe('NO_DATA')
  })
})

describe('[blocker] หลักฐานปิดห้ามข้ามเส้น', () => {
  const rounds: PublicViewInput['rounds'] = [{
    id: 'rd1', step: 4, completedAt: T('2026-05-01T00:00:00.000Z'), inspectorDisplayName: 'สมชาย ว.',
    evidence: [
      // 🛑 หลักฐานปิดที่ "มีพิกัด" ต้องมาก่อนตัวสาธารณะในอาร์เรย์ — ห้ามสลับลำดับหรือลบทิ้ง
      //    ถ้าตัวสาธารณะอยู่ก่อน ตัวที่หยิบ "พิกัดตัวไหนก็ได้" จะได้คำตอบเดียวกันโดยบังเอิญ
      //    แล้ว mutation จะเงียบ (เคยเงียบมาแล้วรอบแรก — mutation-silence-means-weak-corpus.md)
      { visibility: 'PRIVATE', fileId: 'SECRET-deed', lat: 13.7, lng: 100.5 },
      { visibility: 'PRIVATE', fileId: 'SECRET-idcard', lat: null, lng: null },
      { visibility: 'PUBLIC', fileId: 'pub-1', lat: 18.7, lng: 98.9 },
    ],
  }]

  it('🛑 mutation: ถอดตัวกรอง visibility → เคสนี้ต้องแดง', () => {
    const v = build({ rounds })!
    expect(v.timeline[0]!.photoFileIds).toEqual(['pub-1'])
    // ตรวจที่ payload ทั้งก้อน ไม่ใช่แค่ฟิลด์ที่คาดว่าจะรั่ว
    expect(JSON.stringify(v)).not.toContain('SECRET')
  })

  it('พิกัดต้องมาจากหลักฐาน PUBLIC เท่านั้น ไม่ใช่จากตัวแรกที่มีพิกัด', () => {
    const v = build({ rounds })!
    expect(v.timeline[0]!.lat).toBe(18.7) // ไม่ใช่ 13.7 ของหลักฐานปิด
  })

  it('🛑 mutation: ส่งรอบที่ยังไม่เสร็จออกไป → เคสนี้ต้องแดง (AC-INS-17-2 คิว "รอผู้ตรวจ" เป็นข้อมูลภายใน)', () => {
    const v = build({
      rounds: [{ id: 'pending', step: 4, completedAt: null, inspectorDisplayName: 'ยังไม่มอบหมาย', evidence: [] }],
    })!
    expect(v.timeline).toEqual([])
    expect(JSON.stringify(v)).not.toContain('pending')
  })

  it('ไทม์ไลน์เรียงใหม่สุดก่อน', () => {
    const mk = (id: string, iso: string) => ({
      id, step: 4 as const, completedAt: T(iso), inspectorDisplayName: 'ก', evidence: [],
    })
    const v = build({ rounds: [mk('old', '2026-01-01T00:00:00.000Z'), mk('new', '2026-05-01T00:00:00.000Z')] })!
    expect(v.timeline.map((t) => t.id)).toEqual(['new', 'old'])
  })
})

describe('[blocker] วนจากชุดคีย์ ไม่ใช่จากแถวที่มีในฐานข้อมูล', () => {
  it('🛑 mutation: วนจาก results → เคสนี้ต้องแดง (ข้อที่ยังไม่ตรวจจะหายไปเงียบ ๆ)', () => {
    const v = build({ results: [res({ id: 'r1', checkKey: 'scam_db' })] })!
    const expectedShop = checksForStep(4).filter((k) => INSPECTION_CHECKS[k].scope === 'SHOP')
    expect(v.shopChecks).toHaveLength(expectedShop.length)
    expect(v.shopChecks.filter((c) => c.status === 'NO_DATA').length).toBeGreaterThan(0)
  })

  it('ร้านขั้น 1 เห็นเฉพาะข้อของขั้น 1', () => {
    const v = build({ plan: { step: 1, active: true } })!
    const all = [...v.shopChecks, ...v.rooms.flatMap((r) => r.checks)]
    expect(all).toHaveLength(6) // ขั้น 1 มี 6 ข้อพอดี
  })
})

describe('[blocker] ขอบเขตรายหลัง (FR-INS-029)', () => {
  it('🛑 ผลของหลัง A ห้ามครอบไปถึงหลัง B', () => {
    const v = build({
      rooms: [{ id: 'room-a', name: 'A' }, { id: 'room-b', name: 'B' }],
      results: [res({ id: 'r1', checkKey: 'photos_match', roomId: 'room-a', outcome: 'PASS' })],
    })!
    const a = v.rooms.find((r) => r.roomId === 'room-a')!.checks.find((c) => c.checkKey === 'photos_match')!
    const b = v.rooms.find((r) => r.roomId === 'room-b')!.checks.find((c) => c.checkKey === 'photos_match')!
    expect(a.status).toBe('PASS')
    expect(b.status).toBe('NO_DATA')
    expect(b.lastVerifiedAt).toBeNull()
  })
})

describe('[blocker] dataAsOf บนแถบเทา', () => {
  it('🛑 mutation: ใช้ checkedAt แทน lastConfirmedAt → เคสนี้ต้องแดง', () => {
    // ผลตัดสินครั้งแรกเมื่อ 5 เดือนก่อน แต่ยืนยันซ้ำล่าสุดเมื่อวาน — ป้ายต้องขึ้น "เมื่อวาน"
    // ไม่งั้นร้านที่ถูกตรวจต่อเนื่องมาตลอดจะดูเหมือนถูกทิ้งร้าง
    const v = build({
      plan: { step: 4, active: false },
      results: [res({ id: 'r1', checkKey: 'scam_db', checkedAt: T('2026-01-01T00:00:00.000Z'), lastConfirmedAt: T('2026-05-31T00:00:00.000Z') })],
    })!
    expect(v.active).toBe(false)
    expect(v.dataAsOf?.toISOString()).toBe('2026-05-31T00:00:00.000Z')
  })

  it('ไม่มีผลตรวจเลย = dataAsOf เป็น null ไม่ใช่วันนี้', () => {
    expect(build({ results: [] })!.dataAsOf).toBeNull()
  })
})
