/**
 * [blocker] `guaranteeOrderLink()` — การ claim ออเดอร์ต้องไม่ล้มเพราะ instrumentation
 *
 * ทำไมไฟล์นี้ต้องมีก่อนแตะโค้ด: ฟังก์ชันนี้คือหัวใจของระบบ claim ทั้งระบบ และมันถูกห่อด้วย
 * try/catch ที่ **กลืน error ทุกชนิดโดยเจตนา** (best-effort) ⇒ ถ้าทำพัง มันจะพังเงียบ 100%
 * ไม่มี error ไม่มี log ที่ใครสังเกต ผลที่ตามมาคือ `Order.buyerUserId` ไม่ถูกตั้ง = ผู้ซื้อ
 * login สำเร็จแต่ระบบไม่รู้ว่าเขาเป็นเจ้าของออเดอร์ = ย้อนกลับไปที่ `BUYER_CONFIRMED = 0`
 * ซึ่งคือปัญหาที่ทั้งฟีเจอร์ 00041 ตั้งใจแก้ตั้งแต่แรก
 *
 * เทสชุดนี้เขียน **ก่อน** เพิ่ม instrumentation (SRS TFR-013) เพื่อมัดพฤติกรรมเดิมไว้ แล้วค่อย
 * เพิ่มเคสของ instrumentation ต่อท้าย — ไม่ใช่เขียนตามหลังแล้วเดาว่าของเดิมทำอะไร
 *
 * 🛑 แดง = ห้าม merge
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// tx ที่ $transaction ส่งเข้า callback — pattern เดียวกับ account-deletion.service.test.ts
const tx = {
  customer: { findUnique: vi.fn(), update: vi.fn() },
  order: { updateMany: vi.fn() },
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}))

// findOrCreateCustomer อยู่คนละ service — mock ไว้ไม่ให้ลาก dependency ทั้งสายเข้ามา
vi.mock('@/services/customer.service', () => ({
  findOrCreateCustomer: vi.fn(async () => 'cus_1'),
}))

const recordOrderEvent = vi.fn()
vi.mock('@/services/order-event.service', () => ({
  recordOrderEvent: (...a: unknown[]) => recordOrderEvent(...a),
}))

import { prisma } from '@/lib/prisma'
import { guaranteeOrderLink } from '@/services/order-access.service'

const ORDER_ID = 'ord_1'
const USER_ID = 'usr_1'
const PHONE = '0812345891'

/** ให้ $transaction รัน callback จริงด้วย tx ปลอม แล้วคืนค่าที่ callback คืน */
function runTx() {
  vi.mocked(prisma.$transaction).mockImplementation(
    (async (cb: (t: typeof tx) => unknown) => cb(tx)) as never,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  runTx()
  tx.customer.findUnique.mockResolvedValue({ userId: null })
  tx.customer.update.mockResolvedValue({})
  // count > 0 = claim สำเร็จจริงในรอบนี้ (แถวถูกอัปเดตจาก buyerUserId=null)
  tx.order.updateMany.mockResolvedValue({ count: 1 })
  recordOrderEvent.mockResolvedValue(undefined)
})

describe('guaranteeOrderLink — พฤติกรรมเดิมที่ห้ามเปลี่ยน', () => {
  it('ผูก buyerUserId เมื่อออเดอร์ยังไม่มีเจ้าของ', async () => {
    await guaranteeOrderLink({ orderId: ORDER_ID, userId: USER_ID, phone: PHONE })

    const claimCall = tx.order.updateMany.mock.calls.find(
      ([arg]) => (arg as { data?: { buyerUserId?: string } })?.data?.buyerUserId === USER_ID,
    )
    expect(claimCall).toBeDefined()
    // 🛑 เงื่อนไข buyerUserId: null คือกลไก dedupe ตามธรรมชาติ — ห้ามถอด
    expect((claimCall![0] as { where: Record<string, unknown> }).where).toMatchObject({
      id: ORDER_ID,
      buyerUserId: null,
    })
  })

  it('เบอร์ที่ normalize ไม่ผ่าน → ไม่แตะฐานเลย', async () => {
    await guaranteeOrderLink({ orderId: ORDER_ID, userId: USER_ID, phone: 'ไม่ใช่เบอร์' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('ไม่มีเบอร์ → ไม่แตะฐานเลย', async () => {
    await guaranteeOrderLink({ orderId: ORDER_ID, userId: USER_ID, phone: null })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('ทรานแซกชันล้ม → ไม่ throw ออกไปหา caller (best-effort โดยเจตนา)', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('db down'))
    await expect(
      guaranteeOrderLink({ orderId: ORDER_ID, userId: USER_ID, phone: PHONE }),
    ).resolves.toBeUndefined()
  })
})

describe('guaranteeOrderLink — instrumentation (SRS TFR-013)', () => {
  it('claim สำเร็จ → บันทึก AUTH_FLOW_COMPLETED', async () => {
    await guaranteeOrderLink({ orderId: ORDER_ID, userId: USER_ID, phone: PHONE })

    expect(recordOrderEvent).toHaveBeenCalledTimes(1)
    expect(recordOrderEvent.mock.calls[0][1]).toMatchObject({
      orderId: ORDER_ID,
      type: 'AUTH_FLOW_COMPLETED',
    })
  })

  it('ออเดอร์ถูก claim ไปแล้ว (count=0) → ไม่บันทึกซ้ำ', async () => {
    // dedupe เกิดจาก `WHERE buyerUserId: null` ที่ atomic อยู่แล้ว ไม่ต้องมีกลไกนับซ้ำเพิ่ม
    tx.order.updateMany.mockResolvedValue({ count: 0 })
    await guaranteeOrderLink({ orderId: ORDER_ID, userId: USER_ID, phone: PHONE })
    expect(recordOrderEvent).not.toHaveBeenCalled()
  })

  // 🛑 เคสสำคัญที่สุดของไฟล์นี้
  it('เขียน event ล้ม → claim ต้องยังสำเร็จ ไม่ถูก rollback ตาม', async () => {
    recordOrderEvent.mockRejectedValue(new Error('CHECK constraint violation'))

    await expect(
      guaranteeOrderLink({ orderId: ORDER_ID, userId: USER_ID, phone: PHONE }),
    ).resolves.toBeUndefined()

    // การ claim ต้องเกิดขึ้นจริงและอยู่ "นอก" ขอบเขตความล้มเหลวของ event
    const claimCall = tx.order.updateMany.mock.calls.find(
      ([arg]) => (arg as { data?: { buyerUserId?: string } })?.data?.buyerUserId === USER_ID,
    )
    expect(claimCall).toBeDefined()
  })

  // ถ้าเขียน event อยู่ในทรานแซกชันเดียวกับ claim การ throw จะ rollback การ claim ไปด้วย
  // — เทสนี้ล็อกว่า event ต้องถูกเรียก "หลัง" $transaction คืนค่าแล้วเท่านั้น
  it('event ถูกเขียนนอกทรานแซกชัน (เรียกหลัง $transaction จบ)', async () => {
    const order: string[] = []
    vi.mocked(prisma.$transaction).mockImplementation((async (cb: (t: typeof tx) => unknown) => {
      const r = await cb(tx)
      order.push('tx-committed')
      return r
    }) as never)
    recordOrderEvent.mockImplementation(async () => {
      order.push('event-written')
    })

    await guaranteeOrderLink({ orderId: ORDER_ID, userId: USER_ID, phone: PHONE })

    expect(order).toEqual(['tx-committed', 'event-written'])
  })
})
