/**
 * E2E — ระบบนัดหมายวันเข้าใช้บริการ + มัดจำ (feature 00024)
 *
 * ครอบ TestCase.md กลุ่ม B (ตัวกั้นฟีเจอร์) และ C (คิวงาน) เฉพาะส่วนที่ต้องผ่าน browser จริง
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
 *
 * IMPORTANT: ร้าน BUSINESS ต้องมีแถว ShopMember ด้วย ไม่ใช่แค่ Shop.userId
 * ตั้งแต่ feature 00012 (ร้านธุรกิจ/ทีมงาน) การหา "ร้านที่ active" เดินสองทาง:
 *   - PERSONAL → getPersonalShop() จับจาก Shop.userId + kind='PERSONAL'
 *   - BUSINESS → jwt callback (lib/auth.ts) หา ShopMember แถวแรก แล้วตั้งเป็น token.activeShopId
 *     จากนั้น resolveActiveShopContext() re-verify membership อีกชั้น (ไม่ trust JWT เปล่า ๆ)
 * ถ้า seed แต่ Shop.userId ร้าน BUSINESS จะ "ล่องหน" — layout เด้งไป /choose-shop ทุกหน้า
 * แล้วเทสจะแดงยกชุดโดยที่ฟีเจอร์ไม่ได้พัง (เจอจริง 2026-07-31 ตอนรัน E2E ชุดนี้ครั้งแรก)
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
  if (opts.kind === 'BUSINESS') {
    await prisma.shopMember.create({
      data: { shopId: shop.id, userId: user.id, role: 'OWNER' },
    })
  }
  return {
    userId: user.id,
    shopId: shop.id,
    needsRegistration: false,
    needsOnboarding: false,
    // ร้าน BUSINESS ต้องบอก activeShopId ตรง ๆ (ดูเหตุผลใน Seeded.activeShopId)
    ...(opts.kind === 'BUSINESS' ? { activeShopId: shop.id } : {}),
  }
}

test.describe('feature 00024 — ตัวกั้นฟีเจอร์ (กลุ่ม B)', () => {
  test('TC-B01 ร้านบัญชีธุรกิจ + สินค้าและบริการ เข้าหน้าตั้งค่าคิวงานได้ และเห็นเมนู', async ({
    context,
    page,
  }) => {
    const seeded = await createShop({ kind: 'BUSINESS', vertical: 'GENERAL' })
    try {
      await loginAs(context, seeded)
      await page.goto('/queues')

      // ยังไม่มีคิวงาน → ต้องเห็น empty state ที่สอนว่าต้องทำอะไรต่อ ไม่ใช่หน้าว่าง
      // (หัวเรื่อง 'คิวงานที่รับได้' เป็นของ card ตอน "มีรายการแล้ว" — ตอนว่างใช้ empty state แทน)
      await expect(page.getByRole('heading', { name: 'เริ่มต้นด้วยการเพิ่มคิวงาน' })).toBeVisible()
      await expect(page.getByText('คิวงานคือสิ่งที่จำกัดว่ารับลูกค้าได้กี่รายพร้อมกัน')).toBeVisible()
      await expect(page.getByRole('link', { name: /เพิ่มคิวงาน/ })).toBeVisible()

      // เมนูของฟีเจอร์ต้องโผล่ (gate ชั้นเมนู) — เมนูอยู่ทั้ง sidebar และ nav มือถือ
      // จับเฉพาะใบที่มองเห็นจริงบน viewport ปัจจุบัน
      await expect(
        page.getByRole('link', { name: 'คิวงาน' }).locator('visible=true').first(),
      ).toBeVisible()
      
    } finally {
      await cleanup(seeded.userId)
    }
  })

  test('TC-B02 ร้านบุคคลธรรมดาเข้าหน้าเดียวกันไม่ได้ และไม่เห็นเมนู', async ({ context, page }) => {
    // เคสสำคัญ: vertical เป็น GENERAL เหมือนกัน ต่างแค่ kind — ตัวกั้นต้องดูทั้งสองอย่าง
    const seeded = await createShop({ kind: 'PERSONAL', vertical: 'GENERAL' })
    try {
      await loginAs(context, seeded)
      const res = await page.goto('/queues')
      expect(res?.status()).toBe(404)

      await page.goto('/dashboard')
      await expect(page.getByRole('link', { name: 'คิวงาน' })).toHaveCount(0)
      
    } finally {
      await cleanup(seeded.userId)
    }
  })

  test('TC-B03 ร้านบ้านพักเข้าหน้าเดียวกันไม่ได้ และไม่เห็นเมนู', async ({ context, page }) => {
    const seeded = await createShop({ kind: 'BUSINESS', vertical: 'LODGING' })
    try {
      await loginAs(context, seeded)
      const res = await page.goto('/queues')
      expect(res?.status()).toBe(404)

      await page.goto('/dashboard')
      await expect(page.getByRole('link', { name: 'คิวงาน' })).toHaveCount(0)
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

test.describe('feature 00024 — คิวงาน (กลุ่ม C) + มัดจำ (FR-RSV-12)', () => {
  test('TC-C01 สร้างคิวงานโดยไม่ระบุความจุ ได้ 1 คิว และไม่เก็บมัดจำ', async ({
    context,
    page,
  }) => {
    const seeded = await createShop({ kind: 'BUSINESS', vertical: 'GENERAL' })
    try {
      await loginAs(context, seeded)
      await page.goto('/queues/new')

      await page.getByLabel('ชื่อคิวงาน').fill('หมอนวด A')
      await page.getByRole('button', { name: 'เพิ่มคิวงาน' }).click()

      await page.waitForURL('**/queues')
      // ResourceList render สองชุดพร้อมกัน (การ์ดมือถือ + ตารางเดสก์ท็อป สลับด้วย CSS)
      // ชื่อคิวงานจึงอยู่ใน DOM สองที่เสมอ — .first() ใช้ไม่ได้เพราะใบแรกคือใบมือถือที่
      // ถูก lg:hidden ซ่อนอยู่บนจอเดสก์ท็อป ต้องจับ "ใบที่ผู้ใช้เห็นจริง"
      await expect(page.getByText('หมอนวด A').locator('visible=true')).toBeVisible()

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
      await page.goto('/queues/new')

      await page.getByLabel('ชื่อคิวงาน').fill('คลาสเช้า')
      await page.getByLabel('จำนวนคิวที่รับพร้อมกัน').fill('8')
      await page.getByLabel('เก็บมัดจำแบบ').selectOption('PERCENT')
      // exact: true — ไม่งั้นชนกับ 'จำนวนคิวที่รับพร้อมกัน' ที่มีคำว่า "จำนวน" อยู่ด้วย
      await page.getByLabel('จำนวน', { exact: true }).fill('30')

      // กล่องตัวอย่างคิดจากออเดอร์สมมติ 1,000 บาท → มัดจำ 300 เหลือจ่ายหน้างาน 700
      await expect(page.getByText('มัดจำ ฿300')).toBeVisible()
      await expect(page.getByText('ลูกค้าจ่ายหน้างานอีก ฿700')).toBeVisible()

      await page.getByRole('button', { name: 'เพิ่มคิวงาน' }).click()
      await page.waitForURL('**/queues')

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
      await page.goto('/queues/new')

      await page.getByLabel('ชื่อคิวงาน').fill('ทดสอบคิวศูนย์')
      await page.getByLabel('จำนวนคิวที่รับพร้อมกัน').fill('0')
      await page.getByRole('button', { name: 'เพิ่มคิวงาน' }).click()

      // ข้อความของ Yup ฝั่งฟอร์ม (ResourceForm) — ไม่ใช่ของ Valibot ฝั่ง API
      // ('จำนวนคิวต้องมีอย่างน้อย 1' ที่ validations.ts:1266) เพราะฟอร์มกันไว้ก่อนถึง API
      // ซึ่งถูกแล้ว: ผู้ใช้ได้ error ทันทีโดยไม่ต้องรอ round-trip
      await expect(page.getByText('รับได้อย่างน้อย 1 คิว')).toBeVisible()
      const count = await prisma.serviceResource.count({ where: { shopId: seeded.shopId } })
      expect(count).toBe(0)
    } finally {
      await cleanup(seeded.userId)
    }
  })

  test('ลบคิวงานที่มีนัดผูกอยู่ไม่ได้ — ต้องเสนอปิดการใช้งานแทน', async ({ context, page }) => {
    const seeded = await createShop({ kind: 'BUSINESS', vertical: 'GENERAL' })
    try {
      const resource = await prisma.serviceResource.create({
        data: { shopId: seeded.shopId, name: 'ช่างสมชาย', capacity: 1 },
      })
      // ออเดอร์ที่มีนัดผูกกับคิวงานนี้ → FK RESTRICT ต้องกันการลบ
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
      await page.goto('/queues')

      page.once('dialog', (d) => d.dismiss().catch(() => {}))
      await page.getByRole('button', { name: 'ลบช่างสมชาย' }).first().click()
      await page.getByRole('button', { name: 'ลบ', exact: true }).click()

      // Swal มีคำว่า "ลบไม่ได้" ทั้งใน title และ text → .first() จับ title
      await expect(page.getByText('ลบไม่ได้').first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'ปิดการใช้งานแทน' })).toBeVisible()

      // คิวงานต้องยังอยู่
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
      // ต้องมีคิวงานอย่างน้อย 1 ก่อน — ยังไม่มีคิวงาน = ยังจองอะไรไม่ได้ ปฏิทินจึงถูกซ่อน
      // ตั้งใจ (queues/page.tsx:57) ไม่ให้ร้านเปิดใหม่เจอตารางเดือนเปล่าเต็มจอแล้วสับสน
      await prisma.serviceResource.create({
        data: { shopId: seeded.shopId, name: 'ช่องบริการ 1', capacity: 1 },
      })
      await loginAs(context, seeded)
      await page.goto('/queues')

      // ปฏิทิน Paces (FullCalendar) อยู่ในหน้าคิวงานหน้าเดียวกัน
      // FullCalendar render ปุ่มมุมมองไว้หลายชุด (toolbar + ชุดสำรองของ responsive)
      await expect(page.getByRole('button', { name: 'เดือน' }).first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'สัปดาห์' }).first()).toBeVisible()
      // ไม่มีนัด → ช่องวันต้องไม่มีตัวเลข "จองแล้ว n/m" ค้างอยู่
      await expect(page.getByText('เต็ม')).toHaveCount(0)
    } finally {
      await prisma.serviceResource.deleteMany({ where: { shopId: seeded.shopId } })
      await cleanup(seeded.userId)
    }
  })

  /**
   * regression — วันว่างต้องไม่ถูกย้อมสี "ใกล้เต็ม"
   *
   * เคยพังจริง: เงื่อนไขเดิมเช็คแค่ `n === totalCapacity - 1` ร้านที่ความจุรวม = 1
   * (คิวงานเดียว ความจุ 1 = เคสปกติของลูกค้ากลุ่มแรก) จะได้ 1-1 = 0 ทำให้วันที่
   * ไม่มีนัดเลย (n=0) เข้าเงื่อนไขทุกวัน → ทั้งเดือนเป็นครีม 42/42 ช่อง
   * user รายงานว่า "สีมันไม่ได้เลย" — tsc/build/grep มองไม่เห็นบั๊กแบบนี้
   */
  test('ร้านความจุ 1 และไม่มีนัด — ต้องไม่มีช่องวันไหนถูกย้อมสีเลย', async ({ context, page }) => {
    const seeded = await createShop({ kind: 'BUSINESS', vertical: 'GENERAL' })
    try {
      await prisma.serviceResource.create({
        data: { shopId: seeded.shopId, name: 'ช่างซ่อม', capacity: 1 },
      })
      await loginAs(context, seeded)
      await page.goto('/queues')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(800)

      const tinted = await page.evaluate(() => {
        const cells = [...document.querySelectorAll('.appointment-calendar .fc-daygrid-day')]
        return {
          total: cells.length,
          tight: cells.filter((c) => c.classList.contains('appt-day-tight')).length,
          full: cells.filter((c) => c.classList.contains('appt-day-full')).length,
        }
      })
      expect(tinted.total).toBeGreaterThan(0)
      expect(tinted.tight, 'วันว่างต้องไม่ถูกย้อมว่าใกล้เต็ม').toBe(0)
      expect(tinted.full, 'วันว่างต้องไม่ถูกย้อมว่าเต็ม').toBe(0)
    } finally {
      await prisma.serviceResource.deleteMany({ where: { shopId: seeded.shopId } })
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
      await page.goto('/queues')

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

  test('ร้านที่ใช้ได้แต่ยังไม่มีคิวงาน ก็ต้องไม่มีบล็อกวันนัด (ไม่มีอะไรให้เลือก)', async ({
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

  /**
   * regression — วันที่ที่ปฏิทินส่งมาต้อง "มองเห็นได้โดยไม่ต้องกางเอง"
   *
   * เคยพังจริง: commit 58e5b33b ย้ายบล็อกนัดเข้าไปใน accordion ของแผงขวา ซึ่งพับอยู่
   * และ **ไม่ถูก render เลย** ตอนพับ ผู้ใช้ที่กดวันในปฏิทินจึงไม่เห็นว่ามีวันที่ถูกพามา
   * แล้วกดบันทึกไป ได้ออเดอร์เปล่าที่ไม่มีนัดโดยไม่มี error อะไรเลย
   */
  test('กดวันในปฏิทินแล้วมาที่ฟอร์ม — accordion ต้องกางเองและโชว์วันที่บนหัว', async ({
    context,
    page,
  }) => {
    const seeded = await createShop({ kind: 'BUSINESS', vertical: 'GENERAL' })
    try {
      await prisma.serviceResource.create({
        data: { shopId: seeded.shopId, name: 'ช่องบริการ 1', capacity: 2, durationMinutes: 60 },
      })
      await loginAs(context, seeded)

      const d = new Date(Date.now() + 3 * 86_400_000)
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      await page.goto(`/orders/new?appointmentDate=${dateKey}`)

      // accordion กางเอง → ช่องเลือกคิวงานมองเห็นได้ทันที ไม่ต้องกด
      const resourceSelect = page.getByLabel('รับนัดโดย').locator('visible=true')
      await expect(resourceSelect).toBeVisible()

      // วันที่อ่านได้จากหัว accordion พร้อมชื่อวัน (formatWeekdayDateTH)
      await expect(
        page.getByText(/^(จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์) /).locator('visible=true'),
      ).toBeVisible()

      // ยังไม่เลือกคิวงาน = ออเดอร์นี้จะไม่มีนัด ต้องเตือนไว้ก่อน
      await expect(page.getByText('ยังไม่ได้เลือกคิวงาน').locator('visible=true')).toBeVisible()

      // เลือกคิวงานแล้ววันที่โผล่พร้อมค่าที่พามา และคำเตือนหายไป
      await resourceSelect.selectOption({ index: 1 })
      const dateField = page.getByLabel('วันที่นัด').locator('visible=true')
      await expect(dateField).toHaveValue(dateKey)
      await expect(page.getByText('ยังไม่ได้เลือกคิวงาน')).toHaveCount(0)
    } finally {
      await prisma.serviceResource.deleteMany({ where: { shopId: seeded.shopId } })
      await cleanup(seeded.userId)
    }
  })

  test('ร้านที่มีคิวงานแล้ว เห็นบล็อกวันนัด และค่าเริ่มต้นคือไม่ตั้งวันนัด', async ({
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

      // บล็อกนี้อยู่ใน DOM สองที่เสมอ (การ์ดใน QuickForm มือถือ + หัว accordion ใน CartPanel
      // เดสก์ท็อป — สลับด้วย CSS ไม่ใช่ React) จึงต้อง .first() ทุกตัวที่จับด้วยข้อความ
      const trigger = page.getByText('วันเข้าใช้บริการ').locator('visible=true')
      await expect(trigger).toBeVisible()

      // เดสก์ท็อป: บล็อกนี้เป็น accordion ในแผงขวาที่ "พับอยู่" โดยค่าเริ่มต้น (CartPanel)
      // เนื้อในยังไม่ถูก render จนกว่าจะกดเปิด — ต้องกดเหมือนผู้ใช้จริงก่อนถึงจะเห็นช่องเลือก
      // (มือถือเป็นการ์ดกางอยู่แล้ว จึงไม่ต้องกด แต่ที่ viewport ของเทสคือเดสก์ท็อป)
      await trigger.click()

      const select = page.getByLabel('รับนัดโดย').locator('visible=true')
      await expect(select).toHaveValue('')
      // ยังไม่เลือกคิวงาน → ฟิลด์อื่นต้องยังไม่โผล่ (progressive reveal)
      await expect(page.getByLabel('วันที่นัด')).toHaveCount(0)
    } finally {
      await prisma.serviceResource.deleteMany({ where: { shopId: seeded.shopId } })
      await cleanup(seeded.userId)
    }
  })
})
