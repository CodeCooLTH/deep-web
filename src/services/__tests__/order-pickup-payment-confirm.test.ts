/**
 * setHandedOver/clearHandedOver/setPaymentConfirmed/clearPaymentConfirmed (feature 00062, U8/U9)
 *
 * mocked-prisma unit test (pattern เดียวกับ order-service-shop-channel.test.ts) — ไม่แตะ DB จริง
 * (HR13/HR14: เวิร์กทรีนี้ไม่มีฐาน local รันอยู่)
 *
 * ทำไม vi.hoisted: vi.mock ถูก hoist ขึ้นบนสุดของไฟล์ก่อน const declaration ปกติ — ประกาศ db
 * ด้วย const ธรรมดาแล้วอ้างใน factory จะชน TDZ (ReferenceError)
 *
 * `$transaction` mock เรียก callback ด้วย `db` ตัวเดียวกัน (tx === db) เพื่อให้ยืนยัน
 * `db.orderEvent.create` / `db.order.update` ถูกเรียกด้วย argument ที่ต้องการได้ตรง ๆ
 * — `recordOrderEvent()` เป็นฟังก์ชันจริง (ไม่ mock) เรียก `tx.user.findUnique` +
 * `tx.orderEvent.create` จริง ต้อง mock ทั้งคู่
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn(), update: vi.fn() },
  orderEvent: { create: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import {
  setHandedOver,
  clearHandedOver,
  setPaymentConfirmed,
  clearPaymentConfirmed,
  OrderNotPickupError,
  OrderHandoverNotPendingError,
  OrderHandoverAlreadyClosedError,
  PaymentConfirmNotEligibleError,
} from '@/services/order.service'

const PICKUP_PENDING = {
  id: 'order-1',
  status: 'PENDING',
  fulfillmentMode: 'PICKUP',
  shop: { vertical: 'ONLINE_SALES' },
}

const TRANSFER_ONLINE = {
  id: 'order-2',
  status: 'PENDING',
  paymentMethod: 'TRANSFER',
  shop: { vertical: 'ONLINE_SALES' },
}

beforeEach(() => {
  vi.clearAllMocks()
  db.$transaction.mockImplementation(async (cb: any) => cb(db))
  db.user.findUnique.mockResolvedValue(null) // ไม่มี actor snapshot — ไม่ใช่จุดที่เทสชุดนี้สนใจ
  db.orderEvent.create.mockResolvedValue({})
})

describe('setHandedOver (feature 00062, U8)', () => {
  it('POST สำเร็จ — ตั้ง handedOverAt/handedOverByUserId + เขียน OrderEvent(HANDED_OVER) ในทรานแซกชันเดียวกัน', async () => {
    db.order.findUnique.mockResolvedValue(PICKUP_PENDING)
    db.order.update.mockResolvedValue({ id: 'order-1', handedOverAt: new Date('2026-08-28T10:00:00Z') })

    const result = await setHandedOver('order-1', 'user-1')

    expect(result.handedOverAt).toBeInstanceOf(Date)
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { handedOverAt: expect.any(Date), handedOverByUserId: 'user-1' },
      select: { id: true, handedOverAt: true },
    })
    // มติ ก: ต้องเขียน OrderEvent เสมอ — ลบการเรียกนี้ออกต้องทำให้เทสนี้แดง
    expect(db.orderEvent.create).toHaveBeenCalledTimes(1)
    expect(db.orderEvent.create.mock.calls[0]![0].data.type).toBe('HANDED_OVER')
    expect(db.orderEvent.create.mock.calls[0]![0].data.orderId).toBe('order-1')
  })

  it('มติ ง: การ update ต้องไม่แตะ Order.status เลย (คนละแกนกับ "ลูกค้าได้ของแล้ว")', async () => {
    db.order.findUnique.mockResolvedValue(PICKUP_PENDING)
    db.order.update.mockResolvedValue({ id: 'order-1', handedOverAt: new Date() })

    await setHandedOver('order-1', 'user-1')

    const updateArgs = db.order.update.mock.calls[0]![0]
    expect(Object.keys(updateArgs.data)).not.toContain('status')
  })

  it('กดซ้ำ — ไม่ throw, เขียนทับ handedOverAt ใหม่ และยัง insert OrderEvent ใหม่ทุกครั้ง (TFR-003)', async () => {
    const alreadyHanded = { ...PICKUP_PENDING }
    db.order.findUnique.mockResolvedValue(alreadyHanded)
    db.order.update.mockResolvedValue({ id: 'order-1', handedOverAt: new Date() })

    await setHandedOver('order-1', 'user-1')
    await setHandedOver('order-1', 'user-1')

    expect(db.order.update).toHaveBeenCalledTimes(2)
    expect(db.orderEvent.create).toHaveBeenCalledTimes(2)
  })

  it('มติ ข: fulfillmentMode ไม่ใช่ PICKUP → OrderNotPickupError (400 NOT_PICKUP_ORDER) ไม่เขียนอะไรเลย', async () => {
    db.order.findUnique.mockResolvedValue({ ...PICKUP_PENDING, fulfillmentMode: 'SHIPPED' })

    await expect(setHandedOver('order-1', 'user-1')).rejects.toBeInstanceOf(OrderNotPickupError)
    expect(db.order.update).not.toHaveBeenCalled()
    expect(db.orderEvent.create).not.toHaveBeenCalled()
  })

  it('มติ ข (ด่าน vertical): shop.vertical ไม่ใช่ ONLINE_SALES แม้ fulfillmentMode=PICKUP → OrderNotPickupError — ถอดด่านนี้ต้องทำให้เทสนี้แดง', async () => {
    db.order.findUnique.mockResolvedValue({
      ...PICKUP_PENDING,
      shop: { vertical: 'SERVICE_QUEUE' },
    })

    await expect(setHandedOver('order-1', 'user-1')).rejects.toBeInstanceOf(OrderNotPickupError)
    expect(db.order.update).not.toHaveBeenCalled()
  })

  it('status ไม่ใช่ PENDING → OrderHandoverNotPendingError (409 ORDER_NOT_PENDING)', async () => {
    db.order.findUnique.mockResolvedValue({ ...PICKUP_PENDING, status: 'CONFIRMED' })

    await expect(setHandedOver('order-1', 'user-1')).rejects.toBeInstanceOf(OrderHandoverNotPendingError)
    expect(db.order.update).not.toHaveBeenCalled()
  })
})

describe('clearHandedOver (feature 00062, U8)', () => {
  it('DELETE สำเร็จ — ล้าง handedOverAt/handedOverByUserId เป็นคู่ + เขียน OrderEvent(HANDOVER_REVERTED)', async () => {
    db.order.findUnique.mockResolvedValue({ id: 'order-1', status: 'PENDING' })
    db.order.update.mockResolvedValue({ id: 'order-1', handedOverAt: null })

    const result = await clearHandedOver('order-1', 'user-1')

    expect(result.handedOverAt).toBeNull()
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { handedOverAt: null, handedOverByUserId: null },
      select: { id: true, handedOverAt: true },
    })
    expect(db.orderEvent.create.mock.calls[0]![0].data.type).toBe('HANDOVER_REVERTED')
  })

  it('ออเดอร์ปิดไปแล้ว (CONFIRMED) → OrderHandoverAlreadyClosedError (409 ORDER_ALREADY_CLOSED) ไม่ล้างอะไรเลย', async () => {
    db.order.findUnique.mockResolvedValue({ id: 'order-1', status: 'CONFIRMED' })

    await expect(clearHandedOver('order-1', 'user-1')).rejects.toBeInstanceOf(OrderHandoverAlreadyClosedError)
    expect(db.order.update).not.toHaveBeenCalled()
    expect(db.orderEvent.create).not.toHaveBeenCalled()
  })
})

describe('setPaymentConfirmed (feature 00062, U9)', () => {
  it('POST สำเร็จ — ตั้ง paymentConfirmedAt/paymentConfirmedByUserId + เขียน OrderEvent(PAYMENT_CONFIRMED)', async () => {
    db.order.findUnique.mockResolvedValue(TRANSFER_ONLINE)
    db.order.update.mockResolvedValue({ id: 'order-2', paymentConfirmedAt: new Date() })

    const result = await setPaymentConfirmed('order-2', 'user-1')

    expect(result.paymentConfirmedAt).toBeInstanceOf(Date)
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-2' },
      data: { paymentConfirmedAt: expect.any(Date), paymentConfirmedByUserId: 'user-1' },
      select: { id: true, paymentConfirmedAt: true },
    })
    // มติ ก: ลบการเรียก recordOrderEvent ต้องทำให้เทสนี้แดง
    expect(db.orderEvent.create).toHaveBeenCalledTimes(1)
    expect(db.orderEvent.create.mock.calls[0]![0].data.type).toBe('PAYMENT_CONFIRMED')
  })

  it('มติ ง: การ update ต้องไม่แตะ Order.status เลย', async () => {
    db.order.findUnique.mockResolvedValue(TRANSFER_ONLINE)
    db.order.update.mockResolvedValue({ id: 'order-2', paymentConfirmedAt: new Date() })

    await setPaymentConfirmed('order-2', 'user-1')

    const updateArgs = db.order.update.mock.calls[0]![0]
    expect(Object.keys(updateArgs.data)).not.toContain('status')
  })

  it.each(['COD', 'เก็บเงินปลายทาง', 'ปลายทาง'])(
    'มติ ค: paymentMethod=%s (COD) → PaymentConfirmNotEligibleError (400) — ถอดด่านนี้ต้องทำให้เทสนี้แดง',
    async (codLikeMethod) => {
      db.order.findUnique.mockResolvedValue({ ...TRANSFER_ONLINE, paymentMethod: codLikeMethod })

      await expect(setPaymentConfirmed('order-2', 'user-1')).rejects.toBeInstanceOf(
        PaymentConfirmNotEligibleError,
      )
      expect(db.order.update).not.toHaveBeenCalled()
      expect(db.orderEvent.create).not.toHaveBeenCalled()
    },
  )

  it.each(['PROMPTPAY', 'CASH', 'พร้อมเพย์ 081-234-5678'])(
    'paymentMethod=%s (ไม่ใช่ COD) → ผ่านด่าน ไม่ throw',
    async (method) => {
      db.order.findUnique.mockResolvedValue({ ...TRANSFER_ONLINE, paymentMethod: method })
      db.order.update.mockResolvedValue({ id: 'order-2', paymentConfirmedAt: new Date() })

      await expect(setPaymentConfirmed('order-2', 'user-1')).resolves.toBeDefined()
    },
  )

  it('shop.vertical ไม่ใช่ ONLINE_SALES (เช่น SERVICE_QUEUE ที่มี OrderPayment ของ 00050 อยู่แล้ว) → PaymentConfirmNotEligibleError', async () => {
    db.order.findUnique.mockResolvedValue({ ...TRANSFER_ONLINE, shop: { vertical: 'SERVICE_QUEUE' } })

    await expect(setPaymentConfirmed('order-2', 'user-1')).rejects.toBeInstanceOf(
      PaymentConfirmNotEligibleError,
    )
    expect(db.order.update).not.toHaveBeenCalled()
  })

  it('status=CANCELLED → PaymentConfirmNotEligibleError', async () => {
    db.order.findUnique.mockResolvedValue({ ...TRANSFER_ONLINE, status: 'CANCELLED' })

    await expect(setPaymentConfirmed('order-2', 'user-1')).rejects.toBeInstanceOf(
      PaymentConfirmNotEligibleError,
    )
  })
})

describe('clearPaymentConfirmed (feature 00062, U9)', () => {
  it('DELETE สำเร็จ — ล้างเป็นคู่ + เขียน OrderEvent(PAYMENT_CONFIRM_REVERTED)', async () => {
    db.order.findUnique.mockResolvedValue({ id: 'order-2', status: 'PENDING' })
    db.order.update.mockResolvedValue({ id: 'order-2', paymentConfirmedAt: null })

    const result = await clearPaymentConfirmed('order-2', 'user-1')

    expect(result.paymentConfirmedAt).toBeNull()
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: 'order-2' },
      data: { paymentConfirmedAt: null, paymentConfirmedByUserId: null },
      select: { id: true, paymentConfirmedAt: true },
    })
    expect(db.orderEvent.create.mock.calls[0]![0].data.type).toBe('PAYMENT_CONFIRM_REVERTED')
  })

  it('ทำได้ทุกสถานะที่ไม่ CANCELLED (mirror codReceivedAt เดิม) — เช่น SHIPPED/CONFIRMED ก็ undo ได้', async () => {
    db.order.findUnique.mockResolvedValue({ id: 'order-2', status: 'CONFIRMED' })
    db.order.update.mockResolvedValue({ id: 'order-2', paymentConfirmedAt: null })

    await expect(clearPaymentConfirmed('order-2', 'user-1')).resolves.toBeDefined()
  })

  it('status=CANCELLED → PaymentConfirmNotEligibleError ไม่ล้างอะไรเลย', async () => {
    db.order.findUnique.mockResolvedValue({ id: 'order-2', status: 'CANCELLED' })

    await expect(clearPaymentConfirmed('order-2', 'user-1')).rejects.toBeInstanceOf(
      PaymentConfirmNotEligibleError,
    )
    expect(db.order.update).not.toHaveBeenCalled()
    expect(db.orderEvent.create).not.toHaveBeenCalled()
  })
})

/**
 * 🛑 กดซ้ำ = ไม่ทำอะไร ครั้งแรกชนะ (BRD FR-PKP-03 AC "กดซ้ำไม่ได้" + TestCase TC-PKP-11)
 *
 * เคสนี้ถูกเติมเข้ามาหลังพบว่า mutation "ถอด guard กดซ้ำออก" **ยังเขียว** — แปลว่าชุดข้อมูล
 * ทดสอบเดิมไม่มี input ที่ทำให้บั๊กโผล่เลย ไม่ใช่ว่า mutation ไม่เกี่ยว
 * (docs/conventions/mutation-silence-means-weak-corpus.md)
 *
 * ทำไมต้องกัน: ถ้าเขียนทับเวลาใหม่ **นาฬิกา 48 ชม. เริ่มนับใหม่ทุกครั้งที่กด** ⇒ ดับเบิลคลิก
 * โดยไม่ตั้งใจเลื่อนการปิดงานออกไปเงียบ ๆ และไทม์ไลน์ได้แถวซ้ำที่ไม่ได้บอกอะไรใหม่
 */
