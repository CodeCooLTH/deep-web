/** capture screenshot ทุก step ของ /register + /onboarding (ดู UI) — รัน: npm run e2e -- e2e/capture-onboarding.spec.ts */
import { test } from '@playwright/test'
import { createSeller, loginAs, cleanup, cleanupTestPhone } from './helpers/auth'
import fs from 'fs'

const DIR = '.screenshots/onboarding-capture'
test.beforeAll(() => fs.mkdirSync(DIR, { recursive: true }))
const shot = (page: import('@playwright/test').Page, name: string) =>
  page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true })

test('capture /register 4 steps', async ({ context, page }) => {
  await cleanupTestPhone('0000000003')
  const seeded = await createSeller('fresh-fb')
  try {
    await loginAs(context, seeded)
    await page.goto('/register'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400)
    await shot(page, 'register-1-info')

    await page.getByPlaceholder('a-z, 0-9, _ เท่านั้น').fill('qareg' + String(Date.now()).slice(-5))
    await page.getByPlaceholder('08xxxxxxxx').fill('0000000003')
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /ถัดไป/ }).click()
    await page.waitForTimeout(500)
    await shot(page, 'register-2-warning')

    await page.getByRole('button', { name: /ส่งรหัส OTP/ }).click()
    await page.waitForTimeout(900)
    await shot(page, 'register-3-otp')

    const boxes = page.locator('input[aria-label^="OTP"]')
    for (let i = 0; i < 6; i++) await boxes.nth(i).fill('123456'[i])
    await page.getByRole('button', { name: /ยืนยัน OTP/ }).click()
    await page.waitForTimeout(700)
    await shot(page, 'register-4-success')
  } finally { await cleanup(seeded.userId); await cleanupTestPhone('0000000003') }
})

test('capture /onboarding 4 steps', async ({ context, page }) => {
  const seeded = await createSeller('no-slug')
  try {
    await loginAs(context, seeded)
    await page.goto('/onboarding'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(400)
    await shot(page, 'onboarding-1-category')

    // ChoiceSelect: เปิด dropdown → เลือก option จริง (ข้าม placeholder) ด้วยข้อความ
    await page.locator('.choices').click()
    await page.waitForSelector('.choices__list--dropdown .choices__item--choice', { state: 'visible' })
    await page.locator('.choices__list--dropdown .choices__item--choice[data-value]:not([data-value=""])').first().click()
    await page.waitForFunction(() => {
      const sel = document.querySelector('select')
      return !!sel && sel.value !== ''
    })
    await page.getByRole('button', { name: /ถัดไป/ }).click()

    // step 2: slug — รอ input โผล่ก่อนถ่าย (กัน race กับ "กำลังบันทึก...")
    await page.getByPlaceholder('yourshop').waitFor({ state: 'visible' })
    await page.waitForTimeout(300)
    await shot(page, 'onboarding-2-slug')
    await page.getByPlaceholder('yourshop').fill('qa-cap-' + String(Date.now()).slice(-5))
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: /ถัดไป/ }).click()

    // step 3: address — ค้นหา (single search box) → suggestion → เลือก
    const search = page.getByPlaceholder('พิมพ์ ตำบล, อำเภอ, จังหวัด หรือรหัสไปรษณีย์...')
    await search.waitFor({ state: 'visible' })
    await page.waitForTimeout(300)
    await shot(page, 'onboarding-3a-address-empty')
    await search.fill('ในคลอง')
    await page.getByRole('option').first().waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(200)
    await shot(page, 'onboarding-3b-address-search')
    await page.getByRole('option').first().click()
    await page.getByPlaceholder(/123\/4 หมู่ 5/).waitFor({ state: 'visible' })
    await page.waitForTimeout(200)
    await shot(page, 'onboarding-3c-address-selected')
    await page.getByRole('button', { name: /ถัดไป/ }).click()

    // step 4: product — รอ input ชื่อสินค้าโผล่
    await page.getByPlaceholder('เช่น ข้าวหอมมะลิ').waitFor({ state: 'visible' })
    await page.waitForTimeout(300)
    await shot(page, 'onboarding-4-product')
  } finally { await cleanup(seeded.userId) }
})
