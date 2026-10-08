import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { NextRequest } from 'next/server'

vi.mock('@/lib/storage', () => ({ getFile: vi.fn() }))
import { getFile } from '@/lib/storage'
import { GET } from '../route'
import { lineProductImageUrl } from '@/lib/line-report/product-image'

const env = { ...process.env }
beforeEach(() => {
  process.env.NEXT_PUBLIC_SELLER_URL = 'https://seller.example.app'
  process.env.NEXTAUTH_SECRET = 'test-secret'
})
afterEach(() => {
  process.env = { ...env }
  vi.mocked(getFile).mockReset()
})

describe('GET /api/line-report/product-image', () => {
  it('ลายเซ็นถูก + webp → JPEG 160×160 cache ยาว', async () => {
    const webp = await sharp({ create: { width: 400, height: 300, channels: 4, background: '#28a745' } }).webp().toBuffer()
    vi.mocked(getFile).mockResolvedValue({ buffer: webp, ext: 'webp' })
    const res = await GET(new NextRequest(lineProductImageUrl('2026/10/08/a.webp')!))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('cache-control')).toContain('immutable')
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 160, 160])
  })
  it('ลายเซ็นผิด/คีย์ถูกสลับ → 404 และไม่แตะ storage', async () => {
    const u = new URL(lineProductImageUrl('2026/10/08/a.webp')!)
    u.searchParams.set('k', '2026/10/08/kyc.png')
    expect((await GET(new NextRequest(u))).status).toBe(404)
    expect(getFile).not.toHaveBeenCalled()
  })
  it('ไฟล์ไม่มี/ไม่ใช่รูป → 404', async () => {
    vi.mocked(getFile).mockResolvedValueOnce(null)
    expect((await GET(new NextRequest(lineProductImageUrl('2026/10/08/a.png')!))).status).toBe(404)
    vi.mocked(getFile).mockResolvedValueOnce({ buffer: Buffer.from('not an image'), ext: 'png' })
    expect((await GET(new NextRequest(lineProductImageUrl('2026/10/08/a.png')!))).status).toBe(404)
  })
})
