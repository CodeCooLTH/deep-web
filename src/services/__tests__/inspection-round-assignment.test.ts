// [blocker] มอบหมาย · ปิดรอบ · งานค้าง · ขอบเขตผู้ตรวจ (feature 00060 · T5)
//
// 🛑 สองข้อที่พังแล้วเงียบสนิท: (1) เขียนทับ assignedAt ตอนมอบหมาย ⇒ งานที่ตรวจไปแล้ว
//    หลุดออกจากเกณฑ์ปิดรอบ (2) ขอบเขตผู้ตรวจไม่ได้อยู่ใน WHERE ⇒ ข้อมูลร้านอื่นถูกอ่าน
//    ออกมาจากฐานจริงแล้วค่อยกรองทีหลัง ซึ่ง "ดูเหมือนถูก" จน review ผ่านง่าย

import { describe, expect, it, vi, beforeEach } from 'vitest'

const userFindFirst = vi.fn()
const roundFindUnique = vi.fn()
const roundFindFirst = vi.fn()
const roundFindMany = vi.fn()
const roundUpdateMany = vi.fn()
const roundGroupBy = vi.fn()
const resultFindMany = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findFirst: (...a: unknown[]) => userFindFirst(...a) },
    inspectionRound: {
      findUnique: (...a: unknown[]) => roundFindUnique(...a),
      findFirst: (...a: unknown[]) => roundFindFirst(...a),
      findMany: (...a: unknown[]) => roundFindMany(...a),
      updateMany: (...a: unknown[]) => roundUpdateMany(...a),
      groupBy: (...a: unknown[]) => roundGroupBy(...a),
    },
    inspectionResult: { findMany: (...a: unknown[]) => resultFindMany(...a) },
  },
}))

const {
  assignRound,
  completeRound,
  countOverdueRounds,
  listAssignmentsForInspector,
  assertRoundAssignedTo,
  InspectionRoundError,
} = await import('@/services/inspection-round.service')

const NOW = new Date('2026-09-05T03:00:00.000Z')
const ASSIGNED = new Date('2026-09-01T00:00:00.000Z')
const ROUND = {
  id: 'round-1',
  shopId: 'shop-1',
  roomId: 'room-a',
  step: 3,
  method: 'VIDEO_CALL',
  assignedAt: ASSIGNED,
  completedAt: null as Date | null,
}

beforeEach(() => {
  vi.clearAllMocks()
  userFindFirst.mockResolvedValue({ displayName: 'สมชาย ผู้ตรวจ' })
  roundFindUnique.mockResolvedValue({ ...ROUND })
  roundFindFirst.mockResolvedValue({ ...ROUND })
  roundFindMany.mockResolvedValue([])
  roundUpdateMany.mockResolvedValue({ count: 1 })
  roundGroupBy.mockResolvedValue([])
  resultFindMany.mockResolvedValue([])
})

