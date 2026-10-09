import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const typhoon = vi.hoisted(() => vi.fn())
const gemini = vi.hoisted(() => vi.fn())
vi.mock('@/lib/typhoon', () => ({
  generateTyphoonReply: typhoon,
  isTyphoonConfigured: () => Boolean(process.env.TYPHOON_API_KEY),
}))
vi.mock('@/lib/gemini', () => ({ generateReplySuggestions: gemini }))

import { sanitizeForExternalAi } from '@/lib/ai-suggest-sanitize'
import { draftReplySuggestions, resolveSuggestProvider } from '@/lib/reply-suggest-provider'

describe('resolveSuggestProvider', () => {
  beforeEach(() => vi.stubEnv('TYPHOON_API_KEY', 'k'))
  afterEach(() => vi.unstubAllEnvs())

  it.each([
    ['', 's1', 'gemini'],
    [' , ,', 's1', 'gemini'],
    ['s1,s2', 's1', 'typhoon'],
    [' s1 ,, s2 ', 's2', 'typhoon'],
    ['s1,s2', 's3', 'gemini'],
    ['*', 'zzz', 'typhoon'],
  ])('list=%j shop=%s → %s', (list, shop, want) => {
    vi.stubEnv('TYPHOON_SUGGEST_SHOP_IDS', list)
    expect(resolveSuggestProvider(shop)).toBe(want)
  })

  it('เลือก typhoon แต่ไม่มีกุญแจ → none', () => {
    vi.stubEnv('TYPHOON_SUGGEST_SHOP_IDS', '*')
    vi.stubEnv('TYPHOON_API_KEY', '')
    expect(resolveSuggestProvider('s1')).toBe('none')
  })
})

describe('draftReplySuggestions', () => {
  const ctx = { shopName: 'x', vertical: 'ONLINE_SALES' }
  const turns = [{ role: 'BUYER' as const, text: 'hi' }]
  const media = [{ label: 'l', mimeType: 'image/png', dataBase64: 'AAA' }]
  beforeEach(() => {
    typhoon.mockReset()
    gemini.mockReset()
  })

  it('typhoon → [text] และไม่ส่ง media', async () => {
    typhoon.mockResolvedValue({ text: 'ตอบ', usage: null, model: 'm', latencyMs: 7 })
    const payload = sanitizeForExternalAi({ turns, shopName: 'x', knownCustomerNames: [], adminNames: [] }, 'typhoon')
    const r = await draftReplySuggestions('typhoon', payload)
    expect(r).toEqual({ suggestions: ['ตอบ'], usage: null, model: 'm', latencyMs: 7 })
    expect(typhoon).toHaveBeenCalledWith(payload)
    expect(media).toHaveLength(1)
    expect(gemini).not.toHaveBeenCalled()
  })

  it('H3: ส่ง turns ดิบเข้า typhoon ไม่ได้ (compile-time)', () => {
    const never = () => {
      // @ts-expect-error typhoon รับเฉพาะ SanitizedPayload
      void draftReplySuggestions('typhoon', turns, ctx)
    }
    expect(never).toBeTypeOf('function')
  })

  it('gemini → เรียกของเดิมพร้อม media', async () => {
    gemini.mockResolvedValue({ suggestions: ['a', 'b', 'c'], usage: { inputTokens: 1, outputTokens: 2, model: 'g' } })
    const r = await draftReplySuggestions('gemini', turns, ctx, media)
    expect(gemini).toHaveBeenCalledWith(turns, ctx, media)
    expect(r.suggestions).toEqual(['a', 'b', 'c'])
    expect(r.model).toBe('g')
    expect(typhoon).not.toHaveBeenCalled()
  })
})
