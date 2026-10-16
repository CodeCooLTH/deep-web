/**
 * E2E 00077 โต๊ะแชท — ต้อง seed ก่อน (ห้อง "ร้านเพิ่งตอบ" หมดอายุใน 180 วิ → seed ใหม่ก่อนรันทุกครั้ง):
 *   DATABASE_URL=postgresql://safepay:safepay@localhost:5434/safepay DIRECT_URL=<เดียวกัน> npx tsx scripts/qa-00077-seed.ts
 * cleanup: scripts/qa-00077-cleanup.ts
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { encode } from 'next-auth/jwt'
import { CID } from '../scripts/qa-00077-seed-ids'

const SHOT = '.screenshots/2026/10/16'
const SHOP = CID('shop')
const OWNER = CID('uown')
const ADMIN = CID('uadma')
const LONG = CID('a1')
const OTHER_ROOM = CID('other')

async function login(ctx: BrowserContext, userId: string) {
  const token = await encode({ token: { userId, needsRegistration: false, needsOnboarding: false, activeShopId: SHOP }, secret: process.env.NEXTAUTH_SECRET ?? '' })
  await ctx.addCookies([{ name: 'next-auth.session-token', value: token, domain: 'seller.deepth.local', path: '/', httpOnly: true, sameSite: 'Lax' }])
}
const consoleErrors = (page: Page) => {
  const errs: string[] = []
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  return errs
}

test.describe('owner', () => {
  test.beforeEach(async ({ context }) => login(context, OWNER))

  test('L1 เมนู: โต๊ะแชท ลำดับ 2 ของกลุ่มแชท', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/chat-desk')
    const hrefs = await page.locator('aside a[href="/inbox"], aside a[href="/chat-desk"], aside a[href="/settings/auto-reply"]').evaluateAll((a) => a.map((x) => x.getAttribute('href')))
    expect(hrefs).toEqual(['/inbox', '/chat-desk', '/settings/auto-reply'])
  })

  test('L2 desktop 1440: ฉาก 3D + การ์ด + ⓘ + ซ่อนตัวเลข + poll', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const errs = consoleErrors(page)
    const glb: number[] = []
    page.on('response', (r) => r.url().endsWith('.glb') && glb.push(r.status()))
    const snaps: number[] = []
    page.on('request', (r) => r.url().includes('/api/chat-desk/snapshot') && snaps.push(Date.now()))
    await page.goto('/chat-desk')
    await expect(page.getByText('ภาพรวมห้องแชท')).toBeVisible()
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `${SHOT}/pw-desktop-1440-scene.png` })
    expect(await page.locator('canvas').count()).toBeGreaterThan(0)
    expect(glb.length).toBeGreaterThan(5)
    expect(glb.every((s) => s === 200)).toBe(true)
    const text = await page.locator('main').innerText()
    expect(text.replace(/\s+/g, ' ')).toMatch(/รอคำตอบ 7/)
    expect(text).toContain('นับเฉพาะคำตอบที่ระบุตัวคนได้')
    await page.getByRole('button', { name: 'คำอธิบาย ออนไลน์' }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOT}/pw-desktop-1440-info-open.png` })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'ตัวเลข' }).click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOT}/pw-desktop-1440-numbers-hidden.png` })
    expect(await page.locator('main').innerText()).toContain('ภาพรวมห้องแชท')
    await page.getByRole('button', { name: 'ตัวเลข' }).click()
    await page.getByRole('button', { name: 'ตัวกรอง' }).click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOT}/pw-desktop-1440-filter-open.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(18000)
    console.log('snapshot request gaps(ms):', snaps.slice(1).map((t, i) => t - snaps[i]).join(','), 'count', snaps.length)
    console.log('console errors:', JSON.stringify(errs))
  })

  test('L2 ตัวกรอง → URL + รีเฟรชยังอยู่ + 2D list', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/chat-desk')
    await page.getByRole('button', { name: 'ตัวกรอง' }).click()
    const dlg = page.getByRole('dialog')
    console.log('filter dialog:', (await dlg.innerText()).replace(/\n+/g, ' | '))
    await dlg.getByText('LINE', { exact: true }).first().click()
    await dlg.getByRole('button', { name: 'ใช้ตัวกรอง' }).click()
    await page.waitForTimeout(1000)
    console.log('url after filter:', page.url())
    expect(page.url()).toMatch(/platform|page/i)
    await page.reload()
    await page.waitForTimeout(2500)
    expect(page.url()).toMatch(/platform|page/i)
    await page.screenshot({ path: `${SHOT}/pw-desktop-1440-filtered-refresh.png` })
    await page.getByRole('button', { name: 'รายการ', exact: true }).click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${SHOT}/pw-desktop-1440-list2d.png`, fullPage: true })
  })

  test('L2 preview ห้องยาว: ไม่มีกล่องพิมพ์ + ลิงก์ inbox', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/chat-desk?view=2d')
    await page.getByText('คุณมานี (โต๊ะ A-1)').first().click()
    await expect(page.getByText('เปิดในหน้าข้อความ').first()).toBeVisible()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${SHOT}/pw-desktop-1440-preview-long.png` })
    expect(await page.getByRole('link', { name: /เปิดในหน้าข้อความ/ }).getAttribute('href')).toContain(`/inbox/${LONG}`)
    expect(await page.locator('textarea').count()).toBe(0)
    expect(await page.content()).not.toContain('SECRET-DELETED-BODY')
  })

  test('L3 tablet 834 + mobile 390', async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1112 })
    await page.goto('/chat-desk')
    await page.waitForTimeout(3500)
    await page.screenshot({ path: `${SHOT}/pw-tablet-834.png` })
    console.log('834 canvas:', await page.locator('canvas').count())
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/chat-desk')
    await page.waitForTimeout(3000)
    console.log('390 canvas:', await page.locator('canvas').count())
    await page.screenshot({ path: `${SHOT}/pw-mobile-390-initial.png` })
    await page.getByText('คุณสมหญิง').first().click().catch((e) => console.log('tap row failed', String(e).slice(0, 80)))
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${SHOT}/pw-mobile-390-sheet.png` })
  })

  test('fallback: ไม่มี WebGL → 2D + แบนเนอร์', async ({ page }) => {
    await page.addInitScript(() => {
      const g = HTMLCanvasElement.prototype.getContext as any
      ;(HTMLCanvasElement.prototype as any).getContext = function (t: string, ...a: any[]) { return /webgl/.test(t) ? null : g.call(this, t, ...a) }
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    const errs = consoleErrors(page)
    await page.goto('/chat-desk')
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `${SHOT}/pw-no-webgl.png` })
    console.log('no-webgl canvas:', await page.locator('canvas').count(), 'errs', JSON.stringify(errs))
    await expect(page.getByText('ภาพรวมห้องแชท')).toBeVisible()
  })

  test('fallback: บล็อก glb → ฉากไม่ล้ม', async ({ page }) => {
    await page.route('**/*.glb', (r) => r.abort())
    await page.setViewportSize({ width: 1440, height: 900 })
    const errs = consoleErrors(page)
    await page.goto('/chat-desk')
    await page.waitForTimeout(4000)
    await page.screenshot({ path: `${SHOT}/pw-glb-blocked.png` })
    console.log('glb-blocked canvas:', await page.locator('canvas').count(), 'errs', JSON.stringify(errs))
    await expect(page.getByText('ภาพรวมห้องแชท')).toBeVisible()
  })

  test('inbox + chat-desk พร้อมกัน: ออนไลน์นับเจ้าของ 1', async ({ context, page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const errs = consoleErrors(page)
    await page.goto('/inbox')
    await page.waitForTimeout(3000)
    const p2 = await context.newPage()
    await p2.setViewportSize({ width: 1440, height: 900 })
    await p2.goto('/chat-desk')
    await p2.waitForTimeout(8000)
    console.log('online text:', (await p2.locator('main').innerText()).match(/ออนไลน์[\s\S]{0,30}/)?.[0].replace(/\n/g, ' '))
    await p2.screenshot({ path: `${SHOT}/pw-online-with-inbox.png` })
    console.log('inbox errs', JSON.stringify(errs))
  })
})

test('ADMIN: ไม่เห็นเมนู + หน้า = การ์ดไม่มีสิทธิ์', async ({ context, page }) => {
  await login(context, ADMIN)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/inbox')
  await page.waitForTimeout(1500)
  expect(await page.locator('aside a[href="/chat-desk"]').count()).toBe(0)
  await page.goto('/chat-desk')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${SHOT}/pw-admin-no-permission.png` })
  const main = await page.locator('main').innerText()
  console.log('admin main:', main.replace(/\n+/g, ' | '))
  expect(main).not.toMatch(/ภาพรวมห้องแชท/)
  expect((await page.request.get('/api/chat-desk/rooms/' + OTHER_ROOM + '/preview')).status()).toBe(404)
})

test('anon → sign-in', async ({ page }) => {
  await page.goto('/chat-desk')
  await page.waitForURL(/sign-in/)
})
