// inspection-plan.service.test.ts — [blocker] วงจรชีวิตของแผน = เส้นทางที่แตะเงินของร้าน
//
// 🛑 เทสชุดนี้วัด **ลำดับการเรียก** ไม่ใช่แค่ผลลัพธ์สุดท้าย — บั๊กที่แพงที่สุดของไฟล์นี้
//    (หักเงินก่อนจองโควตา) ให้ผลลัพธ์สุดท้ายเหมือนกันเป๊ะในเคสที่สำเร็จ ต่างกันเฉพาะเคสที่ล้ม
//    ⇒ เทสที่ดูแต่ผลลัพธ์จะเขียวตลอดกาลกับบั๊กตัวนี้

import { describe, expect, it, vi, beforeEach } from 'vitest'

/** ลำดับการเรียกที่เกิดขึ้นจริงในหนึ่งเคส — หัวใจของไฟล์นี้ */
let calls: string[] = []

const shopFindFirst = vi.fn()
const planUpsert = vi.fn()
const planUpdate = vi.fn()
const planFindUnique = vi.fn()
const quotaFindUnique = vi.fn()
const executeRaw = vi.fn()
const termsCreate = vi.fn()
const quotaCreate = vi.fn()

const tx = {
  shop: { findFirst: (...a: unknown[]) => shopFindFirst(...a) },
  inspectionPlan: {
    upsert: (...a: unknown[]) => { calls.push('plan.upsert'); return planUpsert(...a) },
    update: (...a: unknown[]) => { calls.push('plan.update'); return planUpdate(...a) },
    findUnique: (...a: unknown[]) => planFindUnique(...a),
  },
  inspectionIntakeQuota: {
    findUnique: (...a: unknown[]) => quotaFindUnique(...a),
    create: (...a: unknown[]) => quotaCreate(...a),
  },
  inspectionTermsAcceptance: {
    create: (...a: unknown[]) => { calls.push('terms.create'); return termsCreate(...a) },
  },
  $executeRaw: (...a: unknown[]) => { calls.push('quota.claim'); return executeRaw(...a) },
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (c: unknown) => unknown) => fn(tx),
    inspectionPlan: {
      findUnique: (...a: unknown[]) => planFindUnique(...a),
      update: (...a: unknown[]) => { calls.push('plan.update'); return planUpdate(...a) },
    },
    inspectionIntakeQuota: {
      findUnique: (...a: unknown[]) => quotaFindUnique(...a),
      create: (...a: unknown[]) => quotaCreate(...a),
    },
  },
}))

const deductCredit = vi.fn()
vi.mock('@/services/wallet.service', () => ({
  deductCredit: (...a: unknown[]) => { calls.push('deductCredit'); return deductCredit(...a) },
}))

const createDueRoundsForShop = vi.fn()
vi.mock('@/services/inspection-round.service', () => ({
  createDueRoundsForShop: (...a: unknown[]) => { calls.push('createDueRounds'); return createDueRoundsForShop(...a) },
}))

const recomputeExpiryForPlanStep = vi.fn()
vi.mock('@/services/inspection-result.service', () => ({
  recomputeExpiryForPlanStep: (...a: unknown[]) => {
    calls.push('recomputeExpiry')
    return recomputeExpiryForPlanStep(...a)
  },
}))

import {
  InspectionPlanError,
  cancelInspectionPlan,
  changeInspectionPlanStep,
  renewOrLapseInspectionPlan,
  seedIntakeQuota,
  subscribeInspectionPlan,
} from '@/services/inspection-plan.service'

const NOW = new Date('2026-09-01T03:00:00.000Z')
const OWNER = 'user-owner'
const SHOP = 'shop-1'

beforeEach(() => {
  calls = []
  vi.clearAllMocks()
  shopFindFirst.mockResolvedValue({ userId: OWNER, vertical: 'LODGING' })
  executeRaw.mockResolvedValue(1)
  planUpsert.mockResolvedValue({ id: 'plan-1' })
  deductCredit.mockResolvedValue({ id: 'wtx-1' })
  createDueRoundsForShop.mockResolvedValue(2)
})