describe('assignRound', () => {
  it('🛑 mutation: เขียนทับ assignedAt ตอนมอบหมาย → เคสนี้ต้องแดง', async () => {
    // assignedAt คือเส้นแบ่ง "รอบนี้เปิดเมื่อไร" ที่เกณฑ์ปิดรอบใช้ (TD-018)
    // เลื่อนมันตอนมอบหมาย = ผลที่ยืนยันไปแล้วก่อนหน้าหลุดออกจากเกณฑ์ แล้วรอบปิดไม่ได้
    await assignRound({ roundId: 'round-1', inspectorUserId: 'u-1', now: NOW })
    const data = roundUpdateMany.mock.calls[0]?.[0]?.data as Record<string, unknown>
    expect(Object.keys(data)).not.toContain('assignedAt')
    expect(data).toMatchObject({ inspectorUserId: 'u-1', inspectorDisplayName: 'สมชาย ผู้ตรวจ' })
  })

  it('🛑 mutation: ยอมรับผู้ใช้ที่ไม่ใช่ผู้ตรวจ (ถอด isInspector ออกจาก WHERE) → เคสนี้ต้องแดง', async () => {
    await assignRound({ roundId: 'round-1', inspectorUserId: 'u-1', now: NOW })
    expect(userFindFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'u-1', isInspector: true, deletedAt: null },
    })
  })

  it('ผู้ใช้ที่ไม่มีสิทธิ์ผู้ตรวจ → INSPECTOR_NOT_ELIGIBLE และต้องไม่แตะรอบเลย', async () => {
    userFindFirst.mockResolvedValue(null)
    await expect(assignRound({ roundId: 'round-1', inspectorUserId: 'u-x', now: NOW })).rejects.toMatchObject({
      code: 'INSPECTOR_NOT_ELIGIBLE',
    })
    expect(roundUpdateMany).not.toHaveBeenCalled()
  })

  it('🛑 ชื่อว่างห้ามผ่าน — inspectorDisplayName คือชื่อที่ไปโผล่บนโปรไฟล์สาธารณะ', async () => {
    userFindFirst.mockResolvedValue({ displayName: '   ' })
    await expect(assignRound({ roundId: 'round-1', inspectorUserId: 'u-1', now: NOW })).rejects.toMatchObject({
      code: 'INSPECTOR_NAME_UNUSABLE',
    })
  })

  it('รอบที่ปิดไปแล้ว มอบหมายไม่ได้ (completedAt: null อยู่ใน WHERE)', async () => {
    roundUpdateMany.mockResolvedValue({ count: 0 })
    roundFindUnique.mockResolvedValue({ completedAt: NOW })
    await expect(assignRound({ roundId: 'round-1', inspectorUserId: 'u-1', now: NOW })).rejects.toMatchObject({
      code: 'ROUND_ALREADY_COMPLETED',
    })
    expect(roundUpdateMany.mock.calls[0]?.[0]?.where).toMatchObject({ completedAt: null })
  })
})

describe('completeRound', () => {
  const confirmedRow = (checkKey: string, lastConfirmedAt: Date) => ({
    id: `r-${checkKey}`,
    checkKey,
    roomId: 'room-a',
    outcome: 'PASS',
    // เก่ากว่า assignedAt โดยตั้งใจ — รอบที่ผลไม่เปลี่ยนจะไม่มีแถวใหม่เลย (TD-002)
    checkedAt: new Date('2025-05-01T00:00:00.000Z'),
    lastConfirmedAt,
    expiresAt: null,
    invalidatedAt: null,
  })

  it('รอบวิดีโอคอลที่ยืนยันครบ → ปิดได้ แม้ไม่มีแถวใหม่ถูกสร้างเลยสักแถว', async () => {
    resultFindMany.mockResolvedValue([confirmedRow('video_tour', new Date('2026-09-04T00:00:00.000Z'))])
    expect(await completeRound({ roundId: 'round-1', now: NOW })).toEqual({
      completed: true,
      alreadyCompleted: false,
    })
    expect(roundUpdateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'round-1', completedAt: null },
      data: { completedAt: NOW },
    })
  })

  it('ยังไม่มีข้อไหนถูกยืนยันในรอบนี้ → ปิดไม่ได้ และบอกได้ว่าขาดข้อไหน', async () => {
    await expect(completeRound({ roundId: 'round-1', now: NOW })).rejects.toMatchObject({
      code: 'ROUND_NOT_COMPLETABLE',
      missing: ['video_tour'],
    })
    expect(roundUpdateMany).not.toHaveBeenCalled()
  })

  it('รอบ ONSITE ต้องยืนยันครบทั้ง 6 ข้อ — ขาดข้อเดียวก็ปิดไม่ได้', async () => {
    roundFindUnique.mockResolvedValue({ ...ROUND, step: 4, method: 'ONSITE' })
    const at = new Date('2026-09-04T00:00:00.000Z')
    resultFindMany.mockResolvedValue(
      ['location_exists', 'photos_match', 'room_count', 'facilities', 'accessibility'].map((k) =>
        confirmedRow(k, at),
      ),
    )
    await expect(completeRound({ roundId: 'round-1', now: NOW })).rejects.toMatchObject({
      missing: ['deep_photo_album'],
    })
  })

  it('กดปิดซ้ำรอบที่ปิดไปแล้ว → ไม่ throw (ผู้ตรวจกดรัวเป็นเรื่องปกติ)', async () => {
    roundFindUnique.mockResolvedValue({ ...ROUND, completedAt: NOW })
    expect(await completeRound({ roundId: 'round-1', now: NOW })).toEqual({
      completed: false,
      alreadyCompleted: true,
    })
    expect(roundUpdateMany).not.toHaveBeenCalled()
  })

  it('🛑 mutation: อ่านผลของที่พักหลังอื่นมาปิดรอบ (ถอด roomId ออกจาก WHERE) → เคสนี้ต้องแดง', async () => {
    resultFindMany.mockResolvedValue([confirmedRow('video_tour', new Date('2026-09-04T00:00:00.000Z'))])
    await completeRound({ roundId: 'round-1', now: NOW })
    expect(resultFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ shopId: 'shop-1', roomId: 'room-a' })
  })
})

