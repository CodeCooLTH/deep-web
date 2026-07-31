/**
 * E2E — ระบบนัดหมายวันเข้าใช้บริการ + มัดจำ (feature 00024)
 *
 * ครอบ TestCase.md กลุ่ม B (ตัวกั้นฟีเจอร์) และ C (ทรัพยากร) เฉพาะส่วนที่ต้องผ่าน browser จริง
 * กลุ่ม A (การกันจองเกินความจุ) ไม่อยู่ที่นี่ — พิสูจน์ด้วย scripts/tc-a05-concurrent-capacity.ts
 * ซึ่งยิงพร้อมกันจริงได้ ต่างจาก Playwright ที่กดทีละครั้ง
 *
 * IMPORTANT: user รัน dev server เอง (กฎ: QA ไม่ start server) — ถ้า :4000 เสิร์ฟ worktree อื่น
 * ให้ override ด้วย E2E_BASE_URL เช่น
 *   E2E_BASE_URL=http://seller.deepth.local:4100 npx playwright test e2e/service-appointment.spec.ts
 *
 * IMPORTANT: seed/cleanup scope ด้วย userId เสมอ (Hard Rule 13) ห้ามล้างตารางแบบไม่มีเงื่อนไข
 */
import { test, expect } from '@playwright/test'
import { prisma, loginAs, cleanup, type Seeded } from './helpers/auth'

/**
 * สร้างร้านตามเงื่อนไขของฟีเจอร์ — ต้องระบุ kind/vertical เอง เพราะ createSeller() ของ helper
 * กลางสร้างร้าน INDIVIDUAL ซึ่งใช้ระบบนัดหมายไม่ได้
 */
async function createShop(opts: {
  kind: 'BUSINESS' | 'PERSONAL'
  vertical: 'GENERAL' | 'LODGING'
}): Promise<Seeded & { shopId: string }> {
  const s = Math.random().toString(36).slice(2, 8)
  const user = await prisma.user.create({
    data: {
      displayName: 'QA นัดหมาย',
      username: `qarsv_${s}`,
      phone: `09${String(Date.now()).slice(-8)}`,
      isShop: true,
    },
  })
  const shop = await prisma.shop.create({
    data: {
      userId: user.id,
      shopName: 'QA ร้านนัดหมาย',
      businessType: 'INDIVIDUAL',
      slug: `qarsv-${s}`,
      kind: opts.kind,
      vertical: opts.vertical,
    },
  })
  return { userId: user.id, shopId: shop.id, needsRegistration: false, needsOnboarding: false }
}

