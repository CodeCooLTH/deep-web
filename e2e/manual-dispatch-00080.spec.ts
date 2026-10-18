/**
 * E2E 00080 ขั้นตอนจัดส่งแบบส่งเอง (S-15 · TC-046) — ยังไม่เคยรัน (dev server ยังไม่ขึ้นตอนเขียน)
 *
 * รัน (ปักหมุด DB localhost:5434 ในคำสั่ง — HR14):
 *   DATABASE_URL=postgresql://safepay:safepay@localhost:5434/safepay \
 *   DIRECT_URL=postgresql://safepay:safepay@localhost:5434/safepay \
 *   node_modules/.bin/dotenv -e .env.local -o -- npx playwright test e2e/manual-dispatch-00080.spec.ts
 *   (ต้องมี dev server ที่ :4000 ชี้ DB เดียวกัน และ NEXTAUTH_SECRET จาก .env.local · -o = ให้ค่า inline ชนะ .env.local)
 *
 * seed/cleanup (HR13): ทุกแถวสร้างด้วย id ที่เทสถือเอง (user/shop/order/conversation) —
 * ลบเฉพาะ id เหล่านั้นใน afterAll ไม่มี deleteMany เปล่า/TRUNCATE
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { prisma, loginAs } from './helpers/auth'
import fs from 'node:fs'

// HR14: ปฏิเสธทันทีถ้าไม่ได้ชี้ localhost:5434 (spec ลบ/สร้างแถวจริง)
if (!/@localhost:5434\//.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('[00080 e2e] DATABASE_URL ต้องปักหมุด postgresql://…@localhost:5434/… เท่านั้น')
}

const BUYER_ORIGIN = 'http://deepth.local:4000'
const SHOT_DIR = 'e2e/__screens__/00080'
const TAG = `qa80${Math.random().toString(36).slice(2, 7)}`

// id ที่เทสสร้างเอง — cleanup ไล่ตามนี้เท่านั้น
const created = { users: [] as string[], shops: [] as string[], orders: [] as string[], convs: [] as string[] }

type Fx = { userId: string; shopId: string }

async function seedShop(label: string): Promise<Fx> {
  const n = `${TAG}_${label}`
  const user = await prisma.user.create({
    data: { username: n, displayName: `QA80 ${label}`, phone: `0900${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}` },
  })
  const shop = await prisma.shop.create({
    data: { userId: user.id, kind: 'PERSONAL', shopName: `QA80 ${label}`, businessType: 'INDIVIDUAL', vertical: 'ONLINE_SALES' },
  })
  created.users.push(user.id)
  created.shops.push(shop.id)
  return { userId: user.id, shopId: shop.id }
}

async function seedOrder(
  fx: Fx,
  name: string,
  opts: { trackingNo?: string; iship?: boolean; conversationId?: string } = {},
) {
  const order = await prisma.order.create({
    data: {
      shopId: fx.shopId,
      type: 'PHYSICAL',
      fulfillmentMode: 'SHIPPED',
      status: 'PENDING',
      totalAmount: 590,
      buyerName: name,
      buyerContact: '0891082095',
      ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
      shippingAddress: { line1: '1/1 ถ.ทดสอบ', subdistrict: 'ออเงิน', district: 'สายไหม', province: 'กรุงเทพมหานคร', postcode: '10220' },
      items: { create: [{ name: 'สินค้าทดสอบ', qty: 1, price: 590 }] },
    },
  })
  created.orders.push(order.id)
  if (opts.trackingNo) {
    await prisma.shipmentTracking.create({
      data: { orderId: order.id, provider: 'Kerry Express', trackingNo: opts.trackingNo },
    })
  }
  if (opts.iship) {
    // iShip live = CREATED + ไม่ใช่ dry-run + FORWARD (ตามนิยามตัวตัดสินขั้น)
    await prisma.orderShipment.create({
      data: {
        orderId: order.id,
        shopId: fx.shopId,
        status: 'CREATED',
        trackingNo: `ISH${TAG}`,
        idempotencyKey: `${order.id}:1`,
        isDryRun: false,
        direction: 'FORWARD',
      },
    })
  }
  return order
}

const login = (ctx: BrowserContext, fx: Fx) =>
  loginAs(ctx, { userId: fx.userId, needsRegistration: false, needsOnboarding: false })

const events = (orderId: string, type: string) => prisma.orderEvent.count({ where: { orderId, type } })
const dbOrder = (id: string) =>
  prisma.order.findUniqueOrThrow({ where: { id }, select: { status: true, shipmentTracking: { select: { dispatchedAt: true } } } })

async function pickCarrierAndTrack(page: Page, trackingNo: string) {
  // ShipForm: react-select (inputId ship-provider) + input#ship-tracking-no
  await page.locator('#ship-provider').click({ force: true })
  await page.getByText('Kerry Express', { exact: true }).click()
  await page.locator('#ship-tracking-no').fill(trackingNo)
  await page.getByRole('button', { name: 'บันทึกเลขพัสดุ' }).click()
}

async function confirmDelivered(page: Page) {
  // pacesConfirmAsync → Swal ปุ่มยืนยัน "ส่งสำเร็จ"
  await page.locator('.swal2-confirm').filter({ hasText: 'ส่งสำเร็จ' }).click()
}

test.afterAll(async () => {
  // ลบตาม id ที่สร้างเอง — แถวลูก (item/tracking/event/shipment) cascade จาก Order/Shop
  await prisma.conversation.deleteMany({ where: { id: { in: created.convs } } }).catch(() => {})
  await prisma.order.deleteMany({ where: { id: { in: created.orders } } }).catch(() => {})
  await prisma.shop.deleteMany({ where: { id: { in: created.shops } } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { in: created.users } } }).catch(() => {})
  await prisma.$disconnect()
})

test.describe('00080 ส่งเอง 3 ขั้น', () => {
  test('1. หน้าออเดอร์: บันทึกเลข → จัดส่งแล้ว → ส่งสำเร็จ', async ({ page, context }) => {
    const fx = await seedShop('flow')
    const order = await seedOrder(fx, 'QA80 ลูกค้าหน้าออเดอร์')
    const token = order.publicToken
    await login(context, fx)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/orders/${token}`)

    await page.getByRole('button', { name: 'แจ้งเลขพัสดุ' }).first().click()
    const manual = page.getByRole('radio', { name: 'ส่งเอง' })
    if (await manual.count()) await manual.click() // ร้านไม่เชื่อม iShip อาจไม่มีแถบเลือก
    await pickCarrierAndTrack(page, 'KEX80FLOW1')

    await expect(page.getByText('รอจัดส่ง').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'จัดส่งแล้ว', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'แจ้งเลขพัสดุ' })).toHaveCount(0)
    expect((await dbOrder(order.id)).status).toBe('PENDING')

    await page.getByRole('button', { name: 'จัดส่งแล้ว', exact: true }).first().click()
    await expect(page.getByText('กำลังจัดส่ง').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'ส่งสำเร็จ', exact: true }).first()).toBeVisible()
    let db = await dbOrder(order.id)
    expect(db.status).toBe('SHIPPED')
    expect(db.shipmentTracking?.dispatchedAt).not.toBeNull()

    await page.getByRole('button', { name: 'ส่งสำเร็จ', exact: true }).first().click()
    await confirmDelivered(page)
    await expect(page.getByText('สำเร็จ', { exact: true }).first()).toBeVisible()
    db = await dbOrder(order.id)
    expect(db.status).toBe('CONFIRMED')
    expect(await events(order.id, 'MANUAL_DISPATCHED')).toBe(1)
    expect(await events(order.id, 'SELLER_DELIVERED')).toBe(1)
  })

  test('2. แผงพัสดุในแชท: 3 ขั้นเดียวกัน', async ({ page, context }) => {
    // seed: ห้อง DEEP (buyerUserId + shopId) + Order.conversationId → OrderProgressBar/CustomerPanel ในห้องเห็นใบนี้
    // ⚠ selector ปุ่มเปิดแผงอ้างจาก aria-label ใน OrderProgressBar/CustomerPanel — ยังไม่เคยรันจริง
    const fx = await seedShop('chat')
    const buyer = await prisma.user.create({
      data: { username: `${TAG}_buyer`, displayName: 'QA80 ผู้ซื้อแชท', phone: `0901${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}` },
    })
    created.users.push(buyer.id)
    const conv = await prisma.conversation.create({ data: { shopId: fx.shopId, buyerUserId: buyer.id, channel: 'DEEP' } })
    created.convs.push(conv.id)
    const order = await seedOrder(fx, 'QA80 ลูกค้าแชท', { conversationId: conv.id })
    await login(context, fx)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/inbox/${conv.id}`)

    const openPanel = async () => {
      await page.getByRole('button', { name: /ดูรายละเอียดพัสดุของคำสั่งซื้อ|สร้างพัสดุสำหรับ|ดูพัสดุของ/ }).first().click()
    }
    await openPanel()
    const manual = page.getByRole('radio', { name: 'ส่งเอง' })
    if (await manual.count()) await manual.click()
    await pickCarrierAndTrack(page, 'KEX80CHAT1')
    await expect.poll(async () => (await dbOrder(order.id)).shipmentTracking !== null).toBe(true)
    expect((await dbOrder(order.id)).status).toBe('PENDING')

    // บันทึกสำเร็จแผงอาจปิดเอง → เปิดใหม่เป็นมุมมอง "ส่งเองแล้ว"
    if (!(await page.getByRole('button', { name: 'จัดส่งแล้ว', exact: true }).count())) await openPanel()
    await page.getByRole('button', { name: 'จัดส่งแล้ว', exact: true }).first().click()
    await expect.poll(async () => (await dbOrder(order.id)).status).toBe('SHIPPED')

    if (!(await page.getByRole('button', { name: 'ส่งสำเร็จ', exact: true }).count())) await openPanel()
    await page.getByRole('button', { name: 'ส่งสำเร็จ', exact: true }).first().click()
    await confirmDelivered(page)
    await expect.poll(async () => (await dbOrder(order.id)).status).toBe('CONFIRMED')
    expect(await events(order.id, 'MANUAL_DISPATCHED')).toBe(1)
    expect(await events(order.id, 'SELLER_DELIVERED')).toBe(1)
  })

  test('3. กด "จัดส่งแล้ว" ซ้ำจากสองแท็บ: event เดียว ไม่ error', async ({ context }) => {
    const fx = await seedShop('double')
    const order = await seedOrder(fx, 'QA80 ลูกค้ากดซ้ำ', { trackingNo: 'KEX80DBL1' })
    await login(context, fx)
    const a = await context.newPage()
    const b = await context.newPage()
    await a.goto(`/orders/${order.publicToken}`)
    await b.goto(`/orders/${order.publicToken}`) // แท็บ b ค้างหน้า "รอจัดส่ง" (stale)

    await a.getByRole('button', { name: 'จัดส่งแล้ว', exact: true }).first().click()
    await expect(a.getByRole('button', { name: 'ส่งสำเร็จ', exact: true }).first()).toBeVisible()

    await b.getByRole('button', { name: 'จัดส่งแล้ว', exact: true }).first().click()
    // changed:false → info toast + refresh ให้เป็น "กำลังจัดส่ง" ไม่มี toast error
    await expect(b.getByText('จัดส่งแล้ว หน้านี้อัปเดตให้แล้ว')).toBeVisible()
    await expect(b.getByRole('button', { name: 'ส่งสำเร็จ', exact: true }).first()).toBeVisible()
    expect(await events(order.id, 'MANUAL_DISPATCHED')).toBe(1)
  })

  test('4. ใบ iShip live ไม่มีปุ่มจัดส่งแล้ว/ส่งสำเร็จ', async ({ page, context }) => {
    const fx = await seedShop('iship')
    const order = await seedOrder(fx, 'QA80 ลูกค้า iShip', { iship: true })
    await login(context, fx)
    await page.goto(`/orders/${order.publicToken}`)
    await expect(page.getByRole('heading').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'จัดส่งแล้ว', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'ส่งสำเร็จ', exact: true })).toHaveCount(0)
  })

  test('5. ตัวกรอง ?stage=AWAITING_DISPATCH + ไทล์ dashboard ตรงกัน', async ({ page, context }) => {
    const fx = await seedShop('stage')
    await seedOrder(fx, 'QA80 รอส่งหนึ่ง', { trackingNo: 'KEX80S1' })
    await seedOrder(fx, 'QA80 รอส่งสอง', { trackingNo: 'KEX80S2' })
    await seedOrder(fx, 'QA80 ไม่มีเลข') // ตัวหลอก: ยังรอเลขพัสดุ
    await seedOrder(fx, 'QA80 ใบ iShip', { trackingNo: 'KEX80S4', iship: true }) // ตัวหลอก: iShip ชนะ
    await login(context, fx)
    await page.setViewportSize({ width: 1440, height: 900 })

    await page.goto('/orders?stage=AWAITING_DISPATCH')
    await expect(page.getByText('QA80 รอส่งหนึ่ง').first()).toBeVisible()
    await expect(page.getByText('QA80 รอส่งสอง').first()).toBeVisible()
    await expect(page.getByText('QA80 ไม่มีเลข')).toHaveCount(0)
    await expect(page.getByText('QA80 ใบ iShip')).toHaveCount(0)

    await page.goto('/dashboard')
    const tiles = page.locator('a[href="/orders?stage=AWAITING_DISPATCH"]')
    await expect(tiles.first()).toBeAttached()
    const texts = await tiles.evaluateAll((els) => els.map((e) => e.textContent ?? ''))
    expect(texts.every((t) => /รอจัดส่ง/.test(t) && /(^|\D)2(\D|$)/.test(t))).toBe(true)
  })

  test('6. ตั้งค่าจังหวะแจ้งเลข + หน้าลูกค้าไม่เห็นเลขจนกด จัดส่งแล้ว', async ({ page, context, browser }) => {
    const fx = await seedShop('timing')
    const order = await seedOrder(fx, 'QA80 ลูกค้าจังหวะ', { trackingNo: 'KEX80TIM9' })
    await login(context, fx)
    await page.setViewportSize({ width: 1440, height: 900 })

    await page.goto('/settings/auto-notify')
    const sw = page.getByLabel('เมื่อมีเลขพัสดุ')
    if (!(await sw.isChecked())) await sw.check()
    const onDispatch = page.getByRole('radio', { name: /ตอนกดจัดส่งแล้ว/ })
    await expect(onDispatch).toBeVisible()
    await onDispatch.check()
    await expect(page.getByText('บันทึกจังหวะการส่งเลขพัสดุแล้ว')).toBeVisible()
    await page.reload()
    await expect(page.getByRole('radio', { name: /ตอนกดจัดส่งแล้ว/ })).toBeChecked()

    // หน้าลูกค้า (โดเมนหลัก · context แยก ไม่มีคุกกี้ร้าน) — ตรวจทั้ง HTML/RSC payload ไม่ใช่แค่ข้อความที่เห็น
    const buyerCtx = await browser.newContext()
    const buyer = await buyerCtx.newPage()
    await buyer.goto(`${BUYER_ORIGIN}/o/${order.publicToken}`)
    expect(await buyer.content()).not.toContain('KEX80TIM9')

    const res = await page.request.post(`/api/orders/${order.publicToken}/dispatch`)
    expect(res.status()).toBe(200)

    await buyer.goto(`${BUYER_ORIGIN}/o/${order.publicToken}`)
    expect(await buyer.content()).toContain('KEX80TIM9')
    await buyerCtx.close()
  })

  test('7. ภาพหน้าออเดอร์ 390/834/1440 ที่ รอจัดส่ง และ กำลังจัดส่ง', async ({ page, context }) => {
    fs.mkdirSync(SHOT_DIR, { recursive: true })
    const fx = await seedShop('shots')
    const order = await seedOrder(fx, 'QA80 ลูกค้าถ่ายภาพ', { trackingNo: 'KEX80SHOT' })
    await login(context, fx)
    const sizes = [
      { w: 390, h: 844 },
      { w: 834, h: 1112 },
      { w: 1440, h: 900 },
    ]
    const shoot = async (stage: string) => {
      for (const s of sizes) {
        await page.setViewportSize({ width: s.w, height: s.h })
        await page.goto(`/orders/${order.publicToken}`)
        await page.getByRole('button', { name: stage === 'awaiting' ? 'จัดส่งแล้ว' : 'ส่งสำเร็จ', exact: true }).first().waitFor()
        await page.screenshot({ path: `${SHOT_DIR}/${stage}-${s.w}.png`, fullPage: true })
      }
    }
    await shoot('awaiting')
    // dark 1 ภาพ — Paces สลับด้วย attribute data-theme บน <html> (ไม่มี helper สลับในรีโป)
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    await page.screenshot({ path: `${SHOT_DIR}/awaiting-1440-dark.png`, fullPage: true })

    expect((await page.request.post(`/api/orders/${order.publicToken}/dispatch`)).status()).toBe(200)
    await shoot('shipping')
  })
})
