/**
 * [blocker] Unit tests — SSOT ของแผนการตรวจสอบร้าน (feature 00060 · T1 + T2)
 *
 * ทั้งหมดเป็นฟังก์ชันบริสุทธิ์ ไม่แตะ DB/session ⇒ รันได้โดยไม่ต้องมี dev server
 *
 * 🛑 ทุกเคสในไฟล์นี้ต้องพิสูจน์ด้วย mutation จริง (กลับตรรกะที่ระบุ แล้วรัน → ต้องแดง)
 *    ถ้า mutation ไหนแล้วยังเขียว **แปลว่าชุด input อ่อน ต้องเติม input ไม่ใช่สรุปว่า
 *    mutation ไม่เกี่ยว** (docs/conventions/mutation-silence-means-weak-corpus.md)
 *    input ที่เติมเพื่อ mutation มีคอมเมนต์กำกับไว้ — ห้ามลบทิ้งเพราะ "ดูซ้ำกับเคสอื่น"
 */
import { describe, it, expect } from 'vitest'
import {
  INSPECTION_CHECKS,
  INSPECTION_CHECK_KEYS,
  checkScope,
  checksForStep,
  computeExpiresAt,
  isInspectionCheckKey,
  ttlDays,
} from './checks'
import {
  latestResultPerCheck,
  resolveResultStatus,
  resultScopeKey,
  badgeLastVerifiedAt,
  timelineOutcomeChangedAt,
  type InspectionResultRow,
} from './result-status'

const T = (iso: string) => new Date(iso)

function row(over: Partial<InspectionResultRow> & Pick<InspectionResultRow, 'id'>): InspectionResultRow {
  return {
    checkKey: 'scam_db',
    roomId: null,
    outcome: 'PASS',
    checkedAt: T('2026-01-01T00:00:00.000Z'),
    lastConfirmedAt: T('2026-01-01T00:00:00.000Z'),
    expiresAt: null,
    invalidatedAt: null,
    ...over,
  }
}