test.describe('feature 00024 — ตัวกั้นฟีเจอร์ (กลุ่ม B)', () => {
  test('TC-B01 ร้านบัญชีธุรกิจ + สินค้าและบริการ เข้าหน้าตั้งค่าทรัพยากรได้ และเห็นเมนู', async ({
    context,
    page,
  }) => {
    const seeded = await createShop({ kind: 'BUSINESS', vertical: 'GENERAL' })
    try {
      await loginAs(context, seeded)
      await page.goto('/service-resources')

      await expect(page.getByRole('heading', { name: 'ทรัพยากรที่จองได้' })).toBeVisible()
      // ยังไม่มีทรัพยากร → ต้องเห็น empty state ที่สอนว่าต้องทำอะไรต่อ ไม่ใช่หน้าว่าง
      await expect(page.getByText('ยังไม่มีทรัพยากรที่จองได้')).toBeVisible()
      await expect(page.getByRole('link', { name: /เพิ่มทรัพยากร/ })).toBeVisible()

      // เมนูทั้งสองของฟีเจอร์ต้องโผล่ (gate ชั้นเมนู)
      await expect(page.getByRole('link', { name: 'ทรัพยากรบริการ' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'ปฏิทินคิว' })).toBeVisible()
    } finally {
      await cleanup(seeded.userId)
    }
  })

  test('TC-B02 ร้านบุคคลธรรมดาเข้าหน้าเดียวกันไม่ได้ และไม่เห็นเมนู', async ({ context, page }) => {
    // เคสสำคัญ: vertical เป็น GENERAL เหมือนกัน ต่างแค่ kind — ตัวกั้นต้องดูทั้งสองอย่าง
    const seeded = await createShop({ kind: 'PERSONAL', vertical: 'GENERAL' })
    try {
      await loginAs(context, seeded)
      const res = await page.goto('/service-resources')
      expect(res?.status()).toBe(404)

      await page.goto('/dashboard')
      await expect(page.getByRole('link', { name: 'ทรัพยากรบริการ' })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'ปฏิทินคิว' })).toHaveCount(0)
    } finally {
      await cleanup(seeded.userId)
    }
  })

  test('TC-B03 ร้านบ้านพักเข้าหน้าเดียวกันไม่ได้ และไม่เห็นเมนู', async ({ context, page }) => {
    const seeded = await createShop({ kind: 'BUSINESS', vertical: 'LODGING' })
    try {
      await loginAs(context, seeded)
      const res = await page.goto('/service-resources')
      expect(res?.status()).toBe(404)

      await page.goto('/dashboard')
      await expect(page.getByRole('link', { name: 'ทรัพยากรบริการ' })).toHaveCount(0)
    } finally {
      await cleanup(seeded.userId)
    }
  })

  test('TC-B04 ร้านที่ไม่เข้าเงื่อนไขเรียก API ตรง ต้องได้ 403 ไม่ใช่แค่ซ่อนเมนู', async ({
    context,
    page,
  }) => {
    const seeded = await createShop({ kind: 'PERSONAL', vertical: 'GENERAL' })
    try {
      await loginAs(context, seeded)
      // ยิงจาก browser context เดิมเพื่อให้ session cookie ติดไปด้วย
      await page.goto('/dashboard')
      const status = await page.evaluate(async () => {
        const r = await fetch('/api/shops/current/service-resources', { cache: 'no-store' })
        return r.status
      })
      expect(status).toBe(403)
    } finally {
      await cleanup(seeded.userId)
    }
  })
})

