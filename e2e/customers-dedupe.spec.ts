/**
 * E2E — Feature 00014-ext: หน้ารายการลูกค้า /customers (dedupe + ยอดขาย SSOT)
 *
 * รัน (dev server ต้องรันอยู่ที่ :4000 — user/Controller รันเอง):
 *   npm run e2e -- e2e/customers-dedupe.spec.ts
 *
 * ขอบเขต:
 *   S-1  dedupe: ลูกค้าคนเดียวกัน (customerId เดียวกัน) สั่ง 2 ครั้งด้วย buyerContact
 *        คนละ format ต้องเห็นเป็น "1 แถว" บนหน้า /customers (makeCustomerRowKey ให้
 *        customerId ชนะเสมอ แม้ buyerUserId ใบหนึ่งเป็น null)
 *   S-2  ออเดอร์ CANCELLED อย่างเดียว → ยอดซื้อสะสมต้องเป็น ฿0 (ไม่นับเป็นยอดขาย) และ
 *        label "(นับเป็นยอดขายแล้ว)" กำกับหัวคอลัมน์อยู่เสมอ (ไม่ใช่แค่ตอนมีเลข)
 *   S-3  ออเดอร์ CONFIRMED → ยอดซื้อสะสมต้องเท่ากับ totalAmount จริง ผ่าน formatBaht
 *        (SSOT เดียวกับ dashboard/รายงานยอดขาย — @/lib/order-revenue::countsAsRevenue)
 *
 * seed: shop ใหม่ทั้งร้าน (ไม่แตะร้าน/ลูกค้าของใครเลย) — เบอร์ทดสอบ generate จาก timestamp
 * เพื่อไม่ชนกับข้อมูลจริง (Hard Rule 13: ห้ามลบไม่ scope — cleanup ผูกกับ shopId/phone ที่
 * เทสสร้างเองทั้งหมด)
 *
 * หมายเหตุ FK: Order.shopId → Shop คือ ON DELETE RESTRICT (ไม่ cascade) — ต้องลบ Order
 * ที่ seed เองก่อนลบ Shop เสมอ ไม่งั้น cleanup() ของ helper จะชนกับ constraint นี้
 * (Order.customerId → Customer เป็น ON DELETE SET NULL คนละเส้น — ลบ Customer เฉย ๆ ไม่พังออเดอร์
 * แต่ที่นี่ลบ Order ก่อนอยู่แล้วจึงไม่เจอกรณีนั้น)
 */
import { test, expect } from '@playwright/test'
import { createSeller, loginAs, cleanup, prisma, type Seeded } from './helpers/auth'

const RUN_ID = Date.now().toString().slice(-7) // 7 หลักท้าย timestamp — กันชนข้อมูลจริง/รันซ้อน

/** เบอร์ทดสอบ 10 หลัก รูปแบบ 0XX-XXX-XXXX — ไม่ซ้ำกันต่อการรันหนึ่งครั้ง (suffix ต่างกันทีละตัว) */
function testPhone(suffix: string): string {
  return `089${RUN_ID}${suffix}`.slice(0, 10).padEnd(10, '0')
}

