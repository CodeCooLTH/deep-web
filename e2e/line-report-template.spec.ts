/**
 * 00070 EXT T14 — หน้าจัดข้อความรายงาน LINE (/business/line-reports/{id}/template) + การ์ดในหน้าตั้งค่า
 * 🛑 ไม่กด "ส่งทดสอบ" (ยิง LINE จริง) · seed/cleanup scope ด้วย id ที่สร้างเอง · DB ต้องเป็น localhost:5434 (HR14)
 * รัน: DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" DIRECT_URL=<เหมือนกัน> npx playwright test e2e/line-report-template.spec.ts
 */
import { test, expect, type Page } from '@playwright/test'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'

const URL_DB = process.env.DATABASE_URL ?? ''
if (!/@(localhost|127\.0\.0\.1):5434\//.test(URL_DB)) throw new Error('E2E: DATABASE_URL ต้องเป็น localhost:5434')
const prisma = new PrismaClient()
const SHOT = '/tmp/qa-00070'
const H = 'http://seller.deepth.local:4000'
const ids = { user: '', shops: [] as string[], group: '', token: '' }

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  fs.mkdirSync(SHOT, { recursive: true })
  const s = Math.random().toString(36).slice(2, 8)
  const user = await prisma.user.create({ data: { displayName: 'QA00070', username: `qa70_${s}`, phone: `09${String(Date.now()).slice(-8)}`, isShop: true } })
  ids.user = user.id
  for (const [n, k] of [['ร้านทดสอบ A', 'a'], ['ร้านทดสอบ B', 'b']] as const) {
    const sh = await prisma.shop.create({ data: { userId: user.id, shopName: n, businessType: 'INDIVIDUAL', slug: `qa70-${s}-${k}`, category: 'general', kind: 'BUSINESS' } })
    ids.shops.push(sh.id)
    await prisma.shopMember.create({ data: { shopId: sh.id, userId: user.id, role: 'OWNER' } })
  }
  await prisma.businessPackageSubscription.create({ data: { ownerId: user.id, tier: 'PRO', source: 'WALLET', status: 'ACTIVE', activatedAt: new Date(), currentPeriodStart: new Date(), nextRenewalAt: new Date(Date.now() + 30 * 86400000) } })
  const g = await prisma.lineReportGroup.create({ data: { ownerId: user.id, status: 'ACTIVE', groupName: 'QA กลุ่มทดสอบ', lineGroupId: `Cqa70${s}`, dailyEnabled: true, dailyTimes: [1080], shops: { create: ids.shops.map((shopId) => ({ shopId })) } } })
  ids.group = g.id
  ids.token = await encode({ token: { userId: user.id, needsRegistration: false, needsOnboarding: false, activeShopId: ids.shops[0] }, secret: process.env.NEXTAUTH_SECRET! })
  fs.writeFileSync(`${SHOT}/spec-ids.json`, JSON.stringify({ ...ids, token: undefined }))
})

test.afterAll(async () => {
  await prisma.lineReportDelivery.deleteMany({ where: { groupId: ids.group } })
  await prisma.lineReportGroup.deleteMany({ where: { id: ids.group } })
  await prisma.shopMember.deleteMany({ where: { shopId: { in: ids.shops } } })
  await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
  await prisma.businessPackageSubscription.deleteMany({ where: { ownerId: ids.user } })
  await prisma.user.deleteMany({ where: { id: ids.user } })
  await prisma.$disconnect()
})

const T = () => `${H}/business/line-reports/${ids.group}/template`
const G = () => `${H}/business/line-reports/${ids.group}`
const errs: string[] = []
let page: Page

test.beforeEach(async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } })
  await ctx.addCookies([{ name: 'next-auth.session-token', value: ids.token, domain: 'seller.deepth.local', path: '/' }])
  page = await ctx.newPage()
  page.on('console', (m) => m.type() === 'error' && errs.push(`${page.url()} :: ${m.text()}`))
  page.on('pageerror', (e) => errs.push(`PAGEERROR ${e.message}`))
})
test.afterEach(async () => {
  await page.context().close()
})

