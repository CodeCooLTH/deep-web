// [blocker] ลำดับงานของ cron แผนการตรวจสอบ (feature 00060 · T8)
//
// 🛑 สองข้อในไฟล์นี้ผิดแล้วเงียบสนิท ไม่มี error ไม่มี log ไม่มีใครรายงาน:
//    (1) เปิดรอบก่อนรันข้อตรวจอัตโนมัติ ⇒ อ่าน expiresAt ค่าเก่า แล้วเปิดรอบให้ข้อที่เพิ่งถูก
//        ยืนยันไปเมื่อกี้ = คิวผู้ตรวจบวมด้วยงานที่ไม่ต้องทำ
//    (2) ตรวจให้ร้านที่เพิ่งพ้นสถานะในรอบเดียวกัน = ให้บริการฟรีต่อไปเรื่อย ๆ

import { describe, expect, it, vi, beforeEach } from 'vitest'

const calls: string[] = []
/** งานแฮชรูปเป็นงานระดับระบบ (ไม่ผูกกับร้านใดร้านหนึ่ง) — เทสลำดับ "ต่อร้าน" จึงตัดออกก่อนเทียบ
 *  ลำดับของมันเทียบกับข้อตรวจอัตโนมัติมีเทสแยกของตัวเองด้านล่าง */
const perShopCalls = () => calls.filter((c) => c !== 'hashImages')
const planFindMany = vi.fn()
const quotaFindMany = vi.fn()
const renewOrLapse = vi.fn()
const runAutoChecks = vi.fn()
const createDueRounds = vi.fn()
const seedQuota = vi.fn()
const overdue = vi.fn()
const hashImages = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    inspectionPlan: { findMany: (...a: unknown[]) => planFindMany(...a) },
    inspectionIntakeQuota: { findMany: (...a: unknown[]) => quotaFindMany(...a) },
    $transaction: (fn: (c: unknown) => unknown) => fn({}),
  },
}))
vi.mock('@/services/inspection-plan.service', () => ({
  renewOrLapseInspectionPlan: (...a: unknown[]) => {
    calls.push('renew')
    return renewOrLapse(...a)
  },
  seedIntakeQuota: (...a: unknown[]) => seedQuota(...a),
}))
vi.mock('@/services/room-image-fingerprint.service', () => ({
  hashPendingRoomImages: (...a: unknown[]) => {
    calls.push('hashImages')
    return hashImages(...a)
  },
}))
vi.mock('@/services/inspection-auto-check.service', () => ({
  runAutomaticStep1Checks: (...a: unknown[]) => {
    calls.push('autoChecks')
    return runAutoChecks(...a)
  },
}))
vi.mock('@/services/inspection-round.service', () => ({
  createDueRoundsForShop: (...a: unknown[]) => {
    calls.push('createDueRounds')
    return createDueRounds(...a)
  },
  countOverdueRounds: (...a: unknown[]) => overdue(...a),
}))

const { GET } = await import('./route')

const req = (auth?: string) =>
  new Request('https://deepthailand.app/api/cron/inspection-lifecycle', {
    headers: auth === undefined ? {} : { authorization: auth },
  })

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  process.env.CRON_SECRET = 's3cret'
  planFindMany.mockResolvedValue([{ shopId: 'shop-1', step: 4 }])
  hashImages.mockResolvedValue({ hashed: 0, failed: 0, remaining: 0 })
  quotaFindMany.mockResolvedValue([{ step: 1, capacity: 10 }])
  renewOrLapse.mockResolvedValue({ action: 'RENEWED' })
  runAutoChecks.mockResolvedValue({ recorded: 5, changed: 1, skipped: {} })
  createDueRounds.mockResolvedValue(2)
  seedQuota.mockResolvedValue({ created: true })
  overdue.mockResolvedValue({ total: 0, buckets: [] })
})

