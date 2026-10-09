/**
 * ai-suggest-auto.service.test.ts — unit (mock prisma) ของคำแนะนำคำตอบอัตโนมัติ Typhoon (00019-ext T4)
 * จุดที่เทสเฝ้า: ทุกเงื่อนไขข้ามต้อง "ไม่เรียกโมเดล" · ผลที่ออกไปต้องผ่าน restore/clamp/stale-check · ปิดแถว THINKING เสมอ
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  conversation: { findFirst: vi.fn() },
  chatMessage: { findFirst: vi.fn(), findMany: vi.fn() },
  aiSuggestRun: {
    createMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  autoReplyJob: { findFirst: vi.fn() },
  shop: { findUnique: vi.fn() },
  user: { findMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

const provider = vi.hoisted(() => ({ resolveSuggestProvider: vi.fn(), draftReplySuggestions: vi.fn() }))
vi.mock('@/lib/reply-suggest-provider', () => provider)
vi.mock('@/services/chat-crm.service', () => ({ getConversationCrm: vi.fn() }))
vi.mock('@/services/ai-setting.service', () => ({
  getAiSetting: vi.fn(),
  getEffectiveAiSetting: vi.fn((s: unknown) => s),
}))
vi.mock('@/services/ai-context.service', () => ({
  resolveProductCards: vi.fn(async () => new Map()),
  buildProductBlock: vi.fn(async () => ''),
  buildCustomerBlock: vi.fn(async () => ''),
  composeContextBlock: vi.fn(() => ''),
}))
vi.mock('@/services/ai-suggest-quota.service', () => ({ isOwnerPaidPlan: vi.fn() }))

import { getConversationCrm } from '@/services/chat-crm.service'
import { getAiSetting } from '@/services/ai-setting.service'
import { isOwnerPaidPlan } from '@/services/ai-suggest-quota.service'
import { TyphoonApiError, TyphoonNotConfiguredError, TyphoonRateLimitedError } from '@/lib/typhoon'
import { createPiiVault } from '@/lib/pii-redact'
import type { SanitizedPayload } from '@/lib/ai-suggest-sanitize'
import { draftReplySuggestions as realDraft } from '@/lib/reply-suggest-provider'
import {
  clampSuggestion,
  computePacingVerdict,
  getLatestAutoSuggest,
  requestAutoSuggest,
  reserveSlot,
  submitAutoSuggestFeedback,
} from '@/services/ai-suggest-auto.service'

const P = { shopId: 'shop-1', conversationId: 'conv-1', userId: 'u-1', userDisplayName: 'แอดมินเอ', anchorMessageId: 'm-1', manual: false, trigger: 'AUTO_NEW_MESSAGE' as const }
const RUN = 'run-1'

let anchorRole = 'BUYER'
let latestQueue: string[] = []
const lastUpdate = () => db.aiSuggestRun.update.mock.calls.filter((c) => c[0].data.finishedAt).at(-1)?.[0].data

function happy() {
  anchorRole = 'BUYER'
  latestQueue = ['m-1', 'm-1']
  db.conversation.findFirst.mockResolvedValue({ isSpam: false, buyerUserId: null, externalContactId: null })
  db.chatMessage.findFirst.mockImplementation(async (a: { where: { id?: string } }) =>
    a.where.id ? { senderRole: anchorRole } : { id: latestQueue.length > 1 ? latestQueue.shift() : latestQueue[0], senderRole: 'BUYER' },
  )
  db.chatMessage.findMany.mockResolvedValue([
    { senderRole: 'BUYER', type: 'TEXT', body: 'ขอเบอร์ 0812345678 หน่อยครับ', productRefId: null, senderUserId: null },
  ])
  db.aiSuggestRun.findFirst.mockResolvedValue(null)
  db.aiSuggestRun.createMany.mockResolvedValue({ count: 1 })
  db.aiSuggestRun.update.mockResolvedValue({})
  db.aiSuggestRun.findMany.mockResolvedValue([])
  db.$queryRaw.mockImplementation(async () => [{ firedAt: new Date() }])
  db.autoReplyJob.findFirst.mockResolvedValue(null)
  db.shop.findUnique.mockResolvedValue({ shopName: 'ร้านทดสอบ', vertical: 'ONLINE_SALES' })
  db.user.findMany.mockResolvedValue([])
  vi.mocked(getConversationCrm).mockResolvedValue({ alias: 'ฟ้า', realName: 'สมชาย ใจดี', phones: [], address: null } as never)
  vi.mocked(getAiSetting).mockResolvedValue({ instruction: '', includeProductContext: false, includeCustomerContext: false, includeMediaContext: false, updatedAt: null })
  vi.mocked(isOwnerPaidPlan).mockResolvedValue(false)
  provider.resolveSuggestProvider.mockReturnValue('typhoon')
  provider.draftReplySuggestions.mockResolvedValue({ suggestions: ['ได้เลยครับ'], usage: { inputTokens: 10, outputTokens: 5, model: 'm' }, model: 'm', latencyMs: 120 })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  happy()
})

describe('requestAutoSuggest — happy path', () => {
  it('READY: ส่ง payload ที่ปิดบังแล้วเท่านั้น + restore ป้ายกลับ + บันทึก token/latency', async () => {
    provider.draftReplySuggestions.mockImplementation(async (_p: string, payload: SanitizedPayload) => {
      const raw = JSON.stringify(payload.turns) + payload.shopName
      expect(raw).not.toContain('0812345678')
      expect(raw).toMatch(/\[เบอร์โทร#1\]/)
      return { suggestions: ['เบอร์ [เบอร์โทร#1] ใช่ไหมครับ'], usage: { inputTokens: 10, outputTokens: 5, model: 'm' }, model: 'm', latencyMs: 120 }
    })
    const r = await requestAutoSuggest(P)
    expect(r).toEqual({ status: 'READY', anchorMessageId: 'm-1', attempt: 1, suggestion: 'เบอร์ 0812345678 ใช่ไหมครับ', feedback: null })
    expect(lastUpdate()).toMatchObject({ status: 'READY', outcome: 'OK', provider: 'typhoon', model: 'm', latencyMs: 120, inputTokens: 10, outputTokens: 5 })
    expect(db.aiSuggestRun.createMany.mock.calls[0]![0].skipDuplicates).toBe(true)
  })

  it('manual: attempt = สูงสุดของ anchor + 1', async () => {
    db.aiSuggestRun.findFirst.mockResolvedValue({ attempt: 2 })
    const r = await requestAutoSuggest({ ...P, manual: true, trigger: 'MANUAL' })
    expect(r).toMatchObject({ status: 'READY', attempt: 3 })
  })
})

describe('requestAutoSuggest — เงื่อนไขข้าม (ห้ามเรียกโมเดล)', () => {
  const cases: [string, () => void, string, string][] = [
    ['anchor ไม่ใช่ BUYER', () => { anchorRole = 'SHOP' }, 'SKIPPED_NOT_BUYER', 'SKIPPED_NOT_BUYER'],
    ['anchor ไม่ใช่ข้อความล่าสุด', () => { latestQueue = ['m-2'] }, 'SKIPPED_NOT_BUYER', 'STALE_ANCHOR'],
    ['ห้องสแปม', () => db.conversation.findFirst.mockResolvedValue({ isSpam: true, buyerUserId: null, externalContactId: null }), 'SKIPPED_SPAM', 'SKIPPED_SPAM'],
    ['บอทกำลังตอบ', () => db.autoReplyJob.findFirst.mockResolvedValue({ id: 'j' }), 'SKIPPED_BOT', 'SKIPPED_BOT'],
    ['ร้านใช้ gemini', () => provider.resolveSuggestProvider.mockReturnValue('gemini'), 'SKIPPED_NOT_ALLOWED', 'NOT_ENABLED'],
    ['ร้านอยู่ใน allow-list แต่ไม่มีกุญแจ', () => provider.resolveSuggestProvider.mockReturnValue('none'), 'SKIPPED_NOT_ALLOWED', 'NOT_CONFIGURED'],
    ['turns ว่าง', () => db.chatMessage.findMany.mockResolvedValue([]), 'SKIPPED_EMPTY', 'SKIPPED_EMPTY'],
  ]
  it.each(cases)('%s', async (_n, setup, outcome, reason) => {
    setup()
    const r = await requestAutoSuggest(P)
    expect(r).toMatchObject({ status: 'NONE', reason })
    expect(lastUpdate()).toMatchObject({ status: 'NONE', outcome })
    expect(provider.draftReplySuggestions).not.toHaveBeenCalled()
  })

  it('บอท: query ใช้เฉพาะ PENDING/PROCESSING ที่อายุ ≤5 นาที', async () => {
    await requestAutoSuggest(P)
    const w = db.autoReplyJob.findFirst.mock.calls[0]![0].where
    expect(w.chatMessageId).toBe('m-1')
    expect(w.status.in).toEqual(['PENDING', 'PROCESSING'])
    expect(Date.now() - w.updatedAt.gt.getTime()).toBeGreaterThan(299_000)
    expect(Date.now() - w.updatedAt.gt.getTime()).toBeLessThan(301_000)
  })

  it('INVALID_ANCHOR: anchor/ห้องไม่ใช่ของร้าน → ไม่ claim', async () => {
    db.conversation.findFirst.mockResolvedValue(null)
    expect(await requestAutoSuggest(P)).toEqual({ status: 'INVALID_ANCHOR' })
    expect(db.aiSuggestRun.createMany).not.toHaveBeenCalled()
  })
})

describe('requestAutoSuggest — error → outcome', () => {
  it.each([
    ['429', new TyphoonRateLimitedError(), 'RATE_LIMITED', 'RATE_LIMITED'],
    ['timeout', new TyphoonApiError('TIMEOUT'), 'TIMEOUT', 'TIMEOUT'],
    ['http', new TyphoonApiError('HTTP', 500), 'ERROR', 'ERROR'],
    ['ไม่มีกุญแจ', new TyphoonNotConfiguredError(), 'SKIPPED_NOT_ALLOWED', 'NOT_CONFIGURED'],
  ])('%s', async (_n, err, outcome, reason) => {
    provider.draftReplySuggestions.mockRejectedValue(err)
    const r = await requestAutoSuggest(P)
    expect(r).toMatchObject({ status: 'NONE', reason })
    expect(lastUpdate()).toMatchObject({ status: 'NONE', outcome })
    expect(provider.draftReplySuggestions).toHaveBeenCalledTimes(1) // ไม่ retry
  })

  it('ป้ายที่ restore ไม่ได้ → UNRESOLVED_TOKEN ไม่แสดงผล', async () => {
    provider.draftReplySuggestions.mockResolvedValue({ suggestions: ['โทร [เบอร์โทร#9] นะ'], usage: null, model: 'm', latencyMs: 1 })
    const r = await requestAutoSuggest(P)
    expect(r).toMatchObject({ status: 'NONE', reason: 'UNRESOLVED_TOKEN' })
    expect(lastUpdate().suggestion).toBeUndefined()
  })

  it('ตอบ 6 ประโยค → เก็บ 3', async () => {
    provider.draftReplySuggestions.mockResolvedValue({ suggestions: ['หนึ่ง. สอง. สาม. สี่. ห้า. หก.'], usage: null, model: 'm', latencyMs: 1 })
    const r = await requestAutoSuggest(P)
    expect(r).toMatchObject({ status: 'READY', suggestion: 'หนึ่ง. สอง. สาม.' })
  })

  it('ระหว่างรอมีข้อความใหม่ → STALE_ANCHOR (บันทึก OK แต่ไม่แสดง)', async () => {
    latestQueue = ['m-1', 'm-2']
    const r = await requestAutoSuggest(P)
    expect(r).toMatchObject({ status: 'NONE', reason: 'STALE_ANCHOR' })
    expect(lastUpdate()).toMatchObject({ status: 'NONE', outcome: 'OK' })
    expect(lastUpdate().suggestion).toBeUndefined()
  })

  it('throw ที่ไม่คาดคิด → ปิดแถวเป็น NONE+ERROR ไม่ค้าง THINKING', async () => {
    db.shop.findUnique.mockRejectedValue(new Error('db down'))
    const r = await requestAutoSuggest(P)
    expect(r).toMatchObject({ status: 'NONE', reason: 'ERROR' })
    expect(lastUpdate()).toMatchObject({ status: 'NONE', outcome: 'ERROR' })
    expect(provider.draftReplySuggestions).not.toHaveBeenCalled()
  })

  it('isOwnerPaidPlan ล้ม = non-paid ไม่ fail คำขอ', async () => {
    vi.mocked(isOwnerPaidPlan).mockRejectedValue(new Error('x'))
    expect(await requestAutoSuggest(P)).toMatchObject({ status: 'READY' })
  })
})

describe('claim', () => {
  const key = { status: 'THINKING', anchorMessageId: 'm-1', attempt: 1, outcome: null, suggestion: null, feedback: null }
  beforeEach(() => db.aiSuggestRun.createMany.mockResolvedValue({ count: 0 }))

  it('ชนกับ THINKING สด → THINKING ไม่เรียกโมเดล', async () => {
    db.aiSuggestRun.findUnique.mockResolvedValue({ ...key, id: RUN, createdAt: new Date() })
    expect(await requestAutoSuggest(P)).toEqual({ status: 'THINKING', anchorMessageId: 'm-1', attempt: 1 })
    expect(provider.draftReplySuggestions).not.toHaveBeenCalled()
  })

  it('ชนกับ READY → คืนผลเดิม', async () => {
    db.aiSuggestRun.findUnique.mockResolvedValue({ ...key, id: RUN, status: 'READY', suggestion: 'เดิม', feedback: 'UP', createdAt: new Date() })
    expect(await requestAutoSuggest(P)).toMatchObject({ status: 'READY', suggestion: 'เดิม', feedback: 'UP' })
  })

  it('THINKING ค้าง >30 วิ → ยึดต่อได้ (เงื่อนไขอยู่ใน WHERE) แล้วทำงานต่อ', async () => {
    db.aiSuggestRun.findUnique.mockResolvedValue({ ...key, id: RUN, createdAt: new Date(Date.now() - 31_000) })
    db.aiSuggestRun.updateMany.mockResolvedValue({ count: 1 })
    expect(await requestAutoSuggest(P)).toMatchObject({ status: 'READY' })
    const w = db.aiSuggestRun.updateMany.mock.calls[0]![0].where
    expect(w).toMatchObject({ id: RUN, status: 'THINKING' })
    expect(w.createdAt.lt).toBeInstanceOf(Date)
  })

  it('THINKING ค้าง แต่แพ้การยึด → THINKING', async () => {
    db.aiSuggestRun.findUnique.mockResolvedValue({ ...key, id: RUN, createdAt: new Date(Date.now() - 31_000) })
    db.aiSuggestRun.updateMany.mockResolvedValue({ count: 0 })
    expect(await requestAutoSuggest(P)).toMatchObject({ status: 'THINKING' })
    expect(provider.draftReplySuggestions).not.toHaveBeenCalled()
  })

  it('ชนกับ NONE → NONE ตาม outcome เดิม', async () => {
    db.aiSuggestRun.findUnique.mockResolvedValue({ ...key, id: RUN, status: 'NONE', outcome: 'TIMEOUT', createdAt: new Date() })
    expect(await requestAutoSuggest(P)).toMatchObject({ status: 'NONE', reason: 'TIMEOUT' })
  })
})

describe('pacing', () => {
  const t = new Date('2026-01-01T00:00:10.000Z')
  const row = (id: string, ms: number, shopId = 's') => ({ id, shopId, firedAt: new Date(t.getTime() + ms) })
  const me = { id: 'm', shopId: 's', firedAt: t }

  it('RPS: มี 3 อันหน้าในรอบ 1 วิ → ไม่ผ่าน · อันที่เกิน 1 วิ ไม่นับ', () => {
    const lim = { rps: 3, rpm: 100 }
    expect(computePacingVerdict([row('a', -10), row('b', -20), row('c', -30)], me, lim)).toBe(false)
    expect(computePacingVerdict([row('a', -10), row('b', -20), row('c', -1500)], me, lim)).toBe(true)
  })
  it('เสมอเวลา → เทียบ id · อันที่อยู่หลังเราไม่นับ', () => {
    const lim = { rps: 1, rpm: 100 }
    expect(computePacingVerdict([row('a', 0)], me, lim)).toBe(false) // 'a' < 'm'
    expect(computePacingVerdict([row('z', 0), row('y', 5)], me, lim)).toBe(true)
  })
  it('ต่อร้านไม่เกินครึ่งของ RPM', () => {
    const rows = [row('a', -100, 's'), row('b', -200, 's'), row('c', -300, 'other')]
    expect(computePacingVerdict(rows, me, { rps: 99, rpm: 4 })).toBe(false) // ร้านเรามี 2 อยู่หน้า = เต็ม (floor(4/2)=2)
    expect(computePacingVerdict(rows, me, { rps: 99, rpm: 6 })).toBe(true)
  })
  it('RPM รวม', () => {
    expect(computePacingVerdict([row('a', -100, 'x'), row('b', -200, 'y')], me, { rps: 99, rpm: 2 })).toBe(false)
  })
  it('reserveSlot หมดเวลา → false และล้าง firedAt', async () => {
    db.aiSuggestRun.update.mockResolvedValue({})
    db.aiSuggestRun.findMany.mockResolvedValue([{ id: 'a', shopId: 'x', firedAt: new Date(Date.now() - 10) }])
    vi.stubEnv('AI_SUGGEST_RPS', '1')
    expect(await reserveSlot(RUN, 's', { deadlineAt: Date.now() })).toBe(false)
    expect(db.aiSuggestRun.update.mock.calls.at(-1)![0].data).toEqual({ firedAt: null })
    vi.unstubAllEnvs()
  })
  it('requestAutoSuggest: pacing เต็ม → RATE_LIMITED ไม่เรียกโมเดล', async () => {
    vi.stubEnv('AI_SUGGEST_RPS', '1')
    // อันหน้า 1 อัน ตลอด — firedAt ตามเวลาปัจจุบัน
    db.aiSuggestRun.findMany.mockImplementation(async () => [{ id: '0', shopId: 'x', firedAt: new Date(Date.now() - 1) }])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const pr = requestAutoSuggest(P)
      await vi.advanceTimersByTimeAsync(6000)
      expect(await pr).toMatchObject({ status: 'NONE', reason: 'RATE_LIMITED' })
    } finally {
      vi.useRealTimers()
      vi.unstubAllEnvs()
    }
    expect(provider.draftReplySuggestions).not.toHaveBeenCalled()
    expect(lastUpdate()).toMatchObject({ outcome: 'RATE_LIMITED' })
  })
})

describe('getLatestAutoSuggest', () => {
  const run = (o: object) => ({ id: RUN, anchorMessageId: 'm-1', attempt: 2, status: 'READY', outcome: 'OK', suggestion: 'ข้อความ', feedback: null, createdAt: new Date(), ...o })
  it('attempt สูงสุดของ anchor ล่าสุด + provider', async () => {
    db.aiSuggestRun.findFirst.mockResolvedValue(run({}))
    const r = await getLatestAutoSuggest('shop-1', 'conv-1')
    expect(r).toMatchObject({ status: 'READY', attempt: 2, provider: 'typhoon' })
    expect(db.aiSuggestRun.findFirst.mock.calls[0]![0]).toMatchObject({ where: { shopId: 'shop-1', anchorMessageId: 'm-1' }, orderBy: { attempt: 'desc' } })
  })
  it('ไม่มีแถว → NO_RUN พร้อม anchor', async () => {
    db.aiSuggestRun.findFirst.mockResolvedValue(null)
    expect(await getLatestAutoSuggest('shop-1', 'conv-1')).toMatchObject({ status: 'NONE', reason: 'NO_RUN', anchorMessageId: 'm-1' })
  })
  it('ข้อความล่าสุดไม่ใช่ BUYER → STALE_ANCHOR ไม่แตะตารางผล', async () => {
    db.chatMessage.findFirst.mockResolvedValue({ id: 'm-9', senderRole: 'SHOP' })
    expect(await getLatestAutoSuggest('shop-1', 'conv-1')).toMatchObject({ reason: 'STALE_ANCHOR', anchorMessageId: null })
    expect(db.aiSuggestRun.findFirst).not.toHaveBeenCalled()
  })
  it('provider ไม่ใช่ typhoon → NOT_ENABLED / NOT_CONFIGURED', async () => {
    provider.resolveSuggestProvider.mockReturnValue('gemini')
    expect(await getLatestAutoSuggest('s', 'c')).toMatchObject({ reason: 'NOT_ENABLED', provider: 'gemini' })
    provider.resolveSuggestProvider.mockReturnValue('none')
    expect(await getLatestAutoSuggest('s', 'c')).toMatchObject({ reason: 'NOT_CONFIGURED', provider: 'none' })
  })
  it('แถว NONE+OK (ถูกทิ้งเพราะ stale) → STALE_ANCHOR', async () => {
    db.aiSuggestRun.findFirst.mockResolvedValue(run({ status: 'NONE', suggestion: null }))
    expect(await getLatestAutoSuggest('s', 'c')).toMatchObject({ status: 'NONE', reason: 'STALE_ANCHOR' })
  })
})

describe('submitAutoSuggestFeedback', () => {
  const body = { shopId: 'shop-1', conversationId: 'conv-1', anchorMessageId: 'm-1', attempt: 1, feedback: 'DOWN' as const }
  it('ผูก shopId + status READY ใน WHERE · note ผ่าน redactPii', async () => {
    db.aiSuggestRun.updateMany.mockResolvedValue({ count: 1 })
    expect(await submitAutoSuggestFeedback({ ...body, reason: 'BAD_TONE', note: 'โทรมาที่ 0812345678' })).toEqual({ ok: true })
    const a = db.aiSuggestRun.updateMany.mock.calls[0]![0]
    expect(a.where).toEqual({ conversationId: 'conv-1', shopId: 'shop-1', anchorMessageId: 'm-1', attempt: 1, status: 'READY' })
    expect(a.data.feedbackNote).not.toContain('0812345678')
    expect(a.data.feedbackAt).toBeInstanceOf(Date)
  })
  it('ร้านอื่น/ไม่ใช่ READY → ok:false', async () => {
    db.aiSuggestRun.updateMany.mockResolvedValue({ count: 0 })
    expect(await submitAutoSuggestFeedback({ ...body, shopId: 'other' })).toEqual({ ok: false })
  })
})

describe('clampSuggestion', () => {
  it('3 ประโยค', () => expect(clampSuggestion('a. b! c? d. e.')).toBe('a. b! c?'))
  it('แบ่งด้วยขึ้นบรรทัด/ช่องว่างคู่', () => expect(clampSuggestion('ก\nข  ค  ง')).toBe('ก ข ค'))
  it('เกิน 400 ตัดที่ช่องว่างสุดท้าย', () => {
    const out = clampSuggestion(('คำ ').repeat(300).trim().replace(/ /g, ' '), { maxSentences: 9 })
    expect(out.length).toBeLessThanOrEqual(400)
    expect(out.endsWith('คำ')).toBe(true)
  })
  it('ไม่มีช่องว่าง → ตัดที่เพดาน', () => expect(clampSuggestion('ก'.repeat(500)).length).toBe(400))
})

describe('branded payload (compile-time)', () => {
  it('ส่ง payload ดิบเข้า typhoon ไม่ได้', () => {
    const raw = { vertical: 'ONLINE_SALES', turns: [], shopName: '', instruction: '', contextBlock: '', customerName: null, customerNote: null, vault: createPiiVault(), foundKinds: [] }
    const never = () => {
      // @ts-expect-error ต้องผ่าน sanitizeForExternalAi เท่านั้น (brand)
      return realDraft('typhoon', raw)
    }
    expect(typeof never).toBe('function')
  })
})
