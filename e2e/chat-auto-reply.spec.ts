/**
 * E2E — ตอบแชทอัตโนมัติ (feature 00023, S-15)
 *
 * ครอบเส้นทางจริงที่ร้านต้องเดินตั้งแต่ยังไม่มีอะไรเลยจนกลุ่มคำตอบลูกค้าได้:
 *   หน้ารายการเปล่า → สร้าง → ใส่คำตรวจจับ → ใส่คำตอบ → เปลี่ยนสถานะ → กลับมาดูในตาราง → ลบ
 *
 * ด่านกันพลาดที่ต้องพิสูจน์ว่าทำงานจริง (ไม่ใช่แค่ซ่อนปุ่ม):
 *   - ตั้ง "ทดสอบ" ทั้งที่ยังไม่มีแชททดสอบ ต้องถูกปฏิเสธ ไม่ใช่เงียบแล้วไม่ตอบใคร
 *   - เปลี่ยนเป็น "ตอบลูกค้าจริง" ต้องถามยืนยันก่อนเสมอ
 *
 * regression guard: สวิตช์เปิด/ปิดระดับร้านถูกลบทิ้งแล้ว (2026-07-30) — ถ้าโผล่กลับมา
 * แปลว่ากับดัก "แถวเป็นตอบลูกค้าจริงแต่เงียบเพราะสวิตช์ร้านปิด" กลับมาด้วย
 *
 * bypass login ด้วย e2e/helpers/auth.ts (seed user + ฉีด session cookie)
 */
import { test, expect, type Page } from '@playwright/test'
import { createSeller, loginAs, cleanup, prisma, type Seeded } from './helpers/auth'

const KEYWORD_NAME = 'สนใจสินค้า (E2E)'

let seeded: Seeded

test.beforeAll(async () => {
  seeded = await createSeller('complete')
})

test.afterAll(async () => {
  await cleanup(seeded.userId)
  await prisma.$disconnect()
})

test.beforeEach(async ({ context }) => {
  await loginAs(context, seeded)
  // ปิด onboarding modal ที่เด้งอัตโนมัติครั้งแรกต่อ device (OnboardingGate) —
  // browser ของ E2E สะอาดทุกรอบจึงเด้งเสมอ แล้ว backdrop จะบังปุ่มทั้งหน้า
  await context.addInitScript(() => {
    try {
      localStorage.setItem('onboarding_modal_shown_v1', '1')
    } catch {
      /* private mode — gate ข้ามให้เองอยู่แล้ว */
    }
  })
})

/** toast ของ Paces อยู่ใน region ที่มี aria-live="polite" */
function toast(page: Page) {
  return page.locator('[aria-live="polite"]')
}

/** ปุ่มยืนยันของ SweetAlert (pacesConfirm) */
function swalConfirm(page: Page) {
  return page.locator('.swal2-confirm')
}

