/**
 * tests/orders/backdated-order-date.test.ts
 *
 * Integration test: วันที่คำสั่งซื้อย้อนหลัง (feature 00033) — ครอบทั้งเส้นทางจริง
 * createOrder → OrderEvent(ORDER_CREATED) → updateOrder → OrderEvent(ORDER_DATE_CHANGED)
 *
 * ทำไมต้องเช็ค occurredAt คู่กับ createdAt เสมอ (ไม่ใช่แค่ createdAt): occurredAt ของ
 * OrderEvent ต้องเป็น "เวลาที่มีคนกดจริง" ไม่ใช่ "วันที่คำสั่งซื้อที่กรอกย้อนหลัง" — ถ้าโค้ด
 * สลับสองค่านี้ ประวัติคำสั่งซื้อจะโกหกว่ามีคนกดตอนตี 3 เมื่อ 30 วันก่อน ทั้งที่จริงกดตอนนี้
 * เคสที่ 1 ด้านล่างเป็นด่านเดียวที่จับข้อผิดพลาดแบบนี้ได้ (ดู task-12-brief.md)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createOrder, updateOrder, OrderDateOutOfWindowError } from '@/services/order.service'
import { orderPeriodTH } from '@/lib/format-date'
import { formatOrderNo } from '@/lib/order-no'
import { deleteTestData } from '../setup'

const createdUserIds: string[] = []
const createdShopIds: string[] = []

let shopId: string

// fixture: user + shop จริง (ไม่ mock) — เก็บ id ทุกตัวที่สร้างไว้ล้างใน afterAll ตาม
// Hard Rule 13 (deleteTestData ที่ผูกกับ id ที่เทสสร้างเองเท่านั้น)
beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      displayName: 'ผู้ขายทดสอบ (backdated-order-date)',
      username: `test_backdate_seller_${Date.now()}`,
      isShop: true,
    },
  })
  createdUserIds.push(user.id)

  const shop = await prisma.shop.create({
    data: { userId: user.id, shopName: 'ร้านทดสอบวันที่ย้อนหลัง', businessType: 'INDIVIDUAL' },
  })
  createdShopIds.push(shop.id)
  shopId = shop.id
})

afterAll(async () => {
  await deleteTestData({ userIds: createdUserIds, shopIds: createdShopIds })
})

describe('วันที่คำสั่งซื้อย้อนหลัง (00033)', () => {
  it('createOrder ที่ลงวันที่ย้อนหลัง — createdAt/orderNo/occurredAt/meta ตรงกันครบ 4 ค่า', async () => {
    const backdated = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const before = Date.now()

    // type DIGITAL หลีกเลี่ยง FR-6.5 (SHIPPED บังคับที่อยู่จัดส่ง) ซึ่งไม่ใช่จุดที่เทสนี้สนใจ
    const order = await createOrder(shopId, {
      items: [{ name: 'คอร์สออนไลน์', qty: 1, price: 390 }],
      type: 'DIGITAL',
      buyerContact: '0899990001',
      createdAt: backdated,
    })

    // 1) createdAt = ค่าที่ส่งไปเป๊ะ
    expect(order.createdAt.getTime()).toBe(backdated.getTime())

    // 2) orderNo ใช้ปี/เดือนของ "วันที่ที่เลือก" ไม่ใช่วันนี้
    const row = await prisma.order.findUnique({ where: { id: order.id }, select: { orderNo: true } })
    expect(row?.orderNo).toContain(String(backdated.getFullYear() + 543))
    expect(row?.orderNo).toBe(formatOrderNo(order.publicToken, backdated))

    const event = await prisma.orderEvent.findFirst({
      where: { orderId: order.id, type: 'ORDER_CREATED' },
      select: { occurredAt: true, meta: true },
    })
    expect(event).toBeTruthy()

    // 3) [สำคัญ] occurredAt = เวลาจริงที่กด ไม่ใช่ค่าที่ส่งไป — ด่านเดียวที่จับบั๊กนี้ได้
    expect(event!.occurredAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(event!.occurredAt.getTime()).not.toBe(backdated.getTime())

    // 4) วันที่สั่งซื้อจริงถูกเก็บไว้ใน meta
    expect((event!.meta as { orderedAt?: string }).orderedAt).toBe(backdated.toISOString())
  })

  it('ออเดอร์ปกติ (ไม่ส่ง createdAt) — meta ไม่มี orderedAt และพฤติกรรมเดิมทุกอย่าง', async () => {
    const order = await createOrder(shopId, {
      items: [{ name: 'ถุงเท้า', qty: 1, price: 150 }],
      type: 'DIGITAL',
      buyerContact: '0899990002',
    })
    const event = await prisma.orderEvent.findFirst({
      where: { orderId: order.id, type: 'ORDER_CREATED' },
      select: { meta: true },
    })
    expect(event).toBeTruthy()
    // ไม่ส่ง createdAt = ไม่ใช่การลงย้อนหลัง → ไม่มีคีย์ orderedAt เลย (ไม่ใช่แค่ undefined ค่า)
    expect(Object.prototype.hasOwnProperty.call(event!.meta as object, 'orderedAt')).toBe(false)
  })

  it('วันที่นอกช่วง (ย้อน 200 วัน) → OrderDateOutOfWindowError ไม่ใช่บันทึกผ่าน', async () => {
    await expect(
      createOrder(shopId, {
        items: [{ name: 'x', qty: 1, price: 1 }],
        type: 'DIGITAL',
        buyerContact: '0899990003',
        createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
      }),
    ).rejects.toBeInstanceOf(OrderDateOutOfWindowError)
  })

  it('updateOrder เปลี่ยนวันที่ข้ามเดือน — orderNo เปลี่ยนเดือน + ORDER_DATE_CHANGED + occurredAt ≈ now', async () => {
    const created = await createOrder(shopId, {
      items: [{ name: 'กระเป๋า', qty: 1, price: 990 }],
      type: 'DIGITAL',
      buyerContact: '0899990004',
    })
    // updateOrder แก้ได้เฉพาะออเดอร์ PENDING (default status ของ createOrder)
    expect(created.status).toBe('PENDING')

    // ย้อนไป 32 วัน — การันตีข้ามเดือนเสมอ (เดือนที่ยาวที่สุดมี 31 วัน) โดยไม่ผูกกับวันที่รันเทส
    const movedTo = new Date(created.createdAt.getTime() - 32 * 24 * 60 * 60 * 1000)
    const before = Date.now()

    const updated = await updateOrder(
      shopId,
      created.publicToken,
      {
        items: [{ name: 'กระเป๋า', qty: 1, price: 990 }],
        type: 'DIGITAL',
        buyerContact: '0899990004',
        createdAt: movedTo,
      },
      null, // actorUserId — ไม่มีผลต่อสิ่งที่เทสนี้ตรวจ
    )
    expect(updated.id).toBe(created.id)

    // orderNo recompute แล้วตามเดือนใหม่ (คำนวณจาก publicToken เดิม + createdAt ใหม่)
    const row = await prisma.order.findUnique({
      where: { id: created.id },
      select: { orderNo: true, createdAt: true },
    })
    expect(row?.createdAt.getTime()).toBe(movedTo.getTime())
    expect(row?.orderNo).toBe(formatOrderNo(created.publicToken, movedTo))
    // เดือนต้องต่างจากก่อนแก้จริง — ยืนยันว่าเทสนี้ทดสอบการ "ข้ามเดือน" จริง ไม่ใช่แค่เปลี่ยนวัน
    expect(orderPeriodTH(movedTo)).not.toBe(orderPeriodTH(created.createdAt))

    const event = await prisma.orderEvent.findFirst({
      where: { orderId: created.id, type: 'ORDER_DATE_CHANGED' },
      select: { occurredAt: true, meta: true },
    })
    expect(event).toBeTruthy()

    // occurredAt = เวลาจริงที่กดแก้ ไม่ใช่วันที่ใหม่ที่กรอก (เหมือนเคส createOrder)
    expect(event!.occurredAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(event!.occurredAt.getTime()).not.toBe(movedTo.getTime())

    const meta = event!.meta as { orderedAtFrom?: string; orderedAtTo?: string }
    expect(meta.orderedAtFrom).toBe(created.createdAt.toISOString())
    expect(meta.orderedAtTo).toBe(movedTo.toISOString())
  })
})
