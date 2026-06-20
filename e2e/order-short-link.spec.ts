/**
 * E2E: Order short link (/o/{8-char shortCode})
 *
 * ตรวจ: short-code permanent link → redirect เข้า flow UUID เดิม (phone-unlock, reusable)
 *   ต่างจาก SMS 12-char (auto-unlock, single-use) — short-code ไม่ auto-unlock
 *
 * รัน: E2E_SHORT_CODE=<8char> E2E_BUYER_PHONE=<เบอร์ตรง buyerContact> npm run e2e -- order-short-link
 *   (dev server ต้องขึ้นที่ deepth.local:4000 + restart หลัง migrate เพื่อโหลด Prisma client ใหม่)
 *   หา shortCode จริง: SELECT "shortCode","buyerContact" FROM "Order" WHERE "shortCode" IS NOT NULL LIMIT 1;
 *
 * หมายเหตุ host: หน้า /o/ อยู่ buyer host (deepth.local) ไม่ใช่ seller baseURL → ใช้ absolute URL
 */
import { test, expect } from '@playwright/test'

const BUYER_BASE = 'http://deepth.local:4000'
const SHORT_CODE = process.env.E2E_SHORT_CODE
const BUYER_PHONE = process.env.E2E_BUYER_PHONE

const UUID_URL_RE = /\/o\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test.describe('order short link', () => {
  test.skip(!SHORT_CODE || !BUYER_PHONE, 'ต้องตั้ง E2E_SHORT_CODE + E2E_BUYER_PHONE')

  test('short-code → redirect /o/{uuid} แล้วแสดง phone-unlock (ไม่ auto-unlock)', async ({ page }) => {
    await page.goto(`${BUYER_BASE}/o/${SHORT_CODE}`, { waitUntil: 'domcontentloaded' })
    // redirect เข้า UUID flow (ไม่ใช่ /o/link-invalid)
    await expect(page).toHaveURL(UUID_URL_RE)
    // phone-unlock แสดง (reusable, server ไม่ได้ปลดล็อกให้อัตโนมัติ)
    await page.getByRole('textbox').first().fill(BUYER_PHONE!)
    await page.getByRole('button', { name: /ยืนยัน|ปลดล็อก|ดูคำสั่งซื้อ/ }).click()
    await expect(page.getByText(/คำสั่งซื้อ|ยอดรวม|ยืนยันคำสั่งซื้อ/).first()).toBeVisible()
  })

  test('short-code ใช้ซ้ำได้ (reusable — เปิดรอบสองยัง redirect เข้า UUID)', async ({ page }) => {
    await page.goto(`${BUYER_BASE}/o/${SHORT_CODE}`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(UUID_URL_RE)
  })
})

test('short-code มั่ว (ไม่มีจริง) → /o/link-invalid (RC-2 uniform)', async ({ page }) => {
  await page.goto(`${BUYER_BASE}/o/ZZZZZZZZ`, { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/o\/link-invalid$/)
})
