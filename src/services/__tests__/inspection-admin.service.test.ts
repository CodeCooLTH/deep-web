// [blocker] ฝั่งทีมปฏิบัติการ (feature 00060 · T10 · API §4.10-4.16)

import { describe, expect, it, vi, beforeEach } from 'vitest'

const quotaFindMany = vi.fn()
const quotaUpsert = vi.fn()
const quotaFindUnique = vi.fn()
const shopFindFirst = vi.fn()
const roomFindFirst = vi.fn()
const planFindUnique = vi.fn()
const roundCreate = vi.fn()
const roundFindMany = vi.fn()
const userFindFirst = vi.fn()
const userUpdate = vi.fn()
const roleChangeCreate = vi.fn()
const createScamReport = vi.fn()
const recordCheckOutcome = vi.fn()

const calls: string[] = []
const tx = {
  user: { update: (...a: unknown[]) => { calls.push('user.update'); return userUpdate(...a) } },
  inspectorRoleChange: {
    create: (...a: unknown[]) => { calls.push('audit.create'); return roleChangeCreate(...a) },
  },
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    inspectionIntakeQuota: {
      findMany: (...a: unknown[]) => quotaFindMany(...a),
      upsert: (...a: unknown[]) => quotaUpsert(...a),
      findUnique: (...a: unknown[]) => quotaFindUnique(...a),
    },
    shop: { findFirst: (...a: unknown[]) => shopFindFirst(...a) },
    room: { findFirst: (...a: unknown[]) => roomFindFirst(...a) },
    inspectionPlan: { findUnique: (...a: unknown[]) => planFindUnique(...a) },
    inspectionRound: {
      create: (...a: unknown[]) => roundCreate(...a),
      findMany: (...a: unknown[]) => roundFindMany(...a),
      count: vi.fn().mockResolvedValue(0),
    },
    user: { findFirst: (...a: unknown[]) => userFindFirst(...a) },
    $transaction: (fn: (c: unknown) => unknown) => fn(tx),
  },
}))
vi.mock('@/services/scam-report.service', () => ({
  createScamReport: (...a: unknown[]) => { calls.push('scamReport.create'); return createScamReport(...a) },
}))
vi.mock('@/services/inspection-result.service', () => ({
  recordCheckOutcome: (...a: unknown[]) => { calls.push('recordOutcome'); return recordCheckOutcome(...a) },
}))
vi.mock('@/services/inspection-round.service', () => ({
  checkKeysOfRound: () => [],
  resolveInspectorDisplayName: vi.fn().mockResolvedValue('สมชาย ก.'),
}))

const {
  getIntakeQuotaOverview,
  setIntakeQuota,
  createAdHocRound,
  reportInspectionFraud,
  setInspectorRole,
} = await import('@/services/inspection-admin.service')

const NOW = new Date('2026-09-05T03:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  quotaFindMany.mockResolvedValue([])
  quotaUpsert.mockResolvedValue({ capacity: 10, usedCount: 2 })
  quotaFindUnique.mockResolvedValue(null)
  shopFindFirst.mockResolvedValue({ vertical: 'LODGING' })
  roomFindFirst.mockResolvedValue({ id: 'room-a' })
  planFindUnique.mockResolvedValue({ status: 'ACTIVE', step: 4 })
  roundCreate.mockResolvedValue({ id: 'round-1', assignedAt: NOW, dueAt: null })
  roundFindMany.mockResolvedValue([])
  userFindFirst.mockResolvedValue({ id: 'u-1' })
  createScamReport.mockResolvedValue({ id: 'scam-1' })
  recordCheckOutcome.mockResolvedValue({ resultId: 'res-1', changed: true })
})

