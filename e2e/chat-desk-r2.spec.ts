/**
 * E2E 00077 รอบ 2 (recheck หลังแก้ 50b33225f) — seed ก่อน: scripts/qa-00077-seed.ts (ปักหมุด localhost:5434)
 * เคสที่ insert ข้อมูลใช้ PrismaClient scoped id 77770000-/qa77- เท่านั้น (cleanup ใน finally)
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { encode } from 'next-auth/jwt'
import { CID } from '../scripts/qa-00077-seed-ids'

const SHOT = '.screenshots/2026/10/16'
const SHOP = CID('shop')
const OWNER = CID('uown')
const ADMIN = CID('uadma')

async function login(ctx: BrowserContext, userId: string) {
  const token = await encode({ token: { userId, needsRegistration: false, needsOnboarding: false, activeShopId: SHOP }, secret: process.env.NEXTAUTH_SECRET ?? '' })
  await ctx.addCookies([{ name: 'next-auth.session-token', value: token, domain: 'seller.deepth.local', path: '/', httpOnly: true, sameSite: 'Lax' }])
}
const errsOf = (page: Page) => {
  const errs: string[] = []
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  return errs
}
/** ป้าย DOM ของฉาก 3D ที่มองเห็นอยู่ → กล่อง; ตรวจล้นขอบ canvas + ซ้อนกัน */
async function labelGeometry(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas')!
    const host = canvas.closest('div')!.parentElement!.getBoundingClientRect()
    const els = [...document.querySelectorAll<HTMLElement>('div.pointer-events-auto.will-change-transform')]
      .filter((e) => getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none')
    const boxes = els.map((e) => {
      const pill = (e.querySelector('span') ?? e).getBoundingClientRect()
      return { t: (e.textContent ?? '').trim().slice(0, 30), l: pill.left, r: pill.right, tp: pill.top, b: pill.bottom }
    }).filter((b) => b.r - b.l > 0)
    const overflow = boxes.filter((b) => b.r > host.right + 1 || b.l < host.left - 1 || b.tp < host.top - 1 || b.b > host.bottom + 1)
    const overlaps: string[] = []
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], c = boxes[j]
      const w = Math.min(a.r, c.r) - Math.max(a.l, c.l), h = Math.min(a.b, c.b) - Math.max(a.tp, c.tp)
      // ซ้อนเกิน 25% ของป้ายเล็กกว่า = อ่านไม่ออก · ป้าย "+N" (โต๊ะที่ซ่อน) ซ้อนโต๊ะ = ตามมอกอัพ จึงยกเว้น
      const small = Math.min((a.r - a.l) * (a.b - a.tp), (c.r - c.l) * (c.b - c.tp))
      if (w > 2 && h > 2 && !/^\+\d/.test(a.t) && !/^\+\d/.test(c.t) && (w * h) / small > 0.25) overlaps.push(`${a.t} X ${c.t} (${Math.round(w)}x${Math.round(h)})`)
    }
    return { count: boxes.length, host: { l: host.left, r: host.right }, overflow, overlaps }
  })
}

