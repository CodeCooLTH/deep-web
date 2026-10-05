/**
 * 00070 EXT T7 — updateTemplate / resetTemplate / updateSettings(guard) / getGroupDetail กับ DB local
 *
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 (นอกนั้น skip) · ข้อมูลสร้างด้วย prefix `lrt7-<run>` ลบ scope ด้วย id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { getGroupDetail, updateSettings, updateTemplate, resetTemplate } from '@/services/line-report-group.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const ids = { users: [] as string[], groups: [] as string[] }

const mkUser = async (tag: string) => {
  const u = await prisma.user.create({ data: { displayName: `lrt7-${run}-${tag}`, username: `lrt7_${run}_${tag}` }, select: { id: true } })
  ids.users.push(u.id)
  await prisma.businessPackageSubscription.create({
    data: { ownerId: u.id, tier: 'PRO', source: 'WALLET', status: 'ACTIVE', activatedAt: new Date(), currentPeriodStart: new Date(), nextRenewalAt: new Date(Date.now() + 86_400_000) },
  })
  return u.id
}
const mkGroup = async (ownerId: string, data: Record<string, unknown> = {}) => {
  const g = await prisma.lineReportGroup.create({ data: { ownerId, ...data } as never, select: { id: true } })
  ids.groups.push(g.id)
  return g.id
}
const row = (id: string) => prisma.lineReportGroup.findUniqueOrThrow({ where: { id } })
const code = async (p: Promise<unknown>) => {
  try { await p; return null } catch (e) { const x = e as { code?: string; details?: { rule?: string } }; return x.code ? `${x.code}${x.details?.rule ? `:${x.details.rule}` : ''}` : `RAW:${(e as Error).message}` }
}
const tpl = (blocks: unknown[], extra: Record<string, unknown> = {}) => ({ v: 1, button: { show: true, label: 'เปิด Deep' }, blocks, ...extra })
const OS = [{ id: 'a', type: 'orders' }, { id: 'b', type: 'sales' }]

describe.skipIf(!isLocal)('00070 EXT template service (DB)', () => {
  let A: string, B: string

  beforeAll(async () => { A = await mkUser('a'); B = await mkUser('b') })
  afterAll(async () => {
    await prisma.lineReportDelivery.deleteMany({ where: { groupId: { in: ids.groups } } })
    await prisma.lineReportGroup.deleteMany({ where: { id: { in: ids.groups } } })
    await prisma.businessPackageSubscription.deleteMany({ where: { ownerId: { in: ids.users } } })
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  it('บันทึกสำเร็จ: เขียน template + flag ที่ derive + version+1 ในครั้งเดียว · detail คืน template/effectiveTemplate', async () => {
    const g = await mkGroup(A)
    const d = await updateTemplate(A, g, { template: tpl([{ id: 'a', type: 'orders' }, { id: 's', type: 'shops', top3: false, profit: false }]), expectedVersion: 0 })
    const r = await row(g)
    expect(r.templateVersion).toBe(1)
    expect(r).toMatchObject({ showOrders: true, showSales: false, showCancelled: false, showTopProducts: false, showProfit: false })
    expect(d.templateVersion).toBe(1)
    expect(d.template).toMatchObject({ v: 1 })
    expect(d.effectiveTemplate).toEqual(d.template)
  })

  it('template = null: effectiveTemplate = แบบมาตรฐานจากคอลัมน์ · deliveries มี summary', async () => {
    const g = await mkGroup(A)
    const d = (await getGroupDetail(A, g)).group
    expect(d.template).toBeNull()
    expect(d.templateVersion).toBe(0)
    expect(d.effectiveTemplate.blocks.map((b) => b.type)).toContain('orders')
    await prisma.lineReportDelivery.create({ data: { groupId: g, kind: 'TEST', slotKey: `T:${randomUUID()}`, status: 'SENT', summary: '2 ร้าน · ข้าม: x' } })
    expect((await getGroupDetail(A, g)).group.deliveries[0].summary).toBe('2 ร้าน · ข้าม: x')
  })

  it('template เสียในฐาน: ไม่ throw · template คืน null · effective = แบบมาตรฐาน', async () => {
    const g = await mkGroup(A, { template: { v: 9, junk: true } })
    const d = (await getGroupDetail(A, g)).group
    expect(d.template).toBeNull()
    expect(d.effectiveTemplate.v).toBe(1)
    // ส่งจริง fallback ไปคอลัมน์แล้ว ⇒ PATCH คอลัมน์ต้องทำได้ ไม่งั้นเจ้าของติดกับดัก (security Low-1)
    expect(await code(updateSettings(A, g, { showCancelled: false }))).toBeNull()
  })

  it('expectedVersion ไม่ตรง → TEMPLATE_STALE และไม่เขียนอะไร', async () => {
    const g = await mkGroup(A)
    expect(await code(updateTemplate(A, g, { template: tpl(OS), expectedVersion: 3 }))).toBe('TEMPLATE_STALE')
    const r = await row(g)
    expect(r.templateVersion).toBe(0)
    expect(r.template).toBeNull()
  })

  it('PUT ขนาน 2 ครั้งด้วย version เดียวกัน → สำเร็จ 1 · STALE 1 · version = 1', async () => {
    const g = await mkGroup(A)
    const res = await Promise.all([
      code(updateTemplate(A, g, { template: tpl(OS, { title: 'หนึ่ง' }), expectedVersion: 0 })),
      code(updateTemplate(A, g, { template: tpl(OS, { title: 'สอง' }), expectedVersion: 0 })),
    ])
    expect(res.filter((x) => x === null)).toHaveLength(1)
    expect(res.filter((x) => x === 'TEMPLATE_STALE')).toHaveLength(1)
    expect((await row(g)).templateVersion).toBe(1)
  })

  it('เทมเพลตกราฟอย่างเดียว/ข้อความอย่างเดียว → INVALID_SETTINGS:METRIC_REQUIRED (ไม่ใช่ raw DB error) และไม่เขียน', async () => {
    const g = await mkGroup(A)
    const chart = tpl([{ id: 'c', type: 'chart_trend', measure: 'sales' }])
    const text = tpl([{ id: 't', type: 'text', style: { bold: false, size: 'm', color: 'ink' }, runs: [{ t: 'สวัสดี' }] }])
    expect(await code(updateTemplate(A, g, { template: chart, expectedVersion: 0 }))).toBe('INVALID_SETTINGS:METRIC_REQUIRED')
    expect(await code(updateTemplate(A, g, { template: text, expectedVersion: 0 }))).toBe('INVALID_SETTINGS:METRIC_REQUIRED')
    expect((await row(g)).templateVersion).toBe(0)
  })

  it('กำไร: ทุกทางเข้า (บล็อก/ตัวเลือกย่อยต่อร้าน/โทเคน) ต้อง confirmProfit · เปิดแล้วตั้ง profitEnabledAt', async () => {
    const g = await mkGroup(A)
    const viaBlock = tpl([...OS, { id: 'p', type: 'profit' }])
    const viaShops = tpl([...OS, { id: 's', type: 'shops', top3: false, profit: true }])
    const viaToken = tpl([...OS, { id: 't', type: 'text', style: { bold: false, size: 'm', color: 'ink' }, runs: [{ tok: 'profit' }] }])
    for (const t of [viaBlock, viaShops, viaToken]) {
      expect(await code(updateTemplate(A, g, { template: t, expectedVersion: 0 }))).toBe('PROFIT_CONFIRM_REQUIRED')
    }
    expect((await row(g)).showProfit).toBe(false)
    await updateTemplate(A, g, { template: viaToken, expectedVersion: 0, confirmProfit: true })
    const r = await row(g)
    expect(r.showProfit).toBe(true)
    expect(r.profitEnabledAt).not.toBeNull()
    // เปิดค้างไว้แล้วบันทึกซ้ำ = ไม่ต้องยืนยันอีก · ค่า profitEnabledAt คงเดิม
    await updateTemplate(A, g, { template: viaBlock, expectedVersion: 1 })
    expect((await row(g)).profitEnabledAt).toEqual(r.profitEnabledAt)
    // ปิดกำไร → NULL
    await updateTemplate(A, g, { template: tpl(OS), expectedVersion: 2 })
    expect(await row(g)).toMatchObject({ showProfit: false, profitEnabledAt: null })
  })

  it('owner อื่น / กลุ่มที่ไม่มี / REMOVED → GROUP_NOT_FOUND ทั้ง PUT และ DELETE (ไม่แตะแถว)', async () => {
    const g = await mkGroup(A)
    const gone = await mkGroup(A, { status: 'REMOVED', removedAt: new Date() })
    expect(await code(updateTemplate(B, g, { template: tpl(OS), expectedVersion: 0 }))).toBe('GROUP_NOT_FOUND')
    expect(await code(resetTemplate(B, g))).toBe('GROUP_NOT_FOUND')
    expect(await code(updateTemplate(A, gone, { template: tpl(OS), expectedVersion: 0 }))).toBe('GROUP_NOT_FOUND')
    expect(await code(updateTemplate(A, randomUUID(), { template: tpl(OS), expectedVersion: 0 }))).toBe('GROUP_NOT_FOUND')
    expect((await row(g)).templateVersion).toBe(0)
  })

  it('เทมเพลตผิดรูป → TEMPLATE_INVALID พร้อม rule · เกินเพดานคอลัมน์ → TEMPLATE_TOO_LARGE · version ไม่ถูกต้อง → VALIDATION', async () => {
    const g = await mkGroup(A)
    expect(await code(updateTemplate(A, g, { template: tpl([{ id: 'a', type: 'orders' }, { id: 'a', type: 'sales' }]), expectedVersion: 0 }))).toBe('TEMPLATE_INVALID:DUPLICATE_ID')
    expect(await code(updateTemplate(A, g, { template: { v: 1 }, expectedVersion: 0 }))).toMatch(/^TEMPLATE_INVALID/)
    expect(await code(updateTemplate(A, g, { template: tpl(OS), expectedVersion: -1 }))).toBe('VALIDATION')
    // ข้อจำกัดของ schema รวมกันแทบไม่เหลือที่ให้เกิน 16KB (ไทย 3 ไบต์/ตัว ได้ ~16.2KB) — ใช้ emoji 4 ไบต์/code point (ผู้ใช้พิมพ์เองได้) ดันให้เกิน
    const fat = Array.from({ length: 6 }, (_, i) => ({
      id: `${i}`.repeat(64), type: 'text', style: { bold: true, size: 'l', color: 'accent' },
      runs: Array.from({ length: 60 }, () => ({ t: '😀😀', b: true, accent: true })),
    }))
    const wide = (id: string, rest: Record<string, unknown>) => ({ id: id.repeat(64), ...rest })
    const big = {
      ...tpl([
        wide('a', { type: 'orders' }), wide('b', { type: 'sales' }), wide('c', { type: 'cancelled' }), wide('d', { type: 'profit' }), wide('e', { type: 'cycle' }),
        wide('f', { type: 'shops', top3: true, profit: true }), wide('g', { type: 'chart_trend', measure: 'sales' }), wide('h', { type: 'chart_compare', measure: 'orders' }),
        ...fat, ...Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`.padEnd(64, 'x'), type: 'separator' })),
      ]),
      title: '😀'.repeat(60),
    }
    big.button.label = '😀'.repeat(20)
    expect(Buffer.byteLength(JSON.stringify(big))).toBeGreaterThan(16384)
    expect(await code(updateTemplate(A, g, { template: big, expectedVersion: 0 }))).toBe('TEMPLATE_TOO_LARGE')
    expect((await row(g)).templateVersion).toBe(0)
  })

  it('PATCH show*/attachCycleToDaily ขณะมีเทมเพลต → FLAGS_DERIVED_FROM_TEMPLATE · ฟิลด์อื่นยังแก้ได้ · template=null PATCH ได้ตามเดิม', async () => {
    const g = await mkGroup(A)
    expect(await code(updateSettings(A, g, { showCancelled: false }))).toBeNull() // ยังไม่มีเทมเพลต
    await updateTemplate(A, g, { template: tpl(OS), expectedVersion: 0 })
    expect(await code(updateSettings(A, g, { showCancelled: true }))).toBe('FLAGS_DERIVED_FROM_TEMPLATE')
    expect(await code(updateSettings(A, g, { attachCycleToDaily: false }))).toBe('FLAGS_DERIVED_FROM_TEMPLATE')
    expect(await code(updateSettings(A, g, { skipWhenNoOrders: true }))).toBeNull()
    expect(await row(g)).toMatchObject({ skipWhenNoOrders: true, showCancelled: false })
  })

  it('เปิดรายเดือนกลับหลังปิด: attachCycleToDaily ตามที่เทมเพลตขอ (E-8)', async () => {
    const g = await mkGroup(A, { monthlyEnabled: true, dailyTimes: [1080], dailyEnabled: true, cutoffDay: 1 })
    await updateTemplate(A, g, { template: tpl([...OS, { id: 'c', type: 'cycle' }]), expectedVersion: 0 })
    expect((await row(g)).attachCycleToDaily).toBe(true)
    await updateSettings(A, g, { monthlyEnabled: false })
    expect((await row(g)).attachCycleToDaily).toBe(false)
    await updateSettings(A, g, { monthlyEnabled: true })
    expect((await row(g)).attachCycleToDaily).toBe(true)
  })

  it('reset: template NULL · flag กลับค่าตั้งต้นคอลัมน์ · profitEnabledAt NULL · version+1', async () => {
    const g = await mkGroup(A)
    await updateTemplate(A, g, { template: tpl([{ id: 'p', type: 'profit' }]), expectedVersion: 0, confirmProfit: true })
    expect(await row(g)).toMatchObject({ showOrders: false, showSales: false, showProfit: true })
    const d = await resetTemplate(A, g)
    expect(await row(g)).toMatchObject({
      template: null, templateVersion: 2, showOrders: true, showSales: true, showCancelled: true, showTopProducts: true, showProfit: false, profitEnabledAt: null,
    })
    expect(d.template).toBeNull()
    expect(d.templateVersion).toBe(2)
  })

  it('ค่าใช้จ่าย (FR-EXP-05): เปิดเพิ่มต้อง confirmExpense · มีอยู่แล้วแก้อื่นผ่าน · reset แล้วเพิ่มใหม่ต้องยืนยันอีก', async () => {
    const g = await mkGroup(A)
    const viaExpense = tpl([...OS, { id: 'e', type: 'expense' }])
    const viaNet = tpl([...OS, { id: 'n', type: 'net_sales' }])
    // (ก) null → expense / net_sales ไม่ confirm = 400 และไม่เขียน
    for (const t of [viaExpense, viaNet]) expect(await code(updateTemplate(A, g, { template: t, expectedVersion: 0 }))).toBe('EXPENSE_CONFIRM_REQUIRED')
    expect((await row(g)).templateVersion).toBe(0)
    // (ข) confirm ผ่าน
    await updateTemplate(A, g, { template: viaExpense, expectedVersion: 0, confirmExpense: true })
    expect((await row(g)).templateVersion).toBe(1)
    // (ค) มีอยู่แล้ว: แก้อย่างอื่น/สลับเป็น net_sales ไม่ต้องยืนยันซ้ำ
    await updateTemplate(A, g, { template: tpl([...OS, { id: 'e', type: 'expense' }, { id: 'c', type: 'cancelled' }]), expectedVersion: 1 })
    await updateTemplate(A, g, { template: viaNet, expectedVersion: 2 })
    // (ง) reset แล้วเพิ่ม = ต้องยืนยันใหม่
    await resetTemplate(A, g)
    expect(await code(updateTemplate(A, g, { template: viaExpense, expectedVersion: 4 }))).toBe('EXPENSE_CONFIRM_REQUIRED')
  })
})
