import { describe, it, expect, vi, beforeEach } from 'vitest'

// 🛑 mock ต้องมี **ทั้ง shop และ user** — `isSlugAvailable` มองสองตารางเป็น namespace เดียว
// ตั้งแต่ 2026-08-10 (lib/public-name.ts) mock ที่มีแต่ `shop` ทำให้เทสตายที่ `prisma.user`
// undefined ไม่ใช่เพราะตรรกะผิด — และนั่นคืออาการที่เกิดขึ้นจริงตอนเพิ่มด่านข้ามตาราง
vi.mock('@/lib/prisma', () => ({
  prisma: {
    shop: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}))
import { prisma } from '@/lib/prisma'
import { isSlugAvailable, setShopSlug } from '../shop.service'

/** ค่าตั้งต้น: ไม่มีใครใช้ชื่อนี้ทั้งสองตาราง */
const nobodyHasIt = () => {
  ;(prisma.shop.findFirst as any).mockResolvedValue(null)
  ;(prisma.user.findFirst as any).mockResolvedValue(null)
}

describe('shop slug service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nobodyHasIt()
  })

  it('isSlugAvailable false for reserved / invalid / taken', async () => {
    expect(await isSlugAvailable('admin')).toBe(false)
    expect(await isSlugAvailable('ab')).toBe(false)
    ;(prisma.shop.findFirst as any).mockResolvedValue({ id: 'x' })
    expect(await isSlugAvailable('taken-shop')).toBe(false)
  })

  it('isSlugAvailable true when valid + free', async () => {
    expect(await isSlugAvailable('free-shop')).toBe(true)
  })

  // [blocker] แดงเมื่อไหร่ห้าม merge
  //
  // กฎนี้มีไว้เพื่อวันที่รวม `/u/{username}` กับ `/b/{slug}` เป็น `/profile/{name}` เส้นเดียว —
  // ถ้าชื่อชนกันได้ ตัวใดตัวหนึ่งจะเข้าไม่ถึงตลอดกาล และ **จะไม่มีอะไรฟ้อง** เพราะทั้งสองแถว
  // ยังถูกต้องตาม @unique ของตัวเอง ทุกอย่างเขียวหมด มีแค่ URL หนึ่งที่พาไปผิดร้าน
  it('[blocker] ชื่อที่เป็น username ของคนอื่นอยู่แล้ว ตั้งเป็น slug ไม่ได้', async () => {
    ;(prisma.user.findFirst as any).mockResolvedValue({ id: 'u1' })
    expect(await isSlugAvailable('somchai')).toBe(false)
  })

  it('setShopSlug throws on unavailable, updates on available', async () => {
    ;(prisma.shop.update as any).mockResolvedValue({ id: 's1', slug: 'free-shop' })
    await expect(setShopSlug('s1', 'free-shop')).resolves.toMatchObject({ slug: 'free-shop' })
    await expect(setShopSlug('s1', 'admin')).rejects.toThrow()
  })

  it('[blocker] setShopSlug ต้องล้มเมื่อชื่อไปชนกับ username ของคนอื่น', async () => {
    ;(prisma.user.findFirst as any).mockResolvedValue({ id: 'u1' })
    await expect(setShopSlug('s1', 'somchai')).rejects.toThrow()
    expect(prisma.shop.update).not.toHaveBeenCalled()
  })
})
