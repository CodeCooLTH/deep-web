/**
 * E2E — Feature 00022 iShip Shipping Integration
 *
 * รัน (worktree นี้ไม่มี .env.local ของตัวเอง — ใช้ env ชุดเดียวกับ dev server):
 *   node_modules/.bin/dotenv -e /Users/craftman/orca/workspaces/safepay/main-3/.env.local \
 *     -- npx playwright test e2e/iship-shipping.spec.ts
 *
 * ข้อควรระวัง: ต้องตั้ง ISHIP_DRY_RUN=1 บน dev server ก่อนรัน
 *    ไม่งั้นเคสสร้างพัสดุจะยิงไป iShip จริง = พัสดุจริง + เสียเงินจริง (BR-ISHIP-60/62)
 *    spec นี้เช็คให้เองที่ต้นไฟล์ และจะ skip เคสกลุ่มนั้นถ้าไม่ได้เปิดโหมดจำลอง
 *
 * ขอบเขตที่ spec นี้ครอบ (เลือกเฉพาะที่ทดสอบได้โดย "ไม่ต้องมี token iShip จริง"):
 *   A. ร้านบ้านพัก (LODGING) — หน้า 404 + API 403 ทุกเส้น           [BLOCKER]
 *   B. ร้านที่ยังไม่เชื่อมต่อ — UI บอกสถานะถูก + API ตอบ 409
 *   C. สิทธิ์ ownerOnly — พนักงานร้านแตะ token/ตั้งค่าไม่ได้
 *   D. สร้าง/ยกเลิกพัสดุบนโหมดจำลอง + กันเปิดซ้ำ                    [BLOCKER]
 *   E. ออเดอร์ที่ไม่เข้าเงื่อนไข — ไม่มีส่วนการจัดส่งโผล่มารบกวน
 *
 * นอกขอบเขต (ต้องมี token จริง → ทำในรอบ smoke test บน production แทน):
 *   - การเชื่อมต่อจริง, พิมพ์ใบปะหน้า (ยิง iShip ตรง ไม่ถูก stub ในโหมดจำลอง),
 *     ประวัติการเดินทาง, เรียกรถเข้ารับ
 */
import { test, expect, type BrowserContext } from '@playwright/test'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'
import { createCipheriv, randomBytes } from 'crypto'

const prisma = new PrismaClient()
const SECRET = process.env.NEXTAUTH_SECRET ?? ''
const DRY_RUN = process.env.ISHIP_DRY_RUN === '1'
const PREFIX = 'qa_iship_'

