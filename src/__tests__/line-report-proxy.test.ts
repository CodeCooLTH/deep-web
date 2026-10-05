/**
 * proxy.ts ของ 00070 (SRS TFR-05 · AC-05-2 · SDS §12 #7) — เรียก `proxy()` จริงด้วย NextRequest
 * (1) path ใหม่ไม่โดน CSRF 403 แบบเทียบตรงตัว · path อื่นใต้ /api/line-report/ ยังโดน
 * (2) bucket rate-limit แยก เพดาน 1200/นาที ไม่ปนกับ bucket mutation ปกติ (100)
 */
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next-auth/jwt', () => ({ getToken: vi.fn().mockResolvedValue(null) }))

import { proxy } from '@/proxy'

const WH = '/api/line-report/webhook'
const post = (path: string, ip: string, headers: Record<string, string> = {}) =>
  proxy(new NextRequest(`http://deepth.local${path}`, { method: 'POST', headers: { host: 'deepth.local', 'x-real-ip': ip, ...headers } }))

describe('proxy — /api/line-report/webhook', () => {
  it('POST ไม่มี Origin ไป webhook ไม่ถูก 403 · path อื่นของ feature (เทียบตรงตัว) ยังถูก 403', async () => {
    expect((await post(WH, '10.68.0.1')).status).not.toBe(403)
    for (const p of [`${WH}/x`, `${WH}2`, '/api/line-report/groups', '/api/line-report/bind-code']) {
      expect((await post(p, '10.68.0.2')).status, p).toBe(403)
    }
  })

  it('bucket แยก: webhook ผ่านเกิน 100 ครั้ง/นาที/IP · ถึง 1200 ถึงโดน 429 · bucket mutation ปกติของ IP เดียวกันไม่ถูกกิน', async () => {
    const ip = '10.68.0.3'
    for (let i = 0; i < 1200; i++) {
      const r = await post(WH, ip)
      if (r.status === 429) throw new Error(`โดน 429 ที่ครั้งที่ ${i + 1}`)
    }
    expect((await post(WH, ip)).status).toBe(429)
    // mutation ปกติ (origin ถูก) ของ IP เดียวกัน: ยังเหลือโควตาเต็ม 100
    const ok = await post('/api/some/other', ip, { origin: 'http://deepth.local' })
    expect(ok.status).not.toBe(429)
  })

  it('bucket mutation ปกติยังเข้ม: ครั้งที่ 101/นาที โดน 429', async () => {
    const ip = '10.68.0.4'
    for (let i = 0; i < 100; i++) expect((await post('/api/some/other', ip, { origin: 'http://deepth.local' })).status).not.toBe(429)
    expect((await post('/api/some/other', ip, { origin: 'http://deepth.local' })).status).toBe(429)
  })
})
