/**
 * E2E — Feature 00021 Shop Video Showcase (คลิปปักหมุดบนหน้าร้าน)
 *
 * รัน (worktree นี้ไม่มี .env.local ของตัวเอง — ใช้ env ชุดเดียวกับ dev server):
 *   node_modules/.bin/dotenv -e ../main-3/.env.local -- npx playwright test e2e/shop-video-showcase.spec.ts
 *
 * ขอบเขตที่ spec นี้ครอบ — เลือกเฉพาะที่ทดสอบได้ "โดยไม่ต้องมี token Facebook/Instagram จริง"
 *   A. หน้าร้านสาธารณะ: มีคลิป → แท็บ "ปักหมุด" เป็นแท็บแรก / ไม่มีคลิป → ไม่มีแท็บนี้เลย
 *   B. NFR-V1: ก่อนผู้ชมกดเล่น ต้องไม่มี request ไปโดเมนของแพลตฟอร์มแม้แต่รายการเดียว
 *   C. กดแล้วจึงฝัง iframe และ URL ต้องอยู่ในโดเมนที่ตั้งใจ
 *   D. หน้าตั้งค่าฝั่งร้านที่ยังไม่เชื่อมช่องทาง → บอกสถานะ + มีทางไปเชื่อม ไม่ใช่หน้าเปล่า
 *   E. ด่านความเป็นเจ้าของบน API จริง (ยิง PUT ตรงด้วย cookie ของร้าน)
 *
 * นอกขอบเขต (ต้องมีบัญชี FB/IG ที่เชื่อมจริงถึงจะมีคลิปให้เลือก → ทำใน smoke test บน prod)
 *   - E2E-1 เลือกคลิปจากแท็บช่องทางแล้วบันทึก, E2E-2 เพดาน 6 คลิปบน UI, E2E-3 ถอดคลิปกลางออก
 *
 * seed แถว ShopVideo ลง DB ตรง ๆ เพราะเส้นทาง "แสดงผล" ไม่ได้ผูกกับการมี token —
 * แยกทดสอบได้ และทำให้เคส A/B/C รันได้ทุกเครื่องโดยไม่ต้องต่อ Meta
 */
import { test, expect } from '@playwright/test'

import { prisma, createSeller, loginAs, cleanup } from './helpers/auth'

const ROOT = 'http://deepth.local:4000'

/** คลิปจริงของเพจที่ใช้ทดสอบ (id จริงเพื่อให้ URL ฝังมีรูปร่างเหมือนของจริง) */
const SEED_VIDEOS = [
  {
    provider: 'FACEBOOK',
    videoId: '800277546442607',
    caption: 'โช๊คหลังคู่ งานสวย',
    accountName: 'ร้านทดสอบ',
    likeCount: 55,
    viewCount: 5316,
  },
  {
    provider: 'INSTAGRAM',
    videoId: 'CxYz123abc',
    caption: 'สปริงแน่น',
    accountName: 'testshop',
    likeCount: 3,
    viewCount: null,
  },
]

/**
 * asBusiness: /b/[slug] รับเฉพาะ kind = BUSINESS แต่ requireActiveShop (ฝั่งร้าน) หาร้าน BUSINESS
 * ไม่เจอถ้า session ไม่มี activeShopId เพราะร้าน BUSINESS ผูกกับ user ผ่าน ShopMember ไม่ใช่ userId ตรง
 * → เคสหน้าสาธารณะต้อง BUSINESS, เคสฝั่งร้านต้องคง PERSONAL ไว้ ไม่งั้น API ตอบ 404 แทนที่จะถึง
 * ด่านที่กำลังทดสอบ (เจอจริงตอนเขียน spec นี้)
 */
async function seedShopWithVideos(withVideos: boolean, asBusiness = true) {
  const seeded = await createSeller('complete')
  const created = await prisma.shop.findFirst({
    where: { userId: seeded.userId },
    select: { id: true, slug: true },
  })
  if (!created?.slug) throw new Error('createSeller("complete") ต้องได้ร้านที่มี slug')

  const shop = asBusiness
    ? await prisma.shop.update({
        where: { id: created.id },
        data: { kind: 'BUSINESS' },
        select: { id: true, slug: true },
      })
    : created

  if (withVideos) {
    await prisma.shopVideo.createMany({
      data: SEED_VIDEOS.map((v, i) => ({
        shopId: shop.id,
        provider: v.provider,
        videoId: v.videoId,
        caption: v.caption,
        accountName: v.accountName,
        likeCount: v.likeCount,
        viewCount: v.viewCount,
        sortOrder: i,
      })),
    })
  }
  return { seeded, shopId: shop.id, slug: shop.slug }
}