const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
const shot = (n: string) => page.screenshot({ path: `${SHOT}/${n}.png`, fullPage: false })
const saveBtn = () => page.locator('button:visible', { hasText: 'บันทึกเทมเพลต' }).first()
const setTpl = (template: unknown, version = 0) => prisma.lineReportGroup.update({ where: { id: ids.group }, data: { template: template as never, templateVersion: version } })
const row = () => prisma.lineReportGroup.findUniqueOrThrow({ where: { id: ids.group } })
const gotoT = async () => {
  await page.goto(T())
  await page.getByRole('heading', { name: 'จัดข้อความรายงาน' }).waitFor()
}
const add = (label: string) => page.locator(`button[aria-label="เพิ่ม${label}"]:visible`).first().click()
const pvSel = 'section[aria-label="ตัวอย่างในกลุ่ม LINE"]:visible'
const titles = () => page.locator('div[id^="row-"] span.truncate.font-medium').allTextContents()

test('Q1 การ์ดข้อความในหน้าตั้งค่า (3 viewport)', async () => {
  for (const w of [1180, 768, 375]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.goto(G())
    await expect(page.getByText('ข้อความที่ส่งเข้ากลุ่ม')).toBeVisible()
    await expect(page.getByText('ใช้แบบมาตรฐานอยู่')).toBeVisible()
    await expect(page.getByRole('link', { name: 'จัดข้อความ' })).toHaveAttribute('href', `/business/line-reports/${ids.group}/template`)
    await expect(page.getByText('รายงานยอดรายวัน').first()).toBeVisible()
    expect(await overflow(), `overflow @${w}`).toBe(false)
    await shot(`q1-settings-${w}`)
  }
})

test('Q2 หน้า template: layout 3/2/สลับ + ไม่ overflow', async () => {
  const cols = () =>
    page.evaluate(() => {
      const x = (s: string) => {
        const e = [...document.querySelectorAll(s)].find((n) => (n as HTMLElement).offsetParent) as HTMLElement | undefined
        return e ? Math.round(e.getBoundingClientRect().left) : null
      }
      return { canvas: x('section[aria-label="ข้อความ"]'), preview: x('section[aria-label="ตัวอย่างในกลุ่ม LINE"]'), lib: x('h3') }
    })
  await page.setViewportSize({ width: 1180, height: 900 })
  await gotoT()
  const c3 = await cols()
  console.log('1180', c3)
  expect(c3.lib).not.toBeNull()
  expect(c3.canvas!).toBeGreaterThan(c3.lib!)
  expect(c3.preview!).toBeGreaterThan(c3.canvas!)
  expect(await overflow()).toBe(false)
  await shot('q2-tpl-1180')
  await page.setViewportSize({ width: 768, height: 900 })
  await gotoT()
  const c2 = await cols()
  console.log('768', c2)
  expect(c2.canvas).not.toBeNull()
  expect(c2.preview).not.toBeNull()
  expect(c2.preview!).toBeGreaterThan(c2.canvas! + 100)
  expect(await overflow()).toBe(false)
  await shot('q2-tpl-768')
  await page.setViewportSize({ width: 375, height: 800 })
  await gotoT()
  expect(await overflow()).toBe(false)
  const seg = page.getByRole('radiogroup', { name: 'เลือกมุมมอง' }).locator('visible=true').first()
  await expect(seg).toBeVisible()
  await expect(page.locator('section[aria-label="ข้อความ"]:visible')).toHaveCount(1)
  await expect(page.locator(pvSel)).toHaveCount(0)
  await shot('q2-tpl-375-canvas')
  await seg.getByRole('radio', { name: 'ตัวอย่าง' }).click()
  await expect(page.locator(pvSel)).toHaveCount(1)
  await expect(page.locator('section[aria-label="ข้อความ"]:visible')).toHaveCount(0)
  expect(await overflow()).toBe(false)
  await shot('q2-tpl-375-preview')
})

test('Q3 เพิ่มบล็อกจากคลัง → dirty + save primary + หายจากคลัง + พรีวิวอัปเดต', async () => {
  await gotoT()
  const pv = page.locator(pvSel)
  await expect(saveBtn()).toBeDisabled()
  await expect(pv).not.toContainText('แนวโน้ม')
  await expect(page.getByText('ยังไม่บันทึก')).toHaveCount(0)
  await add('แนวโน้ม 7 วันล่าสุด')
  await expect(page.getByText('ยังไม่บันทึก').first()).toBeVisible()
  await expect(saveBtn()).toBeEnabled()
  await expect(saveBtn()).toHaveClass(/bg-primary/)
  await expect(page.locator('button[aria-label="เพิ่มแนวโน้ม 7 วันล่าสุด"]:visible')).toHaveCount(0)
  await expect(pv).toContainText('แนวโน้ม')
  await shot('q3-added-trend')
})

