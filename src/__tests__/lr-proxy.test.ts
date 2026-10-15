/**
 * proxy.ts ของ 00070 FR-05 (S-8) — หน้ารายละเอียดสาธารณะบน seller ที่ path /lr/{token}
 * เรียก `proxy()` จริง: ทุกสถานะผู้เปิดต้อง rewrite (ไม่ redirect) และไม่แตะ getToken
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const getToken = vi.fn()
vi.mock('next-auth/jwt', () => ({ getToken: (...a: unknown[]) => getToken(...a) }))

import { proxy } from '@/proxy'

const TOKEN = 'SECRETtoken1234567890abcdef'
const req = (host: string, ip: string, path = `/lr/${TOKEN}`, headers: Record<string, string> = {}) =>
  new NextRequest(`http://${host}${path}`, { headers: { host, 'x-real-ip': ip, ...headers } })

let n = 0
const freshIp = () => `10.70.${Math.floor(n / 250)}.${++n % 250}`

const expectHeaders = (r: Response) => {
  expect(r.headers.get('cache-control')).toBe('no-store')
  expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  expect(r.headers.get('referrer-policy')).toBe('no-referrer')
}

beforeEach(() => getToken.mockReset())

describe('proxy — seller.*/lr/{token}', () => {
  const states: [string, unknown, Record<string, string>][] = [
    ['guest', null, {}],
    ['authed ปกติ', { sub: 'u1' }, {}],
    ['authed needsOnboarding', { sub: 'u1', needsOnboarding: true }, {}],
    ['authed needsRegistration', { sub: 'u1', needsRegistration: true }, {}],
    ['app shell iOS', { sub: 'u1', needsRegistration: true }, { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', cookie: 'deep_shell=app' }],
  ]
  for (const [name, tok, h] of states) {
    it(`${name}: rewrite ไป /seller/lr/<token> ไม่ redirect · getToken ไม่ถูกเรียก · header ครบ`, async () => {
      getToken.mockResolvedValue(tok)
      const r = await proxy(req('seller.deepth.local', freshIp(), `/lr/${TOKEN}`, h))
      expect(r.status).toBe(200)
      expect(r.headers.get('location')).toBeNull()
      expect(r.headers.get('x-middleware-rewrite')).toBe(`http://seller.deepth.local/seller/lr/${TOKEN}`)
      expect(getToken).not.toHaveBeenCalled()
      expectHeaders(r)
    })
  }

  it('ครั้งที่ 31 ต่อ IP → 429 HTML ไทย + header ครบ · IP อื่นไม่โดน', async () => {
    const ip = freshIp()
    for (let i = 0; i < 30; i++) expect((await proxy(req('seller.deepth.local', ip))).status).toBe(200)
    const r = await proxy(req('seller.deepth.local', ip))
    expect(r.status).toBe(429)
    expectHeaders(r)
    expect(r.headers.get('content-type')).toContain('text/html')
    const body = await r.text()
    expect(body).toContain('เปิดหน้านี้ถี่เกินไป')
    expect(body).not.toMatch(/<script|https?:\/\//i)
    expect((await proxy(req('seller.deepth.local', freshIp()))).status).toBe(200)
  })

  it('host หลัก (deepth.local) /lr/ ไม่เข้า branch: ไม่มี header · ไม่นับโควตา', async () => {
    getToken.mockResolvedValue(null)
    const ip = freshIp()
    for (let i = 0; i < 40; i++) {
      const r = await proxy(req('deepth.local', ip))
      expect(r.status).toBe(200)
      expect(r.headers.get('x-robots-tag')).toBeNull()
    }
    expect(getToken).toHaveBeenCalled()
  })

  describe('ไม่ log token', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(m => vi.spyOn(console, m).mockImplementation(() => {}))
    afterEach(() => spies.forEach(s => s.mockClear()))
    it('ทั้ง rewrite และ 429', async () => {
      const ip = freshIp()
      for (let i = 0; i < 31; i++) await proxy(req('seller.deepth.local', ip))
      const all = spies.flatMap(s => s.mock.calls).flat().map(String).join(' ')
      expect(all).not.toContain(TOKEN)
    })
  })
})