test.describe('หน้าร้านสาธารณะ', () => {
  test('A1: ร้านที่ปักคลิปไว้ → แท็บ "ปักหมุด" เป็นแท็บแรก และคลิปขึ้นครบ', async ({ page }) => {
    const { seeded, slug } = await seedShopWithVideos(true)
    try {
      await page.goto(`${ROOT}/b/${slug}`)

      const tabs = page.getByRole('tab')
      await expect(tabs.first()).toContainText('ปักหมุด')
      // เป็นแท็บที่เปิดอยู่ตั้งแต่เข้าหน้า ไม่ใช่แค่มีอยู่
      await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')

      const cells = page.getByRole('button', { name: /^เล่นคลิปจาก/ })
      await expect(cells).toHaveCount(SEED_VIDEOS.length)

      // ยอดที่มีค่าต้องขึ้น — ที่เป็น null ต้องไม่กลายเป็น 0
      await expect(page.getByText('5.3K')).toBeVisible()
      await expect(page.getByText('55')).toBeVisible()
    } finally {
      await cleanup(seeded.userId)
    }
  })

  test('A2 (E2E-6): ร้านที่ไม่มีคลิป → ไม่มีแท็บ "ปักหมุด" เลย (ไม่ใช่แท็บว่าง)', async ({ page }) => {
    const { seeded, slug } = await seedShopWithVideos(false)
    try {
      await page.goto(`${ROOT}/b/${slug}`)
      await expect(page.getByRole('tab').first()).toBeVisible()
      await expect(page.getByRole('tab', { name: /ปักหมุด/ })).toHaveCount(0)
    } finally {
      await cleanup(seeded.userId)
    }
  })

  test('B (NFR-V1): ก่อนกดเล่น ต้องไม่มี request ไปโดเมนแพลตฟอร์มแม้แต่รายการเดียว', async ({ page }) => {
    const { seeded, slug } = await seedShopWithVideos(true)
    const platformHits: string[] = []
    page.on('request', (r) => {
      const h = new URL(r.url()).hostname
      if (/facebook\.com|instagram\.com|fbcdn\.net|cdninstagram\.com|tiktok\.com|youtube/.test(h)) {
        platformHits.push(r.url())
      }
    })
    try {
      await page.goto(`${ROOT}/b/${slug}`)
      await page.getByRole('button', { name: /^เล่นคลิปจาก/ }).first().waitFor()
      await page.waitForTimeout(1200)

      // ถ้าข้อนี้แดง = หน้าร้านดึงสคริปต์/พิกเซลของแพลตฟอร์มทันทีที่เปิดหน้า
      // ผู้ชมยังไม่ได้เลือกดูสักคลิป แต่แพลตฟอร์มรู้แล้วว่าใครเปิดหน้าร้านนี้
      expect(platformHits, `ไม่ควรมี request ไปแพลตฟอร์มก่อนกดเล่น:\n${platformHits.join('\n')}`).toEqual([])
    } finally {
      await cleanup(seeded.userId)
    }
  })

  test('C: กดแล้วจึงฝัง iframe และ src อยู่ในโดเมนที่ตั้งใจเท่านั้น', async ({ page }) => {
    const { seeded, slug } = await seedShopWithVideos(true)
    try {
      await page.goto(`${ROOT}/b/${slug}`)
      await expect(page.locator('iframe')).toHaveCount(0)

      await page.getByRole('button', { name: /^เล่นคลิปจาก/ }).first().click()

      const frame = page.locator('iframe').first()
      await expect(frame).toHaveCount(1)
      const src = await frame.getAttribute('src')
      expect(src).toBeTruthy()
      // URL ฝังต้องประกอบขึ้นเอง ไม่ใช่ค่าที่มาจากข้อมูลดิบ
      expect(new URL(src as string).hostname).toMatch(
        /^(www\.facebook\.com|www\.instagram\.com|www\.tiktok\.com|www\.youtube-nocookie\.com)$/,
      )
      // sandbox ต้องติดมาด้วย ไม่ใช่ iframe เปล่า (NFR-V2)
      expect(await frame.getAttribute('sandbox')).toContain('allow-scripts')
    } finally {
      await cleanup(seeded.userId)
    }
  })
})

test.describe('หน้าตั้งค่าฝั่งร้าน + ด่านความเป็นเจ้าของ', () => {
  test('D: ร้านที่ยังไม่เชื่อมช่องทาง → บอกสถานะ ไม่ใช่หน้าเปล่า', async ({ page, context }) => {
    const { seeded } = await seedShopWithVideos(false, false)
    try {
      await loginAs(context, seeded)
      await page.goto('/public-profile')

      await expect(page.getByRole('heading', { name: /โปรไฟล์สาธารณะ/ })).toBeVisible()
      // ไม่มีช่องทางที่เชื่อมไว้ = ไม่มีคลิปให้เลือก ต้องอธิบายและมีทางไปต่อ
      await expect(page.getByText(/เชื่อม|ช่องทาง/).first()).toBeVisible()
    } finally {
      await cleanup(seeded.userId)
    }
  })

  test('E (INT-1 บนเส้นจริง): PUT คลิปที่ไม่ใช่ของร้าน → ถูกปฏิเสธ ไม่ถูกบันทึก', async ({ context }) => {
    const { seeded, shopId } = await seedShopWithVideos(false, false)
    try {
      await loginAs(context, seeded)

      const res = await context.request.put(
        'http://seller.deepth.local:4000/api/shops/current/videos',
        {
          data: { items: [{ provider: 'FACEBOOK', videoId: '999999999999999' }] },
          headers: { origin: 'http://seller.deepth.local:4000' },
        },
      )

      // ร้านนี้ไม่ได้เชื่อมช่องทางใดเลย จึงยืนยันความเป็นเจ้าของไม่ได้ทุกกรณี
      // 403 = ตรวจแล้วไม่ใช่ของร้าน · 503 = ถามแพลตฟอร์มไม่สำเร็จ — ทั้งสองอย่างต้องไม่บันทึก
      expect([403, 503]).toContain(res.status())
      expect(await prisma.shopVideo.count({ where: { shopId } })).toBe(0)
    } finally {
      await cleanup(seeded.userId)
    }
  })
})