describe('subscribeInspectionPlan — ลำดับที่ผิดแล้วร้านเสียเงินฟรี', () => {
  it('🛑 mutation: สลับให้ deductCredit มาก่อน claimIntakeSlot → เคสนี้ต้องแดง', async () => {
    await subscribeInspectionPlan({ shopId: SHOP, userId: OWNER, step: 2, termsAccepted: true, now: NOW })
    // โควตาก่อนเงินเสมอ — ถ้าหักเงินสำเร็จแล้วโควตาเต็ม ร้านเสียเงินโดยไม่ได้บริการ
    // และกฎ "ไม่คืนเงิน" ที่เราเขียนเองทำให้มันกลายเป็นทางตันที่ต้องแก้ด้วยมือทีละราย
    expect(calls.indexOf('quota.claim')).toBeLessThan(calls.indexOf('deductCredit'))
  })

  it('🛑 mutation: ย้าย terms.create ไปหลัง plan.upsert → เคสนี้ต้องแดง', async () => {
    await subscribeInspectionPlan({ shopId: SHOP, userId: OWNER, step: 2, termsAccepted: true, now: NOW })
    expect(calls).toEqual(['quota.claim', 'terms.create', 'deductCredit', 'plan.upsert', 'createDueRounds'])
  })

  it('🛑 mutation: ถอดด่าน termsAccepted → เคสนี้ต้องแดง (ต้องไม่แตะอะไรเลยสักอย่าง)', async () => {
    await expect(
      subscribeInspectionPlan({ shopId: SHOP, userId: OWNER, step: 2, termsAccepted: false, now: NOW }),
    ).rejects.toMatchObject({ code: 'TERMS_NOT_ACCEPTED' })
    expect(calls).toEqual([])
  })

  it('🛑 mutation: ถอดด่าน OWNER (ปล่อยให้ ShopMember ADMIN ผ่าน) → เคสนี้ต้องแดง', async () => {
    shopFindFirst.mockResolvedValue({ userId: 'someone-else', vertical: 'LODGING' })
    await expect(
      subscribeInspectionPlan({ shopId: SHOP, userId: OWNER, step: 2, termsAccepted: true, now: NOW }),
    ).rejects.toMatchObject({ code: 'NOT_SHOP_OWNER' })
    expect(calls).toEqual([])
  })

  it('🛑 mutation: ถอดด่าน vertical → เคสนี้ต้องแดง', async () => {
    shopFindFirst.mockResolvedValue({ userId: OWNER, vertical: 'ONLINE_SALES' })
    await expect(
      subscribeInspectionPlan({ shopId: SHOP, userId: OWNER, step: 2, termsAccepted: true, now: NOW }),
    ).rejects.toMatchObject({ code: 'NOT_LODGING_SHOP' })
  })

  it('ร้านที่ถูกลบแล้วสมัครไม่ได้ (findFirst กรอง deletedAt ใน WHERE ไม่ใช่กรองทีหลัง)', async () => {
    shopFindFirst.mockResolvedValue(null)
    await expect(
      subscribeInspectionPlan({ shopId: SHOP, userId: OWNER, step: 2, termsAccepted: true, now: NOW }),
    ).rejects.toMatchObject({ code: 'SHOP_NOT_FOUND' })
    expect(shopFindFirst.mock.calls[0]?.[0]).toMatchObject({ where: { deletedAt: null } })
  })

  it('🛑 "เต็มแล้ว" กับ "ยังไม่เปิดรับ" ต้องเป็นคนละรหัส — mutation: ตอบ FULL ทั้งคู่ → แดง', async () => {
    // วันที่ทีมลืมตั้งโควตา ทุกขั้นจะขึ้นว่าเต็มทั้งที่ยังไม่มีใครสมัครสักคน แล้วไม่มีใคร
    // เอะใจไปสืบต่อ เพราะ "เต็ม" เป็นคำอธิบายที่ฟังขึ้นสมบูรณ์
    executeRaw.mockResolvedValue(0)
    quotaFindUnique.mockResolvedValue(null)
    await expect(
      subscribeInspectionPlan({ shopId: SHOP, userId: OWNER, step: 3, termsAccepted: true, now: NOW }),
    ).rejects.toMatchObject({ code: 'INTAKE_NOT_OPEN' })

    quotaFindUnique.mockResolvedValue({ id: 'q1' })
    await expect(
      subscribeInspectionPlan({ shopId: SHOP, userId: OWNER, step: 3, termsAccepted: true, now: NOW }),
    ).rejects.toMatchObject({ code: 'INTAKE_QUOTA_FULL' })
  })

  it('จองโควตาไม่ได้ = ไม่หักเงินเลย', async () => {
    executeRaw.mockResolvedValue(0)
    quotaFindUnique.mockResolvedValue({ id: 'q1' })
    await expect(
      subscribeInspectionPlan({ shopId: SHOP, userId: OWNER, step: 3, termsAccepted: true, now: NOW }),
    ).rejects.toThrow()
    expect(calls).not.toContain('deductCredit')
  })

  it('🛑 mutation: ลบ canceledAt/graceUntil/lapsedAt/lapsedReason ออกจาก update → เคสนี้ต้องแดง', async () => {
    // ร้านที่ LAPSED แล้วสมัครใหม่ ถ้าเหลือ graceUntil เก่าค้าง cron จะ LAPSE ให้ในคืนแรก
    // ทั้งที่เพิ่งจ่ายเงินมา — เงียบสนิท ไม่มี error ไม่มีอะไรบนหน้าจอฟ้อง
    await subscribeInspectionPlan({ shopId: SHOP, userId: OWNER, step: 1, termsAccepted: true, now: NOW })
    expect(planUpsert.mock.calls[0]?.[0]).toMatchObject({
      update: { canceledAt: null, graceUntil: null, lapsedAt: null, lapsedReason: null, status: 'ACTIVE' },
    })
  })

  it('ยอดที่หักกับยอดที่บันทึกในความยินยอมต้องเป็นจำนวนเดียวกัน', async () => {
    // 🛑 ถ้าสองค่านี้หลุดจากกัน หลักฐานที่เราจะใช้ตอนพิพาทจะระบุราคาคนละตัวกับที่หักจริง
    await subscribeInspectionPlan({ shopId: SHOP, userId: OWNER, step: 4, termsAccepted: true, now: NOW })
    const acceptedPrice = termsCreate.mock.calls[0]?.[0]?.data?.priceSnapshotBaht
    const chargedAmount = deductCredit.mock.calls[0]?.[1]
    expect(acceptedPrice).toBe(chargedAmount)
    expect(chargedAmount).toBe(999 + 3900)
  })
})