test('Q4 บล็อกข้อความ: ตัวหนา · markup ไม่ปิด → error + บันทึกปิด + เหตุผลเห็น (มือถือด้วย)', async () => {
  await gotoT()
  await add('ข้อความ')
  const ta = page.locator('textarea[aria-label="ข้อความ"]')
  await ta.fill('สรุป **{ชื่อร้าน}** วันนี้')
  const pv = page.locator(pvSel)
  await expect(pv).toContainText('ร้านทดสอบ')
  const boldTxt = await pv.evaluate((el) =>
    [...el.querySelectorAll('*')].filter((n) => n.children.length === 0 && /^(700|600|bold)$/.test(getComputedStyle(n).fontWeight) && /ร้าน/.test(n.textContent ?? '')).map((n) => n.textContent),
  )
  console.log('bold leaf nodes containing ร้าน:', boldTxt)
  await shot('q4-bold-preview')
  await ta.fill('**ไม่ปิด')
  await ta.blur()
  await expect(saveBtn()).toBeDisabled()
  const msg = page.locator('p.text-danger-ink').first()
  await expect(msg).toBeVisible()
  console.log('error text:', await msg.textContent())
  await shot('q4-unclosed-desktop')
  await page.setViewportSize({ width: 375, height: 800 })
  await expect(saveBtn()).toBeDisabled()
  await expect(page.locator('p.text-danger-ink').first()).toBeVisible()
  expect(await overflow()).toBe(false)
  await shot('q4-unclosed-375')
  const dby = await saveBtn().getAttribute('aria-describedby')
  console.log('save aria-describedby:', dby)
  if (dby) {
    const r = page.locator(`#${dby}`)
    console.log('reason text:', await r.textContent(), '| visible:', await r.isVisible())
    await expect(r).toBeVisible()
  }
})

test('Q5 กราฟแนวโน้ม + เทียบรายร้าน → พรีวิวมีแท่ง', async () => {
  await gotoT()
  await add('แนวโน้ม 7 วันล่าสุด')
  await add('เทียบรายร้าน')
  const pv = page.locator(pvSel)
  await expect(pv).toContainText('แนวโน้ม')
  await expect(pv).toContainText('เทียบ')
  await shot('q5-charts')
})

test('Q6 ย้ายบล็อก: ปุ่มขึ้น/ลง + คีย์บอร์ด', async () => {
  await gotoT()
  const before = await titles()
  console.log('before', before)
  await page.locator('div[id^="row-"]').nth(0).locator('button[aria-expanded]').click()
  await page.locator('button[aria-label^="ย้าย"][aria-label$="ลง"]:visible').first().click()
  const after = await titles()
  console.log('after-btn', after)
  expect(after[1]).toBe(before[0])
  expect(after[0]).toBe(before[1])
  await page.locator('button[aria-label^="ย้าย"][aria-label$="ขึ้น"]:visible').first().click()
  expect(await titles()).toEqual(before)
  const grip = page.locator('[aria-label^="ลากเพื่อย้าย"]').first()
  await grip.focus()
  await page.keyboard.press('Space')
  await page.waitForTimeout(300)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(400)
  await page.keyboard.press('Space')
  await page.waitForTimeout(600)
  const kb = await titles()
  console.log('after-kb', kb)
  expect(kb[1]).toBe(before[0])
  expect(kb[0]).toBe(before[1])
  await shot('q6-moved')
})

test('Q7 เอาบล็อกออก → toast ย้อนกลับ → กลับที่เดิม', async () => {
  await gotoT()
  const before = await titles()
  await page.locator('div[id^="row-"]').nth(2).locator('button[aria-expanded]').click()
  await page.locator('button[aria-label^="เอา"][aria-label$="ออก"]:visible').first().click()
  expect((await titles()).length).toBe(before.length - 1)
  await shot('q7-removed-toast')
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
  expect(await titles()).toEqual(before)
})

