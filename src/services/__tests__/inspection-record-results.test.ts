// [blocker] ผู้ตรวจบันทึกผลทั้งชุด (feature 00060 · T10 · API §4.8)
//
// 🛑 สามข้อที่ผิดแล้วเงียบ: (1) `roomId` มาจาก body ⇒ ผู้ตรวจที่ได้รับมอบหมายให้ตรวจหลัง A
//    เขียนผลลงหลัง B ที่ไม่เคยไปเห็น (2) หลักฐานปิดถูกตั้งเป็น PUBLIC (3) อายุผลคิดจากขั้นของ
//    รอบแทนขั้นของแผน ⇒ ร้านขั้น 4 ได้อายุ 180 วันแทน 90 แล้วไม่มีใครสังเกตจนป้ายค้าง

import { describe, expect, it, vi, beforeEach } from 'vitest'

const roundFindFirst = vi.fn()
const userFindFirst = vi.fn()
const planFindUnique = vi.fn()
const evidenceCreate = vi.fn()
const roundUpdate = vi.fn()
const recordCheckOutcome = vi.fn()
const getFileMeta = vi.fn()

const tx = {
  inspectionEvidence: { create: (...a: unknown[]) => evidenceCreate(...a) },
  inspectionRound: { update: (...a: unknown[]) => roundUpdate(...a) },
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    inspectionRound: { findFirst: (...a: unknown[]) => roundFindFirst(...a) },
    user: { findFirst: (...a: unknown[]) => userFindFirst(...a) },
    inspectionPlan: { findUnique: (...a: unknown[]) => planFindUnique(...a) },
    $transaction: (fn: (c: unknown) => unknown) => fn(tx),
  },
}))
vi.mock('@/services/inspection-result.service', () => ({
  recordCheckOutcome: (...a: unknown[]) => recordCheckOutcome(...a),
}))
vi.mock('@/lib/storage', () => ({ getFileMeta: (...a: unknown[]) => getFileMeta(...a) }))

const { recordRoundResults } = await import('@/services/inspection-round.service')

const NOW = new Date('2026-09-05T03:00:00.000Z')
const ROUND = {
  id: 'round-1',
  shopId: 'shop-1',
  roomId: 'room-a',
  step: 4,
  method: 'ONSITE',
  assignedAt: new Date('2026-09-01T00:00:00.000Z'),
  completedAt: null as Date | null,
  suspectedFraudNote: null as string | null,
}

const run = (results: unknown[], extra?: Record<string, unknown>) =>
  recordRoundResults({
    roundId: 'round-1',
    inspectorUserId: 'u-1',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    results: results as any,
    now: NOW,
    ...extra,
  })

beforeEach(() => {
  vi.clearAllMocks()
  userFindFirst.mockResolvedValue({ displayName: 'สมชาย ก.' })
  roundFindFirst.mockResolvedValue({ ...ROUND })
  planFindUnique.mockResolvedValue({ step: 4 })
  evidenceCreate.mockResolvedValue({ id: 'ev-1' })
  recordCheckOutcome.mockResolvedValue({ changed: true, resultId: 'res-1' })
  getFileMeta.mockResolvedValue({ size: 1000, ext: 'jpg' })
})

describe('ขอบเขตของรอบ', () => {
  it('🛑 mutation: ถอดด่าน "คีย์ต้องอยู่ในรอบนี้" → เคสนี้ต้องแดง', async () => {
    // video_tour เป็นข้อของรอบ VIDEO_CALL ไม่ใช่ ONSITE
    await expect(run([{ checkKey: 'video_tour', outcome: 'PASS' }])).rejects.toMatchObject({
      code: 'CHECK_NOT_IN_ROUND',
    })
    expect(recordCheckOutcome).not.toHaveBeenCalled()
  })

  it('🛑 mutation: เอา roomId จาก body แทนของรอบ → เคสนี้ต้องแดง', async () => {
    await run([{ checkKey: 'room_count', outcome: 'PASS', roomId: 'room-ที่ไม่ได้รับมอบหมาย' }])
    expect(recordCheckOutcome.mock.calls[0]?.[0]).toMatchObject({
      shopId: 'shop-1',
      roomId: 'room-a',
      roundId: 'round-1',
    })
  })

  it('🛑 mutation: อ่านขั้นจาก round.step แทนขั้นของแผน → เคสนี้ต้องแดง', async () => {
    // อายุผลของ video_tour/operating_evidence สั้นลงเหลือ 90 วันเมื่อร้านอยู่ขั้น 4
    // ⇒ ใช้ขั้นของรอบ (ซึ่งอาจเป็น 3) จะได้ 180 วัน แล้วป้ายค้างเกินกำหนดโดยไม่มีอะไรฟ้อง
    roundFindFirst.mockResolvedValue({ ...ROUND, step: 3, method: 'DOCUMENT' })
    planFindUnique.mockResolvedValue({ step: 4 })
    await run([{ checkKey: 'operating_evidence', outcome: 'PASS' }])
    expect(recordCheckOutcome.mock.calls[0]?.[0]).toMatchObject({ planStep: 4 })
  })

  it('แผนหายไปแล้ว (LAPSED/ถูกลบ) ยังบันทึกผลได้ โดยถอยไปใช้ขั้นของรอบ', async () => {
    planFindUnique.mockResolvedValue(null)
    await run([{ checkKey: 'room_count', outcome: 'PASS' }])
    expect(recordCheckOutcome.mock.calls[0]?.[0]).toMatchObject({ planStep: 4 })
  })

  it('🛑 รอบที่ปิดแล้วบันทึกซ้ำไม่ได้ — ล็อกถาวร (ไทม์ไลน์สาธารณะอ้างรอบนี้ไปแล้ว)', async () => {
    roundFindFirst.mockResolvedValue({ ...ROUND, completedAt: NOW })
    await expect(run([{ checkKey: 'room_count', outcome: 'PASS' }])).rejects.toMatchObject({
      code: 'ROUND_ALREADY_COMPLETED',
    })
    expect(recordCheckOutcome).not.toHaveBeenCalled()
  })
})

