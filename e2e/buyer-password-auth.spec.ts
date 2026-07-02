/**
 * E2E — Buyer Password Auth (S-BA-9)
 *
 * ครอบ: render password form + toggle OTP, ปุ่ม social render, password login สำเร็จ,
 * password login ผิด → error รวม, reset-pass → verify-otp(mode=reset),
 * new-pass redirect กลับเมื่อไม่มี resetDraft.
 *
 * รันบน buyer domain `deepth.local:4000` จริง (ไม่ใช่ localhost — memory feedback_qa_domains).
 * user เป็นคนรัน dev server เอง (`npm run dev -- -p 4000`); รันเทส: `npm run e2e -- buyer-password-auth`
 * dev test phone/OTP `0000000009`/`123456` (dev-only).
 */
import { test, expect } from '@playwright/test'
import bcrypt from 'bcryptjs'
import { prisma, cleanup, type Seeded } from './helpers/auth'

const BUYER = 'http://deepth.local:4000'

test.describe('buyer password auth', () => {
  let seeded: Seeded
  const password = 'Test@1234!'

  test.beforeAll(async () => {
    // seed buyer (ไม่ใช่ shop) ที่มี passwordHash — login ผ่าน buyer-credentials
    const s = Math.random().toString(36).slice(2, 8)
    const user = await prisma.user.create({
      data: {
        displayName: 'QA Buyer',
        username: `qabuyer_${s}`,
        passwordHash: await bcrypt.hash(password, 10),
      },
    })
    seeded = {
      userId: user.id,
      needsRegistration: true,
      needsOnboarding: true,
      username: user.username,
      password,
    }
  })

  test.afterAll(async () => {
    if (seeded) await cleanup(seeded.userId)
  })

  test('sign-in แสดง password form + toggle OTP + ปุ่ม social', async ({ page }) => {
    await page.goto(`${BUYER}/auth/sign-in`)
    await expect(page.getByLabel('ชื่อผู้ใช้')).toBeVisible()
    await expect(page.getByLabel('รหัสผ่าน')).toBeVisible()
    await expect(page.getByRole('button', { name: /Facebook/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /LINE/ })).toBeVisible()
    // toggle ไปโหมด OTP → เห็น field เบอร์โทร
    await page.getByText('เข้าสู่ระบบด้วยรหัส OTP แทน').click()
    await expect(page.getByLabel('เบอร์โทรศัพท์')).toBeVisible()
  })

  test('password login สำเร็จ → redirect ออกจาก /auth', async ({ page }) => {
    await page.goto(`${BUYER}/auth/sign-in`)
    await page.getByLabel('ชื่อผู้ใช้').fill(seeded.username!)
    await page.getByLabel('รหัสผ่าน').fill(password)
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
    await expect(page).not.toHaveURL(/\/auth\/sign-in/)
  })

  test('password login ผิด → error รวม (ไม่ leak field)', async ({ page }) => {
    await page.goto(`${BUYER}/auth/sign-in`)
    await page.getByLabel('ชื่อผู้ใช้').fill(seeded.username!)
    await page.getByLabel('รหัสผ่าน').fill('wrong-password-x')
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
    await expect(page.getByText('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')).toBeVisible()
  })

  test('reset-pass → verify-otp(mode=reset)', async ({ page }) => {
    await page.goto(`${BUYER}/auth/reset-pass`)
    await page.getByLabel('เบอร์โทรศัพท์').fill('0000000009')
    await page.getByRole('button', { name: 'ส่งรหัส OTP' }).click()
    await expect(page).toHaveURL(/\/auth\/verify-otp\?mode=reset/)
  })

  test('new-pass ไม่มี resetDraft → เด้งกลับ reset-pass', async ({ page }) => {
    await page.goto(`${BUYER}/auth/new-pass`)
    await expect(page).toHaveURL(/\/auth\/reset-pass/)
  })
})