test.describe('feature 00024 — ทรัพยากร (กลุ่ม C) + มัดจำ (FR-RSV-12)', () => {
  test('TC-C01 สร้างทรัพยากรโดยไม่ระบุความจุ ได้ 1 คิว และไม่เก็บมัดจำ', async ({
    context,
    page,
  }) => {
    const seeded = await createShop({ kind: 'BUSINESS', vertical: 'GENERAL' })
    try {
      await loginAs(context, seeded)
      await page.goto('/service-resources/new')

      await page.getByLabel('ชื่อทรัพยากร').fill('หมอนวด A')
      await page.getByRole('button', { name: 'เพิ่มทรัพยากร' }).click()

      await page.waitForURL('**/service-resources')
      await expect(page.getByText('หมอนวด A')).toBeVisible()

      const row = await prisma.serviceResource.findFirst({
        where: { shopId: seeded.shopId, name: 'หมอนวด A' },
        select: { capacity: true, depositMode: true, depositValue: true },
      })
      expect(row?.capacity).toBe(1)
      expect(row?.depositMode).toBe('FIXED')
      expect(Number(row?.depositValue)).toBe(0)
    } finally {
      await cleanup(seeded.userId)
    }
  })

  test('ตั้งมัดจำแบบเปอร์เซ็นต์แล้วเห็นตัวอย่างยอดที่ลูกค้าจ่ายหน้างาน', async ({
    context,
    page,
  }) => {
    const seeded = await createShop({ kind: 'BUSINESS', vertical: 'GENERAL' })
    try {
      await loginAs(context, seeded)
      await page.goto('/service-resources/new')

      await page.getByLabel('ชื่อทรัพยากร').fill('คลาสเช้า')
      await page.getByLabel('จำนวนคิวที่รับพร้อมกัน').fill('8')
      await page.getByLabel('เก็บมัดจำแบบ').selectOption('PERCENT')
      await page.getByLabel('จำนวน').fill('30')

      // กล่องตัวอย่างคิดจากออเดอร์สมมติ 1,000 บาท → มัดจำ 300 เหลือจ่ายหน้างาน 700
      await expect(page.getByText('มัดจำ ฿300')).toBeVisible()
      await expect(page.getByText('ลูกค้าจ่ายหน้างานอีก ฿700')).toBeVisible()

      await page.getByRole('button', { name: 'เพิ่มทรัพยากร' }).click()
      await page.waitForURL('**/service-resources')

      const row = await prisma.serviceResource.findFirst({
        where: { shopId: seeded.shopId, name: 'คลาสเช้า' },
        select: { capacity: true, depositMode: true, depositValue: true },
      })
      expect(row?.capacity).toBe(8)
      expect(row?.depositMode).toBe('PERCENT')
      expect(Number(row?.depositValue)).toBe(30)
    } finally {
      await cleanup(seeded.userId)
    }
  })

  test('TC-C02 ความจุ 0 ต้องถูกปฏิเสธ ไม่บันทึกลงฐานข้อมูล', async ({ context, page }) => {
    const seeded = await createShop({ kind: 'BUSINESS', vertical: 'GENERAL' })
    try {
      await loginAs(context, seeded)
      await page.goto('/service-resources/new')

      await page.getByLabel('ชื่อทรัพยากร').fill('ทดสอบคิวศูนย์')
      await page.getByLabel('จำนวนคิวที่รับพร้อมกัน').fill('0')
      await page.getByRole('button', { name: 'เพิ่มทรัพยากร' }).click()

      await expect(page.getByText('จำนวนคิวต้องมีอย่างน้อย 1')).toBeVisible()
      const count = await prisma.serviceResource.count({ where: { shopId: seeded.shopId } })
      expect(count).toBe(0)
    } finally {
      await cleanup(seeded.userId)
    }
  })

  test('ลบทรัพยากรที่มีนัดผูกอยู่ไม่ได้ — ต้องเสนอปิดการใช้งานแทน', async ({ context, page }) => {
    const seeded = await createShop({ kind: 'BUSINESS', vertical: 'GENERAL' })
    try {
      const resource = await prisma.serviceResource.create({
        data: { shopId: seeded.shopId, name: 'ช่างสมชาย', capacity: 1 },
      })
      // ออเดอร์ที่มีนัดผูกกับทรัพยากรนี้ → FK RESTRICT ต้องกันการลบ
      await prisma.order.create({
        data: {
          shopId: seeded.shopId,
          type: 'SERVICE',
          totalAmount: '500',
          serviceResourceId: resource.id,
          serviceSeat: 1,
          serviceStart: new Date('2026-09-10T03:00:00Z'),
          serviceEnd: new Date('2026-09-10T04:00:00Z'),
          appointmentStatus: 'SCHEDULED',
        },
      })

      await loginAs(context, seeded)
      await page.goto('/service-resources')

      page.once('dialog', (d) => d.dismiss().catch(() => {}))
      await page.getByRole('button', { name: 'ลบช่างสมชาย' }).first().click()
      await page.getByRole('button', { name: 'ลบ', exact: true }).click()

      await expect(page.getByText('ลบไม่ได้')).toBeVisible()
      await expect(page.getByRole('button', { name: 'ปิดการใช้งานแทน' })).toBeVisible()

      // ทรัพยากรต้องยังอยู่
      const still = await prisma.serviceResource.count({ where: { id: resource.id } })
      expect(still).toBe(1)
    } finally {
      // ลบออเดอร์ก่อน ไม่งั้น FK RESTRICT กันการลบร้าน — scope ด้วย shopId ที่เทสสร้างเอง
      await prisma.order.deleteMany({ where: { shopId: seeded.shopId } })
      await prisma.serviceResource.deleteMany({ where: { shopId: seeded.shopId } })
      await cleanup(seeded.userId)
    }
  })
})

