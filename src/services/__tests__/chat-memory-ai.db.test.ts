/**
 * chat-memory-ai.db.test.ts — ผู้เขียนความจำ AI บน Postgres จริง (00019-ext-mem T7, AC-MEM-05/06/07/09/10)
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · Typhoon mock ทั้งหมด · ลบเฉพาะ id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))
const m = vi.hoisted(() => ({ provider: vi.fn(() => 'typhoon'), gen: vi.fn() }))
vi.mock('@/lib/reply-suggest-provider', () => ({ resolveSuggestProvider: m.provider }))
vi.mock('@/lib/typhoon', async (orig) => ({ ...(await orig<typeof import('@/lib/typhoon')>()), generateTyphoonMemoryText: m.gen }))
vi.mock('@/services/ai-setting.service', () => ({
  getAiSetting: async () => ({}),
  getEffectiveAiSetting: () => ({ includeCustomerContext: true, includeProductContext: true }),
}))
vi.mock('@/services/ai-suggest-quota.service', () => ({ isOwnerPaidPlan: async () => true }))
vi.mock('@/services/chat-crm.service', () => ({ getConversationCrm: async () => null }))
vi.mock('@/services/chat-interested-product.service', () => ({ listInterestedProducts: vi.fn() }))

import { TyphoonApiError, TyphoonRateLimitedError } from '@/lib/typhoon'
import { maybeUpdateMemory } from '@/services/chat-memory-ai.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const prisma = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const ids = { user: '', shop: '', convs: [] as string[] }

const OK_TEXT = 'ลูกค้าชอบสีดำ ไซส์ L สนใจรุ่นใหม่ ผ่อนได้'
const gen = (text: string) => ({ text, usage: { inputTokens: 10, outputTokens: 5 }, model: 'm', latencyMs: 5 })

/** ห้องใหม่ + (ถ้ามี) แถวความจำ + n ข้อความหลังแถว (BUYER/SHOP สลับ) → คืน id ข้อความล่าสุด */
async function mkRoom(o: { n: number; mem?: { text: string; version?: number; aiUpdatedAt?: Date } }) {
  const c = await prisma.conversation.create({ data: { shopId: ids.shop } as never, select: { id: true } })
  ids.convs.push(c.id)
  const mem = o.mem
    ? await prisma.chatMemory.create({
        data: { shopId: ids.shop, conversationId: c.id, text: o.mem.text, source: 'ADMIN', version: o.mem.version ?? 1, aiUpdatedAt: o.mem.aiUpdatedAt ?? null },
      })
    : null
  const t0 = (mem?.updatedAt ?? new Date()).getTime()
  let last = ''
  for (let i = 0; i < o.n; i++) {
    const msg = await prisma.chatMessage.create({
      data: {
        conversationId: c.id, senderRole: i % 2 === 0 ? 'BUYER' : 'SHOP', type: 'TEXT', body: `ข้อความที่ ${i + 1} ครับ`,
        createdAt: new Date(t0 + (i + 1) * 1000),
      },
      select: { id: true },
    })
    last = msg.id
  }
  return { conv: c.id, last }
}
const call = (r: { conv: string; last: string }, force = false) =>
  maybeUpdateMemory({ shopId: ids.shop, conversationId: r.conv, latestMessageId: r.last, force })
const runs = (conv: string) => prisma.aiSuggestRun.findMany({ where: { conversationId: conv }, orderBy: { createdAt: 'asc' } })
const memOf = (conv: string) => prisma.chatMemory.findFirst({ where: { conversationId: conv } })

