/**
 * E2E — Feature 00003 Inventory Add-on (end-of-phase QA, safepay-qa)
 *
 * รัน: node_modules/.bin/dotenv -e /Users/craftman/Projects/safepay/.env.local -- npx playwright test e2e/inventory-addon.spec.ts
 * (แทน `npm run e2e` เพราะ worktree นี้ไม่มี .env.local ของตัวเอง — ใช้ env เดียวกับที่ dev server รันอยู่)
 *
 * ข้อมูลทดสอบ seed ด้วย prisma/qa-seed-inventory-addon.ts (username qa_inv_* ทั้งหมด, cleanup ท้าย spec)
 * bypass login ด้วย NextAuth cookie encode (pattern เดียวกับ e2e/helpers/auth.ts) — ใช้ username+password
 * seller-credentials / admin-credentials จริงก็ได้ แต่ cookie เร็วกว่าและไม่ผูกกับ UI ของหน้า sign-in
 * (ซึ่งไม่ใช่ scope ของ feature นี้)
 */
import { test, expect, type BrowserContext } from '@playwright/test'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const SECRET = process.env.NEXTAUTH_SECRET ?? ''

async function loginAsUser(context: BrowserContext, userId: string, domain: string) {
  const token = await encode({
    token: { userId, needsRegistration: false, needsOnboarding: false },
    secret: SECRET,
  })
  await context.addCookies([
    {
      name: 'next-auth.session-token',
      value: token,
      domain,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
}

async function getShop(username: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { username },
    include: { shops: { where: { kind: 'PERSONAL' } } },
  })
  return { user, shop: user.shops[0]! }
}

/**
 * apiPost — เรียก API ผ่าน fetch() ใน browser page context (ไม่ใช่ page.request)
 * เพราะ CSRF guard (src/lib/csrf-origin.ts) เช็ค Origin header ที่ browser fetch()
 * แนบให้อัตโนมัติ — page.request (Node-side APIRequestContext) ไม่แนบ Origin จริง
 * ทำให้โดน "CSRF check failed" 403 เสมอ (ไม่ใช่ bug ของ feature — เป็นข้อจำกัดของ
 * test tool). นี่คือ pattern เดียวกับที่ OrderCreateForm.tsx เรียกจริงในแอป
 */
async function apiPost(page: import('@playwright/test').Page, url: string, data?: unknown) {
  return page.evaluate(
    async ({ url, data }) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: data !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: data !== undefined ? JSON.stringify(data) : undefined,
      })
      const body = await res.json().catch(() => ({}))
      return { status: res.status, body }
    },
    { url, data },
  )
}

test.afterAll(async () => {
  await prisma.$disconnect()
})