test.describe('feature 00024 — ปฏิทินคิว (FR-RSV-04)', () => {
  test('ไม่มีนัดวันนี้ → เห็นสถานะว่างที่บอกว่านัดจะขึ้นเมื่อไร', async ({ context, page }) => {
    const seeded = await createShop({ kind: 'BUSINESS', vertical: 'GENERAL' })
    try {
      await loginAs(context, seeded)
      await page.goto('/appointments')

      await expect(page.getByRole('button', { name: 'รายวัน' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'รายสัปดาห์' })).toBeVisible()
      await expect(
        page.getByText('นัดจะขึ้นที่นี่เมื่อคุณระบุวันเข้าใช้บริการตอนสร้างออเดอร์'),
      ).toBeVisible()
    } finally {
      await cleanup(seeded.userId)
    }
  })

  test('นัดที่มีอยู่แสดงบนปฏิทินพร้อมสถานะ และกดแล้วไปหน้าออเดอร์', async ({ context, page }) => {
    const seeded = await createShop({ kind: 'BUSINESS', vertical: 'GENERAL' })
    try {
      const resource = await prisma.serviceResource.create({
        data: { shopId: seeded.shopId, name: 'เตียงนวด 1', capacity: 1 },
      })
      // ตั้งเวลาเป็น "วันนี้ 10:00 เวลาไทย" เพื่อให้ตรงกับ default ของหน้า (Day view วันนี้)
      const today = new Date()
      const start = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 3, 0, 0),
      )
      const end = new Date(start.getTime() + 60 * 60 * 1000)
      const order = await prisma.order.create({
        data: {
          shopId: seeded.shopId,
          type: 'SERVICE',
          totalAmount: '900',
          buyerName: 'สมชาย ใจดี',
          serviceResourceId: resource.id,
          serviceSeat: 1,
          serviceStart: start,
          serviceEnd: end,
          appointmentStatus: 'SCHEDULED',
        },
      })

      await loginAs(context, seeded)
      await page.goto('/appointments')

      await expect(page.getByText('สมชาย ใจดี').first()).toBeVisible()
      await expect(page.getByText('เตียงนวด 1').first()).toBeVisible()
      await expect(page.getByText('นัดแล้ว').first()).toBeVisible()

      await page.getByText('สมชาย ใจดี').first().click()
      await page.waitForURL(`**/orders/${order.publicToken}`)
    } finally {
      await prisma.order.deleteMany({ where: { shopId: seeded.shopId } })
      await prisma.serviceResource.deleteMany({ where: { shopId: seeded.shopId } })
      await cleanup(seeded.userId)
    }
  })
})

test.describe('feature 00024 — zero-regression (กลุ่ม G)', () => {
  test('ฟอร์มสร้างออเดอร์ของร้านที่ใช้ฟีเจอร์ไม่ได้ ต้องไม่มีบล็อกวันนัดเลย', async ({
    context,
    page,
  }) => {
    const seeded = await createShop({ kind: 'PERSONAL', vertical: 'GENERAL' })
    try {
      await loginAs(context, seeded)
      await page.goto('/orders/new')
      await expect(page.getByText('วันเข้าใช้บริการ')).toHaveCount(0)
    } finally {
      await cleanup(seeded.userId)
    }
  })

  test('ร้านที่ใช้ได้แต่ยังไม่มีทรัพยากร ก็ต้องไม่มีบล็อกวันนัด (ไม่มีอะไรให้เลือก)', async ({
    context,
    page,
  }) => {
    const seeded = await createShop({ kind: 'BUSINESS', vertical: 'GENERAL' })
    try {
      await loginAs(context, seeded)
      await page.goto('/orders/new')
      await expect(page.getByText('วันเข้าใช้บริการ')).toHaveCount(0)
    } finally {
      await cleanup(seeded.userId)
    }
  })

  test('ร้านที่มีทรัพยากรแล้ว เห็นบล็อกวันนัด และค่าเริ่มต้นคือไม่ตั้งวันนัด', async ({
    context,
    page,
  }) => {
    const seeded = await createShop({ kind: 'BUSINESS', vertical: 'GENERAL' })
    try {
      await prisma.serviceResource.create({
        data: { shopId: seeded.shopId, name: 'ช่างตัดผม', capacity: 2, durationMinutes: 45 },
      })
      await loginAs(context, seeded)
      await page.goto('/orders/new')

      await expect(page.getByText('วันเข้าใช้บริการ')).toBeVisible()
      const select = page.getByLabel('ทรัพยากรที่ให้บริการ')
      await expect(select).toHaveValue('')
      // ยังไม่เลือกทรัพยากร → ฟิลด์อื่นต้องยังไม่โผล่ (progressive reveal)
      await expect(page.getByLabel('วันที่นัด')).toHaveCount(0)
    } finally {
      await prisma.serviceResource.deleteMany({ where: { shopId: seeded.shopId } })
      await cleanup(seeded.userId)
    }
  })
})
