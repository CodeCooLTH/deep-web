import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { assertReady, pushToGroup, replyTo, fetchGroupSummary, fetchMemberCount, leaveGroup } from '../line-client'
import { retryKeyFor } from '../retry-key'

const TOKEN = 'SECRET-TOKEN-xyz'
const fetchMock = vi.fn()
const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  process.env.LINE_REPORT_BOT_CHANNEL_SECRET = 's'
  process.env.LINE_REPORT_BOT_CHANNEL_ACCESS_TOKEN = TOKEN
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('assertReady', () => {
  it('env ไม่ครบ -> BOT_NOT_CONFIGURED', () => {
    delete process.env.LINE_REPORT_BOT_CHANNEL_ACCESS_TOKEN
    expect(() => assertReady()).toThrowError(expect.objectContaining({ code: 'BOT_NOT_CONFIGURED' }))
  })
  it('env ครบ -> ผ่าน', () => expect(() => assertReady()).not.toThrow())
})

describe('pushToGroup', () => {
  const messages = [{ type: 'flex', altText: 'สรุป', contents: { z: 1, a: [2, 1], b: 'ไทย' } }]
  const key = retryKeyFor('Cg1', 'D:2026-10-05@18:00')

  it('ส่ง retry key header คงที่ + raw string -> body ไบต์เดิม', async () => {
    const raw = JSON.stringify(messages)
    fetchMock.mockResolvedValue(res(200))
    await pushToGroup('Cg1', messages, key)
    await pushToGroup('Cg1', raw, key)
    const [a, b] = fetchMock.mock.calls.map((c) => c[1])
    expect(a.headers['X-Line-Retry-Key']).toBe(key)
    expect(b.headers['X-Line-Retry-Key']).toBe(key)
    expect(a.body).toBe(`{"to":"Cg1","messages":${raw}}`)
    expect(b.body).toBe(a.body)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.line.me/v2/bot/message/push')
  })

  it('409 = ok duplicate', async () => {
    fetchMock.mockResolvedValue(res(409, { message: 'dup', sentMessages: [] }))
    expect(await pushToGroup('Cg1', messages, key)).toEqual({ ok: true, duplicate: true })
  })

  it('5xx/401/400 -> ok:false พร้อม reason ไม่ throw', async () => {
    fetchMock.mockResolvedValueOnce(res(500)).mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(400))
    expect(await pushToGroup('Cg1', messages, key)).toMatchObject({ ok: false, status: 500, kind: 'LINE_UNAVAILABLE', reason: 'HTTP_500' })
    expect(await pushToGroup('Cg1', messages, key)).toMatchObject({ ok: false, kind: 'TOKEN_INVALID', reason: 'TOKEN_INVALID' })
    expect(await pushToGroup('Cg1', messages, key)).toMatchObject({ ok: false, status: 400, reason: 'HTTP_400' })
  })

  it('timeout -> TIMEOUT · network -> NETWORK', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('t', 'TimeoutError')).mockRejectedValueOnce(new TypeError('fetch failed'))
    expect(await pushToGroup('Cg1', messages, key)).toMatchObject({ ok: false, status: 0, reason: 'TIMEOUT' })
    expect(await pushToGroup('Cg1', messages, key)).toMatchObject({ ok: false, status: 0, reason: 'NETWORK' })
  })

  it('ไม่ log และไม่ปล่อย token ออกใน result', async () => {
    const spies = (['log', 'error', 'warn', 'info'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    fetchMock.mockResolvedValueOnce(res(401)).mockRejectedValueOnce(new TypeError('boom'))
    const out = [await pushToGroup('Cg1', messages, key), await pushToGroup('Cg1', messages, key)]
    expect(JSON.stringify(out)).not.toContain(TOKEN)
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })
})

describe('replyTo', () => {
  it('ไม่มี retry key header', async () => {
    fetchMock.mockResolvedValue(res(200))
    expect(await replyTo('tok', [{ type: 'text', text: 'x' }])).toEqual({ ok: true, duplicate: false })
    expect(fetchMock.mock.calls[0][1].headers['X-Line-Retry-Key']).toBeUndefined()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.line.me/v2/bot/message/reply')
  })
  it('400 -> ok:false', async () => {
    fetchMock.mockResolvedValue(res(400))
    expect(await replyTo('tok', [])).toMatchObject({ ok: false, reason: 'HTTP_400' })
  })
})

describe('group info', () => {
  it('summary / count ปกติ', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { groupName: 'ทีม' })).mockResolvedValueOnce(res(200, { count: 7 }))
    expect(await fetchGroupSummary('Cg1')).toEqual({ groupName: 'ทีม' })
    expect(await fetchMemberCount('Cg1')).toBe(7)
  })
  it('404 -> null · 500 -> throw', async () => {
    fetchMock.mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(500))
    expect(await fetchGroupSummary('Cg1')).toBeNull()
    expect(await fetchMemberCount('Cg1')).toBeNull()
    await expect(fetchGroupSummary('Cg1')).rejects.toMatchObject({ status: 500 })
  })
  it('leaveGroup: 200 true · 404 false', async () => {
    fetchMock.mockResolvedValueOnce(res(200)).mockResolvedValueOnce(res(404))
    expect(await leaveGroup('Cg1')).toBe(true)
    expect(await leaveGroup('Cg1')).toBe(false)
  })
})
