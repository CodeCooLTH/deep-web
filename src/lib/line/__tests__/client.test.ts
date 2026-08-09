import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { lineApiRequest, lineDataApiRequest, LineApiError } from '@/lib/line/client'
import { API_BASE, DATA_API_BASE } from '@/lib/line/constants'

const okJson = (data: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) } as Response)
const failJson = (data: unknown, status = 400) =>
  Promise.resolve({ ok: false, status, json: () => Promise.resolve(data) } as Response)

describe('lineApiRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('200 → คืนค่า JSON ที่ parse แล้ว', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      okJson({ userId: 'U123', basicId: '@example', displayName: 'ร้านตัวอย่าง' }),
    )
    const result = await lineApiRequest('/v2/bot/info', 'tok')
    expect(result).toEqual({ userId: 'U123', basicId: '@example', displayName: 'ร้านตัวอย่าง' })
  })

  it('ยิงไปที่ API_BASE พร้อม Authorization: Bearer <token>', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(okJson({}))
    await lineApiRequest('/v2/bot/info', 'super_secret_token')
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>
    const [url, init] = mockFetch.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe(`${API_BASE}/v2/bot/info`)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer super_secret_token')
  })

  it('ไม่ใส่ access token ลง query string ของ URL (กัน token หลุดเข้า log)', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(okJson({}))
    await lineApiRequest('/v2/bot/info', 'super_secret_token')
    const calledUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).not.toContain('super_secret_token')
  })

  it('401 → โยน LineApiError status=401 kind=TOKEN_INVALID', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      failJson({ message: 'Authentication failed.' }, 401),
    )
    const err = await lineApiRequest('/v2/bot/info', 'bad_token').catch((e) => e)
    expect(err).toBeInstanceOf(LineApiError)
    expect(err.status).toBe(401)
    expect(err.kind).toBe('TOKEN_INVALID')
    expect(err.message).toBe('Authentication failed.')
  })

  it('403 → kind=TOKEN_INVALID', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(failJson({ message: 'forbidden' }, 403))
    const err = await lineApiRequest('/v2/bot/info', 'tok').catch((e) => e)
    expect(err).toBeInstanceOf(LineApiError)
    expect(err.kind).toBe('TOKEN_INVALID')
  })

  it('429 → kind=LINE_UNAVAILABLE', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(failJson({ message: 'rate limited' }, 429))
    const err = await lineApiRequest('/v2/bot/message/reply', 'tok', { method: 'POST' }).catch((e) => e)
    expect(err).toBeInstanceOf(LineApiError)
    expect(err.kind).toBe('LINE_UNAVAILABLE')
  })

  it('500 → kind=LINE_UNAVAILABLE', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(failJson({}, 500))
    const err = await lineApiRequest('/v2/bot/info', 'tok').catch((e) => e)
    expect(err).toBeInstanceOf(LineApiError)
    expect(err.kind).toBe('LINE_UNAVAILABLE')
  })

  it('400 อื่น ๆ ที่ไม่เข้าเกณฑ์ transport → kind=UNKNOWN (ให้ S-8 อ่าน raw ต่อเอง)', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      failJson({ message: 'The user hasn’t added the bot as a friend.' }, 400),
    )
    const err = await lineApiRequest('/v2/bot/message/push', 'tok', { method: 'POST' }).catch((e) => e)
    expect(err).toBeInstanceOf(LineApiError)
    expect(err.status).toBe(400)
    expect(err.kind).toBe('UNKNOWN')
    // raw ต้องเก็บ body ดิบไว้ให้ผู้เรียกชั้นถัดไปอ่านต่อ (S-8 แปล error ทางธุรกิจ)
    expect(err.raw).toEqual({ message: 'The user hasn’t added the bot as a friend.' })
  })

  it('timeout → LineApiError อ่านออก (status=0, kind=LINE_UNAVAILABLE) ไม่ throw error ดิบของ fetch', async () => {
    const abortErr = new DOMException('The operation was aborted.', 'TimeoutError')
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(abortErr)
    const err = await lineApiRequest('/v2/bot/info', 'tok').catch((e) => e)
    expect(err).toBeInstanceOf(LineApiError)
    expect(err.status).toBe(0)
    expect(err.kind).toBe('LINE_UNAVAILABLE')
    expect(err.message).toMatch(/หมดเวลา/)
  })

  it('network error อื่น ๆ (ไม่ใช่ timeout) → LineApiError อ่านออกเช่นกัน', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('fetch failed'))
    const err = await lineApiRequest('/v2/bot/info', 'tok').catch((e) => e)
    expect(err).toBeInstanceOf(LineApiError)
    expect(err.status).toBe(0)
    expect(err.kind).toBe('LINE_UNAVAILABLE')
  })

  it('error ที่โยนออกไปไม่มี token ปนอยู่ใน message/raw', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('fetch failed'))
    const err = await lineApiRequest('/v2/bot/info', 'super_secret_token_xyz').catch((e) => e)
    expect(JSON.stringify(err.raw ?? '')).not.toContain('super_secret_token_xyz')
    expect(err.message).not.toContain('super_secret_token_xyz')
  })

  it('ส่ง X-Line-Retry-Key ไปกับ header เมื่อระบุ retryKey', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(okJson({}))
    await lineApiRequest('/v2/bot/message/push', 'tok', {
      method: 'POST',
      body: { to: 'U1', messages: [] },
      retryKey: 'retry-key-123',
    })
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>
    const [, init] = mockFetch.mock.calls[0]! as [string, RequestInit]
    expect((init.headers as Record<string, string>)['X-Line-Retry-Key']).toBe('retry-key-123')
  })

  it('ไม่ระบุ retryKey → ไม่มี header X-Line-Retry-Key', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(okJson({}))
    await lineApiRequest('/v2/bot/info', 'tok')
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>
    const [, init] = mockFetch.mock.calls[0]! as [string, RequestInit]
    expect((init.headers as Record<string, string>)['X-Line-Retry-Key']).toBeUndefined()
  })

  it('ส่ง body เป็น JSON string พร้อม Content-Type application/json', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(okJson({}))
    await lineApiRequest('/v2/bot/message/push', 'tok', {
      method: 'POST',
      body: { to: 'U1', messages: [{ type: 'text', text: 'hi' }] },
    })
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>
    const [, init] = mockFetch.mock.calls[0]! as [string, RequestInit]
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ to: 'U1', messages: [{ type: 'text', text: 'hi' }] }))
  })

  it('ส่ง query params ต่อท้าย URL', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(okJson({}))
    await lineApiRequest('/v2/bot/message/quota', 'tok', { query: { foo: 'bar' } })
    const calledUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toBe(`${API_BASE}/v2/bot/message/quota?foo=bar`)
  })
})

