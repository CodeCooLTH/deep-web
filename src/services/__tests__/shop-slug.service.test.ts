import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { shop: { findUnique: vi.fn(), update: vi.fn() } },
}))
import { prisma } from '@/lib/prisma'
import { isSlugAvailable, setShopSlug } from '../shop.service'

describe('shop slug service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('isSlugAvailable false for reserved / invalid / taken', async () => {
    expect(await isSlugAvailable('admin')).toBe(false)
    expect(await isSlugAvailable('ab')).toBe(false)
    ;(prisma.shop.findUnique as any).mockResolvedValue({ id: 'x' })
    expect(await isSlugAvailable('taken-shop')).toBe(false)
  })

  it('isSlugAvailable true when valid + free', async () => {
    ;(prisma.shop.findUnique as any).mockResolvedValue(null)
    expect(await isSlugAvailable('free-shop')).toBe(true)
  })

  it('setShopSlug throws on unavailable, updates on available', async () => {
    ;(prisma.shop.findUnique as any).mockResolvedValue(null)
    ;(prisma.shop.update as any).mockResolvedValue({ id: 's1', slug: 'free-shop' })
    await expect(setShopSlug('s1', 'free-shop')).resolves.toMatchObject({ slug: 'free-shop' })
    await expect(setShopSlug('s1', 'admin')).rejects.toThrow()
  })
})
