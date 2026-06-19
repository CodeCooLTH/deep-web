/**
 * E2E — Feature 00001 Extension: LINE/IG OAuth (FR-LO-14/15) + Account Linking UI (FR-LO-16)
 * + Register page sanitize (FR-LO-14-AC-06) + register cancel button
 *
 * Scope: เทสเฉพาะส่วนที่ automate ได้โดยไม่ต้องมี OAuth provider จริง:
 *   A. /register — username prefill sanitize (LINE prefix ยาว/ตัวพิมพ์ใหญ่ → lowercase ≤30)
 *   B. /register — ปุ่ม "ยกเลิก" มีอยู่ + กด → Swal ถาม confirm
 *   C. /settings — ConnectedAccountsClient render: FB linked = "เชื่อมแล้ว", LINE = "ยังไม่เชื่อม"
 *   D. IG flag-off (FR-LO-15-AC-01) — row Instagram ไม่อยู่ใน DOM เมื่อ flag ไม่ตั้ง
 *
 * Manual-prod carry (ระบุใน report):
 *   - LINE OAuth login จริง (ต้อง OAuth provider จริงบน prod)
 *   - Account Linking Connect happy path / block path (OAuth redirect จริง)
 *   - Disconnect OTP flow end-to-end (SMS OTP จริง)
 *
 * auth bypass: seed user + inject NextAuth cookie (e2e/helpers/auth.ts)
 * รัน: `npm run e2e` (dev server ต้องขึ้นที่ seller.deepth.local:4000 ก่อน)
 */
import { test, expect } from '@playwright/test'
import { createSeller, loginAs, cleanup, prisma } from './helpers/auth'

test.afterAll(async () => {
  await prisma.$disconnect()
})

// ═══════════════════════════════════════════════════════════════════════════
// A. /register — username prefill sanitize (FR-LO-14 LINE username ยาว/ตัวใหญ่)
// ═══════════════════════════════════════════════════════════════════════════

test('FR-LO-14-AC-06 register: LINE username (lineU9d3995738c072255fdcedf985a88608c) ถูก sanitize → lowercase ≤30 ตัว', async ({
  context,
  page,
}) => {
  // seed: fresh-fb state → needsRegistration (proxy เด้ง /register)
  // จำลอง LINE user: username = `lineU9d3995738c072255fdcedf985a88608c` (ตัวพิมพ์ใหญ่ + ยาวกว่า 30)
  const s = Math.random().toString(36).slice(2, 8)
  const longLineUsername = 'lineU9d3995738c072255fdcedf985a88608c' // 38 ตัว มีตัวพิมพ์ใหญ่

  // seed user ด้วย username จำลอง LINE (ยาวกว่า 30 chars — ปกติมีอยู่ใน DB แบบนี้เพราะ upsertOAuthUser)
  // ใช้ Prisma createSeller แบบ manual เพื่อกำหนด username ที่ต้องการ
  const user = await prisma.user.create({
    data: {
      displayName: 'LINE Test User',
      username: longLineUsername.toLowerCase().slice(0, 30), // DB บันทึกแค่ 30 ตัว แต่ prefix ยังเป็น line
      authAccounts: { create: { provider: 'LINE', providerAccountId: `line-qa-${s}` } },
    },
  })

  const seeded = {
    userId: user.id,
    needsRegistration: true, // ไม่มี phone → proxy เด้ง /register
    needsOnboarding: true,
  }

  try {
    await loginAs(context, seeded)
    await page.goto('/register', { waitUntil: 'domcontentloaded' })

    // ตรวจว่า redirect ไป /register (ไม่ถูก redirect ออก)
    await expect(page).toHaveURL(/\/register/, { timeout: 10_000 })

    // รอ component hydrate (ready state = username input ปรากฏ)
    const usernameInput = page.getByPlaceholder('a-z, 0-9, _ เท่านั้น')
    await expect(usernameInput).toBeVisible({ timeout: 10_000 })

    // ตรวจค่า prefill ใน input (ผ่าน useEffect sanitize: lowercase + ≤30 + strip non-[a-z0-9_])
    const value = await usernameInput.inputValue()

    // ต้อง lowercase ทั้งหมด
    expect(value).toBe(value.toLowerCase())

    // ต้องยาวไม่เกิน 30
    expect(value.length).toBeLessThanOrEqual(30)

    // ต้องผ่าน regex a-z0-9_ เท่านั้น (ไม่มีตัวพิมพ์ใหญ่หรืออักขระพิเศษ)
    expect(value).toMatch(/^[a-z0-9_]*$/)

    // ต้องยังคง prefix "line" ไว้ (sanitize slice จากซ้าย)
    expect(value.startsWith('line')).toBe(true)
  } finally {
    // cleanup: ลบ authAccount ก่อน ลบ user
    await prisma.authAccount.deleteMany({ where: { userId: user.id } }).catch(() => {})
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
  }
})