describe('โควตา', () => {
  it('🛑 mutation: เดือนที่ไม่มีแถวคืน capacity เป็น null → เคสนี้ต้องแดง', async () => {
    // null จะถูกตีความว่า "ไม่จำกัด" ในที่ใดที่หนึ่งวันหนึ่งแน่นอน — `seeded` ตอบคำถาม
    // "ตั้งหรือยัง" ส่วน `capacity` ตอบ "รับได้กี่ร้าน" สองคำถามที่ไม่ควรใช้ช่องเดียวกัน
    const rows = await getIntakeQuotaOverview(2026, 9)
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.capacity === 0 && r.seeded === false)).toBe(true)
  })

  it('🛑 mutation: ยอมให้ตั้งโควตาย้อนหลังเดือนที่ผ่านไปแล้ว → เคสนี้ต้องแดง', async () => {
    await expect(
      setIntakeQuota({ year: 2026, month: 8, step: 2, capacity: 5, now: NOW }),
    ).rejects.toMatchObject({ code: 'QUOTA_INVALID' })
    expect(quotaUpsert).not.toHaveBeenCalled()
  })

  it('โควตาติดลบ → QUOTA_INVALID', async () => {
    await expect(
      setIntakeQuota({ year: 2026, month: 9, step: 2, capacity: -1, now: NOW }),
    ).rejects.toMatchObject({ code: 'QUOTA_INVALID' })
  })

  it('🛑 mutation: ลดเพดานต่ำกว่ายอดที่รับไปแล้วโดยไม่บอกแอดมิน → เคสนี้ต้องแดง', async () => {
    quotaUpsert.mockResolvedValue({ capacity: 1, usedCount: 3 })
    const res = await setIntakeQuota({ year: 2026, month: 9, step: 2, capacity: 1, now: NOW })
    expect(res.overCommitted).toBe(true)
    expect(res.remaining).toBe(0)
  })

  it('คืนเพดานของเดือนถัดไปมาด้วย — cron คัดลอกค่าไปแล้ว ไม่ได้อ้างอิงสด', async () => {
    quotaFindUnique.mockResolvedValue({ capacity: 7 })
    const res = await setIntakeQuota({ year: 2026, month: 12, step: 2, capacity: 5, now: NOW })
    expect(quotaFindUnique.mock.calls[0]?.[0]?.where?.periodYearMonth_step?.periodYearMonth).toBe('2027-01')
    expect(res.nextMonthCapacity).toBe(7)
  })
})

describe('สร้างรอบนอกกำหนด', () => {
  const base = {
    shopId: 'shop-1',
    step: 4 as const,
    method: 'ONSITE' as const,
    inspectorUserId: null,
    dueAt: null,
    now: NOW,
  }

  it('🛑 mutation: ยอมให้ผสมคีย์ของร้านกับของที่พักในรอบเดียว → เคสนี้ต้องแดง', async () => {
    // การบันทึกผลอ่าน roomId จากตัวรอบ ⇒ รอบที่ปนกันจะเขียน roomId ลงไปทั้งชุด
    // แล้วผลระดับร้านกลายเป็นผลของหลังเดียวโดยไม่มีอะไรฟ้อง
    await expect(
      createAdHocRound({ ...base, roomId: 'room-a', checkKeys: ['bank_account_name', 'room_count'] }),
    ).rejects.toMatchObject({ code: 'CHECK_SCOPE_MISMATCH' })
    expect(roundCreate).not.toHaveBeenCalled()
  })

  it('🛑 คีย์ของที่พักแต่ไม่ส่ง roomId → CHECK_SCOPE_MISMATCH (ตรวจสองทิศ)', async () => {
    await expect(
      createAdHocRound({ ...base, roomId: null, checkKeys: ['room_count'] }),
    ).rejects.toMatchObject({ code: 'CHECK_SCOPE_MISMATCH' })
  })

  it('🛑 mutation: ถอดด่าน "ห้องนี้เป็นของร้านนี้จริงไหม" → เคสนี้ต้องแดง', async () => {
    roomFindFirst.mockResolvedValue(null)
    await expect(
      createAdHocRound({ ...base, roomId: 'room-ของร้านอื่น', checkKeys: ['room_count'] }),
    ).rejects.toMatchObject({ code: 'ROOM_NOT_IN_SHOP' })
  })

  it('ร้านที่ไม่มีแผน ACTIVE สร้างรอบไม่ได้', async () => {
    planFindUnique.mockResolvedValue({ status: 'LAPSED' })
    await expect(
      createAdHocRound({ ...base, roomId: 'room-a', checkKeys: ['room_count'] }),
    ).rejects.toMatchObject({ code: 'PLAN_NOT_FOUND' })
  })

  it('ไม่ระบุผู้ตรวจ → สร้างเป็นรอบที่ยังไม่มอบหมาย และ dueAt มาจาก lead time ของวิธีตรวจ', async () => {
    const res = await createAdHocRound({ ...base, roomId: 'room-a', checkKeys: ['room_count'] })
    expect(res.inspectorDisplayName).toBeNull()
    const data = roundCreate.mock.calls[0]?.[0]?.data as Record<string, unknown>
    expect(data.inspectorUserId).toBeNull()
    // ONSITE = 30 วันก่อนกำหนด (ต้องหาผู้ตรวจในพื้นที่ นัดวัน เดินทาง)
    expect((data.dueAt as Date).getTime() - NOW.getTime()).toBe(30 * 24 * 60 * 60 * 1000)
  })
})

