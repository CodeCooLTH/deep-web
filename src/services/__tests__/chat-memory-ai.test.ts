import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
const m = vi.hoisted(() => ({
  provider: vi.fn(() => 'typhoon'),
  eff: vi.fn(),
  switchOn: true,
  gen: vi.fn(),
  claim: vi.fn(),
  reserve: vi.fn(),
  count: vi.fn(),
  update: vi.fn(),
  findMsgs: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    chatMessage: { findFirst: vi.fn(), count: m.count, findMany: m.findMsgs },
    aiSuggestRun: { findFirst: vi.fn(async () => null), update: m.update },
    chatMemory: {},
  },
}))
vi.mock('@/lib/reply-suggest-provider', () => ({ resolveSuggestProvider: m.provider }))
vi.mock('@/lib/typhoon', async (orig) => ({ ...(await orig<typeof import('@/lib/typhoon')>()), generateTyphoonMemoryText: m.gen }))
vi.mock('@/services/ai-setting.service', () => ({
  getAiSetting: async () => ({}),
  getEffectiveAiSetting: () => ({ includeCustomerContext: m.switchOn }),
}))
vi.mock('@/services/ai-suggest-quota.service', () => ({ isOwnerPaidPlan: async () => true }))
vi.mock('@/services/chat-crm.service', () => ({ getConversationCrm: async () => null }))
vi.mock('@/services/ai-suggest-identity', () => ({ buildSuggestIdentity: async () => ({ knownCustomerNames: [], adminNames: [], knownLiterals: [] }) }))
vi.mock('@/services/chat-memory.service', () => ({ resolveEffectiveMemory: m.eff }))
vi.mock('@/services/ai-suggest-auto.service', () => ({ claimRun: m.claim, reserveSlot: m.reserve }))

import { TyphoonApiError, TyphoonNotConfiguredError, TyphoonRateLimitedError } from '@/lib/typhoon'
import { maybeUpdateMemory } from '../chat-memory-ai.service'

const P = { shopId: 's1', conversationId: 'c1', latestMessageId: 'm9' }

beforeEach(() => {
  vi.clearAllMocks()
  m.switchOn = true
  m.provider.mockReturnValue('typhoon')
  m.eff.mockResolvedValue({ row: null, shared: false, roomIds: ['c1'] })
  m.count.mockResolvedValue(5) // ห้องใหม่: total 5 / ลูกค้า 5
  m.claim.mockResolvedValue({ owned: true, runId: 'r1' })
  m.reserve.mockResolvedValue(true)
  m.update.mockResolvedValue({})
  m.findMsgs.mockResolvedValue([{ senderRole: 'BUYER', type: 'TEXT', body: 'สนใจสีดำครับ', productRefId: null, senderUserId: null }])
  m.gen.mockResolvedValue({ text: 'ลูกค้าสนใจสีดำ', usage: null, model: 'm', latencyMs: 1 })
})
const closed = () => m.update.mock.calls.at(-1)?.[0].data

describe('maybeUpdateMemory (mock)', () => {
  it('ร้านไม่ใช่ typhoon / สวิตช์ข้อมูลลูกค้าปิด / ห้องไม่ใช่ของร้าน → NOT_APPLICABLE ไม่ claim', async () => {
    m.provider.mockReturnValue('gemini')
    expect(await maybeUpdateMemory(P)).toEqual({ outcome: 'NOT_APPLICABLE' })
    m.provider.mockReturnValue('typhoon')
    m.switchOn = false
    expect(await maybeUpdateMemory(P)).toEqual({ outcome: 'NOT_APPLICABLE' })
    m.switchOn = true
    m.eff.mockResolvedValue(null)
    expect(await maybeUpdateMemory(P)).toEqual({ outcome: 'NOT_APPLICABLE' })
    expect(m.claim).not.toHaveBeenCalled()
  })

  it('error ของ Typhoon → outcome ตามตาราง (หัวข้อ 6) และปิดแถวเป็น NONE ไม่มี suggestion', async () => {
    const cases: [Error, string][] = [
      [new TyphoonRateLimitedError(), 'RATE_LIMITED'],
      [new TyphoonApiError('TIMEOUT'), 'TIMEOUT'],
      [new TyphoonApiError('HTTP', 500), 'ERROR'],
      [new TyphoonNotConfiguredError(), 'ERROR'],
    ]
    for (const [err, outcome] of cases) {
      m.gen.mockRejectedValueOnce(err)
      expect(await maybeUpdateMemory(P)).toEqual({ outcome })
      expect(closed()).toMatchObject({ status: 'NONE', outcome, suggestion: null })
    }
    expect(m.gen).toHaveBeenCalledTimes(cases.length) // ไม่ retry
  })

  it('คิวเต็ม → RATE_LIMITED ไม่เรียกโมเดล · lowPriority + deadline สั้น', async () => {
    m.reserve.mockResolvedValue(false)
    expect(await maybeUpdateMemory(P)).toEqual({ outcome: 'RATE_LIMITED' })
    expect(m.reserve).toHaveBeenCalledWith('r1', 's1', expect.objectContaining({ lowPriority: true, deadlineAt: expect.any(Number) }))
    expect(m.gen).not.toHaveBeenCalled()
  })

  it('claim แพ้ → busy ไม่เรียกโมเดล', async () => {
    m.claim.mockResolvedValue({ owned: false, state: { status: 'THINKING' } })
    expect(await maybeUpdateMemory(P)).toEqual({ outcome: 'NOT_APPLICABLE', busy: true })
    expect(m.gen).not.toHaveBeenCalled()
  })

  it('prisma ล่มก่อน claim → ERROR ไม่ throw และไม่ log เนื้อความ', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.eff.mockRejectedValue(new Error('secret ข้อความลูกค้า 0812345678'))
    expect(await maybeUpdateMemory(P)).toEqual({ outcome: 'ERROR' })
    expect(JSON.stringify(spy.mock.calls)).not.toContain('0812345678')
    spy.mockRestore()
  })
})