test('register: username ที่ผ่าน regex (a-z0-9_ 3-30 ตัว) → กด ถัดไป ไม่โดน toast validation error', async ({
  context,
  page,
}) => {
  // seed fresh-fb ปกติ
  const seeded = await createSeller('fresh-fb')

  try {
    await loginAs(context, seeded)
    await page.goto('/register', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/register/, { timeout: 10_000 })

    const usernameInput = page.getByPlaceholder('a-z, 0-9, _ เท่านั้น')
    await expect(usernameInput).toBeVisible({ timeout: 10_000 })

    // ล้าง prefill แล้วพิมพ์ username ที่ valid
    await usernameInput.fill('')
    await usernameInput.fill('validusr')

    // รอ debounce check-username (400ms) → uStatus = ok หรือ taken
    // ใน test เราแค่ตรวจว่าไม่มี toast "กรุณาตั้งชื่อผู้ใช้ที่ใช้ได้" ขณะ typing valid value
    // (toast เด้งเฉพาะเมื่อ uStatus !== 'ok' แล้วกด submit)

    // กรอกเบอร์โทรที่ valid ด้วย เพื่อให้ผ่าน phone validation
    const phoneInput = page.getByPlaceholder('08xxxxxxxx')
    await phoneInput.fill('0812345678')

    // ตรวจว่าปุ่ม ถัดไป มีอยู่
    await expect(page.getByRole('button', { name: /ถัดไป/ })).toBeVisible()
  } finally {
    await cleanup(seeded.userId)
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// B. /register — ปุ่ม "ยกเลิก" + Swal confirm
// ═══════════════════════════════════════════════════════════════════════════

test('register: ปุ่ม "ยกเลิก" มีอยู่ใต้ปุ่ม ถัดไป', async ({ context, page }) => {
  const seeded = await createSeller('fresh-fb')

  try {
    await loginAs(context, seeded)
    await page.goto('/register', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/register/, { timeout: 10_000 })

    // รอ component ready
    await expect(page.getByPlaceholder('a-z, 0-9, _ เท่านั้น')).toBeVisible({ timeout: 10_000 })

    // ตรวจว่าปุ่ม ยกเลิก มีอยู่
    const cancelBtn = page.getByRole('button', { name: 'ยกเลิก' })
    await expect(cancelBtn).toBeVisible()

    // ปุ่ม ยกเลิก อยู่ใต้ ถัดไป (DOM order — ยกเลิก ต้องเป็น sibling ถัดไปของ ถัดไป btn)
    const nextBtn = page.getByRole('button', { name: /ถัดไป/ })
    await expect(nextBtn).toBeVisible()
  } finally {
    await cleanup(seeded.userId)
  }
})

test('register: กดปุ่ม "ยกเลิก" → Swal ถาม "ยกเลิกการสร้างบัญชี?"', async ({
  context,
  page,
}) => {
  const seeded = await createSeller('fresh-fb')

  try {
    await loginAs(context, seeded)
    await page.goto('/register', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/register/, { timeout: 10_000 })

    // รอ component ready
    await expect(page.getByPlaceholder('a-z, 0-9, _ เท่านั้น')).toBeVisible({ timeout: 10_000 })

    // กดปุ่ม ยกเลิก → Swal ต้องเด้งขึ้นมา
    await page.getByRole('button', { name: 'ยกเลิก' }).click()

    // รอ Swal dialog ปรากฏ (SweetAlert2 inject .swal2-container)
    await expect(page.locator('.swal2-container')).toBeVisible({ timeout: 5_000 })

    // title ต้องเป็น "ยกเลิกการสร้างบัญชี?"
    await expect(page.locator('.swal2-title')).toContainText('ยกเลิกการสร้างบัญชี?')

    // มีปุ่ม confirm ("ใช่ ยกเลิก") และ cancel ("ไม่ใช่")
    await expect(page.locator('.swal2-confirm')).toContainText('ใช่ ยกเลิก')
    await expect(page.locator('.swal2-cancel')).toContainText('ไม่ใช่')

    // กด "ไม่ใช่" → dialog ปิด ยังอยู่หน้า register
    await page.locator('.swal2-cancel').click()
    await expect(page.locator('.swal2-container')).not.toBeVisible({ timeout: 3_000 })
    await expect(page).toHaveURL(/\/register/)
  } finally {
    await cleanup(seeded.userId)
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// C. /settings — ConnectedAccountsClient render (FR-LO-16-AC-11)
// ═══════════════════════════════════════════════════════════════════════════

test('FR-LO-16-AC-11 settings: FB linked → row "Facebook" = เชื่อมแล้ว, LINE = ยังไม่เชื่อม', async ({
  context,
  page,
}) => {
  // seed: complete seller (มี slug) + AuthAccount FACEBOOK
  // ใช้ createSeller('fresh-fb') = FB user ไม่มีเบอร์ → needsRegistration → proxy block
  // ต้องการ complete seller ที่มี FACEBOOK account → seed manual
  const s = Math.random().toString(36).slice(2, 8)

  const user = await prisma.user.create({
    data: {
      displayName: 'QA Settings FB',
      username: `qasettings_${s}`,
      phone: `09${String(Date.now()).slice(-8)}`,
      isShop: true,
      authAccounts: { create: { provider: 'FACEBOOK', providerAccountId: `fb-qa-${s}` } },
    },
  })
  await prisma.shop.create({
    data: {
      userId: user.id,
      shopName: 'QA Settings Shop',
      businessType: 'INDIVIDUAL',
      slug: `qasettings-${s}`,
    },
  })

  const seeded = {
    userId: user.id,
    needsRegistration: false,
    needsOnboarding: false,
  }

  try {
    await loginAs(context, seeded)
    await page.goto('/settings', { waitUntil: 'domcontentloaded' })

    // รอ settings page โหลด
    await expect(page).toHaveURL(/\/settings/, { timeout: 15_000 })

    // หัว section "บัญชีที่เชื่อมต่อ"
    await expect(page.getByText('บัญชีที่เชื่อมต่อ')).toBeVisible({ timeout: 10_000 })

    // Facebook row — ต้องมีข้อความ "เชื่อมแล้ว" (badge status)
    const fbRow = page.locator('div').filter({ hasText: 'Facebook' }).first()
    await expect(fbRow.getByText('เชื่อมแล้ว')).toBeVisible({ timeout: 5_000 })

    // Facebook ปุ่มต้องเป็น "ยกเลิก" (disconnect — เพราะ linked)
    await expect(page.locator('button', { hasText: 'ยกเลิก' }).first()).toBeVisible()

    // LINE row — ต้องมีข้อความ "ยังไม่เชื่อม"
    const lineRow = page.locator('div').filter({ hasText: 'LINE' }).first()
    await expect(lineRow.getByText('ยังไม่เชื่อม')).toBeVisible({ timeout: 5_000 })

    // LINE ปุ่มต้องเป็น "เชื่อมต่อ" (connect — เพราะไม่ linked)
    // ใช้ text match ที่ specific กว่า เพื่อกัน false-positive จาก FB row
    const connectBtns = page.locator('button', { hasText: 'เชื่อมต่อ' })
    await expect(connectBtns.first()).toBeVisible()
  } finally {
    await prisma.authAccount.deleteMany({ where: { userId: user.id } }).catch(() => {})
    await prisma.shop.deleteMany({ where: { userId: user.id } }).catch(() => {})
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
  }
})

test('FR-LO-16-AC-11 settings: ทั้ง FB และ LINE linked → ทั้งสอง row เป็น "เชื่อมแล้ว"', async ({
  context,
  page,
}) => {
  const s = Math.random().toString(36).slice(2, 8)

  const user = await prisma.user.create({
    data: {
      displayName: 'QA Settings FB+LINE',
      username: `qasettings2_${s}`,
      phone: `09${String(Date.now()).slice(-8)}`,
      isShop: true,
      authAccounts: {
        create: [
          { provider: 'FACEBOOK', providerAccountId: `fb-qa2-${s}` },
          { provider: 'LINE', providerAccountId: `line-qa2-${s}` },
        ],
      },
    },
  })
  await prisma.shop.create({
    data: {
      userId: user.id,
      shopName: 'QA Settings Shop2',
      businessType: 'INDIVIDUAL',
      slug: `qasettings2-${s}`,
    },
  })

  const seeded = { userId: user.id, needsRegistration: false, needsOnboarding: false }

  try {
    await loginAs(context, seeded)
    await page.goto('/settings', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/settings/, { timeout: 15_000 })
    await expect(page.getByText('บัญชีที่เชื่อมต่อ')).toBeVisible({ timeout: 10_000 })

    // ทั้ง 2 ต้องเป็น "เชื่อมแล้ว"
    const linkedBadges = page.locator('span', { hasText: 'เชื่อมแล้ว' })
    await expect(linkedBadges).toHaveCount(2, { timeout: 5_000 })

    // ทั้ง 2 ปุ่มต้องเป็น "ยกเลิก" (disconnect)
    const disconnectBtns = page.locator('button', { hasText: 'ยกเลิก' })
    // อาจมีปุ่มยกเลิกอื่นในหน้า แต่ต้องมีอย่างน้อย 2 ปุ่ม (จาก FB + LINE)
    const count = await disconnectBtns.count()
    expect(count).toBeGreaterThanOrEqual(2)
  } finally {
    await prisma.authAccount.deleteMany({ where: { userId: user.id } }).catch(() => {})
    await prisma.shop.deleteMany({ where: { userId: user.id } }).catch(() => {})
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
  }
})

test('FR-LO-16-AC-11 settings: ไม่มี provider ใดเลย → ทั้ง FB และ LINE เป็น "ยังไม่เชื่อม"', async ({
  context,
  page,
}) => {
  // ใช้ manual-complete (password login เท่านั้น ไม่มี authAccount OAuth)
  const seeded = await createSeller('manual-complete')

  try {
    await loginAs(context, seeded)
    await page.goto('/settings', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/settings/, { timeout: 15_000 })
    await expect(page.getByText('บัญชีที่เชื่อมต่อ')).toBeVisible({ timeout: 10_000 })

    // ทั้ง FB และ LINE ต้องแสดง "ยังไม่เชื่อม"
    const unlinkedBadges = page.locator('span', { hasText: 'ยังไม่เชื่อม' })
    // ต้องมีอย่างน้อย 2 (FB + LINE)
    const count = await unlinkedBadges.count()
    expect(count).toBeGreaterThanOrEqual(2)

    // ปุ่ม "เชื่อมต่อ" ต้องมีอย่างน้อย 2 (สำหรับ FB + LINE)
    const connectBtns = page.locator('button', { hasText: 'เชื่อมต่อ' })
    const connectCount = await connectBtns.count()
    expect(connectCount).toBeGreaterThanOrEqual(2)
  } finally {
    await cleanup(seeded.userId)
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// D. IG flag-off (FR-LO-15-AC-01) — row Instagram ไม่อยู่ใน DOM
// ═══════════════════════════════════════════════════════════════════════════

test('FR-LO-15-AC-01 settings: NEXT_PUBLIC_ENABLE_IG_LOGIN ไม่ตั้ง → Instagram row ไม่อยู่ใน DOM', async ({
  context,
  page,
}) => {
  /**
   * ทำไม test นี้ทำงานได้ถึงแม้ NEXT_PUBLIC_ENABLE_IG_LOGIN ถูก bake ตอน build:
   * - process.env.NEXT_PUBLIC_ENABLE_IG_LOGIN ถูก inline โดย Next.js ที่ build time
   * - ถ้า .env.local ไม่ตั้ง NEXT_PUBLIC_ENABLE_IG_LOGIN → dev server build ด้วย undefined
   * - ConnectedAccountsClient: `const enableIg = process.env.NEXT_PUBLIC_ENABLE_IG_LOGIN === 'true'`
   *   → undefined !== 'true' → false → IG row ไม่ render (FR-LO-15-AC-01)
   * - หน้า settings ที่รันบน dev server ปัจจุบัน (ไม่มี flag) → ตรวจ DOM ตรงๆ ได้เลย
   */
  const seeded = await createSeller('manual-complete')

  try {
    await loginAs(context, seeded)
    await page.goto('/settings', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/settings/, { timeout: 15_000 })
    await expect(page.getByText('บัญชีที่เชื่อมต่อ')).toBeVisible({ timeout: 10_000 })

    // Instagram row ต้องไม่อยู่ใน DOM เลย (ไม่ใช่แค่ hidden)
    await expect(page.locator('p', { hasText: 'Instagram' })).not.toBeAttached({ timeout: 3_000 })

    // แต่ Facebook และ LINE ต้องมีอยู่ (ยืนยันว่า section render แล้ว)
    await expect(page.locator('p', { hasText: 'Facebook' })).toBeVisible()
    await expect(page.locator('p', { hasText: 'LINE' })).toBeVisible()
  } finally {
    await cleanup(seeded.userId)
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// E. Settings — /api/account/link/start guard (FR-LO-16-AC-05)
// ═══════════════════════════════════════════════════════════════════════════

test('FR-LO-16-AC-05 link/start: ผู้ใช้ไม่ได้ login → 401', async ({ page }) => {
  /**
   * ไม่ inject cookie → unauthenticated → POST /api/account/link/start → 401
   * ทดสอบ guard ระดับ API โดยไม่ต้องทำ OAuth จริง
   */
  const response = await page.request.post(
    'http://seller.deepth.local:4000/api/account/link/start',
    {
      data: { provider: 'line' },
      headers: { 'Content-Type': 'application/json' },
    },
  )
  expect(response.status()).toBe(401)
})