describe('changeInspectionPlanStep', () => {
  beforeEach(() => planFindUnique.mockResolvedValue({ step: 2, status: 'ACTIVE' }))

  it('🛑 mutation: ให้การลดขั้นจองโควตา/หักเงินด้วย → เคสนี้ต้องแดง', async () => {
    await changeInspectionPlanStep({ shopId: SHOP, userId: OWNER, toStep: 1, termsAccepted: false, now: NOW })
    expect(calls).not.toContain('quota.claim')
    expect(calls).not.toContain('deductCredit')
    expect(calls).not.toContain('terms.create')
  })

  it('🛑 mutation: ถอด recomputeExpiryForPlanStep → เคสนี้ต้องแดง (ทั้งขึ้นและลง)', async () => {
    // อายุผลตรวจบางข้อผูกกับขั้นของแผน — ไม่คิดใหม่ = ขายความถี่ที่ไม่ได้ส่งมอบ
    await changeInspectionPlanStep({ shopId: SHOP, userId: OWNER, toStep: 4, termsAccepted: true, now: NOW })
    expect(calls).toContain('recomputeExpiry')
    expect(recomputeExpiryForPlanStep.mock.calls[0]?.[2]).toBe(4)

    calls = []
    planFindUnique.mockResolvedValue({ step: 4, status: 'ACTIVE' })
    await changeInspectionPlanStep({ shopId: SHOP, userId: OWNER, toStep: 2, termsAccepted: false, now: NOW })
    expect(calls).toContain('recomputeExpiry')
  })

  it('🛑 mutation: ให้ update เขียน nextRenewalAt ใหม่ → เคสนี้ต้องแดง', async () => {
    // รีเซ็ตรอบบิลตอนอัปเกรด = เก็บค่าเดือนสองครั้งในเดือนเดียว
    await changeInspectionPlanStep({ shopId: SHOP, userId: OWNER, toStep: 3, termsAccepted: true, now: NOW })
    const data = planUpdate.mock.calls[0]?.[0]?.data ?? {}
    expect(Object.keys(data)).not.toContain('nextRenewalAt')
    expect(Object.keys(data)).not.toContain('currentPeriodStart')
  })

  it('อัปเกรดต้องรับทราบเงื่อนไขใหม่เสมอ (AC-INS-10-3) — จำจากครั้งก่อนไม่ได้', async () => {
    await expect(
      changeInspectionPlanStep({ shopId: SHOP, userId: OWNER, toStep: 3, termsAccepted: false, now: NOW }),
    ).rejects.toMatchObject({ code: 'TERMS_NOT_ACCEPTED' })
  })

  it('แผนที่ไม่ ACTIVE เปลี่ยนขั้นไม่ได้ · ขั้นเดิมซ้ำต้องปฏิเสธ', async () => {
    planFindUnique.mockResolvedValue({ step: 2, status: 'LAPSED' })
    await expect(
      changeInspectionPlanStep({ shopId: SHOP, userId: OWNER, toStep: 3, termsAccepted: true, now: NOW }),
    ).rejects.toMatchObject({ code: 'PLAN_NOT_ACTIVE' })

    planFindUnique.mockResolvedValue({ step: 2, status: 'ACTIVE' })
    await expect(
      changeInspectionPlanStep({ shopId: SHOP, userId: OWNER, toStep: 2, termsAccepted: true, now: NOW }),
    ).rejects.toMatchObject({ code: 'STEP_UNCHANGED' })
  })
})