// ─────────────────────────────────────────────────────────────────────────
// 1) REGRESSION — shop ไม่มี InventoryEntitlement เลย (NOT_SUBSCRIBED)
// ─────────────────────────────────────────────────────────────────────────
test.describe('Regression — NOT_SUBSCRIBED shop (order.service ไม่ถูกกระทบ)', () => {
  test('สร้าง order PHYSICAL สำเร็จ, stockDeducted=null, ไม่มี stock check', async ({ context, page }) => {
    const { shop, user } = await getShop('qa_inv_regression')
    await loginAsUser(context, user.id, 'seller.deepth.local')

    const product = await prisma.product.findFirstOrThrow({
      where: { shopId: shop.id, name: 'QA-INV-Regression-Product' },
    })
    expect(product.stockQty).toBeNull()

    await page.goto('/dashboard')
    const { status, body: order } = await apiPost(page, '/api/orders', {
      items: [{ productId: product.id, name: product.name, qty: 3, price: 100 }],
      type: 'PHYSICAL',
      buyerContact: '0899999991',
      paymentMethod: 'TRANSFER',
      shippingAddress: { line1: '123 ถนนทดสอบ', province: 'กรุงเทพมหานคร', postcode: '10110' },
    })
    expect(status, JSON.stringify(order)).toBe(201)

    const items = await prisma.orderItem.findMany({ where: { orderId: order.id } })
    expect(items).toHaveLength(1)
    expect(items[0].stockDeducted).toBeNull() // regression: ไม่มีการตัดสต็อกเลย

    // cancel สำเร็จไม่มี error
    const { status: cancelStatus } = await apiPost(page, `/api/orders/${order.publicToken}/cancel`)
    expect(cancelStatus).toBe(200)

    const cancelled = await prisma.order.findUnique({ where: { id: order.id } })
    expect(cancelled?.status).toBe('CANCELLED')

    // cleanup order รอบนี้ (ไม่กระทบ seed data)
    await prisma.order.delete({ where: { id: order.id } })
  })

  test('product edit form ไม่มี field stockQty โผล่ (entitlementActive=false)', async ({ context, page }) => {
    const { shop, user } = await getShop('qa_inv_regression')
    await loginAsUser(context, user.id, 'seller.deepth.local')

    const product = await prisma.product.findFirstOrThrow({
      where: { shopId: shop.id, name: 'QA-INV-Regression-Product' },
    })

    await page.goto(`/products/${product.id}/edit`)
    await expect(page.getByRole('heading', { name: 'แก้ไขสินค้า' })).toBeVisible()
    await expect(page.getByText('ติดตามจำนวนสต็อก')).toHaveCount(0)
  })

  test('เมนู "จัดการสต็อก" แสดง badge ฿199/ด. + /inventory เห็น pricing gate', async ({ context, page }) => {
    const { user } = await getShop('qa_inv_regression')
    await loginAsUser(context, user.id, 'seller.deepth.local')

    await page.goto('/dashboard')
    const menuLink = page.getByRole('link', { name: /จัดการสต็อก/ })
    await expect(menuLink.first()).toBeVisible()
    await expect(page.getByText('฿199/ด.').first()).toBeVisible()

    await page.goto('/inventory')
    await expect(page.getByRole('heading', { name: 'Inventory Add-on' })).toBeVisible()
    await expect(page.getByText('฿199').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'สมัคร Inventory Add-on' })).toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 2) HAPPY PATH — subscribe → ACTIVE → stock tracking → order deduct/restock
// ─────────────────────────────────────────────────────────────────────────
test.describe('Happy path — subscribe + stock deduct/restock', () => {
  test('subscribe หัก ฿199 → entitlement ACTIVE → หน้าเปลี่ยนเป็น management table', async ({ context, page }) => {
    const { shop, user } = await getShop('qa_inv_happy')
    await loginAsUser(context, user.id, 'seller.deepth.local')

    const balanceBefore = (await prisma.sellerWallet.findUnique({ where: { shopId: shop.id } }))!.balance

    await page.goto('/inventory')
    await expect(page.getByRole('button', { name: 'สมัคร Inventory Add-on' })).toBeVisible()
    await page.getByRole('button', { name: 'สมัคร Inventory Add-on' }).click()
    // Sweet Alerts confirm dialog (in-page, ไม่ใช่ native)
    await expect(page.getByText('สมัคร Inventory Add-on?')).toBeVisible()
    await page.getByRole('button', { name: 'สมัคร ฿199' }).click()
    await expect(page.getByText('สมัคร Inventory Add-on สำเร็จ')).toBeVisible({ timeout: 10_000 })

    const entitlement = await prisma.inventoryEntitlement.findUnique({ where: { shopId: shop.id } })
    expect(entitlement?.status).toBe('ACTIVE')

    const wallet = await prisma.sellerWallet.findUnique({ where: { shopId: shop.id } })
    expect(wallet?.balance).toBe(balanceBefore - 199)

    const walletTx = await prisma.walletTransaction.findFirst({
      where: { wallet: { shopId: shop.id }, reason: 'INVENTORY_SUBSCRIPTION' },
      orderBy: { createdAt: 'desc' },
    })
    expect(walletTx).not.toBeNull()

    // หน้าเปลี่ยนเป็น management table หลัง router.refresh()
    await expect(page.getByText('สถานะติดตาม')).toBeVisible({ timeout: 10_000 })
  })

  test('ตั้ง stockQty ผ่าน product edit form (toggle ติดตามจำนวนสต็อก)', async ({ context, page }) => {
    const { shop, user } = await getShop('qa_inv_happy')
    await loginAsUser(context, user.id, 'seller.deepth.local')

    const product = await prisma.product.findFirstOrThrow({
      where: { shopId: shop.id, name: 'QA-INV-Happy-Product' },
    })

    await page.goto(`/products/${product.id}/edit`)
    await expect(page.getByRole('heading', { name: 'แก้ไขสินค้า' })).toBeVisible()
    const toggle = page.locator('#v2-stock-toggle')
    await expect(toggle).toBeVisible()
    await toggle.check()
    await page.getByPlaceholder('จำนวนสต็อก*').fill('5')
    await page.getByRole('button', { name: 'บันทึก' }).first().click()
    await expect(page.getByText('บันทึกแล้ว')).toBeVisible({ timeout: 10_000 })

    const updated = await prisma.product.findUnique({ where: { id: product.id } })
    expect(updated?.stockQty).toBe(5)
  })

  test('สร้าง order → stock ลด (DB), cancel → stock คืน (DB)', async ({ context, page }) => {
    const { shop, user } = await getShop('qa_inv_happy')
    await loginAsUser(context, user.id, 'seller.deepth.local')

    const product = await prisma.product.findFirstOrThrow({
      where: { shopId: shop.id, name: 'QA-INV-Happy-Product' },
    })
    expect(product.stockQty).toBe(5) // จาก test ก่อนหน้า

    await page.goto('/dashboard', { timeout: 60000 }) // dev Turbopack cold-compile ของ authenticated dashboard ช้า >15s default
    const { status, body: order } = await apiPost(page, '/api/orders', {
      items: [{ productId: product.id, name: product.name, qty: 2, price: 100 }],
      type: 'PHYSICAL',
      buyerContact: '0899999992',
      paymentMethod: 'TRANSFER',
      shippingAddress: { line1: '123 ถนนทดสอบ', province: 'กรุงเทพมหานคร', postcode: '10110' },
    })
    expect(status, JSON.stringify(order)).toBe(201)

    const afterOrder = await prisma.product.findUnique({ where: { id: product.id } })
    expect(afterOrder?.stockQty).toBe(3) // 5 - 2

    const items = await prisma.orderItem.findMany({ where: { orderId: order.id } })
    expect(items[0].stockDeducted).toBe(2)

    // cancel → restock
    const { status: cancelStatus } = await apiPost(page, `/api/orders/${order.publicToken}/cancel`)
    expect(cancelStatus).toBe(200)

    const afterCancel = await prisma.product.findUnique({ where: { id: product.id } })
    expect(afterCancel?.stockQty).toBe(5) // คืนกลับ

    await prisma.order.delete({ where: { id: order.id } })
  })

  test('stock = 0 → สร้าง order → hard-stop (คาดหวัง 400 "สินค้าหมดสต็อก")', async ({ context, page }) => {
    const { shop, user } = await getShop('qa_inv_happy')
    await loginAsUser(context, user.id, 'seller.deepth.local')

    const product = await prisma.product.findFirstOrThrow({
      where: { shopId: shop.id, name: 'QA-INV-Happy-Product' },
    })
    await prisma.product.update({ where: { id: product.id }, data: { stockQty: 0 } })

    await page.goto('/dashboard')
    const { status, body } = await apiPost(page, '/api/orders', {
      items: [{ productId: product.id, name: product.name, qty: 1, price: 100 }],
      type: 'PHYSICAL',
      buyerContact: '0899999993',
      paymentMethod: 'TRANSFER',
      shippingAddress: { line1: '123 ถนนทดสอบ', province: 'กรุงเทพมหานคร', postcode: '10110' },
    })
    console.log('[out-of-stock] status=', status, 'body=', JSON.stringify(body))

    // ยืนยันว่า order ไม่ถูกสร้างขึ้นจริง (ไม่ว่า status code จะเป็นอะไร)
    const orders = await prisma.order.findMany({ where: { shopId: shop.id, buyerContact: '0899999993' } })
    expect(orders).toHaveLength(0)

    // stock ต้องไม่ถูกตัด (all-or-nothing rollback)
    const afterAttempt = await prisma.product.findUnique({ where: { id: product.id } })
    expect(afterAttempt?.stockQty).toBe(0)

    expect(status, `คาดหวัง 400 "สินค้าหมดสต็อก" แต่ได้ ${status}: ${JSON.stringify(body)}`).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 3) LOCKED gate + menu
// ─────────────────────────────────────────────────────────────────────────
test.describe('LOCKED state — gate + menu + ข้อมูลเดิมยังอยู่', () => {
  test('/inventory เห็น danger banner + ปุ่ม reactivate; เมนู badge "ถูกล็อก"', async ({ context, page }) => {
    const { shop, user } = await getShop('qa_inv_locked')
    await loginAsUser(context, user.id, 'seller.deepth.local')

    await page.goto('/dashboard')
    await expect(page.getByText('ถูกล็อก').first()).toBeVisible()

    await page.goto('/inventory')
    await expect(page.getByText('ถูกล็อกเพราะเครดิตไม่พอ')).toBeVisible()
    await expect(page.getByRole('button', { name: 'เปิดใช้งาน Inventory Add-on อีกครั้ง' })).toBeVisible()
    await expect(page.getByText('ข้อมูลสต็อกเดิมยังอยู่ครบ')).toBeVisible()

    // ข้อมูล stock เดิมยังอยู่ใน DB (gate ไม่ query/แสดง table แต่ data ไม่หาย)
    const product = await prisma.product.findFirstOrThrow({
      where: { shopId: shop.id, name: 'QA-INV-Locked-Product' },
    })
    expect(product.stockQty).toBe(7)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 4) Admin — topup detail sidebar label
// ─────────────────────────────────────────────────────────────────────────
test.describe('Admin — topup detail sidebar แยก label Inventory Add-on', () => {
  test('sidebar "รายการเครดิตล่าสุด" แสดง "Inventory Add-on" แยกจาก SMS Order Link', async ({ context, page }) => {
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { username: 'qa_inv_admin' } })
    const happy = await getShop('qa_inv_happy')

    // seed WalletTransaction reason=SMS_ORDER_LINK เพื่อเทียบ label แยกกัน (ถ้ายังไม่มี)
    const wallet = await prisma.sellerWallet.findUniqueOrThrow({ where: { shopId: happy.shop.id } })
    const existingSms = await prisma.walletTransaction.findFirst({
      where: { walletId: wallet.id, reason: 'SMS_ORDER_LINK' },
    })
    if (!existingSms) {
      await prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEDUCT',
          amount: 1,
          balanceAfter: wallet.balance,
          description: 'ส่ง SMS order link (QA seed)',
          reason: 'SMS_ORDER_LINK',
        },
      })
    }

    // ต้องมี TopUpRequest อย่างน้อย 1 row ผูก shop นี้ (เป็น anchor page /topups/[id])
    let topup = await prisma.topUpRequest.findFirst({ where: { shopId: happy.shop.id } })
    if (!topup) {
      topup = await prisma.topUpRequest.create({
        data: {
          shopId: happy.shop.id,
          amount: 500,
          slipFileId: 'qa-test-slip-placeholder',
          status: 'PENDING',
        },
      })
    }

    await loginAsUser(context, adminUser.id, 'admin.deepth.local')
    await page.goto(`http://admin.deepth.local:4000/topups/${topup.id}`)
    await expect(page.getByText('รายการเครดิตล่าสุด')).toBeVisible()
    await expect(page.getByText('Inventory Add-on').first()).toBeVisible()
    await expect(page.getByText('SMS Order Link').first()).toBeVisible()
  })
})
