import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock prisma เท่านั้น — ใช้ shop-slug helpers จริง (pure functions ไม่มี side-effect)
vi.mock('@/lib/prisma', () => ({
  prisma: { shop: { findUnique: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { GET } from './route'

function req(slug: string) {
  return new Request(`http://seller.deepth.local/api/shops/check-slug?slug=${encodeURIComponent(slug)}`)
}

describe('GET /api/shops/check-slug', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invalid slug (ab — สั้นเกิน 3 chars) → available:false reason:invalid', async () => {
    const res = await GET(req('ab') as any)
    const data = await res.json()
    expect(data).toEqual({ available: false, reason: 'invalid' })
    // findUnique ต้องไม่ถูกเรียก — format check ต้อง short-circuit ก่อน DB
    expect(prisma.shop.findUnique).not.toHaveBeenCalled()
  })

  it('reserved slug (admin) → available:false reason:reserved', async () => {
    const res = await GET(req('admin') as any)
    const data = await res.json()
    expect(data).toEqual({ available: false, reason: 'reserved' })
    expect(prisma.shop.findUnique).not.toHaveBeenCalled()
  })

  it('taken slug (mock findUnique คืน {id}) → available:false reason:taken', async () => {
    ;(prisma.shop.findUnique as any).mockResolvedValue({ id: 'shop-1' })
    const res = await GET(req('my-shop') as any)
    const data = await res.json()
    expect(data).toEqual({ available: false, reason: 'taken' })
    expect(prisma.shop.findUnique).toHaveBeenCalledWith({ where: { slug: 'my-shop' }, select: { id: true } })
  })

  it('free slug (mock findUnique คืน null) → available:true', async () => {
    ;(prisma.shop.findUnique as any).mockResolvedValue(null)
    const res = await GET(req('cool-shop') as any)
    const data = await res.json()
    expect(data).toEqual({ available: true })
    expect(prisma.shop.findUnique).toHaveBeenCalledWith({ where: { slug: 'cool-shop' }, select: { id: true } })
  })
})