describe('lineDataApiRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ยิงไปที่ DATA_API_BASE ไม่ใช่ API_BASE', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(okJson({}))
    await lineDataApiRequest('/v2/bot/message/468789577898262530/content', 'tok')
    const calledUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(calledUrl).toBe(`${DATA_API_BASE}/v2/bot/message/468789577898262530/content`)
  })

  it('คืน Response ดิบเสมอ (ไม่เรียก .json() ให้เอง) แม้ ok=true', async () => {
    const fakeRes = { ok: true, status: 200, json: vi.fn() } as unknown as Response
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(Promise.resolve(fakeRes))
    const res = await lineDataApiRequest('/v2/bot/message/1/content', 'tok')
    expect(res).toBe(fakeRes)
    expect((fakeRes.json as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('คืน Response ดิบแม้ ok=false (ไม่โยน error) — ให้ caller (S-7) ตัดสินใจเอง', async () => {
    const fakeRes = { ok: false, status: 404 } as unknown as Response
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(Promise.resolve(fakeRes))
    const res = await lineDataApiRequest('/v2/bot/message/1/content', 'tok')
    expect(res).toBe(fakeRes)
    expect(res.ok).toBe(false)
  })

  it('network error/timeout ยังโยน LineApiError เหมือนกัน (ไม่มี Response ให้คืนจริง ๆ)', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DOMException('aborted', 'TimeoutError'),
    )
    const err = await lineDataApiRequest('/v2/bot/message/1/content', 'tok').catch((e) => e)
    expect(err).toBeInstanceOf(LineApiError)
    expect(err.status).toBe(0)
  })
})