describe('countOverdueRounds', () => {
  it('🛑 แยกตามขั้นและวิธีตรวจ — คิวที่ตันเพราะหาผู้ตรวจไม่ได้ คนละปัญหากับไม่มีคนกดมอบหมาย', async () => {
    roundGroupBy.mockResolvedValue([
      { step: 4, method: 'ONSITE', _count: { _all: 3 } },
      { step: 2, method: 'DOCUMENT', _count: { _all: 5 } },
    ])
    const r = await countOverdueRounds(NOW)
    expect(r.total).toBe(8)
    expect(r.buckets).toEqual([
      { step: 2, method: 'DOCUMENT', count: 5 },
      { step: 4, method: 'ONSITE', count: 3 },
    ])
  })

  it('🛑 mutation: นับรอบที่ยังไม่ถึงกำหนด/ปิดไปแล้วด้วย → เคสนี้ต้องแดง', async () => {
    await countOverdueRounds(NOW)
    expect(roundGroupBy.mock.calls[0]?.[0]).toMatchObject({
      where: { completedAt: null, dueAt: { lt: NOW } },
    })
  })
})

describe('ขอบเขตของผู้ตรวจ', () => {
  it('🛑 mutation: ดึงรอบทั้งหมดแล้วค่อยกรองใน TS (ถอด inspectorUserId ออกจาก WHERE) → เคสนี้ต้องแดง', async () => {
    await listAssignmentsForInspector('u-1')
    expect(roundFindMany.mock.calls[0]?.[0]?.where).toMatchObject({ inspectorUserId: 'u-1', completedAt: null })
  })

  it('assertRoundAssignedTo ผูกขอบเขตไว้ในคิวรีแรก ไม่ใช่เทียบหลังอ่าน', async () => {
    await assertRoundAssignedTo('round-1', 'u-1')
    expect(roundFindFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 'round-1', inspectorUserId: 'u-1' })
  })

  it('🛑 ผู้ตรวจที่ถูกถอดสิทธิ์ระหว่างมีงานค้าง เข้าไม่ได้ทันที — ทั้งรายการงานและรายรอบ', async () => {
    userFindFirst.mockResolvedValue(null)
    await expect(listAssignmentsForInspector('u-1')).rejects.toBeInstanceOf(InspectionRoundError)
    await expect(assertRoundAssignedTo('round-1', 'u-1')).rejects.toBeInstanceOf(InspectionRoundError)
    expect(roundFindMany).not.toHaveBeenCalled()
    expect(roundFindFirst).not.toHaveBeenCalled()
  })

  it('รอบที่ไม่ใช่ของตน → ROUND_NOT_ASSIGNED_TO_YOU (ข้อความเดียวกับรอบที่ไม่มีอยู่จริง)', async () => {
    roundFindFirst.mockResolvedValue(null)
    await expect(assertRoundAssignedTo('round-9', 'u-1')).rejects.toMatchObject({
      code: 'ROUND_NOT_ASSIGNED_TO_YOU',
    })
  })
})