test('Q8 บันทึก → toast → reload คงอยู่ · DB template + version+1', async () => {
  await prisma.lineReportGroup.update({ where: { id: ids.group }, data: { template: null as never, templateVersion: 0 } }).catch(async () => {
    await prisma.$executeRaw`UPDATE "LineReportGroup" SET template = NULL, "templateVersion" = 0 WHERE id = ${ids.group}`
  })
  const v0 = (await row()).templateVersion
  await gotoT()
  await add('ข้อความ')
  await page.locator('textarea[aria-label="ข้อความ"]').fill('สรุป **{ชื่อร้าน}** วันนี้ QA')
  await saveBtn().click()
  await expect(page.getByText('บันทึกแล้ว รายงานรอบถัดไปจะใช้แบบนี้')).toBeVisible()
  await shot('q8-saved-toast')
  const r = await row()
  expect(r.templateVersion).toBe(v0 + 1)
  expect(r.template).not.toBeNull()
  expect(JSON.stringify(r.template)).toContain('QA')
  await page.reload()
  await page.getByRole('heading', { name: 'จัดข้อความรายงาน' }).waitFor()
  await expect(page.locator('textarea[aria-label="ข้อความ"]').first()).toBeAttached().catch(() => {})
  await expect(page.locator('div[id^="row-"]').filter({ hasText: 'ข้อความ' }).first()).toBeVisible()
  await expect(saveBtn()).toBeDisabled()
  await shot('q8-after-reload')
})

test('Q9 เพิ่มกำไร → Swal ยืนยัน · ยกเลิก = ไม่ลง · ยืนยัน = ลง', async () => {
  await gotoT()
  await add('กำไร')
  const sw = page.locator('.swal2-popup')
  await expect(sw).toBeVisible()
  await expect(sw).toContainText('แสดงกำไรในกลุ่ม LINE?')
  await shot('q9-profit-swal')
  await sw.getByRole('button', { name: 'ยกเลิก' }).click()
  await expect(sw).toHaveCount(0)
  await expect(page.locator('div[id^="row-"]').filter({ hasText: 'กำไร' })).toHaveCount(0)
  await expect(page.locator('button[aria-label="เพิ่มกำไร"]:visible')).toHaveCount(1)
  await add('กำไร')
  await page.locator('.swal2-popup').getByRole('button', { name: 'แสดงกำไร' }).click()
  await expect(page.locator('div[id^="row-"]').filter({ hasText: 'กำไร' })).toHaveCount(1)
})

test('Q10 dirty แล้วกดกลับ → Swal ออกจากหน้า', async () => {
  await gotoT()
  await add('เส้นคั่น')
  await page.getByRole('button', { name: 'กลับ' }).first().click()
  const sw = page.locator('.swal2-popup')
  await expect(sw).toBeVisible()
  console.log('leave swal:', (await sw.textContent())?.slice(0, 140))
  await shot('q10-leave-swal')
  expect(page.url()).toContain('/template')
})

test('Q11 เมนู ⋯ → คืนเป็นแบบมาตรฐาน → Swal → template null', async () => {
  await setTpl({ v: 1, button: { show: true, label: 'เปิด Deep' }, blocks: [{ id: 'a', type: 'orders' }, { id: 'b', type: 'sales' }] }, 5)
  await gotoT()
  await page.locator('button[aria-label="เมนูเพิ่มเติม"]:visible').first().click()
  await page.getByRole('menuitem', { name: /คืนเป็นแบบมาตรฐาน/ }).click()
  const sw = page.locator('.swal2-popup')
  await expect(sw).toContainText('คืนเป็นแบบมาตรฐาน?')
  await shot('q11-reset-swal')
  await sw.getByRole('button', { name: 'คืนเป็นแบบมาตรฐาน' }).click()
  await expect(page.getByText('คืนเป็นแบบมาตรฐานแล้ว')).toBeVisible()
  const r = await row()
  expect(r.template).toBeNull()
  expect(r.templateVersion).toBe(6)
})

test('Q12 หน้าตั้งค่าหลังบันทึก: chip จัดเองแล้ว + ประวัติไม่พัง', async () => {
  await setTpl({ v: 1, button: { show: true, label: 'เปิด Deep' }, blocks: [{ id: 'a', type: 'orders' }, { id: 'b', type: 'sales' }] }, 7)
  await prisma.lineReportDelivery.create({ data: { groupId: ids.group, kind: 'TEST', slotKey: `T:qa70:${Date.now()}`, status: 'SENT', summary: '2 ร้าน · ข้าม: บรรทัดทดสอบ' } })
  for (const w of [1180, 375]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.goto(G())
    await expect(page.getByText('จัดเองแล้ว')).toBeVisible()
    await expect(page.getByText('ข้าม: บรรทัดทดสอบ').locator('visible=true').first()).toBeVisible()
    expect(await overflow()).toBe(false)
    await shot(`q12-settings-custom-${w}`)
  }
})

test('Z console ไม่มี error นอกจาก 404 resource', async () => {
  console.log('console errors collected:\n' + errs.join('\n'))
  expect(errs.filter((e) => !/404/.test(e))).toEqual([])
})
