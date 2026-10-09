/**
 * ai-suggest-auto.service.db.test.ts — claim + pacing บน Postgres จริง (00019-ext T4, TC-AIT-03/04)
 *
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 (นอกนั้น skip) · Typhoon mock ทั้งหมด (ไม่มีการยิงจริง)
 * ข้อมูลสร้างด้วย prefix `asa-<run>` และลบ scope ด้วย conversationId/id ที่เทสสร้างเท่านั้น (ไม่มี deleteMany เปล่า)
 * AiSuggestRun ไม่มี FK — แถว pacing สร้างตรง ๆ ได้ · เคส claim ทั้งเส้นใช้ User/Shop/Conversation/ChatMessage จริง
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const provider = vi.hoisted(() => ({ resolveSuggestProvider: vi.fn(() => 'typhoon'), draftReplySuggestions: vi.fn() }))
vi.mock('@/lib/reply-suggest-provider', () => provider)

import { claimRun, requestAutoSuggest, reserveSlot } from '@/services/ai-suggest-auto.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)

const run = randomUUID().slice(0, 8)
const convPrefix = `asa-${run}-`
const seeded = { user: '', shop: '', conv: '', msg: '' }

const mkRuns = async (shopId: string, n: number, tag: string) => {
  const ids = Array.from({ length: n }, () => randomUUID())
  await prisma.aiSuggestRun.createMany({
    data: ids.map((id, i) => ({
      id, shopId, conversationId: `${convPrefix}${tag}`, anchorMessageId: `a${i}`, attempt: 1,
      trigger: 'AUTO_NEW_MESSAGE', status: 'THINKING', provider: 'typhoon',
    })),
  })
  return ids
}

/** ไม่มีหน้าต่าง 1 วิใดมี firedAt เกิน limit */
const maxInAnySecond = (ts: number[]) =>
  Math.max(0, ...ts.map((t) => ts.filter((x) => x > t - 1000 && x <= t).length))

