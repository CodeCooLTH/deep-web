/**
 * E2E — AI Suggestion Usage Limit & Credit (feature 00019 ext, 2026-07-29)
 * รัน: `npm run e2e` (ต้องมี dev server ที่ seller.deepth.local:4000 serve worktree/branch
 *   `feature/ai-suggestion-limit` — verify ก่อนด้วย `curl .../api/chat/ai-quota` ต้องได้ 401 ไม่ใช่ 404)
 * spec (SSOT): docs/20 - Features/00019 - AI Reply Assistant/EXTENSIONS-2026-07-29-usage-limit.md
 *
 * หมายเหตุ: เขียนโดยอ่าน source โดยตรง (route/service/component) — ยังไม่เคยรันจริงกับ dev server ที่ถูกต้อง
 * (QA run 2026-07-29 เจอ blocker: server serve worktree ผิด + worktree นี้ไม่มี .env.local เลย
 * ไม่มี DATABASE_URL/NEXTAUTH_SECRET ให้ seed ได้) — รอบถัดไปต้องรันแล้วแก้ selector/assert ที่พลาดจากของจริง
 *
 * bypass login ด้วย e2e/helpers/auth.ts (createSeller('manual-complete') → OWNER ของร้านใหม่)
 * seed เพิ่มเติมนอกเหนือ helper: BusinessPackageSubscription (paid), SellerWallet, AiSuggestDailyUsage,
 * Conversation + ChatMessage (ai-suggest 400 ถ้าเธรดไม่มีข้อความเลย) — ทำตรงในไฟล์นี้ผ่าน prisma ที่ export
 * จาก helper (`prisma`)
 */
import { test, expect } from '@playwright/test'
import { createSeller, loginAs, cleanup, prisma } from './helpers/auth'
import { randomUUID } from 'crypto'

const FREE_LIMIT = 10

async function seedConversation(shopId: string) {
  const conversation = await prisma.conversation.create({
    data: { id: randomUUID(), shopId, channel: 'DEEP' },
  })
  await prisma.chatMessage.create({
    data: {
      id: randomUUID(),
      conversationId: conversation.id,
      senderRole: 'BUYER',
      type: 'TEXT',
      body: 'สวัสดีครับ สอบถามสินค้าหน่อยครับ',
    },
  })
  return conversation.id
}

async function makePaidPlan(userId: string) {
  const now = new Date()
  await prisma.businessPackageSubscription.create({
    data: {
      ownerId: userId,
      tier: 'GROWTH',
      status: 'ACTIVE',
      activatedAt: now,
      currentPeriodStart: now,
      nextRenewalAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    },
  })
}

async function seedWallet(shopId: string, balance: number) {
  await prisma.sellerWallet.create({ data: { shopId, balance } })
}

async function seedDailyUsage(shopId: string, count: number) {
  const { todayThaiIsoDate } = await import('../src/lib/date-range')
  await prisma.aiSuggestDailyUsage.create({ data: { shopId, date: todayThaiIsoDate(), count } })
}

async function cleanupExtra(userId: string, shopId: string) {
  await prisma.aiSuggestUsageEvent.deleteMany({ where: { shopId } }).catch(() => {})
  await prisma.aiSuggestDailyUsage.deleteMany({ where: { shopId } }).catch(() => {})
  await prisma.walletTransaction.deleteMany({ where: { wallet: { shopId } } }).catch(() => {})
  await prisma.sellerWallet.deleteMany({ where: { shopId } }).catch(() => {})
  await prisma.chatMessage.deleteMany({ where: { conversation: { shopId } } }).catch(() => {})
  await prisma.conversation.deleteMany({ where: { shopId } }).catch(() => {})
  await prisma.businessPackageSubscription.deleteMany({ where: { ownerId: userId } }).catch(() => {})
}

test.afterAll(async () => {
  await prisma.$disconnect()
})