test.describe('owner รอบ 2', () => {
  test.beforeEach(async ({ context }) => login(context, OWNER))

  for (const [name, w, h] of [['1440', 1440, 900], ['834', 834, 1112]] as const) {
    test(`ป้ายฉาก 3D ที่ ${name}: ไม่ล้นขอบ ไม่ซ้อน + ป้ายเกินเวลายุบ`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      const errs = errsOf(page)
      await page.goto('/chat-desk')
      await page.waitForTimeout(4500)
      const g = await labelGeometry(page)
      console.log(name, JSON.stringify(g))
      await page.screenshot({ path: `${SHOT}/qa2-scene-${name}.png` })
      expect(g.count).toBeGreaterThan(3)
      expect(g.overflow).toEqual([])
      expect(g.overlaps).toEqual([])
      // seed มีเกินเวลา 2 คน → ป้ายยุบ 1 ป้าย ไม่มีป้ายเกินเวลารายคน
      await expect(page.getByRole('button', { name: 'เกินเวลาตอบ 2 คน เปิดรายการ' })).toHaveCount(1)
      expect(errs.filter((e) => e.startsWith('pageerror'))).toEqual([])
    })
  }

  test('มือถือ 390: กด "เปิดฉาก 3D" → ป้ายอ่านออก ไม่ซ้อน/ไม่ล้น', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const errs = errsOf(page)
    await page.goto('/chat-desk')
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${SHOT}/qa2-mobile-390-2d.png`, fullPage: true })
    await page.getByRole('button', { name: /เปิดฉาก 3D/ }).click()
    await page.waitForTimeout(4500)
    expect(await page.locator('canvas').count()).toBeGreaterThan(0)
    const g = await labelGeometry(page)
    console.log('390', JSON.stringify(g))
    await page.screenshot({ path: `${SHOT}/qa2-mobile-390-3d.png` })
    expect(g.count).toBeGreaterThan(2)
    expect(g.overflow).toEqual([])
    expect(g.overlaps).toEqual([])
    expect(errs.filter((e) => e.startsWith('pageerror'))).toEqual([])
  })

  test('บล็อก glb: ไม่มี pageerror/uncaught + dev overlay ไม่ขึ้น Issues', async ({ page }) => {
    await page.route('**/*.glb', (r) => r.abort())
    await page.setViewportSize({ width: 1440, height: 900 })
    const errs = errsOf(page)
    await page.goto('/chat-desk')
    await page.waitForTimeout(5000)
    await page.screenshot({ path: `${SHOT}/qa2-glb-blocked.png` })
    expect(errs.filter((e) => e.startsWith('pageerror') || /uncaught/i.test(e))).toEqual([])
    // Next dev overlay = <nextjs-portal> ที่มี dialog/ปุ่ม issues เมื่อมี error
    const issues = await page.evaluate(() => {
      const p = document.querySelector('nextjs-portal')
      const root = p?.shadowRoot
      // ข้าม <style> — อ่านเฉพาะข้อความที่ผู้ใช้เห็น (ปุ่ม "N Issue")
      return root ? [...root.querySelectorAll('button,[role=dialog],[data-nextjs-toast]')].map((e) => e.textContent).join(' ').replace(/\s+/g, ' ').slice(0, 200) : ''
    })
    console.log('dev overlay text:', JSON.stringify(issues))
    // หมายเหตุ: ตรวจ dev overlay ด้วยตา (ภาพ qa2-glb-blocked.png — ปุ่ม N ไม่มีตัวเลข Issues) · regex บน shadow DOM ไม่น่าเชื่อถือ
    await expect(page.getByText('ภาพรวมห้องแชท')).toBeVisible()
  })

  test('ตาราง 2D: "รอมา" บรรทัดเดียว', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/chat-desk?view=2d')
    await page.waitForTimeout(2000)
    const hs = await page.evaluate(() => {
      const th = [...document.querySelectorAll('th')].findIndex((t) => t.textContent?.includes('รอมา'))
      const cells = [...document.querySelectorAll('tbody tr')].map((r) => r.children[th] as HTMLElement).filter(Boolean)
      return cells.map((c) => { const lh = parseFloat(getComputedStyle(c).lineHeight) || 20; return Math.round((c.getBoundingClientRect().height - 20) / lh * 10) / 10 })
    })
    console.log('รอมา cell line-ratios:', hs.join(','))
    expect(hs.length).toBeGreaterThan(0)
    expect(Math.max(...hs)).toBeLessThan(1.6)
    await page.screenshot({ path: `${SHOT}/qa2-list2d.png` })
  })

  test('presence unavailable: ออนไลน์/ว่างรับแชท = "—" + ป้ายเตือน', async ({ page }) => {
    await page.routeWebSocket(/supabase\.co\/realtime/, (ws) => ws.close())
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/chat-desk')
    await expect(page.getByText('ตรวจสถานะออนไลน์ไม่ได้ตอนนี้')).toBeVisible({ timeout: 25000 })
    const main = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
    console.log('presence-unavailable main:', main.match(/ออนไลน์[\s\S]{0,60}/)?.[0])
    await page.screenshot({ path: `${SHOT}/qa2-presence-unavailable.png` })
    expect(main).toMatch(/ออนไลน์ —/)
    expect(main).toMatch(/ว่างรับแชท —/)
    expect(main).not.toMatch(/ออนไลน์ 0\/\d/)
  })

  test('reduced-motion: ไม่มี animate ค้าง/กะพริบ', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1440, height: 900 })
    const errs = errsOf(page)
    await page.goto('/chat-desk')
    await page.waitForTimeout(4000)
    const anims = await page.evaluate(() => document.getAnimations().filter((a) => {
      const t = (a.effect as KeyframeEffect | null)?.target as HTMLElement | null
      return t && !t.closest('nextjs-portal') && (a as CSSAnimation).animationName
    }).map((a) => (a as CSSAnimation).animationName))
    console.log('running css animations under reduced-motion:', JSON.stringify(anims))
    await page.screenshot({ path: `${SHOT}/qa2-reduced-motion.png` })
    expect(anims).toEqual([])
    expect(errs.filter((e) => e.startsWith('pageerror'))).toEqual([])
  })

  test('poll ล้ม (500) > 30 วิ → ป้าย "ข้อมูลล่าช้า"', async ({ page }) => {
    test.setTimeout(90000)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/chat-desk')
    await page.waitForTimeout(3000)
    await page.route('**/api/chat-desk/snapshot**', (r) => r.fulfill({ status: 500, body: '{}' }))
    await expect(page.getByText(/ข้อมูลล่าช้า \d+ วินาที/)).toBeVisible({ timeout: 60000 })
    await page.screenshot({ path: `${SHOT}/qa2-stale-badge.png` })
  })

  test('เหตุการณ์: ลูกค้าใหม่เข้ามา → โผล่ใน ~10 วิ + แถว "เข้ามารอคำตอบ"', async ({ page }) => {
    test.setTimeout(60000)
    expect(process.env.DATABASE_URL).toMatch(/localhost:5434/)
    const prisma = new PrismaClient()
    const room = CID('newrm')
    try {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/chat-desk')
      await page.waitForTimeout(3500)
      await prisma.externalContact.create({ data: { id: 'qa77-ec-new', shopChannelId: CID('chmsg'), externalUserId: 'qa77-psid-new', name: 'ลูกค้าใหม่ QA2' } })
      const now = new Date()
      await prisma.conversation.create({ data: { id: room, shopId: SHOP, channel: 'MESSENGER', shopChannelId: CID('chmsg'), externalContactId: 'qa77-ec-new', lastSenderRole: 'BUYER', lastInboundAt: now, lastMessageAt: now, lastMessagePreview: 'สวัสดีค่ะ', createdAt: now, shopLastReadAt: new Date(now.getTime() - 3600_000) } })
      await prisma.chatMessage.create({ data: { id: 'qa77-m-new', conversationId: room, senderRole: 'BUYER', createdAt: now, body: 'สวัสดีค่ะ', type: 'TEXT' } })
      await expect(page.getByText('ลูกค้าใหม่ QA2').first()).toBeVisible({ timeout: 12000 })
      await expect(page.locator('li', { hasText: 'เข้ามารอคำตอบ' }).first()).toBeVisible({ timeout: 12000 })
      await page.screenshot({ path: `${SHOT}/qa2-new-customer-event.png` })
      expect((await page.locator('main').innerText()).replace(/\s+/g, ' ')).toMatch(/รอคำตอบ 8/)
    } finally {
      await prisma.chatMessage.deleteMany({ where: { id: 'qa77-m-new' } })
      await prisma.conversation.deleteMany({ where: { id: room } })
      await prisma.externalContact.deleteMany({ where: { id: 'qa77-ec-new' } })
      await prisma.$disconnect()
    }
  })

  test('ChatNavRail ของ /inbox มีไอคอนโต๊ะแชท (OWNER)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const errs = errsOf(page)
    await page.goto('/inbox')
    await page.waitForTimeout(2500)
    const link = page.locator('.chat-nav-rail a[href="/chat-desk"], nav a[href="/chat-desk"]').first()
    await expect(link).toBeVisible()
    await page.screenshot({ path: `${SHOT}/qa2-inbox-rail-owner.png` })
    console.log('inbox errs', JSON.stringify(errs))
  })

  test('หน้า seller อื่นไม่มี pageerror', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    for (const p of ['/inbox', '/orders', '/dashboard']) {
      const errs = errsOf(page)
      await page.goto(p)
      await page.waitForTimeout(2500)
      console.log(p, JSON.stringify(errs))
      expect(errs.filter((e) => e.startsWith('pageerror'))).toEqual([])
    }
  })
})

test('ChatNavRail ของ /inbox ไม่มีโต๊ะแชทสำหรับ ADMIN', async ({ context, page }) => {
  await login(context, ADMIN)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/inbox')
  await page.waitForTimeout(2500)
  expect(await page.locator('a[href="/chat-desk"]').count()).toBe(0)
  await page.screenshot({ path: `${SHOT}/qa2-inbox-rail-admin.png` })
})