describe('cancelInspectionPlan', () => {
  const RENEWAL = new Date('2026-09-19T17:00:00.000Z')

  it('🛑 mutation: ให้ cancel เขียน status=LAPSED ทันที → เคสนี้ต้องแดง', async () => {
    // ร้านจ่ายค่ารอบนี้ไปแล้ว การตัดป้ายทันทีคือการยึดบริการที่เขาซื้อไปแล้วคืน (AC-INS-26-3)
    planFindUnique.mockResolvedValue({ status: 'ACTIVE', canceledAt: null, nextRenewalAt: RENEWAL })
    const res = await cancelInspectionPlan({ shopId: SHOP, userId: OWNER, now: NOW })
    const data = (planUpdate.mock.calls[0]?.[0]?.data ?? {}) as Record<string, unknown>
    expect(data).not.toHaveProperty('status')
    expect(res.effectiveAt).toEqual(RENEWAL)
  })

  it('🛑 mutation: ไม่เขียน lapsedReason ตอนแจ้งยกเลิก → เคสนี้ต้องแดง', async () => {
    // ถ้าไม่บันทึกเจตนาตรงนี้ ตัวตัดรอบบิลจะเห็นแค่ "แผนนี้ไม่ต่ออายุ" แล้วเขียน RENEWAL_FAILED
    // ให้คนที่ตั้งใจเลิก = บอกร้านว่าเขาค้างชำระทั้งที่เขาไม่ได้ค้าง
    planFindUnique.mockResolvedValue({ status: 'ACTIVE', canceledAt: null, nextRenewalAt: RENEWAL })
    await cancelInspectionPlan({ shopId: SHOP, userId: OWNER, now: NOW })
    expect(planUpdate.mock.calls[0]?.[0]?.data).toMatchObject({
      canceledAt: NOW,
      lapsedReason: 'OWNER_CANCELLED',
    })
  })

  it('🛑 กดยกเลิกซ้ำ → PLAN_ALREADY_CANCELED และต้องไม่เขียนทับวันที่เดิม', async () => {
    // เขียนทับได้เมื่อไร วันสิ้นสุดที่ร้านเห็นจะเลื่อนออกไปทุกครั้งที่กด
    planFindUnique.mockResolvedValue({
      status: 'ACTIVE',
      canceledAt: new Date('2026-08-20T00:00:00.000Z'),
      nextRenewalAt: RENEWAL,
    })
    await expect(cancelInspectionPlan({ shopId: SHOP, userId: OWNER, now: NOW })).rejects.toMatchObject({
      code: 'PLAN_ALREADY_CANCELED',
    })
    expect(planUpdate).not.toHaveBeenCalled()
  })
})