// ────────────────────────────────────────────────────────────────────────────
describe('[blocker] INSPECTION_CHECKS — ตารางข้อตรวจ', () => {
  it('มี 18 ข้อ แบ่งเป็นผูกร้าน 7 · ผูกที่พักรายหลัง 11', () => {
    expect(INSPECTION_CHECK_KEYS).toHaveLength(18)
    const shop = INSPECTION_CHECK_KEYS.filter((k) => checkScope(k) === 'SHOP')
    const room = INSPECTION_CHECK_KEYS.filter((k) => checkScope(k) === 'ROOM')
    expect(shop).toHaveLength(7)
    expect(room).toHaveLength(11)
  })

  it('ขั้นที่ 1 มี 6 ข้อพอดี (AC-INS-03-1)', () => {
    expect(checksForStep(1)).toHaveLength(6)
  })

  it('ขั้นบนกินขั้นล่างเสมอ — จำนวนข้อเพิ่มขึ้นทุกขั้นและขั้น 4 = ครบทั้ง 18 (AC-INS-07-1)', () => {
    expect(checksForStep(1).length).toBeLessThan(checksForStep(2).length)
    expect(checksForStep(2).length).toBeLessThan(checksForStep(3).length)
    expect(checksForStep(3).length).toBeLessThan(checksForStep(4).length)
    expect(checksForStep(4)).toHaveLength(18)
    // ข้อของขั้นล่างต้องอยู่ในชุดของขั้นบนครบทุกข้อ ไม่ใช่แค่จำนวนมากกว่า
    for (const k of checksForStep(2)) expect(checksForStep(4)).toContain(k)
  })

  it('🛑 operating_evidence ต้องเป็น DOCUMENT ไม่ใช่ VIDEO_CALL — method คือคีย์จัดกลุ่มรอบ', () => {
    // ถ้าเป็น VIDEO_CALL จะถูกจับกลุ่มกับ video_tour แล้วรอบนั้นใช้ dueAt ที่สั้นที่สุดในกลุ่ม
    // (90 วัน) = บังคับนัดวิดีโอคอลทุก 90 วันทั้งที่ video_tour ต้องการแค่ 180
    expect(INSPECTION_CHECKS.operating_evidence.method).toBe('DOCUMENT')
    expect(INSPECTION_CHECKS.video_tour.method).toBe('VIDEO_CALL')
    expect(INSPECTION_CHECKS.operating_evidence.step).toBe(INSPECTION_CHECKS.video_tour.step)
  })

  it('🛑 ข้อที่ตรวจสถานที่ต้องเป็น ROOM แม้อยู่ขั้นที่ 2 — โฉนดของหลัง A ไม่พิสูจน์หลัง B', () => {
    expect(checkScope('lease_right_document')).toBe('ROOM')
    expect(checkScope('hotel_license')).toBe('ROOM')
    expect(checkScope('duplicate_listing')).toBe('ROOM') // ขั้น 1 แต่ผูกรายหลัง
    // ทิศกลับ: ข้อที่ตรวจตัวร้าน/เจ้าของต้องเป็น SHOP
    expect(checkScope('id_card_selfie')).toBe('SHOP')
    expect(checkScope('bank_account_name')).toBe('SHOP')
  })

  it('หลักฐานสาธารณะเปิดได้เฉพาะข้อที่เป็นภาพสถานที่ — เอกสารตัวตน/สิทธิ์ต้องปิดเสมอ', () => {
    expect(INSPECTION_CHECKS.id_card_selfie.publicEvidence).toBe(false)
    expect(INSPECTION_CHECKS.lease_right_document.publicEvidence).toBe(false)
    expect(INSPECTION_CHECKS.bank_account_name.publicEvidence).toBe(false)
    expect(INSPECTION_CHECKS.deep_photo_album.publicEvidence).toBe(true)
    expect(INSPECTION_CHECKS.video_tour.publicEvidence).toBe(true)
  })

  it('isInspectionCheckKey เป็น allow-list fail-closed', () => {
    expect(isInspectionCheckKey('scam_db')).toBe(true)
    expect(isInspectionCheckKey('scam_db_extra')).toBe(false)
    expect(isInspectionCheckKey('toString')).toBe(false) // ห้ามหลุดผ่าน prototype
    expect(isInspectionCheckKey(null)).toBe(false)
    expect(isInspectionCheckKey(1)).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('[blocker] ttlDays — อายุผลตรวจขึ้นกับขั้นของแผน ไม่ใช่ค่าคงที่ต่อคีย์', () => {
  it('🛑 mutation: ถอดกิ่ง planStep === 4 ออก → เคสนี้ต้องแดง (AC-INS-06-1)', () => {
    // ร้านขั้น 3 ทวนนำชมทุก 180 วัน · ร้านขั้น 4 ต้องทวนทุก 90 วัน — ค่าเดียวกันต่างกันตามขั้น
    expect(ttlDays('video_tour', 3)).toBe(180)
    expect(ttlDays('video_tour', 4)).toBe(90)
    expect(ttlDays('operating_evidence', 3)).toBe(90)
    expect(ttlDays('operating_evidence', 4)).toBe(90)
  })

  it('ข้ออื่นไม่ถูกกิ่งขั้น 4 กระทบ', () => {
    expect(ttlDays('id_card_selfie', 4)).toBe(365)
    expect(ttlDays('location_exists', 4)).toBe(365)
    expect(ttlDays('scam_db', 4)).toBe(1)
  })

  it('computeExpiresAt นับจาก lastConfirmedAt และเปลี่ยนตามขั้นจริง', () => {
    const base = T('2026-03-01T00:00:00.000Z')
    expect(computeExpiresAt(base, 'video_tour', 3).toISOString()).toBe('2026-08-28T00:00:00.000Z')
    expect(computeExpiresAt(base, 'video_tour', 4).toISOString()).toBe('2026-05-30T00:00:00.000Z')
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('[blocker] resolveResultStatus — 5 สถานะที่แสดง จาก 3 ค่าที่เก็บ', () => {
  const now = T('2026-06-01T00:00:00.000Z')

  it('ไม่มีแถว = ยังไม่มีข้อมูล ไม่ใช่ไม่ผ่าน (FR-INS-011)', () => {
    expect(resolveResultStatus(null, now)).toBe('NO_DATA')
    expect(resolveResultStatus(undefined, now)).toBe('NO_DATA')
  })

  it('NOT_APPLICABLE ไม่ถูกนับเป็นข้อที่ตก', () => {
    expect(resolveResultStatus(row({ id: 'r1', outcome: 'NOT_APPLICABLE' }), now)).toBe('NOT_APPLICABLE')
  })

  it('🛑 mutation: สลับข้อ 3 กับข้อ 4 → เคสนี้ต้องแดง (ผ่านแต่เกินอายุ = รอตรวจซ้ำ)', () => {
    const expired = row({ id: 'r2', outcome: 'PASS', expiresAt: T('2026-05-31T23:59:59.999Z') })
    expect(resolveResultStatus(expired, now)).toBe('RECHECK')
  })

  it('🛑 mutation: ตัด invalidatedAt ออกจากเงื่อนไข → เคสนี้ต้องแดง (FR-INS-028)', () => {
    // ยังไม่เกินอายุเลย (expiresAt อยู่ในอนาคต) แต่ถูกทำให้เป็นโมฆะเพราะร้านเปลี่ยนภาพประกาศ
    const invalidated = row({
      id: 'r3',
      outcome: 'PASS',
      expiresAt: T('2027-01-01T00:00:00.000Z'),
      invalidatedAt: T('2026-05-20T00:00:00.000Z'),
    })
    expect(resolveResultStatus(invalidated, now)).toBe('RECHECK')
  })

  it('🛑 mutation: เปลี่ยน < เป็น <= → เคสนี้ต้องแดง (ค่าขอบ 3 จุด)', () => {
    const before = row({ id: 'r4', expiresAt: T('2026-05-31T23:59:59.999Z') })
    const exact = row({ id: 'r5', expiresAt: now })
    const after = row({ id: 'r6', expiresAt: T('2026-06-01T00:00:00.001Z') })
    expect(resolveResultStatus(before, now)).toBe('RECHECK')
    expect(resolveResultStatus(exact, now)).toBe('PASS') // เท่ากันพอดี = ยังผ่าน
    expect(resolveResultStatus(after, now)).toBe('PASS')
  })

  it('🛑 expiresAt = null แปลว่าไม่มีวันหมดอายุ ไม่ใช่หมดอายุแล้ว', () => {
    expect(resolveResultStatus(row({ id: 'r7', expiresAt: null }), now)).toBe('PASS')
  })

  it('FAIL ที่ถูก invalidate ยังคงเป็น FAIL (ข้อ 3 ครอบเฉพาะ PASS)', () => {
    const failInvalidated = row({
      id: 'r8',
      outcome: 'FAIL',
      invalidatedAt: T('2026-05-20T00:00:00.000Z'),
      expiresAt: T('2026-01-01T00:00:00.000Z'),
    })
    expect(resolveResultStatus(failInvalidated, now)).toBe('FAIL')
  })

  it('NOT_APPLICABLE ที่เกินอายุยังคงเป็น NOT_APPLICABLE ไม่กลายเป็น RECHECK', () => {
    const naExpired = row({ id: 'r9', outcome: 'NOT_APPLICABLE', expiresAt: T('2026-01-01T00:00:00.000Z') })
    expect(resolveResultStatus(naExpired, now)).toBe('NOT_APPLICABLE')
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('[blocker] latestResultPerCheck — เลือกแถวล่าสุดต่อ (checkKey, roomId)', () => {
  it('🛑 mutation: เรียงด้วย lastConfirmedAt แทน checkedAt → เคสนี้ต้องแดง', () => {
    // input ที่จงใจให้สองการเรียง "ไม่ตรงกัน" — ห้ามลบเพราะดูซ้ำกับเคสอื่น
    // แถวเก่าเคยถูกยืนยันซ้ำมานานจน lastConfirmedAt ใหม่กว่าแถวที่มาแทนที่
    const older = row({
      id: 'a',
      outcome: 'PASS',
      checkedAt: T('2026-01-01T00:00:00.000Z'),
      lastConfirmedAt: T('2026-05-30T00:00:00.000Z'), // ใหม่ที่สุดในชุด
    })
    const newer = row({
      id: 'b',
      outcome: 'FAIL',
      checkedAt: T('2026-02-01T00:00:00.000Z'), // ผลเปลี่ยนทีหลัง = แถวที่ถูกต้อง
      lastConfirmedAt: T('2026-02-01T00:00:00.000Z'),
    })
    const picked = latestResultPerCheck([older, newer]).get(resultScopeKey('scam_db', null))
    expect(picked?.id).toBe('b')
    expect(resolveResultStatus(picked ?? null, T('2026-06-01T00:00:00.000Z'))).toBe('FAIL')
  })

  it('🛑 mutation: ถอด tie-break id DESC → เคสนี้ต้องแดง (cron เขียนหลายข้อในทรานแซกชันเดียว)', () => {
    const sameTime = T('2026-03-01T00:00:00.000Z')
    const lo = row({ id: 'aaa', outcome: 'FAIL', checkedAt: sameTime, lastConfirmedAt: sameTime })
    const hi = row({ id: 'bbb', outcome: 'PASS', checkedAt: sameTime, lastConfirmedAt: sameTime })
    // ทั้งสองลำดับ input ต้องให้ผลเดียวกัน — id มากสุดชนะเสมอ ไม่ใช่ "ตัวแรก" หรือ "ตัวสุดท้าย"
    expect(latestResultPerCheck([lo, hi]).get(resultScopeKey('scam_db', null))?.id).toBe('bbb')
    expect(latestResultPerCheck([hi, lo]).get(resultScopeKey('scam_db', null))?.id).toBe('bbb')
  })

  it('🛑 ผลของที่พักหลังหนึ่งห้ามครอบไปถึงหลังอื่น (FR-INS-029 / AC-INS-29-4)', () => {
    const now = T('2026-06-01T00:00:00.000Z')
    const roomA = row({ id: 'ra', checkKey: 'photos_match', roomId: 'room-a', outcome: 'PASS' })
    const map = latestResultPerCheck([roomA])
    expect(resolveResultStatus(map.get(resultScopeKey('photos_match', 'room-a')) ?? null, now)).toBe('PASS')
    // หลัง B ไม่เคยถูกตรวจ → ต้องเป็น "ยังไม่มีข้อมูล" ห้ามสืบทอด PASS จากหลัง A และห้ามเป็น FAIL
    expect(resolveResultStatus(map.get(resultScopeKey('photos_match', 'room-b')) ?? null, now)).toBe('NO_DATA')
  })

  it('ข้อที่ผูกร้าน (roomId = null) แยกคีย์จากข้อที่ผูกห้องอย่างเด็ดขาด', () => {
    const shopLevel = row({ id: 's1', checkKey: 'duplicate_listing', roomId: null, outcome: 'FAIL' })
    const roomLevel = row({ id: 's2', checkKey: 'duplicate_listing', roomId: 'room-a', outcome: 'PASS' })
    const map = latestResultPerCheck([shopLevel, roomLevel])
    expect(map.size).toBe(2)
    expect(map.get(resultScopeKey('duplicate_listing', null))?.id).toBe('s1')
    expect(map.get(resultScopeKey('duplicate_listing', 'room-a'))?.id).toBe('s2')
  })

  it('🛑 parity: ผลของ TS ต้องตรงกับการเรียงแบบ SQL (checkedAt DESC, id DESC) ทุกแถว', () => {
    const t1 = T('2026-01-01T00:00:00.000Z')
    const t2 = T('2026-02-01T00:00:00.000Z')
    const rows: InspectionResultRow[] = [
      row({ id: 'x1', checkKey: 'scam_db', checkedAt: t1 }),
      row({ id: 'x2', checkKey: 'scam_db', checkedAt: t2 }),
      row({ id: 'x3', checkKey: 'scam_db', checkedAt: t2 }), // ชนเวลากับ x2 → id ตัดสิน
      row({ id: 'y1', checkKey: 'video_tour', roomId: 'room-a', checkedAt: t1 }),
      row({ id: 'y2', checkKey: 'video_tour', roomId: 'room-b', checkedAt: t2 }),
    ]
    // อ้างอิงแบบ SQL: เรียงทั้งชุดก่อน แล้วหยิบตัวแรกของแต่ละคีย์ (เท่ากับ DISTINCT ON)
    const sqlLike = new Map<string, InspectionResultRow>()
    for (const r of [...rows].sort(
      (a, b) => b.checkedAt.getTime() - a.checkedAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    )) {
      const k = resultScopeKey(r.checkKey, r.roomId)
      if (!sqlLike.has(k)) sqlLike.set(k, r)
    }
    const ts = latestResultPerCheck(rows)
    expect(ts.size).toBe(sqlLike.size)
    for (const [k, v] of sqlLike) expect(ts.get(k)?.id).toBe(v.id)
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('[blocker] วันที่สองตัวที่สลับกันแล้วโกหกผู้ใช้', () => {
  it('🛑 mutation: สลับ badgeLastVerifiedAt กับ timelineOutcomeChangedAt → ต้องแดง', () => {
    // fixture จงใจให้สองค่า "ต่างกัน" — ถ้าตั้งให้เท่ากันจะแยกไม่ออกว่าสลับสายแล้วหรือยัง
    const r = row({
      id: 'd1',
      checkedAt: T('2026-03-01T00:00:00.000Z'), // ผลนี้ถูกตัดสินครั้งแรกเมื่อ 3 เดือนก่อน
      lastConfirmedAt: T('2026-05-31T00:00:00.000Z'), // แต่ยืนยันซ้ำล่าสุดเมื่อวาน
    })
    expect(badgeLastVerifiedAt(r).toISOString()).toBe('2026-05-31T00:00:00.000Z')
    expect(timelineOutcomeChangedAt(r).toISOString()).toBe('2026-03-01T00:00:00.000Z')
    expect(badgeLastVerifiedAt(r).getTime()).toBeGreaterThan(timelineOutcomeChangedAt(r).getTime())
  })
})