describe('เส้นทางฉ้อโกง', () => {
  const base = {
    actorUserId: 'admin-1',
    shopId: 'shop-1',
    roundId: 'round-1',
    roomId: null,
    scamType: 'TRANSFER_NO_DELIVERY',
    description: 'x'.repeat(30),
    evidenceFileIds: ['f1'],
    identifiers: [{ type: 'PHONE' as const, value: '0812345678' }],
    now: NOW,
  }

  it('🛑 mutation: เขียนตาราง ScamReport ตรงแทนการเรียก service ของโดเมน /check → เคสนี้ต้องแดง', async () => {
    // ตัวระบุต้องเก็บเป็น hash ตามกฎ PDPA ที่โดเมนนั้นบังคับไว้แล้ว เขียนตรงคือข้ามกฎทั้งชุด
    const res = await reportInspectionFraud({ ...base, checkKey: null })
    expect(calls).toContain('scamReport.create')
    expect(res.status).toBe('PENDING')
  })

  it('🛑 บันทึก FAIL ควบคู่ ไม่ใช่แทนกัน (AC-INS-23-2)', async () => {
    const res = await reportInspectionFraud({ ...base, checkKey: 'bank_account_name' })
    expect(recordCheckOutcome.mock.calls[0]?.[0]).toMatchObject({
      checkKey: 'bank_account_name',
      outcome: 'FAIL',
      roundId: 'round-1',
    })
    expect(res.linkedResultIds).toEqual(['res-1'])
  })

  it('🛑 คีย์ที่ผูกรายหลังแต่ไม่ส่ง roomId → CHECK_SCOPE_MISMATCH และต้องไม่เขียนอะไรเลย', async () => {
    await expect(reportInspectionFraud({ ...base, checkKey: 'photos_match' })).rejects.toMatchObject({
      code: 'CHECK_SCOPE_MISMATCH',
    })
    expect(calls).toEqual([])
  })
})

describe('บทบาทผู้ตรวจ', () => {
  it('🛑 mutation: ถอนบทบาททั้งที่ยังถือรอบอยู่ → เคสนี้ต้องแดง', async () => {
    // งานจะหายไปจากทุกหน้าจอพร้อมกัน: ไม่โผล่ในคิวของใคร (เจ้าของเข้าไม่ได้แล้ว) และไม่นับเป็น
    // overdueUnassigned (เพราะมีคนมอบหมายแล้ว) — ไปนอนใน overdueAssigned ที่รอคนซึ่งไม่มีวันกลับมา
    roundFindMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }])
    await expect(
      setInspectorRole({ targetUserId: 'u-1', actorUserId: 'a-1', isInspector: false, reason: 'จบสัญญา', now: NOW }),
    ).rejects.toMatchObject({ code: 'INSPECTOR_HAS_OPEN_ROUNDS', details: { count: 2 } })
    expect(calls).toEqual([])
  })

  it('🛑 mutation: อัปเดตสิทธิ์โดยไม่เขียน audit → เคสนี้ต้องแดง (ต้องอยู่ทรานแซกชันเดียวกัน)', async () => {
    await setInspectorRole({ targetUserId: 'u-1', actorUserId: 'a-1', isInspector: true, reason: 'จ้างเชียงใหม่', now: NOW })
    expect(calls).toEqual(['user.update', 'audit.create'])
    expect(roleChangeCreate.mock.calls[0]?.[0]?.data).toMatchObject({
      targetUserId: 'u-1',
      actorUserId: 'a-1',
      isInspector: true,
      reason: 'จ้างเชียงใหม่',
    })
  })

  it('ผู้ใช้ที่ไม่มีอยู่/ถูกลบ → USER_NOT_FOUND', async () => {
    userFindFirst.mockResolvedValue(null)
    await expect(
      setInspectorRole({ targetUserId: 'ghost', actorUserId: 'a-1', isInspector: true, reason: 'x', now: NOW }),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' })
  })
})