test.describe('A. /settings/ai — gate ตามแพ็กเกจ', () => {
  test('A1+A2+A5: ร้าน non-paid — สวิตช์ disabled + badge อัพเกรด + บันทึกคำสั่งประจำร้านสำเร็จ + ค่า context ไม่ถูกเขียนทับ', async ({ context, page }) => {
    const seeded = await createSeller('manual-complete')
    const shop = await prisma.shop.findFirstOrThrow({ where: { userId: seeded.userId } })
    // ค่า default ของ ShopAiSetting เป็น true ทั้ง 3 ตัว (ยังไม่เคย upsert) — ไม่ seed เอง ปล่อยให้ getAiSetting คืน default
    try {
      await loginAs(context, seeded)
      await page.goto('/settings/ai')

      const productSwitch = page.getByRole('checkbox').nth(0)
      await expect(productSwitch).toBeDisabled()
      await expect(page.getByRole('link', { name: /อัพเกรดแพ็กเกจ|ต่ออายุแพ็กเกจ/ }).first()).toHaveAttribute('href', '/business')
      await expect(page.getByText('ตอนนี้ AI เห็นเฉพาะข้อความในแชทเท่านั้น')).toBeVisible()

      const textarea = page.locator('#ai-instruction')
      await textarea.fill('ร้านทดสอบ QA — ตอบสุภาพ')
      await page.getByRole('button', { name: /บันทึกการตั้งค่า/ }).click()
      await expect(page.getByText('บันทึกการตั้งค่าแล้ว')).toBeVisible({ timeout: 10_000 })

      const setting = await prisma.shopAiSetting.findUnique({ where: { shopId: shop.id } })
      expect(setting?.instruction).toBe('ร้านทดสอบ QA — ตอบสุภาพ')
      // BR-AIQ-14 — ค่า default (true) ต้องไม่ถูกเขียนทับเป็น false แม้ client เป็น non-paid
      expect(setting?.includeProductContext).toBe(true)
      expect(setting?.includeCustomerContext).toBe(true)
      expect(setting?.includeMediaContext).toBe(true)
    } finally {
      await cleanupExtra(seeded.userId, shop.id)
      await cleanup(seeded.userId)
    }
  })

  test('A3: ร้าน paid plan — ไม่มี badge, สวิตช์กดได้ปกติ', async ({ context, page }) => {
    const seeded = await createSeller('manual-complete')
    const shop = await prisma.shop.findFirstOrThrow({ where: { userId: seeded.userId } })
    await makePaidPlan(seeded.userId)
    try {
      await loginAs(context, seeded)
      await page.goto('/settings/ai')
      await expect(page.getByRole('link', { name: /อัพเกรดแพ็กเกจ|ต่ออายุแพ็กเกจ/ })).toHaveCount(0)
      const productSwitch = page.getByRole('checkbox').nth(0)
      await expect(productSwitch).toBeEnabled()
    } finally {
      await cleanupExtra(seeded.userId, shop.id)
      await cleanup(seeded.userId)
    }
  })

  test('A4: PUT /api/shops/ai-settings ตรง — ร้าน non-paid ถูกปฏิเสธเปลี่ยน 3 ฟิลด์บริบท แต่ instruction-only ผ่าน', async ({ context, page, request }) => {
    const seeded = await createSeller('manual-complete')
    const shop = await prisma.shop.findFirstOrThrow({ where: { userId: seeded.userId } })
    try {
      await loginAs(context, seeded)
      await page.goto('/settings/ai') // ให้ cookie ผูก origin ก่อนยิง API ผ่าน request context เดียวกัน

      const resForbidden = await page.request.put('/api/shops/ai-settings', {
        data: { instruction: 'x', includeProductContext: true, includeCustomerContext: true, includeMediaContext: true },
      })
      expect(resForbidden.status()).toBe(403)
      const bodyForbidden = await resForbidden.json()
      expect(bodyForbidden.code).toBe('CONTEXT_GATE_PAID_PLAN_REQUIRED')

      const resOk = await page.request.put('/api/shops/ai-settings', { data: { instruction: 'เฉพาะคำสั่งประจำร้าน' } })
      expect(resOk.status()).toBe(200)
    } finally {
      await cleanupExtra(seeded.userId, shop.id)
      await cleanup(seeded.userId)
    }
  })
})