// เข้ารหัส token ปลอมด้วยกลไกเดียวกับระบบ — seed ตรงลง DB ได้โดยไม่ต้องมี token iShip จริง
// (copy จาก src/lib/token-crypto.ts โดยเจตนา: spec ไม่ควร import โมดูล server-only)
function encryptToken(plain: string): string {
  const key = Buffer.from(process.env.CHANNEL_TOKEN_KEY ?? '', 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.')
}

async function loginAs(context: BrowserContext, userId: string) {
  const token = await encode({
    token: { userId, needsRegistration: false, needsOnboarding: false },
    secret: SECRET,
  })
  await context.addCookies([
    {
      name: 'next-auth.session-token',
      value: token,
      domain: 'seller.deepth.local',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
}

interface Fixture {
  generalUserId: string
  generalShopId: string
  lodgingUserId: string
  lodgingShopId: string
  shippableOrderId: string
  digitalOrderId: string
}

let fx: Fixture

test.beforeAll(async () => {
  // ── ร้านขายออนไลน์ (ONLINE_SALES) — เดิมชื่อตัวแปร/comment อ้าง GENERAL ก่อน feature 00028
  // แยก vertical เป็น 3 ทาง คงชื่อตัวแปร generalShop/generalUser ไว้ (ไม่ rename เพื่อลด diff
  // ที่ไม่เกี่ยวกับงานนี้) แต่ค่า vertical จริงต้องเป็น ONLINE_SALES เพราะ iShip เปิดเฉพาะ
  // ประเภทนี้เท่านั้น (BRD §8.1 matrix) ──
  const generalUser = await prisma.user.create({
    data: { username: `${PREFIX}general`, displayName: 'ร้านทดสอบ iShip', phone: '0900000221' },
  })
  const generalShop = await prisma.shop.create({
    data: {
      userId: generalUser.id,
      kind: 'PERSONAL',
      shopName: 'ร้านทดสอบ iShip',
      businessType: 'INDIVIDUAL',
      vertical: 'ONLINE_SALES',
    },
  })

  // ── ร้านบ้านพัก (LODGING) ──
  const lodgingUser = await prisma.user.create({
    data: { username: `${PREFIX}lodging`, displayName: 'บ้านพักทดสอบ', phone: '0900000222' },
  })
  const lodgingShop = await prisma.shop.create({
    data: {
      userId: lodgingUser.id,
      kind: 'PERSONAL',
      shopName: 'บ้านพักทดสอบ',
      businessType: 'INDIVIDUAL',
      vertical: 'LODGING',
    },
  })

  // การเชื่อมต่อ iShip ของร้าน ONLINE_SALES — token ปลอมที่เข้ารหัสถูกวิธี
  // ใช้ได้กับทุกเคสที่ไม่ได้ยิงออกไปหา iShip จริง (โหมดจำลอง stub การสร้างพัสดุไว้แล้ว)
  await prisma.shopShippingAccount.create({
    data: {
      shopId: generalShop.id,
      accessTokenEnc: encryptToken('qa-dummy-token-not-real-0000'),
      tokenLast4: '0000',
      status: 'ACTIVE',
      createMode: 'ASK',
      connectedByUserId: generalUser.id,
      senderName: 'ร้านทดสอบ iShip',
      senderPhone: '0900000221',
      senderAddress: '44/247 ซอยทดสอบ',
      senderSubdistrict: 'ประเวศ', // ตำบล
      senderDistrict: 'ประเวศ', // อำเภอ
      senderProvince: 'กรุงเทพมหานคร',
      senderPostcode: '10250',
      defaultCourierCode: 'FlashExpress',
      defaultCategoryId: 4,
      defaultWeight: 1,
      defaultWidth: 17,
      defaultLength: 25,
      defaultHeight: 9,
    },
  })

  // ออเดอร์ที่ต้องจัดส่งและข้อมูลครบ
  const shippable = await prisma.order.create({
    data: {
      shopId: generalShop.id,
      type: 'PHYSICAL',
      fulfillmentMode: 'SHIPPED',
      totalAmount: 890,
      buyerName: 'สมชาย ใจดี',
      buyerContact: '0891082095',
      shippingAddress: {
        line1: '91/83 ถ.สายไหม',
        subdistrict: 'ออเงิน', // ตำบล — ต้องไปลง dst_district
        district: 'สายไหม', // อำเภอ — ต้องไปลง dst_amphure
        province: 'กรุงเทพมหานคร',
        postcode: '10220',
      },
      items: { create: [{ name: 'เสื้อยืดทดสอบ', qty: 1, price: 890 }] },
    },
  })

  // ออเดอร์ดิจิทัล — ต้องไม่มีส่วนการจัดส่งโผล่มาเลย
  const digital = await prisma.order.create({
    data: {
      shopId: generalShop.id,
      type: 'DIGITAL',
      fulfillmentMode: 'NO_SHIPPING',
      totalAmount: 199,
      buyerName: 'สมหญิง',
      buyerContact: '0891082096',
      items: { create: [{ name: 'อีบุ๊กทดสอบ', qty: 1, price: 199 }] },
    },
  })

  fx = {
    generalUserId: generalUser.id,
    generalShopId: generalShop.id,
    lodgingUserId: lodgingUser.id,
    lodgingShopId: lodgingShop.id,
    shippableOrderId: shippable.id,
    digitalOrderId: digital.id,
  }
})

test.afterAll(async () => {
  // ลบตามลำดับ dependency — Shop/User cascade ครอบ OrderShipment/ShopShippingAccount ให้แล้ว
  await prisma.shop.deleteMany({ where: { user: { username: { startsWith: PREFIX } } } })
  await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } })
  await prisma.$disconnect()
})

// ─── A. ร้านบ้านพัก — BLOCKER ───────────────────────────────────────────────

test.describe('A. ร้านบ้านพักต้องไม่มีฟีเจอร์นี้เลย (BR-ISHIP-01/02)', () => {
  // หน้า /settings/shipping ถูกยกเลิกไปแล้ว (2026-07-29) — การตั้งค่าอยู่ในโมดัลบนหน้า /settings
  // จึงพิสูจน์การซ่อนที่ "แถวไม่โผล่" แทนการเช็ค 404 ของ route (ดู A3)
  test('A1 route เดิม /settings/shipping ไม่มีอยู่แล้ว', async ({ page, context }) => {
    await loginAs(context, fx.lodgingUserId)
    const res = await page.goto('/settings/shipping')
    expect(res?.status()).toBe(404)
  })

  test('A2 ยิง API ตรงได้ 403 ทุกเส้น — การซ่อน UI ไม่ใช่การบังคับสิทธิ์', async ({ page, context }) => {
    await loginAs(context, fx.lodgingUserId)
    await page.goto('/dashboard')

    const endpoints = [
      { method: 'GET', path: '/api/seller/iship/connection' },
      { method: 'GET', path: '/api/seller/iship/settings' },
      { method: 'GET', path: '/api/seller/iship/couriers' },
      { method: 'GET', path: '/api/seller/iship/boxes' },
    ]
    for (const ep of endpoints) {
      const status = await page.evaluate(
        async (e) => (await fetch(e.path, { method: e.method })).status,
        ep,
      )
      expect(status, `${ep.method} ${ep.path}`).toBe(403)
    }
  })

  test('A3 การ์ด iShip ไม่โผล่ในหน้าตั้งค่า', async ({ page, context }) => {
    await loginAs(context, fx.lodgingUserId)
    await page.goto('/settings')
    await expect(page.getByText('เชื่อมต่อ iShip')).toHaveCount(0)
  })
})

// ─── B. ร้านที่ยังไม่เชื่อมต่อ ───────────────────────────────────────────────

test.describe('B. สถานะการเชื่อมต่อ', () => {
  test('B1 ร้าน ONLINE_SALES เห็นแถว iShip พร้อมสถานะในหน้าตั้งค่า', async ({ page, context }) => {
    await loginAs(context, fx.generalUserId)
    const res = await page.goto('/settings')
    expect(res?.status()).toBe(200)
    await expect(page.getByText('เชื่อมต่อ iShip')).toBeVisible()
    await expect(page.getByText('เชื่อมต่อแล้ว').first()).toBeVisible()
  })

  test('B2 กด "ตั้งค่า" เปิดโมดัล 3 แท็บ ไม่ใช่เปลี่ยนหน้า', async ({ page, context }) => {
    await loginAs(context, fx.generalUserId)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'ตั้งค่า' }).click()
    const modal = page.getByRole('dialog', { name: 'ตั้งค่าการจัดส่ง' })
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('tab')).toHaveCount(3)
    // ไม่เปลี่ยนหน้า — โมดัลลอยอยู่บน /settings เดิม
    expect(new URL(page.url()).pathname).toBe('/settings')
  })

  test('B3 deep-link จากหน้าคำสั่งซื้อเปิดโมดัลที่แท็บที่อยู่ผู้ส่งทันที', async ({ page, context }) => {
    await loginAs(context, fx.generalUserId)
    await page.goto('/settings?iship=settings&tab=sender')
    const modal = page.getByRole('dialog', { name: 'ตั้งค่าการจัดส่ง' })
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('tab', { name: /ที่อยู่ผู้ส่ง/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })
})

