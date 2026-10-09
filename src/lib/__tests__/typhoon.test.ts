import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sanitizeForExternalAi } from '@/lib/ai-suggest-sanitize'
import { buildTyphoonSystemPrompt, SAFETY_RULE_LINES } from '@/lib/reply-suggest-prompt'
import {
  generateTyphoonReply,
  isTyphoonConfigured,
  TYPHOON_ENDPOINT,
  TyphoonApiError,
  TyphoonNotConfiguredError,
  TyphoonRateLimitedError,
} from '@/lib/typhoon'

const KEY = 'sk-test-secret-123'
const ctx = { shopName: 'ร้านทดสอบ', vertical: 'ONLINE_SALES' }
const turns = [{ role: 'BUYER' as const, text: 'สนใจครับ' }]
const payload = sanitizeForExternalAi({ turns, shopName: ctx.shopName, knownCustomerNames: [], adminNames: [] }, 'typhoon')
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const good = { choices: [{ message: { content: ' สวัสดีครับ ' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }

describe('generateTyphoonReply', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('TYPHOON_API_KEY', KEY)
    vi.stubEnv('TYPHOON_MODEL', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('ส่ง URL/header/body ถูกและคืน text+usage', async () => {
    fetchMock.mockResolvedValue(ok(good))
    const r = await generateTyphoonReply(payload)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(TYPHOON_ENDPOINT)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`)
    const body = JSON.parse(init.body)
    expect(body.model).toBe('typhoon-v2.5-30b-a3b-instruct')
    expect(body.temperature).toBe(0.3)
    expect(body.max_tokens).toBe(300)
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user'])
    expect(r.text).toBe('สวัสดีครับ')
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 5, model: r.model })
  })

  it('429 → RateLimited และ fetch 1 ครั้ง', async () => {
    fetchMock.mockResolvedValue(ok({ error: 'x' }, 429))
    await expect(generateTyphoonReply(payload)).rejects.toBeInstanceOf(TyphoonRateLimitedError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('เนื้อหาว่าง → EMPTY', async () => {
    fetchMock.mockResolvedValue(ok({ choices: [{ message: { content: '  ' } }] }))
    await expect(generateTyphoonReply(payload)).rejects.toMatchObject({ kind: 'EMPTY' })
  })

  it('HTTP 500 → kind HTTP + status และ message ไม่มี body/key', async () => {
    fetchMock.mockResolvedValue(new Response(`secret body ${KEY}`, { status: 500 }))
    const e = await generateTyphoonReply(payload).catch((x) => x)
    expect(e).toBeInstanceOf(TyphoonApiError)
    expect(e).toMatchObject({ kind: 'HTTP', status: 500 })
    expect(e.message).not.toContain(KEY)
    expect(e.message).not.toContain('secret body')
  })

  it('fetch throw → NETWORK', async () => {
    fetchMock.mockRejectedValue(new TypeError(`fail ${KEY}`))
    const e = await generateTyphoonReply(payload).catch((x) => x)
    expect(e).toMatchObject({ kind: 'NETWORK' })
    expect(e.message).not.toContain(KEY)
  })

  it('ไม่มีกุญแจ → NotConfigured และไม่ fetch', async () => {
    vi.stubEnv('TYPHOON_API_KEY', '')
    await expect(generateTyphoonReply(payload)).rejects.toBeInstanceOf(TyphoonNotConfiguredError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('เกิน 8 วิ → TIMEOUT', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      (_u: string, init: { signal: AbortSignal }) =>
        new Promise((_res, rej) => {
          init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        }),
    )
    const p = generateTyphoonReply(payload).catch((x) => x)
    await vi.advanceTimersByTimeAsync(8_000)
    expect(await p).toMatchObject({ kind: 'TIMEOUT' })
  })

  it('header มาแต่ body ค้าง → TIMEOUT (timer ครอบการอ่าน body)', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(async (_u: string, init: { signal: AbortSignal }) => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_res, rej) => {
          init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        }),
    }))
    const p = generateTyphoonReply(payload).catch((x) => x)
    await vi.advanceTimersByTimeAsync(8_000)
    expect(await p).toMatchObject({ kind: 'TIMEOUT' })
  })

  it('isTyphoonConfigured ตัดช่องว่าง', () => {
    vi.stubEnv('TYPHOON_API_KEY', '   ')
    expect(isTyphoonConfigured()).toBe(false)
    vi.stubEnv('TYPHOON_API_KEY', ' k ')
    expect(isTyphoonConfigured()).toBe(true)
  })

  it('H3: ข้อความดิบส่งเข้า typhoon ไม่ได้ (compile-time)', () => {
    // ไม่เรียกจริง — แค่ให้ tsc ตรวจว่า @ts-expect-error ยังจำเป็น
    const never = () => {
      // @ts-expect-error turns ดิบไม่ใช่ SanitizedPayload
      void generateTyphoonReply(turns, ctx)
      // @ts-expect-error object ธรรมดาไม่มีแบรนด์
      void generateTyphoonReply({ turns, shopName: 'x', vertical: 'ONLINE_SALES' })
    }
    expect(never).toBeTypeOf('function')
  })
})

describe('กันลอก: กฎความปลอดภัยต้องตรงกับ gemini.ts', () => {
  const gemini = readFileSync(path.resolve(__dirname, '../gemini.ts'), 'utf8')
  const prompt = buildTyphoonSystemPrompt(ctx)
  it.each([...SAFETY_RULE_LINES])('มีทั้งใน gemini.ts และ prompt: %s', (line) => {
    expect(gemini).toContain(line)
    expect(prompt).toContain(line)
  })
  it('prompt สั่งคำตอบเดียวและห้ามเดาป้าย', () => {
    expect(prompt).toContain('ตอบคำตอบเดียว 1-3 ประโยค')
    expect(prompt).toContain('[เบอร์โทร#1]')
  })
})

describe('กติกาห้ามยืนยันสต็อกเอง', () => {
  it('อยู่ใน prompt ทั้งช่วงกติกาและช่วงปิดท้าย', async () => {
    const { NO_INVENTED_FACTS_RULE } = await import('@/lib/reply-suggest-prompt')
    const p = buildTyphoonSystemPrompt({ shopName: 'ร้านทดสอบ' } as never)
    expect(p.split(NO_INVENTED_FACTS_RULE).length - 1).toBe(2)
    expect(NO_INVENTED_FACTS_RULE).toContain('ขอเช็กให้ก่อน')
  })
})

describe('กติกาห้ามเดาสื่อ + ห้ามเรียกลูกค้าว่า "ลูกค้า"', () => {
  it('อยู่ใน prompt', async () => {
    const { NO_GUESS_MEDIA_RULE, ADDRESSING_RULE } = await import('@/lib/reply-suggest-prompt')
    const p = buildTyphoonSystemPrompt({ shopName: 'ร้านทดสอบ' } as never)
    expect(p).toContain(NO_GUESS_MEDIA_RULE)
    expect(p).toContain(ADDRESSING_RULE)
    expect(NO_GUESS_MEDIA_RULE).toContain('[รูป]')
  })
})