/** แปลงเบอร์ดิบ 10 หลัก → รูปแบบมีขีด 0XX-XXX-XXXX (คนละ format จาก raw เจตนา) */
function toDashFormat(p: string): string {
  return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`
}

let seeded: Seeded
let shopId: string
const orderIds: string[] = []
const dedupePhone = testPhone('1')

test.beforeAll(async () => {
  seeded = await createSeller('complete')
  const shop = await prisma.shop.findFirstOrThrow({ where: { userId: seeded.userId } })
  shopId = shop.id

  // ── S-1: Customer กลาง 1 คน สั่งซื้อ 2 ครั้ง — buyerContact คนละ format, buyerUserId null ทั้งคู่ ──
  const customer = await prisma.customer.create({ data: { phone: dedupePhone } })
  const order1 = await prisma.order.create({
    data: {
      shopId,
      customerId: customer.id,
      buyerUserId: null,
      buyerContact: dedupePhone, // raw digits
      buyerName: 'ลูกค้า QA Dedupe',
      totalAmount: 500,
      status: 'CONFIRMED',
      type: 'PHYSICAL',
      fulfillmentMode: 'NO_SHIPPING',
    },
  })
  const order2 = await prisma.order.create({
    data: {
      shopId,
      customerId: customer.id,
      buyerUserId: null,
      buyerContact: toDashFormat(dedupePhone), // คนละ format จาก order1 โดยเจตนา
      buyerName: 'ลูกค้า QA Dedupe',
      totalAmount: 300,
      status: 'CONFIRMED',
      type: 'PHYSICAL',
      fulfillmentMode: 'NO_SHIPPING',
    },
  })
  orderIds.push(order1.id, order2.id)

  // ── S-2: ลูกค้า guest ที่มีออเดอร์ CANCELLED อย่างเดียว — ต้องไม่นับเป็นยอดขาย ──
  const cancelledOrder = await prisma.order.create({
    data: {
      shopId,
      buyerUserId: null,
      buyerContact: testPhone('2'),
      buyerName: 'ลูกค้า QA ยกเลิกทั้งหมด',
      totalAmount: 750,
      status: 'CANCELLED',
      type: 'PHYSICAL',
      fulfillmentMode: 'NO_SHIPPING',
    },
  })
  orderIds.push(cancelledOrder.id)

  // ── S-3: ลูกค้า guest ที่มีออเดอร์ CONFIRMED — ยอดต้องตรง totalAmount ผ่าน formatBaht ──
  const confirmedOrder = await prisma.order.create({
    data: {
      shopId,
      buyerUserId: null,
      buyerContact: testPhone('3'),
      buyerName: 'ลูกค้า QA ยืนยันแล้ว',
      totalAmount: 890,
      status: 'CONFIRMED',
      type: 'PHYSICAL',
      fulfillmentMode: 'NO_SHIPPING',
    },
  })
  orderIds.push(confirmedOrder.id)
})

test.afterAll(async () => {
  // ลบ Order ก่อนเสมอ — Order.shopId → Shop เป็น ON DELETE RESTRICT (ดูหมายเหตุบนไฟล์)
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {})
  await prisma.customer.deleteMany({ where: { phone: dedupePhone } }).catch(() => {})
  await cleanup(seeded.userId)
  await prisma.$disconnect()
})

test.describe('S-1: dedupe ด้วย customerId ชนะเสมอ', () => {
  test('ลูกค้าเดียวกัน 2 ออเดอร์ (buyerContact คนละ format) → เห็น 1 แถว รวม 2 ออเดอร์', async ({
    page,
    context,
  }) => {
    await loginAs(context, seeded)
    const res = await page.goto('/customers')
    expect(res?.status()).toBe(200)

    const row = page.locator('table tbody tr').filter({ hasText: 'ลูกค้า QA Dedupe' })
    await expect(row).toHaveCount(1)
    // ยอดออเดอร์รวม = 2 (ไม่ใช่ 2 แถวแยก) — ยืนยัน dedupe จริง ไม่ใช่แค่ชื่อซ้ำบังเอิญ
    await expect(row).toContainText('2')
    // ยอดซื้อสะสมรวม 500 + 300 = 800 (ทั้งคู่ CONFIRMED → นับเป็นยอดขายทั้งคู่)
    await expect(row).toContainText('฿800')
  })
})

test.describe('S-2/S-3: ยอดขาย SSOT (countsAsRevenue) + label กำกับหัวคอลัมน์', () => {
  test('S-2 ออเดอร์ CANCELLED อย่างเดียว → ยอดซื้อสะสม ฿0 และ label "(นับเป็นยอดขายแล้ว)" ปรากฏ', async ({
    page,
    context,
  }) => {
    await loginAs(context, seeded)
    await page.goto('/customers')

    const row = page.locator('table tbody tr').filter({ hasText: 'ลูกค้า QA ยกเลิกทั้งหมด' })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('฿0')

    // label กำกับหัวคอลัมน์ — ต้องปรากฏเสมอ (ไม่ใช่แค่ตอนมีตัวเลข) ไม่งั้นผู้ใช้เข้าใจผิดว่า
    // ฿0 = ยังไม่มีคนซื้อ ทั้งที่จริงคือ "ซื้อแล้วแต่ยกเลิก จึงไม่นับ"
    await expect(page.getByText('(นับเป็นยอดขายแล้ว)').first()).toBeVisible()
  })

  test('S-3 ออเดอร์ CONFIRMED → ยอดซื้อสะสมตรงกับ totalAmount ผ่าน formatBaht', async ({
    page,
    context,
  }) => {
    await loginAs(context, seeded)
    await page.goto('/customers')

    const row = page.locator('table tbody tr').filter({ hasText: 'ลูกค้า QA ยืนยันแล้ว' })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('฿890')
  })
})
