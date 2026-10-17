/**
 * auto-notify-config.service (00078 T11 · TC-160, 170..175, 184) — Postgres จริง
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ข้อมูล scope ด้วย id ที่เทสสร้าง ไม่มี deleteMany เปล่า
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import * as v from 'valibot'
import { SetAutoNotifyCapSchema } from '@/lib/auto-notify/schemas'
import {
  AutoNotifyKindNotAvailableError,
  AutoNotifyTemplateConflictError,
  AutoNotifyTemplateInvalidError,
  getAutoNotifySettings,
  getStripContext,
  resetTemplate,
  saveTemplate,
  setDailyCap,
  setSwitch,
} from '@/services/auto-notify-config.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const S = { user: '', online: '', service: '', other: '', conv: '', convB: '', orderToken: '', orderId: '' }

describe.skipIf(!isLocal)('auto-notify-config (DB จริง)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `an-${run}`, username: `an_${run}` }, select: { id: true } })
    const mk = (vertical: string) =>
      prisma.shop.create({ data: { userId: u.id, shopName: `an-${run}-${vertical}`, kind: 'BUSINESS', vertical } as never, select: { id: true } })
    const [a, b, c] = await Promise.all([mk('ONLINE_SALES'), mk('SERVICE_QUEUE'), mk('ONLINE_SALES')])
    const conv = await prisma.conversation.create({ data: { shopId: c.id }, select: { id: true } })
    const convB = await prisma.conversation.create({ data: { shopId: c.id }, select: { id: true } })
    const ord = await prisma.order.create({
      data: { shopId: c.id, conversationId: conv.id, type: 'PHYSICAL', totalAmount: 100, buyerContact: `08${run}` },
      select: { id: true, publicToken: true },
    })
    Object.assign(S, { user: u.id, online: a.id, service: b.id, other: c.id, conv: conv.id, convB: convB.id, orderToken: ord.publicToken, orderId: ord.id })
  })
  afterAll(async () => {
    const shopIds = [S.online, S.service, S.other]
    await prisma.autoNotifySwitch.deleteMany({ where: { shopId: { in: shopIds } } })
    await prisma.autoNotifyTemplate.deleteMany({ where: { shopId: { in: shopIds } } })
    await prisma.autoNotifyConfig.deleteMany({ where: { shopId: { in: shopIds } } })
    await prisma.order.deleteMany({ where: { id: S.orderId } })
    await prisma.conversation.deleteMany({ where: { id: { in: [S.conv, S.convB] } } })
    await prisma.shop.deleteMany({ where: { id: { in: shopIds } } })
    await prisma.user.deleteMany({ where: { id: S.user } })
    await prisma.$disconnect()
  })

  it('enabledAt: เปิดครั้งแรกตั้งค่า · ปิดไม่แตะ · เปิดใหม่ตั้งใหม่ · เปิดซ้ำตอนเปิดอยู่ไม่รีเซ็ต', async () => {
    const first = await setSwitch(S.online, 'ORDER_SUMMARY', true, S.user)
    expect(first.firstEnable).toBe(true)
    expect(first.enabledAt).not.toBeNull()
    await new Promise((r) => setTimeout(r, 20))
    const again = await setSwitch(S.online, 'ORDER_SUMMARY', true, S.user)
    expect(again.enabledAt).toBe(first.enabledAt) // เปิดซ้ำ = ไม่รีเซ็ต
    expect(again.firstEnable).toBe(false)
    const off = await setSwitch(S.online, 'ORDER_SUMMARY', false, S.user)
    expect(off.enabled).toBe(false)
    expect(off.enabledAt).toBe(first.enabledAt) // ปิดไม่แตะ
    await new Promise((r) => setTimeout(r, 20))
    const re = await setSwitch(S.online, 'ORDER_SUMMARY', true, S.user)
    expect(new Date(re.enabledAt!).getTime()).toBeGreaterThan(new Date(first.enabledAt!).getTime())
    expect(re.firstEnable).toBe(false)
  })

  it('ปิดก่อนไม่เคยเปิด: แถวใหม่ enabled=false enabledAt=null (ผ่าน CHECK)', async () => {
    const r = await setSwitch(S.online, 'TRACKING', false, S.user)
    expect(r).toMatchObject({ enabled: false, enabledAt: null })
  })

  it('kind ผิด vertical → KindNotAvailable (สวิตช์/เทมเพลต/รีเซ็ต)', async () => {
    await expect(setSwitch(S.online, 'SERVICE_BOOKED', true, S.user)).rejects.toBeInstanceOf(AutoNotifyKindNotAvailableError)
    await expect(saveTemplate(S.service, 'TRACKING', 'x', null, S.user)).rejects.toBeInstanceOf(AutoNotifyKindNotAvailableError)
    await expect(resetTemplate(S.service, 'TRACKING', new Date())).rejects.toBeInstanceOf(AutoNotifyKindNotAvailableError)
  })

  it('เทมเพลต: บันทึกใหม่ → ชน updatedAt → 409 → รีเซ็ต', async () => {
    const a = await saveTemplate(S.online, 'ORDER_SUMMARY', 'สวัสดี {ชื่อลูกค้า}', null, S.user)
    await expect(saveTemplate(S.online, 'ORDER_SUMMARY', 'อีกคน', null, S.user)).rejects.toBeInstanceOf(AutoNotifyTemplateConflictError)
    const b = await saveTemplate(S.online, 'ORDER_SUMMARY', 'แก้ {ชื่อลูกค้า}', new Date(a.updatedAt), S.user)
    const stale = saveTemplate(S.online, 'ORDER_SUMMARY', 'เก่า', new Date(a.updatedAt), S.user)
    await expect(stale).rejects.toMatchObject({ currentUpdatedAt: new Date(b.updatedAt) })
    const snap = await getAutoNotifySettings(S.online, ['MANAGER'])
    expect(snap.kinds.find((k) => k.kind === 'ORDER_SUMMARY')!.template).toMatchObject({ body: 'แก้ {ชื่อลูกค้า}', isCustom: true })
    expect(snap.canEdit).toBe(true)
    expect((await getAutoNotifySettings(S.online, ['CHAT'])).canEdit).toBe(false)
    await expect(resetTemplate(S.online, 'ORDER_SUMMARY', new Date(a.updatedAt))).rejects.toBeInstanceOf(AutoNotifyTemplateConflictError)
    await resetTemplate(S.online, 'ORDER_SUMMARY', new Date(b.updatedAt))
    await resetTemplate(S.online, 'ORDER_SUMMARY', new Date(b.updatedAt)) // idempotent
    const after = await getAutoNotifySettings(S.online, ['OWNER'])
    expect(after.kinds.find((k) => k.kind === 'ORDER_SUMMARY')!.template.isCustom).toBe(false)
  })

  it('round-trip: updatedAt จาก GET (ISO ms) ส่งกลับ PUT/DELETE แล้วไม่ชน', async () => {
    const a = await saveTemplate(S.online, 'TRACKING', 'พัสดุ {เลขพัสดุ}', null, S.user)
    const got = (await getAutoNotifySettings(S.online, ['OWNER'])).kinds.find((k) => k.kind === 'TRACKING')!.template.updatedAt!
    expect(got).toBe(a.updatedAt)
    const b = await saveTemplate(S.online, 'TRACKING', 'พัสดุใหม่ {เลขพัสดุ}', new Date(got), S.user)
    await resetTemplate(S.online, 'TRACKING', new Date(b.updatedAt))
  })

  it('strip-context: ห้อง+ออเดอร์คู่กัน — ห้องที่ออเดอร์ผูกอยู่ได้ context · ห้องอื่นของร้านเดียวกัน = ไม่พบ', async () => {
    const ok = await getStripContext(S.other, ['OWNER'], { conversationId: S.conv, orderToken: S.orderToken })
    expect(ok.found).toEqual({ conversation: true, order: true })
    expect(ok.context.order).toMatchObject({ conversationId: S.conv })
    const bad = await getStripContext(S.other, ['OWNER'], { conversationId: S.convB, orderToken: S.orderToken })
    expect(bad.found.conversation || bad.found.order).toBe(false)
  })

  it('เทมเพลต: ตัวแปรผิดชนิด/ว่าง ถูกปฏิเสธซ้ำที่ server', async () => {
    await expect(saveTemplate(S.online, 'ORDER_SUMMARY', '{ลิงก์งาน}', null, S.user)).rejects.toBeInstanceOf(AutoNotifyTemplateInvalidError)
    await expect(saveTemplate(S.online, 'ORDER_SUMMARY', '   ', null, S.user)).rejects.toBeInstanceOf(AutoNotifyTemplateInvalidError)
  })

  it('เพดาน: ไม่มีแถว=5 · ตั้งได้ · 0/21/ทศนิยม ถูก schema ปฏิเสธ', async () => {
    expect((await getAutoNotifySettings(S.online, ['OWNER'])).dailyCapPerRoom).toBe(5)
    expect(await setDailyCap(S.online, 12, S.user)).toEqual({ dailyCapPerRoom: 12 })
    expect((await getAutoNotifySettings(S.online, ['OWNER'])).dailyCapPerRoom).toBe(12)
    for (const bad of [0, 21, 2.5, '5', null]) expect(v.safeParse(SetAutoNotifyCapSchema, { dailyCapPerRoom: bad }).success, String(bad)).toBe(false)
    for (const ok of [1, 20]) expect(v.safeParse(SetAutoNotifyCapSchema, { dailyCapPerRoom: ok }).success).toBe(true)
  })

  it('snapshot: kinds ตาม vertical', async () => {
    expect((await getAutoNotifySettings(S.service, ['OWNER'])).kinds.map((k) => k.kind)).toEqual(['SERVICE_BOOKED', 'SERVICE_STARTED', 'SERVICE_CLOSED'])
  })

  it('strip-context: ห้องของร้านอื่นหาไม่เจอ (WHERE shopId) · ห้องร้านตัวเองเจอ', async () => {
    expect((await getStripContext(S.online, ['OWNER'], { conversationId: S.conv })).found.conversation).toBe(false)
    const ok = await getStripContext(S.other, ['CHAT'], { conversationId: S.conv })
    expect(ok.found.conversation).toBe(true)
    expect(ok.context.conversation).toMatchObject({ id: S.conv, channel: 'DEEP', lastInboundAt: null })
    expect(ok.context.canOpenSettings).toBe(true)
    expect((await getStripContext(S.other, ['TECHNICIAN'], { orderToken: 'nope' })).found.order).toBe(false)
  })
})