test.describe('B. แผง AI ในหน้าแชท', () => {
  test('B6: ร้าน paid plan — unlimited path ไม่มี dialog + ไม่แตะ AiSuggestDailyUsage', async ({ context, page }) => {
    const seeded = await createSeller('manual-complete')
    const shop = await prisma.shop.findFirstOrThrow({ where: { userId: seeded.userId } })
    await makePaidPlan(seeded.userId)
    const conversationId = await seedConversation(shop.id)
    try {
      await loginAs(context, seeded)
      await page.goto(`/inbox/${conversationId}`)
      await page.getByRole('button', { name: /AI ช่วยร่าง/ }).click().catch(() => {})
      await expect(page.getByText('ใช้ได้ไม่จำกัด')).toBeVisible({ timeout: 15_000 })
      const usage = await prisma.aiSuggestDailyUsage.findUnique({ where: { shopId_date: { shopId: shop.id, date: new Date().toISOString().slice(0, 10) } } })
      expect(usage).toBeNull()
    } finally {
      await cleanupExtra(seeded.userId, shop.id)
      await cleanup(seeded.userId)
    }
  })

  test('B10 (boundary): count=9 → ครั้งที่ 10 ยังฟรี ไม่หักเงิน', async ({ context, page }) => {
    const seeded = await createSeller('manual-complete')
    const shop = await prisma.shop.findFirstOrThrow({ where: { userId: seeded.userId } })
    await seedWallet(shop.id, 100)
    await seedDailyUsage(shop.id, FREE_LIMIT - 1)
    const conversationId = await seedConversation(shop.id)
    try {
      await loginAs(context, seeded)
      await page.goto(`/inbox/${conversationId}`)
      await page.getByRole('button', { name: /AI ช่วยร่าง/ }).click().catch(() => {})
      // ต้อง auto ได้ suggestions (ไม่ใช่ credit-prompt) — Swal ต้องไม่ปรากฏ
      await expect(page.locator('.swal2-popup')).toHaveCount(0)
      const wallet = await prisma.sellerWallet.findUnique({ where: { shopId: shop.id } })
      expect(wallet?.balance).toBe(100) // ไม่ถูกหัก
    } finally {
      await cleanupExtra(seeded.userId, shop.id)
      await cleanup(seeded.userId)
    }
  })

  test('B8: count=10 + มีเครดิต — ปุ่ม credit-prompt → Swal ยืนยัน → หักเครดิต ฿1', async ({ context, page }) => {
    const seeded = await createSeller('manual-complete')
    const shop = await prisma.shop.findFirstOrThrow({ where: { userId: seeded.userId } })
    await seedWallet(shop.id, 50)
    await seedDailyUsage(shop.id, FREE_LIMIT)
    const conversationId = await seedConversation(shop.id)
    try {
      await loginAs(context, seeded)
      await page.goto(`/inbox/${conversationId}`)
      await page.getByRole('button', { name: /AI ช่วยร่าง/ }).click().catch(() => {})
      const creditBtn = page.getByRole('button', { name: /ใช้เครดิต ฿1 เพื่อขอร่างเพิ่ม/ })
      await expect(creditBtn).toBeVisible({ timeout: 15_000 })
      await creditBtn.click()
      await expect(page.locator('.swal2-popup')).toBeVisible()
      await page.getByRole('button', { name: 'ใช้เครดิต ฿1' }).click()
      await expect(page.getByText(/หักเครดิต ฿1 แล้ว/)).toBeVisible({ timeout: 15_000 })

      const wallet = await prisma.sellerWallet.findUnique({ where: { shopId: shop.id } })
      expect(wallet?.balance).toBe(49)
      const tx = await prisma.walletTransaction.findFirst({ where: { walletId: wallet!.id, reason: 'AI_SUGGEST_EXTRA_USE' }, orderBy: { createdAt: 'desc' } })
      expect(tx).not.toBeNull()
      expect(tx?.amount).toBe(-1) // DEDUCT convention — verify sign against wallet.service.ts จริงตอนรัน
    } finally {
      await cleanupExtra(seeded.userId, shop.id)
      await cleanup(seeded.userId)
    }
  })

  test('B9: count=10 + เครดิต ฿0 — บล็อกทันที ไม่มี Swal', async ({ context, page }) => {
    const seeded = await createSeller('manual-complete')
    const shop = await prisma.shop.findFirstOrThrow({ where: { userId: seeded.userId } })
    await seedWallet(shop.id, 0)
    await seedDailyUsage(shop.id, FREE_LIMIT)
    const conversationId = await seedConversation(shop.id)
    try {
      await loginAs(context, seeded)
      await page.goto(`/inbox/${conversationId}`)
      await page.getByRole('button', { name: /AI ช่วยร่าง/ }).click().catch(() => {})
      await expect(page.getByText(/เครดิตไม่พอ/)).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('.swal2-popup')).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'เติมเครดิต' })).toHaveAttribute('href', '/wallet')
      await expect(page.getByRole('link', { name: /อัพเกรดแพ็กเกจ ใช้ AI ไม่จำกัด/ })).toHaveAttribute('href', '/business')
    } finally {
      await cleanupExtra(seeded.userId, shop.id)
      await cleanup(seeded.userId)
    }
  })

  test('B11: POST ai-suggest ตรงพร้อม confirmUseCredit:true ตอนยังมีโควตาฟรี — ต้องใช้ free path ไม่หักเงิน', async ({ context, page }) => {
    const seeded = await createSeller('manual-complete')
    const shop = await prisma.shop.findFirstOrThrow({ where: { userId: seeded.userId } })
    await seedWallet(shop.id, 20)
    const conversationId = await seedConversation(shop.id)
    try {
      await loginAs(context, seeded)
      await page.goto(`/inbox/${conversationId}`) // ผูก cookie/origin
      const res = await page.request.post(`/api/chat/conversations/${conversationId}/ai-suggest`, {
        data: { confirmUseCredit: true },
      })
      const body = await res.json().catch(() => null)
      // 200 (Gemini configured) หรือ 503 (ยังไม่ตั้งค่า) ยอมรับได้ทั้งคู่ — สิ่งที่ห้ามคือหักเงิน
      if (res.ok()) {
        expect(body.usedCredit).toBe(false)
      }
      const wallet = await prisma.sellerWallet.findUnique({ where: { shopId: shop.id } })
      expect(wallet?.balance).toBe(20)
    } finally {
      await cleanupExtra(seeded.userId, shop.id)
      await cleanup(seeded.userId)
    }
  })
})
