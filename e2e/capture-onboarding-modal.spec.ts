/** capture + smoke E2E ของ OnboardingModal (feature 00001) — npm run e2e -- e2e/capture-onboarding-modal.spec.ts */
import { test, expect } from '@playwright/test'
import { createSeller, loginAs, cleanup } from './helpers/auth'
import fs from 'fs'

const DIR = '.screenshots/onboarding-modal'
test.beforeAll(() => fs.mkdirSync(DIR, { recursive: true }))
const shot = (page: import('@playwright/test').Page, name: string) =>
  page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true })

test('onboarding modal: dashboard checklist + modal auto-open + walk 5 steps', async ({ context, page }) => {
  // 'complete' = มี slug (ผ่าน proxy) แต่ salesChannels/categories ว่าง → checklist ไม่ครบ → modal auto-open
  const seeded = await createSeller('complete')
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  try {
    await loginAs(context, seeded)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)
    await shot(page, '00-dashboard-modal-open')

    // modal auto-open ที่ step 1 (sales channels) — รอปุ่ม footer; ถ้าไม่เปิด กด checklist item
    const next = page.getByRole('button', { name: /ถัดไป|บันทึก/ })
    const skip = page.getByRole('button', { name: /ข้าม/ })
    if (!(await skip.or(next).first().isVisible().catch(() => false))) {
      await page.getByText('ช่องทางการขาย').first().click()
      await page.waitForTimeout(500)
    }
    await expect(skip.or(next).first()).toBeVisible({ timeout: 10_000 })
    await shot(page, '01-step-sales-channels')

    // step 1 → เลือก channel แล้วบันทึก (ทดสอบ POST sales-channels)
    const fbChip = page.getByRole('button', { name: /Facebook/ }).first()
    if (await fbChip.isVisible().catch(() => false)) await fbChip.click()
    await page.waitForTimeout(200)
    await next.first().click()
    await page.waitForTimeout(700)
    await shot(page, '02-step-categories')

    // step 2 → เลือก 1 หมวด แล้วบันทึก (ทดสอบ POST categories)
    const cat = page.getByRole('button', { name: /แฟชั่น/ }).first()
    if (await cat.isVisible().catch(() => false)) await cat.click()
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: /ถัดไป|บันทึก/ }).first().click()
    await page.waitForTimeout(700)
    await shot(page, '03-step-address')

    // step 3 (address) → ข้าม (map ไม่ปัก)
    await page.getByRole('button', { name: /ข้าม/ }).first().click()
    await page.waitForTimeout(600)
    await shot(page, '04-step-product')

    // step 4 (product) → ข้าม
    await page.getByRole('button', { name: /ข้าม/ }).first().click()
    await page.waitForTimeout(600)
    // step 5 summary — รอ badge fetch ของ modal เสร็จ (loading text หายไป)
    await expect(page.getByText(/กำลังโหลด Achievement/)).toBeHidden({ timeout: 15_000 })
    await page.waitForTimeout(300)
    await shot(page, '05-step-summary')
    // ยืนยัน achievement section แสดงผล (founding 2026 อยู่ใน next/earned ของ modal)
    const modalBadge = page.locator('[role="dialog"], .fixed').getByText('สมาชิกผู้ก่อตั้ง 2026')
    await expect(modalBadge.first()).toBeVisible({ timeout: 5_000 })

    // ไม่มี JS error ร้ายแรง (กรอง noise ที่รู้จัก)
    const real = errors.filter((e) => !/favicon|ResizeObserver|hydrat/i.test(e))
    expect(real, `console/page errors:\n${real.join('\n')}`).toHaveLength(0)
  } finally {
    await cleanup(seeded.userId)
  }
})