test.describe('ตอบแชทอัตโนมัติ — เส้นทางเต็มของร้าน', () => {
  test('สร้าง → ใส่คำ → ใส่คำตอบ → เปลี่ยนสถานะ → เห็นในตาราง → ลบ', async ({ page }) => {
    // ── 1) หน้ารายการตอนยังไม่มีอะไรเลย ──────────────────────────────
    await page.goto('/settings/auto-reply')
    await expect(page.getByRole('heading', { name: 'ตอบแชทอัตโนมัติ' }).first()).toBeVisible()

    // empty state ต้องแยก "ยังไม่เคยสร้าง" ออกจาก "กรองแล้วไม่เจอ" (clarify 2026-07-30)
    await expect(page.getByText('ยังไม่มีกลุ่มคำ').first()).toBeVisible()

    // regression: ต้องไม่มีสวิตช์เปิด/ปิดระดับร้านแล้ว
    await expect(page.getByLabel('เปิดใช้งานการตอบแชทอัตโนมัติทั้งร้าน')).toHaveCount(0)

    // ── 2) สร้างกลุ่มคำ ────────────────────────────────────────────
    await page.getByRole('link', { name: /สร้างกลุ่มคำ|สร้าง/ }).first().click()
    await page.getByLabel('ชื่อกลุ่มคำ').fill(KEYWORD_NAME)
    await page.getByRole('button', { name: 'สร้างแล้วไปตั้งค่าต่อ' }).click()

    // เด้งเข้าหน้าแก้ไขของกลุ่มที่เพิ่งสร้าง
    await page.waitForURL(/\/settings\/auto-reply\/[0-9a-f-]{36}/)
    const editorUrl = page.url()

    // สร้างใหม่ต้องเป็น "ไม่ใช้งาน" เสมอ — ห้ามแตะลูกค้าตั้งแต่วินาทีแรก
    const statusGroup = page.getByRole('group', { name: 'สถานะของกลุ่มคำนี้' })
    await expect(statusGroup.getByRole('button', { name: 'ไม่ใช้งาน' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // ── 3) คำตรวจจับ ───────────────────────────────────────────────
    const phraseInput = page.getByLabel('คำตรวจจับใหม่')
    for (const phrase of ['สนใจ', 'ราคาเท่าไหร่']) {
      await phraseInput.fill(phrase)
      await phraseInput.press('Enter')
      // ต้องรอชิปขึ้นก่อนพิมพ์คำถัดไป — ฟอร์มมี busy-guard กันยิงซ้อน
      await expect(page.getByText(phrase, { exact: true }).first()).toBeVisible()
    }

    // ── 4) คำตอบหลัก + บันทึก ──────────────────────────────────────
    await page.getByLabel('ทุกกรณีที่เหลือ').fill('สนใจรายการไหนคะ ส่งชื่อสินค้ามาได้เลยค่ะ')
    // แถบบันทึกเป็น sticky — เลื่อนให้เข้าที่ก่อน ไม่งั้น Playwright ตัดสินว่า element ยังไม่นิ่ง
    const saveBtn = page.getByRole('button', { name: 'บันทึกการเปลี่ยนแปลง' })
    await saveBtn.scrollIntoViewIfNeeded()
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()
    await expect(toast(page).getByText('บันทึกแล้ว')).toBeVisible()

    // แผงพรีวิวต้องโชว์คำตอบที่ตั้งไว้ทันที ไม่ต้องพิมพ์ทดลองก่อน
    await expect(page.getByText('ตัวอย่างคำตอบที่ตั้งไว้')).toBeVisible()

    // ── 5) ด่านกันพลาด: "ทดสอบ" ที่ยังไม่มีแชททดสอบ ต้องถูกปฏิเสธ ───
    await statusGroup.getByRole('button', { name: 'ทดสอบ' }).click()
    await expect(toast(page).first()).toBeVisible()
    // สถานะต้องไม่เปลี่ยน — server ปฏิเสธแล้ว UI ต้องคืนค่าเดิม ไม่ใช่โกหกว่าสำเร็จ
    await expect(statusGroup.getByRole('button', { name: 'ไม่ใช้งาน' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // ── 6) เปลี่ยนเป็น "ตอบลูกค้าจริง" — ต้องถามยืนยันก่อนเสมอ ──────
    await statusGroup.getByRole('button', { name: 'ตอบลูกค้าจริง' }).click()
    await expect(page.locator('.swal2-popup')).toBeVisible()
    await swalConfirm(page).click()
    await expect(statusGroup.getByRole('button', { name: 'ตอบลูกค้าจริง' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // ยืนยันถึงชั้น DB จริง ไม่ใช่แค่ state ใน browser
    await expect
      .poll(async () => {
        const row = await prisma.autoReplyKeyword.findFirst({
          where: { name: KEYWORD_NAME },
          select: { status: true },
        })
        return row?.status
      })
      .toBe('LIVE')

    // ── 7) กลับหน้ารายการ — ต้องเห็นคำจริง ไม่ใช่แค่ตัวเลข ─────────
    await page.goto('/settings/auto-reply')
    const row = page.getByRole('row').filter({ hasText: KEYWORD_NAME })
    await expect(row).toBeVisible()
    await expect(row.getByText('สนใจ', { exact: true })).toBeVisible()
    await expect(row.getByText('ราคาเท่าไหร่', { exact: true })).toBeVisible()

    // สถานะในตารางเป็นปุ่ม 3 ค่าแบบเดียวกับหน้าแก้ไข (ไม่ใช่ dropdown อีกแล้ว)
    const rowStatus = page.getByRole('group', { name: `สถานะของ ${KEYWORD_NAME}` })
    await expect(rowStatus.getByRole('button')).toHaveCount(3)
    await expect(rowStatus.getByRole('button', { name: 'ตอบลูกค้าจริง' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // ── 8) ลบ ──────────────────────────────────────────────────────
    await row.getByRole('button', { name: `ลบ ${KEYWORD_NAME}` }).click()
    await expect(page.locator('.swal2-popup')).toBeVisible()
    await swalConfirm(page).click()
    await expect
      .poll(async () => prisma.autoReplyKeyword.count({ where: { name: KEYWORD_NAME } }))
      .toBe(0)

    // หน้าแก้ไขของกลุ่มที่ลบไปแล้วต้องไม่เปิดค้าง
    await page.goto(editorUrl)
    await expect(page.getByText(/ไม่พบ|404/).first()).toBeVisible({ timeout: 15_000 })
  })
})