describe('ด่านสิทธิ์ + ด่านประเภทร้าน', () => {
  it('🛑 mutation: สลับให้เช็คเจ้าของก่อนประเภทร้าน → เคสนี้ต้องแดง (API §4.2)', async () => {
    // ร้านประเภทอื่นที่ยิงตรงเข้ามาต้องได้คำตอบที่ตรงกับความจริงเสมอ ไม่ใช่ถูกไล่ไปหาสาเหตุผิดทาง
    shopFindFirst.mockResolvedValue({ userId: 'someone-else', vertical: 'ONLINE_SALES' })
    await expect(
      subscribeInspectionPlan({ shopId: SHOP, userId: OWNER, step: 2, termsAccepted: true, now: NOW }),
    ).rejects.toMatchObject({ code: 'NOT_LODGING_SHOP' })
  })

  it('ร้านบ้านพักแต่ไม่ใช่เจ้าของ → NOT_SHOP_OWNER', async () => {
    shopFindFirst.mockResolvedValue({ userId: 'someone-else', vertical: 'LODGING' })
    await expect(
      subscribeInspectionPlan({ shopId: SHOP, userId: OWNER, step: 2, termsAccepted: true, now: NOW }),
    ).rejects.toMatchObject({ code: 'NOT_SHOP_OWNER' })
  })

  it('🛑 mutation: ปล่อยให้สมัครทับแผนที่ยัง ACTIVE → เคสนี้ต้องแดง', async () => {
    // upsert จะรีเซ็ตรอบบิลแล้วเก็บเงินรอบใหม่ทับของที่ร้านจ่ายไปแล้ว โดยหน้าจอขึ้นว่าสำเร็จ
    planFindUnique.mockResolvedValue({ status: 'ACTIVE' })
    await expect(
      subscribeInspectionPlan({ shopId: SHOP, userId: OWNER, step: 2, termsAccepted: true, now: NOW }),
    ).rejects.toMatchObject({ code: 'PLAN_ALREADY_EXISTS' })
    expect(calls).toEqual([])
  })

  it('ร้านที่ LAPSED แล้วกลับมาสมัครใหม่ ยังทำได้ตามเดิม (เป็นการเริ่มรอบใหม่จริง)', async () => {
    planFindUnique.mockResolvedValue({ status: 'LAPSED' })
    await expect(
      subscribeInspectionPlan({ shopId: SHOP, userId: OWNER, step: 2, termsAccepted: true, now: NOW }),
    ).resolves.toMatchObject({ planId: 'plan-1' })
  })

  it('🛑 mutation: ถอด upgradeOnly ให้ /upgrade ลดขั้นได้เงียบ ๆ → เคสนี้ต้องแดง', async () => {
    planFindUnique.mockResolvedValue({ step: 4, status: 'ACTIVE' })
    await expect(
      changeInspectionPlanStep({
        shopId: SHOP, userId: OWNER, toStep: 2, termsAccepted: true, upgradeOnly: true, now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STEP_TRANSITION' })
    expect(calls).not.toContain('plan.update')
  })
})

describe('renewOrLapseInspectionPlan', () => {
  it('🛑 mutation: ย้ายการเช็ค canceledAt ไปหลังการหักเงิน → เคสนี้ต้องแดง', async () => {
    // เก็บเงินร้านที่กดยกเลิกไปแล้ว = เก็บเงินโดยไม่มีสิทธิ์ ไม่ใช่บั๊กแสดงผล
    planFindUnique.mockResolvedValue({
      step: 2, status: 'ACTIVE',
      nextRenewalAt: new Date(NOW.getTime() - 1000),
      canceledAt: new Date('2026-08-20T00:00:00.000Z'), graceUntil: null,
    })
    const res = await renewOrLapseInspectionPlan(SHOP, NOW)
    expect(res).toEqual({ action: 'LAPSED', reason: 'OWNER_CANCELLED' })
    expect(calls).not.toContain('deductCredit')
  })

  it('ยังไม่ถึงรอบ = ไม่แตะอะไรเลย', async () => {
    planFindUnique.mockResolvedValue({
      step: 2, status: 'ACTIVE',
      nextRenewalAt: new Date(NOW.getTime() + 86_400_000), canceledAt: null, graceUntil: null,
    })
    expect(await renewOrLapseInspectionPlan(SHOP, NOW)).toEqual({ action: 'NOOP' })
    expect(calls).toEqual([])
  })

  it('ถึงรอบ + เครดิตพอ = ต่ออายุและล้าง graceUntil', async () => {
    planFindUnique.mockResolvedValue({
      step: 2, status: 'ACTIVE',
      nextRenewalAt: new Date(NOW.getTime() - 1000), canceledAt: null, graceUntil: null,
    })
    expect(await renewOrLapseInspectionPlan(SHOP, NOW)).toEqual({ action: 'RENEWED' })
    expect(planUpdate.mock.calls[0]?.[0]?.data).toMatchObject({ graceUntil: null, lastRenewalAt: NOW })
  })

  it('เครดิตไม่พอครั้งแรก = เริ่มนับผ่อนผัน ยังไม่ตัดป้าย', async () => {
    planFindUnique.mockResolvedValue({
      step: 2, status: 'ACTIVE',
      nextRenewalAt: new Date(NOW.getTime() - 1000), canceledAt: null, graceUntil: null,
    })
    deductCredit.mockRejectedValue(new Error('INSUFFICIENT_CREDIT'))
    expect(await renewOrLapseInspectionPlan(SHOP, NOW)).toEqual({ action: 'GRACE_STARTED' })
    expect(planUpdate.mock.calls[0]?.[0]?.data?.graceUntil).toBeInstanceOf(Date)
  })

  it('🛑 mutation: ให้ catch กลืน error ทุกชนิด → เคสนี้ต้องแดง', async () => {
    // ฐานข้อมูลล่มแล้วถูกตีความว่า "ร้านนี้เครดิตไม่พอ" = เริ่มนับผ่อนผันให้ทั้งกระดานพร้อมกัน
    // แล้วอีก 7 วันร้านที่จ่ายเงินครบทุกรายจะถูกตัดป้ายพร้อมกัน โดย error rate เป็น 0 สวยงาม
    planFindUnique.mockResolvedValue({
      step: 2, status: 'ACTIVE',
      nextRenewalAt: new Date(NOW.getTime() - 1000), canceledAt: null, graceUntil: null,
    })
    deductCredit.mockRejectedValue(new Error('P1001: Connection refused'))
    await expect(renewOrLapseInspectionPlan(SHOP, NOW)).rejects.toThrow('P1001')
  })

  it('พ้นเส้นตายผ่อนผันแล้วยังไม่พอ = LAPSED พร้อมเหตุผลที่แยกจากการยกเลิกเอง', async () => {
    planFindUnique.mockResolvedValue({
      step: 2, status: 'ACTIVE',
      nextRenewalAt: new Date(NOW.getTime() - 1000), canceledAt: null,
      graceUntil: new Date(NOW.getTime() - 1000),
    })
    deductCredit.mockRejectedValue(new Error('INSUFFICIENT_CREDIT'))
    expect(await renewOrLapseInspectionPlan(SHOP, NOW)).toEqual({ action: 'LAPSED', reason: 'RENEWAL_FAILED' })
  })
})

describe('seedIntakeQuota', () => {
  it('🛑 mutation: เปลี่ยนเป็น upsert ที่เขียนทับ capacity → เคสนี้ต้องแดง', async () => {
    // cron รันทุกวัน ถ้าเขียนทับ ค่าที่แอดมินปรับด้วยมือระหว่างเดือนจะถูกดีดกลับทุกคืน
    quotaFindUnique.mockResolvedValue({ id: 'q1' })
    expect(await seedIntakeQuota({ periodYearMonth: '2026-10', step: 3, capacity: 5 })).toEqual({ created: false })
    expect(quotaCreate).not.toHaveBeenCalled()

    quotaFindUnique.mockResolvedValue(null)
    expect(await seedIntakeQuota({ periodYearMonth: '2026-10', step: 3, capacity: 5 })).toEqual({ created: true })
    expect(quotaCreate.mock.calls[0]?.[0]?.data).toMatchObject({ capacity: 5, usedCount: 0 })
  })
})

describe('รหัสข้อผิดพลาดต้องเป็นชนิดที่ route แยกได้', () => {
  it('InspectionPlanError พก code ติดตัวเสมอ ไม่ต้องอ่านจากข้อความ', () => {
    const e = new InspectionPlanError('INTAKE_QUOTA_FULL')
    expect(e.code).toBe('INTAKE_QUOTA_FULL')
    expect(e).toBeInstanceOf(Error)
  })
})