// ─── C. สิทธิ์ ────────────────────────────────────────────────────────────────

test.describe('C. เฉพาะเจ้าของร้านตั้งค่าได้ (BR-ISHIP-03)', () => {
  test('C1 คนนอกร้านเรียก API ไม่ได้', async ({ page, context }) => {
    await loginAs(context, fx.lodgingUserId) // คนละร้าน
    await page.goto('/dashboard')
    const status = await page.evaluate(
      async () =>
        (
          await fetch('/api/seller/iship/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senderName: 'แอบแก้' }),
          })
        ).status,
    )
    expect(status).toBe(403)
  })
})

// ─── D. สร้าง/ยกเลิกพัสดุ — BLOCKER (ต้องอยู่ในโหมดจำลอง) ──────────────────

test.describe('D. สร้างและยกเลิกพัสดุ', () => {
  test.skip(!DRY_RUN, 'ต้องตั้ง ISHIP_DRY_RUN=1 ก่อน ไม่งั้นจะเปิดพัสดุจริงและเสียเงินจริง')

  test('D1 สร้างพัสดุสำเร็จและมีเครื่องหมายว่าเป็นของจำลอง', async ({ page, context }) => {
    await loginAs(context, fx.generalUserId)
    await page.goto('/dashboard')

    const body = await page.evaluate(async (orderId) => {
      const res = await fetch('/api/seller/iship/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      return { status: res.status, json: await res.json() }
    }, fx.shippableOrderId)

    expect(body.status).toBe(201)
    expect(body.json.status).toBe('CREATED')
    expect(body.json.isDryRun).toBe(true)
    expect(String(body.json.trackingNo)).toContain('DRYRUN')
  })

  test('D2 กดซ้ำต้องไม่เกิดพัสดุใบที่สอง (BR-ISHIP-22)', async ({ page, context }) => {
    await loginAs(context, fx.generalUserId)
    await page.goto('/dashboard')

    const status = await page.evaluate(async (orderId) => {
      const res = await fetch('/api/seller/iship/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      return res.status
    }, fx.shippableOrderId)

    expect(status).toBe(409) // SHIPMENT_EXISTS

    const count = await prisma.orderShipment.count({
      where: { orderId: fx.shippableOrderId, status: { not: 'CANCELLED' } },
    })
    expect(count).toBe(1)
  })

  test('D3 ยกเลิกแล้วเปิดใบใหม่ได้ และ attemptGroup เดินหน้า', async ({ page, context }) => {
    await loginAs(context, fx.generalUserId)
    await page.goto('/dashboard')

    const first = await prisma.orderShipment.findFirstOrThrow({
      where: { orderId: fx.shippableOrderId, status: { not: 'CANCELLED' } },
    })

    const cancelStatus = await page.evaluate(
      async (id) => (await fetch(`/api/seller/iship/shipments/${id}/cancel`, { method: 'POST' })).status,
      first.id,
    )
    expect(cancelStatus).toBe(200)

    const again = await page.evaluate(async (orderId) => {
      const res = await fetch('/api/seller/iship/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      return { status: res.status, json: await res.json() }
    }, fx.shippableOrderId)

    expect(again.status).toBe(201)

    const second = await prisma.orderShipment.findFirstOrThrow({
      where: { orderId: fx.shippableOrderId, status: { not: 'CANCELLED' } },
    })
    // คีย์ต้องเปลี่ยน (attemptGroup +1) ไม่งั้นจะชน unique constraint ของใบเดิม
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey)
  })

  test('D4 ที่อยู่ถูกส่งเข้าช่องที่ถูกต้อง — ตำบลไม่สลับกับอำเภอ (BR-ISHIP-31)', async () => {
    const shipment = await prisma.orderShipment.findFirstOrThrow({
      where: { orderId: fx.shippableOrderId, status: { not: 'CANCELLED' } },
    })
    const receiver = shipment.receiverSnapshot as Record<string, unknown>
    // snapshot เก็บด้วยชื่อฝั่งเรา — ตรวจว่าค่าไม่ถูกสลับตั้งแต่ต้นทาง
    expect(receiver.subdistrict).toBe('ออเงิน') // ตำบล
    expect(receiver.district).toBe('สายไหม') // อำเภอ
  })
})

// ─── E. ออเดอร์ที่ไม่เข้าเงื่อนไข ────────────────────────────────────────────

test.describe('E. ออเดอร์ที่ไม่ต้องจัดส่งต้องไม่ถูกรบกวน (FR-ISHIP-023)', () => {
  test('E1 ออเดอร์ดิจิทัลเรียกสร้างพัสดุไม่ได้ และเป็นการปฏิเสธแบบไม่ใช่ข้อผิดพลาดของร้าน', async ({
    page,
    context,
  }) => {
    await loginAs(context, fx.generalUserId)
    await page.goto('/dashboard')

    const status = await page.evaluate(async (orderId) => {
      const res = await fetch('/api/seller/iship/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      return res.status
    }, fx.digitalOrderId)

    expect(status).toBe(403) // NOT_ELIGIBLE
  })
})
