/**
 * [blocker] 00073 ภาคต่อ (FR-014) — ยอด "ยังไม่ปิดงาน" (สีเหลือง) ของร้านบริการ บนฐานจริง (localhost)
 * เคสจริง 2026-10-12: บิลที่ร้านเปิดโดยไม่ลงนัดและยังไม่กดปิดงาน "หาย" จากการ์ด — แก้ด้วยการแสดงผล ไม่แก้ข้อมูล
 *
 * ฉาก (ร้านบริการ · ต.ค. 2026):
 *   A ปิดงานแล้ว ฿3,000 (สร้าง 5 ต.ค. ปิด 6 ต.ค.)                    → ยอดขาย (เขียว)
 *   B ไม่มีนัด ยังไม่ปิด ฿8,000 (สร้าง 7 ต.ค.)                        → ยังไม่ปิดงาน (เหลือง)
 *   C ไม่มีนัด ยังไม่ปิด ฿1,000 (สร้าง 7 ก.ย.)                        → ช่วงก่อนหน้า (เทียบ %)
 *   D ยกเลิก ฿500 / E ร่าง ฿700 (สร้าง ต.ค.)                           → ไม่นับทั้งสองสี
 * ร้านขายของ: ไม่มีฟิลด์ unclosed เลย · values/total เดิม
 * ล้างเฉพาะของที่เทสสร้าง (Hard Rule 13)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deleteTestData, prisma } from '../setup'
import { getSalesSeries } from '@/services/dashboard.service'

const userIds: string[] = []
const shopIds: string[] = []
const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
const th = (iso: string, h = 12) => new Date(`${iso}T${String(h).padStart(2, '0')}:00:00+07:00`)
let svcShop = ''
let onlineShop = ''

beforeAll(async () => {
  const owner = await prisma.user.create({ data: { displayName: 'เจ้าของ', username: `unc_owner_${tag}`, isShop: true } })
  const owner2 = await prisma.user.create({ data: { displayName: 'เจ้าของ 2', username: `unc_owner2_${tag}`, isShop: true } })
  userIds.push(owner.id, owner2.id)
  const svc = await prisma.shop.create({ data: { userId: owner.id, shopName: 'ร้านบริการ', businessType: 'INDIVIDUAL', vertical: 'SERVICE_QUEUE' } })
  const online = await prisma.shop.create({ data: { userId: owner2.id, shopName: 'ร้านขายของ', businessType: 'INDIVIDUAL', vertical: 'ONLINE_SALES' } })
  shopIds.push(svc.id, online.id)
  svcShop = svc.id
  onlineShop = online.id
  const bill = (key: string, shopId: string, total: number, createdAt: Date, extra: Record<string, unknown> = {}) =>
    prisma.order.create({
      data: {
        publicToken: `unc-${tag}-${key}`, shopId, type: 'SERVICE', fulfillmentMode: 'NO_SHIPPING', totalAmount: total, createdAt,
        items: { create: [{ name: 'ล้างแอร์', qty: 1, price: total }] },
        ...extra,
      },
    })
  await bill('A', svc.id, 3000, th('2026-10-05'), { serviceClosedAt: th('2026-10-06'), status: 'PENDING' })
  await bill('B', svc.id, 8000, th('2026-10-07'))
  await bill('C', svc.id, 1000, th('2026-09-07'))
  await bill('D', svc.id, 500, th('2026-10-08'), { status: 'CANCELLED' })
  await bill('E', svc.id, 700, th('2026-10-08'), { status: 'DRAFTED' })
  await bill('P', online.id, 2000, th('2026-10-07'))
})
afterAll(async () => { await deleteTestData({ userIds, shopIds }) })

describe('getSalesSeries — ยังไม่ปิดงาน (FR-014)', () => {
  it('[blocker] ร้านบริการ: ยอดขาย (เขียว) เดิม · ยังไม่ปิดงาน (เหลือง) แยกช่อง ตามวันเปิดบิล', async () => {
    const s = await getSalesSeries(svcShop, 'daily', { year: 2026, month: 10 }, true, 'SERVICE_QUEUE')
    // ยอดขายไม่เปลี่ยนนิยาม — นับเฉพาะงานที่ปิดแล้ว ตามวันปิดงาน
    expect(s.total).toBe(3000)
    expect(s.values[5]).toBe(3000) // 6 ต.ค.
    // ยังไม่ปิดงาน: B เท่านั้น (ยกเลิก/ร่างไม่นับ) · วันที่ = วันเปิดบิล
    expect(s.unclosedTotal).toBe(8000)
    expect(s.unclosedCount).toBe(1)
    expect(s.unclosedValues?.[6]).toBe(8000) // 7 ต.ค.
    expect(s.unclosedValues?.reduce((a, b) => a + b, 0)).toBe(8000)
  })

  it('[blocker] ช่วงก่อนหน้า: C (ก.ย.) อยู่ใน prevUnclosedToDate ไม่ปนเดือนนี้', async () => {
    const s = await getSalesSeries(svcShop, 'daily', { year: 2026, month: 9 }, false, 'SERVICE_QUEUE')
    expect(s.unclosedTotal).toBe(1000)
    const oct = await getSalesSeries(svcShop, 'daily', { year: 2026, month: 10 }, false, 'SERVICE_QUEUE')
    // เดือนที่ผ่านมาแล้วทั้งเดือน (futureFromIndex = ทั้งเดือน) ⇒ prevUnclosedToDate = ยอด ก.ย. ทั้งก้อน
    expect(oct.prevUnclosedToDate).toBe(1000)
  })

  it('[blocker] ร้านขายของ: ไม่มีฟิลด์ยังไม่ปิดงาน · ยอดเดิม (รวมรอยืนยัน)', async () => {
    const s = await getSalesSeries(onlineShop, 'daily', { year: 2026, month: 10 }, false, 'ONLINE_SALES')
    expect(s.unclosedValues).toBeUndefined()
    expect(s.unclosedTotal).toBeUndefined()
    expect(s.total).toBe(2000)
  })
})