describe('หลักฐาน', () => {
  it('🛑 mutation: ถอดด่านชนิดหลักฐาน แล้วปล่อยเอกสารเข้าข้อสาธารณะ → เคสนี้ต้องแดง', async () => {
    await expect(
      run([
        {
          checkKey: 'deep_photo_album',
          outcome: 'PASS',
          evidence: [{ kind: 'DOCUMENT', fileId: 'f1' }],
        },
      ]),
    ).rejects.toMatchObject({ code: 'EVIDENCE_VISIBILITY_FORBIDDEN' })
    expect(evidenceCreate).not.toHaveBeenCalled()
  })

  it('🛑 mutation: ให้ client กำหนด visibility เอง → เคสนี้ต้องแดง (server ตัดสินเท่านั้น)', async () => {
    await run([
      { checkKey: 'deep_photo_album', outcome: 'PASS', evidence: [{ kind: 'PHOTO', fileId: 'f1', visibility: 'PRIVATE' }] },
      { checkKey: 'room_count', outcome: 'PASS', evidence: [{ kind: 'PHOTO', fileId: 'f2', visibility: 'PUBLIC' }] },
    ])
    const rows = evidenceCreate.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data)
    expect(rows[0]).toMatchObject({ kind: 'PHOTO', visibility: 'PUBLIC' })
    expect(rows[1]).toMatchObject({ kind: 'PHOTO', visibility: 'PRIVATE' })
  })

  it('🛑 mutation: ถอดการตรวจว่าไฟล์ commit แล้ว → เคสนี้ต้องแดง', async () => {
    getFileMeta.mockResolvedValue(null)
    await expect(
      run([{ checkKey: 'room_count', outcome: 'PASS', evidence: [{ kind: 'PHOTO', fileId: 'ไม่มีจริง' }] }]),
    ).rejects.toMatchObject({ code: 'FILE_NOT_COMMITTED' })
  })

  it('หลักฐานชนิดพิกัดไม่ต้องมีไฟล์ และผูกกับแถวผลที่เพิ่งเขียน', async () => {
    await run([{ checkKey: 'location_exists', outcome: 'PASS', evidence: [{ kind: 'GEO', lat: 18.79, lng: 98.98 }] }])
    expect(getFileMeta).not.toHaveBeenCalled()
    expect(evidenceCreate.mock.calls[0]?.[0]).toMatchObject({
      data: { kind: 'GEO', visibility: 'PUBLIC', resultId: 'res-1', roundId: 'round-1' },
    })
  })
})

describe('บันทึกความสงสัยเรื่องฉ้อโกง', () => {
  it('🛑 mutation: ไม่ส่งมาแล้วเขียน null ทับ → เคสนี้ต้องแดง', async () => {
    await run([{ checkKey: 'room_count', outcome: 'PASS' }])
    expect(roundUpdate).not.toHaveBeenCalled()
  })

  it('ส่งมาแล้วทับค่าเดิมของรอบนั้น', async () => {
    await run([{ checkKey: 'room_count', outcome: 'PASS' }], { suspectedFraudNote: 'เพื่อนบ้านบอกว่าบ้านร้าง' })
    expect(roundUpdate.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'round-1' },
      data: { suspectedFraudNote: 'เพื่อนบ้านบอกว่าบ้านร้าง' },
    })
  })
})

describe('ผลลัพธ์ที่คืนกลับ', () => {
  it('บอกได้ว่าข้อไหน "ผลเปลี่ยน" ข้อไหน "ยืนยันผลเดิม"', async () => {
    recordCheckOutcome
      .mockResolvedValueOnce({ changed: false, resultId: 'res-1' })
      .mockResolvedValueOnce({ changed: true, resultId: 'res-2' })
    const res = await run([
      { checkKey: 'facilities', outcome: 'PASS' },
      { checkKey: 'room_count', outcome: 'FAIL' },
    ])
    expect(res.saved.map((s) => ({ k: s.checkKey, c: s.changed }))).toEqual([
      { k: 'facilities', c: false },
      { k: 'room_count', c: true },
    ])
  })
})