describe('[blocker] กดซ้ำต้องไม่เขียนทับ/ไม่สร้าง event ซ้ำ (feature 00062)', () => {
  it('setHandedOver ครั้งที่สอง — คืนเวลาเดิม ไม่เรียก update ไม่เขียน event', async () => {
    const first = new Date('2026-08-28T10:00:00Z')
    db.order.findUnique.mockResolvedValue({ ...PICKUP_PENDING, handedOverAt: first })

    const r = await setHandedOver('order-1', 'user-1')

    expect(r.handedOverAt).toEqual(first)
    expect(db.order.update).not.toHaveBeenCalled()
    expect(db.orderEvent.create).not.toHaveBeenCalled()
  })

  it('setPaymentConfirmed ครั้งที่สอง — คืนเวลาเดิม ไม่เรียก update ไม่เขียน event', async () => {
    const first = new Date('2026-08-28T11:00:00Z')
    db.order.findUnique.mockResolvedValue({ ...TRANSFER_ONLINE, paymentConfirmedAt: first })

    const r = await setPaymentConfirmed('order-2', 'user-1')

    expect(r.paymentConfirmedAt).toEqual(first)
    expect(db.order.update).not.toHaveBeenCalled()
    expect(db.orderEvent.create).not.toHaveBeenCalled()
  })
})