describe.skipIf(!isLocal)('chat-memory-ai (DB จริง)', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `cma-${run}`, username: `cma_${run}` }, select: { id: true } })
    const s = await prisma.shop.create({ data: { userId: u.id, shopName: `cma-${run}`, kind: 'BUSINESS' } as never, select: { id: true } })
    ids.user = u.id; ids.shop = s.id
  })
  beforeEach(() => {
    m.provider.mockReturnValue('typhoon')
    m.gen.mockReset()
    m.gen.mockResolvedValue(gen(OK_TEXT))
  })
  afterAll(async () => {
    await prisma.aiSuggestRun.deleteMany({ where: { conversationId: { in: ids.convs } } })
    await prisma.chatMessage.deleteMany({ where: { conversationId: { in: ids.convs } } })
    await prisma.chatMemory.deleteMany({ where: { conversationId: { in: ids.convs } } })
    await prisma.conversation.deleteMany({ where: { id: { in: ids.convs } } })
    await prisma.shop.deleteMany({ where: { id: ids.shop } })
    await prisma.user.deleteMany({ where: { id: ids.user } })
    await prisma.$disconnect()
  })

  it('ห้องใหม่ 4 ข้อความ (ลูกค้า 2) → สร้างแถว AI v1 + แถว run READY/OK ไม่มี suggestion', async () => {
    const r = await mkRoom({ n: 4 })
    expect(await call(r)).toEqual({ outcome: 'OK' })
    expect(await memOf(r.conv)).toMatchObject({ text: OK_TEXT, source: 'AI', version: 1, basedOnMessageId: r.last })
    const rows = await runs(r.conv)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      trigger: 'MEMORY_UPDATE', anchorMessageId: `mem:${r.last}`, provider: 'typhoon', status: 'READY', outcome: 'OK', suggestion: null, attempt: 1,
    })
    expect(rows[0]!.firedAt).toBeInstanceOf(Date)
  })

  it('AC-MEM-05 ผลโมเดลมี PII → REJECTED_PII · แถวความจำไม่เปลี่ยน (หลายรูปแบบ)', async () => {
    const r = await mkRoom({ n: 4, mem: { text: 'ลูกค้าชอบสีดำ' } })
    const before = await memOf(r.conv)
    const corpus = [
      'ลูกค้าชอบสีดำ โทร 0812345678', 'ลูกค้าชอบสีดำ 081.234.5678', 'ลูกค้าชอบสีดำ mail a@b.com',
      'ลูกค้าชอบสีดำ บัตร 1-2345-6789-0-12', 'ลูกค้าชอบสีดำ ส่งที่ 99/9 ซอยสุขุมวิท 5', 'ลูกค้าชอบสีดำ [เบอร์โทร#1]', 'ลูกค้าชอบสีดำ [ข้อมูลลูกค้า]',
    ]
    for (const text of corpus) {
      m.gen.mockResolvedValueOnce(gen(text))
      expect(await call(r, true), text).toEqual({ outcome: 'REJECTED_PII' })
    }
    expect(await memOf(r.conv)).toEqual(before)
    const rows = await runs(r.conv)
    expect(rows).toHaveLength(corpus.length)
    expect(rows.every((x) => x.status === 'NONE' && x.outcome === 'REJECTED_PII' && x.suggestion === null)).toBe(true)
  })

  it('AC-MEM-06 แอดมินแก้เป็น v4 แล้ว AI อัปเดต → ข้อความที่ส่ง provider คือ v4 ตรงตัว · ได้ v5 + previousText', async () => {
    const v4 = 'v4 แอดมินเขียน: ลูกค้าชอบสีดำ'
    const r = await mkRoom({ n: 4, mem: { text: v4, version: 4 } })
    expect(await call(r)).toEqual({ outcome: 'OK' })
    expect(m.gen.mock.calls[0]![0].memory.text).toBe(v4)
    expect(await memOf(r.conv)).toMatchObject({ text: OK_TEXT, source: 'AI', version: 5, previousText: v4, basedOnMessageId: r.last })
  })

  it('AC-MEM-07 AI ถือ v3 ขณะแอดมินบันทึก v4 → SUPERSEDED · ข้อความแอดมินอยู่ครบ', async () => {
    const r = await mkRoom({ n: 4, mem: { text: 'v3 เดิม', version: 3 } })
    m.gen.mockImplementationOnce(async () => {
      await prisma.chatMemory.updateMany({ where: { conversationId: r.conv }, data: { text: 'v4 แอดมิน', version: 4 } })
      return gen(OK_TEXT)
    })
    expect(await call(r)).toEqual({ outcome: 'SUPERSEDED' })
    expect(await memOf(r.conv)).toMatchObject({ text: 'v4 แอดมิน', version: 4, source: 'ADMIN' })
    expect((await runs(r.conv))[0]).toMatchObject({ status: 'NONE', outcome: 'SUPERSEDED' })
  })

  it('ผลสั้นเกินครึ่งของฐาน (ฐาน ≥100) → REJECTED_SHRINK', async () => {
    const r = await mkRoom({ n: 4, mem: { text: 'ลูกค้าชอบสีดำและสนใจรุ่นใหม่ '.repeat(8) } })
    m.gen.mockResolvedValueOnce(gen('ชอบดำ'))
    expect(await call(r)).toEqual({ outcome: 'REJECTED_SHRINK' })
    expect((await memOf(r.conv))!.version).toBe(1)
  })

  it('AC-MEM-09 ข้อความใหม่ 2 → ไม่มีแถว · 3 → 1 แถว', async () => {
    const two = await mkRoom({ n: 2, mem: { text: 'ลูกค้าชอบสีดำ' } })
    expect(await call(two)).toEqual({ outcome: 'SKIPPED_FEW_MESSAGES' })
    expect(await runs(two.conv)).toHaveLength(0)
    expect(m.gen).not.toHaveBeenCalled()
    const three = await mkRoom({ n: 3, mem: { text: 'ลูกค้าชอบสีดำ' } })
    expect(await call(three)).toEqual({ outcome: 'OK' })
    expect(await runs(three.conv)).toHaveLength(1)
  })

  it('AC-MEM-09 cooldown 120 วิ: aiUpdatedAt เพิ่งอัปเดต / เพิ่งมีแถว run (แม้ถูกปฏิเสธ) → ไม่เรียก ไม่เพิ่มแถว', async () => {
    const a = await mkRoom({ n: 4, mem: { text: 'ลูกค้าชอบสีดำ', aiUpdatedAt: new Date() } })
    expect(await call(a)).toEqual({ outcome: 'SKIPPED_COOLDOWN' })
    expect(await runs(a.conv)).toHaveLength(0)
    const b = await mkRoom({ n: 4, mem: { text: 'ลูกค้าชอบสีดำ' } })
    m.gen.mockResolvedValueOnce(gen('โทร 0812345678'))
    expect(await call(b)).toEqual({ outcome: 'REJECTED_PII' })
    expect(await call(b)).toEqual({ outcome: 'SKIPPED_COOLDOWN' }) // P-3
    expect(await runs(b.conv)).toHaveLength(1)
    expect(m.gen).toHaveBeenCalledTimes(1)
  })

  it('AC-MEM-10 2 คำขอพร้อมกัน → เรียก Typhoon 1 ครั้ง · 1 แถว', async () => {
    const r = await mkRoom({ n: 4 })
    m.gen.mockImplementation(async () => {
      await new Promise((x) => setTimeout(x, 200))
      return gen(OK_TEXT)
    })
    const [a, b] = await Promise.all([call(r), call(r)])
    expect(m.gen).toHaveBeenCalledTimes(1)
    // ตัวแพ้: claim แพ้ (busy) หรือเห็นแถวของผู้ชนะแล้วติด cooldown — ทั้งสองทางต้องไม่เรียกโมเดลซ้ำ
    expect([a, b].filter((x) => x.outcome === 'OK')).toHaveLength(1)
    expect(await runs(r.conv)).toHaveLength(1)
  })

  it('ฐานมีเบอร์ → SKIPPED_BASE_HAS_PII ไม่เรียก provider (มีแถว run)', async () => {
    const r = await mkRoom({ n: 4, mem: { text: 'โทร 0812345678 ชอบสีดำ' } })
    expect(await call(r)).toEqual({ outcome: 'SKIPPED_BASE_HAS_PII' })
    expect(m.gen).not.toHaveBeenCalled()
    expect((await runs(r.conv))[0]).toMatchObject({ status: 'NONE', outcome: 'SKIPPED_BASE_HAS_PII' })
  })

  it('ร้าน Gemini → NOT_APPLICABLE ไม่มีแถว', async () => {
    m.provider.mockReturnValue('gemini')
    const r = await mkRoom({ n: 4 })
    expect(await call(r)).toEqual({ outcome: 'NOT_APPLICABLE' })
    expect(await runs(r.conv)).toHaveLength(0)
    expect(m.gen).not.toHaveBeenCalled()
  })

  it('429 → RATE_LIMITED ไม่ retry · timeout → TIMEOUT · อื่น → ERROR (ไม่ throw)', async () => {
    const r = await mkRoom({ n: 4 })
    m.gen.mockRejectedValueOnce(new TyphoonRateLimitedError())
    expect(await call(r)).toEqual({ outcome: 'RATE_LIMITED' })
    expect(m.gen).toHaveBeenCalledTimes(1)
    m.gen.mockRejectedValueOnce(new TyphoonApiError('TIMEOUT'))
    expect(await call(r, true)).toEqual({ outcome: 'TIMEOUT' })
    m.gen.mockRejectedValueOnce(new Error('boom'))
    expect(await call(r, true)).toEqual({ outcome: 'ERROR' })
    expect((await runs(r.conv)).map((x) => [x.attempt, x.outcome])).toEqual([[1, 'RATE_LIMITED'], [2, 'TIMEOUT'], [3, 'ERROR']])
  })
})