describe('auth', () => {
  it('ไม่มี header / ผิด → 401 และต้องไม่แตะข้อมูลเลย', async () => {
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer wrong'))).status).toBe(401)
    expect(planFindMany).not.toHaveBeenCalled()
  })

  it('🛑 mutation: CRON_SECRET ว่างแล้วปล่อยผ่าน ("Bearer undefined") → เคสนี้ต้องแดง', async () => {
    delete process.env.CRON_SECRET
    expect((await GET(req('Bearer undefined'))).status).toBe(401)
    expect(planFindMany).not.toHaveBeenCalled()
  })
})

describe('ลำดับงาน', () => {
  it('🛑 mutation: ย้ายงานแฮชรูปไปหลังข้อตรวจอัตโนมัติ → เคสนี้ต้องแดง', async () => {
    // รูปที่เพิ่งอัปวันนี้ต้องมีลายนิ้วมือ **ก่อน** ถูกตรวจ ไม่งั้นห้องนั้นได้ "ยังไม่มีข้อมูล"
    // ไปอีกหนึ่งวันเต็มโดยไม่จำเป็น — และไม่มีอะไรฟ้องเลยเพราะทั้งสองงานสำเร็จตามปกติทั้งคู่
    await GET(req('Bearer s3cret'))
    expect(calls.indexOf('hashImages')).toBeGreaterThanOrEqual(0)
    expect(calls.indexOf('hashImages')).toBeLessThan(calls.indexOf('autoChecks'))
  })

  it('🛑 mutation: สลับให้เปิดรอบก่อนรันข้อตรวจอัตโนมัติ → เคสนี้ต้องแดง', async () => {
    await GET(req('Bearer s3cret'))
    expect(perShopCalls()).toEqual(['renew', 'autoChecks', 'createDueRounds'])
  })

  it('🛑 mutation: ตรวจ/เปิดรอบให้ร้านที่เพิ่งพ้นสถานะในรอบนี้ → เคสนี้ต้องแดง', async () => {
    renewOrLapse.mockResolvedValue({ action: 'LAPSED', reason: 'RENEWAL_FAILED' })
    const res = await GET(req('Bearer s3cret'))
    expect(perShopCalls()).toEqual(['renew'])
    expect(runAutoChecks).not.toHaveBeenCalled()
    expect(createDueRounds).not.toHaveBeenCalled()
    expect(await res.json()).toMatchObject({ lapsed: 1, autoCheckedShops: 0, roundsScheduled: 0 })
  })

  it('🛑 mutation: ถอด status ACTIVE ออกจาก WHERE → เคสนี้ต้องแดง (ร้านที่เลิกจ่ายจะถูกตรวจฟรีต่อ)', async () => {
    await GET(req('Bearer s3cret'))
    expect(planFindMany.mock.calls[0]?.[0]).toMatchObject({ where: { status: 'ACTIVE' } })
  })

  it('ร้านที่พังหนึ่งร้านต้องไม่ทำให้ทั้งรอบหยุด', async () => {
    planFindMany.mockResolvedValue([
      { shopId: 'shop-1', step: 2 },
      { shopId: 'shop-2', step: 2 },
    ])
    renewOrLapse.mockRejectedValueOnce(new Error('boom'))
    const body = await (await GET(req('Bearer s3cret'))).json()
    expect(body).toMatchObject({ plans: 2, errors: 1, autoCheckedShops: 1 })
  })
})

describe('โควตาเดือนถัดไป', () => {
  it('คัดลอก capacity ของเดือนปัจจุบัน', async () => {
    const body = await (await GET(req('Bearer s3cret'))).json()
    expect(seedQuota.mock.calls[0]?.[0]).toMatchObject({ step: 1, capacity: 10 })
    expect(body.quota).toMatchObject({ created: 1, sourceMissing: false })
  })

  it('🛑 mutation: เดือนปัจจุบันไม่มีแถวแล้วเดา capacity เอง → เคสนี้ต้องแดง', async () => {
    // เพดานที่ไม่มีใครตั้งใจ แย่กว่าการปิดรับที่มองเห็นได้จาก log
    quotaFindMany.mockResolvedValue([])
    const body = await (await GET(req('Bearer s3cret'))).json()
    expect(seedQuota).not.toHaveBeenCalled()
    expect(body.quota).toMatchObject({ created: 0, sourceMissing: true })
  })
})