describe.skipIf(!isLocal)('ai-suggest-auto (DB จริง)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `asa-${run}`, username: `asa_${run}` }, select: { id: true } })
    const s = await prisma.shop.create({ data: { userId: u.id, shopName: `ร้าน-asa-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })
    const c = await prisma.conversation.create({ data: { shopId: s.id }, select: { id: true } })
    const m = await prisma.chatMessage.create({
      data: { conversationId: c.id, senderRole: 'BUYER', type: 'TEXT', body: 'สนใจสินค้าครับ' }, select: { id: true },
    })
    Object.assign(seeded, { user: u.id, shop: s.id, conv: c.id, msg: m.id })
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    provider.draftReplySuggestions.mockReset()
    await prisma.aiSuggestRun.deleteMany({
      where: { OR: [{ conversationId: { startsWith: convPrefix } }, { conversationId: seeded.conv }] },
    })
  })

  afterAll(async () => {
    await prisma.chatMessage.deleteMany({ where: { id: seeded.msg } })
    await prisma.conversation.deleteMany({ where: { id: seeded.conv } })
    await prisma.shop.deleteMany({ where: { id: seeded.shop } })
    await prisma.user.deleteMany({ where: { id: seeded.user } })
    await prisma.$disconnect()
  })

  it('claim ซ้อน 2 คำขอ (ทั้งเส้น) → 1 แถว · เรียกโมเดล 1 ครั้ง', async () => {
    provider.draftReplySuggestions.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 200))
      return { suggestions: ['ยินดีครับ'], usage: null, model: 'm', latencyMs: 200 }
    })
    const p = { shopId: seeded.shop, conversationId: seeded.conv, userId: seeded.user, userDisplayName: null, anchorMessageId: seeded.msg, manual: false, trigger: 'AUTO_NEW_MESSAGE' as const }
    const [a, b] = await Promise.all([requestAutoSuggest(p), requestAutoSuggest(p)])
    expect(provider.draftReplySuggestions).toHaveBeenCalledTimes(1)
    expect([a.status, b.status].sort()).toEqual(['READY', 'THINKING'])
    const rows = await prisma.aiSuggestRun.findMany({ where: { conversationId: seeded.conv } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'READY', outcome: 'OK', suggestion: 'ยินดีครับ', provider: 'typhoon' })
    expect(rows[0]!.firedAt).toBeInstanceOf(Date)
  })

  it('claimRun ซ้อน 2 ตัว → ชนะคนเดียว', async () => {
    const k = { shopId: 's', conversationId: `${convPrefix}c1`, anchorMessageId: 'a', attempt: 1, trigger: 'AUTO_OPEN' as const }
    const rs = await Promise.all([claimRun(k), claimRun(k), claimRun(k)])
    expect(rs.filter((r) => r.owned)).toHaveLength(1)
    expect(await prisma.aiSuggestRun.count({ where: { conversationId: k.conversationId } })).toBe(1)
  })

  it('THINKING ค้าง >30 วิ → ยึดได้คนเดียวแม้แข่งกัน', async () => {
    const k = { shopId: 's', conversationId: `${convPrefix}c2`, anchorMessageId: 'a', attempt: 1, trigger: 'AUTO_OPEN' as const }
    const first = await claimRun(k)
    expect(first.owned).toBe(true)
    await prisma.aiSuggestRun.updateMany({ where: { conversationId: k.conversationId }, data: { createdAt: new Date(Date.now() - 31_000) } })
    const rs = await Promise.all([claimRun(k), claimRun(k)])
    expect(rs.filter((r) => r.owned)).toHaveLength(1)
    // ยึดแล้ว lease ใหม่ → คนถัดไปเห็น THINKING
    expect(await claimRun(k)).toMatchObject({ owned: false, state: { status: 'THINKING' } })
  })

  it('pacing: 20 พร้อมกัน RPS=3 → firedAt ภายใน 1 วิไม่เกิน 3 · ที่เหลือถูกทิ้ง (firedAt=null)', async () => {
    vi.stubEnv('AI_SUGGEST_RPS', '3')
    vi.stubEnv('AI_SUGGEST_RPM', '1000')
    const ids = await mkRuns(`asa-shop-${run}-p`, 20, 'pace')
    const t0 = Date.now()
    // deadline สั้น (600ms < 1 วิ ที่หน้าต่างเลื่อน) → ผ่านได้เท่าเพดานพอดี ทดสอบเร็ว
    const got = await Promise.all(ids.map((id) => reserveSlot(id, `asa-shop-${run}-p`, { deadlineAt: t0 + 600 })))
    const rows = await prisma.aiSuggestRun.findMany({ where: { id: { in: ids } }, select: { id: true, firedAt: true } })
    const fired = rows.filter((r) => r.firedAt).map((r) => r.firedAt!.getTime())
    expect(got.filter(Boolean).length).toBe(fired.length)
    expect(fired.length).toBeGreaterThanOrEqual(1)
    expect(maxInAnySecond(fired)).toBeLessThanOrEqual(3)
    expect(got.filter((g) => !g).length).toBeGreaterThanOrEqual(17)
    expect(Date.now() - t0).toBeLessThan(3000)
  })

  it('pacing: ต่อร้านไม่เกินครึ่งของ RPM', async () => {
    vi.stubEnv('AI_SUGGEST_RPS', '1000')
    vi.stubEnv('AI_SUGGEST_RPM', '10')
    const shop = `asa-shop-${run}-q`
    const ids = await mkRuns(shop, 8, 'shop')
    const t0 = Date.now()
    const got = await Promise.all(ids.map((id) => reserveSlot(id, shop, { deadlineAt: t0 + 300 })))
    expect(got.filter(Boolean).length).toBe(5)
  })

  it('pacing: เพดานเริ่มต้น deadline 5 วิ — ช่องว่างหลังหน้าต่างเลื่อน ได้สิทธิ์ภายในเวลา', async () => {
    vi.stubEnv('AI_SUGGEST_RPS', '1')
    vi.stubEnv('AI_SUGGEST_RPM', '1000')
    const [a, b] = await mkRuns(`asa-shop-${run}-r`, 2, 'slide')
    expect(await reserveSlot(a!, `asa-shop-${run}-r`)).toBe(true)
    const t0 = Date.now()
    expect(await reserveSlot(b!, `asa-shop-${run}-r`)).toBe(true) // รอหน้าต่าง 1 วิเลื่อน
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900)
    expect(Date.now() - t0).toBeLessThan(5000)
  })
})
