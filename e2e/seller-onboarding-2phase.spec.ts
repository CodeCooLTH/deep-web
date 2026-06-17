/**
 * E2E — Seller 2-phase onboarding (FB OAuth bypass)
 * รัน: `npm run e2e` (ต้องมี dev server ที่ seller.deepth.local:4000 + .env.local)
 * bypass FB ด้วย seed user + NextAuth cookie (e2e/helpers/auth.ts)
 * spec: docs/superpowers/specs/2026-06-17-fb-onboarding-mandatory-page-design.md
 */
import { test, expect } from '@playwright/test'
import { createSeller, loginAs, cleanup, prisma } from './helpers/auth'

test.afterAll(async () => { await prisma.$disconnect() })

test('เฟส 1: FB user (ไม่มีเบอร์) → ถูกบังคับไป /register + ข้ามไป /onboarding ไม่ได้', async ({ context, page }) => {
  const seeded = await createSeller('fresh-fb')
  try {
    await loginAs(context, seeded)
    await page.goto('/')
    await expect(page).toHaveURL(/\/register/)
    await expect(page.getByText('ยินดีต้อนรับสู่ Deep')).toBeVisible()
    await page.getByRole('button', { name: /เริ่มเลย/ }).click()
    await expect(page.getByRole('heading', { name: 'ข้อมูลร้านค้า' })).toBeVisible()
    await expect(page.getByPlaceholder('ชื่อ-นามสกุล หรือชื่อเล่น')).toBeVisible()
    await expect(page.getByPlaceholder('08xxxxxxxx')).toBeVisible()
    // ข้ามเฟสไม่ได้
    await page.goto('/onboarding')
    await expect(page).toHaveURL(/\/register/)
  } finally {
    await cleanup(seeded.userId)
  }
})

test('เฟส 2: seller มีเบอร์ ไม่มี slug → ถูกบังคับไป /onboarding (slug step)', async ({ context, page }) => {
  const seeded = await createSeller('no-slug')
  try {
    await loginAs(context, seeded)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/onboarding/)
    await expect(page.getByRole('heading', { name: 'ตั้ง URL ร้านของคุณ' })).toBeVisible()
    await expect(page.getByPlaceholder('yourshop')).toBeVisible()
    // ผ่านเฟส 1 แล้ว → /register เด้งออก (ไป /dashboard → /onboarding)
    await page.goto('/register')
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/)
  } finally {
    await cleanup(seeded.userId)
  }
})

test('ครบแล้ว: seller มี slug → /dashboard เข้าได้ + /onboarding เด้งออก', async ({ context, page }) => {
  const seeded = await createSeller('complete')
  try {
    await loginAs(context, seeded)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
    await page.goto('/onboarding')
    await expect(page).toHaveURL(/\/dashboard/)
  } finally {
    await cleanup(seeded.userId)
  }
})
