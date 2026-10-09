import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('server-only', () => ({}))
const m = vi.hoisted(() => ({
  expand: vi.fn(),
  product: { findFirst: vi.fn(), findMany: vi.fn() },
  cip: { count: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
}))
vi.mock('@/services/follow-up-scope', () => ({ expandClusters: m.expand }))
vi.mock('@/lib/prisma', () => ({ prisma: { product: m.product, chatInterestedProduct: m.cip } }))

import { addInterestedProduct, removeInterestedProduct } from '@/services/chat-interested-product.service'

const base = { shopId: 's', conversationId: 'c', userId: 'u', productId: 'p' }
const prod = { id: 'p', name: 'เสื้อ', price: new Prisma.Decimal(10), isActive: true, stockQty: null, images: ['f1'], attributes: { สี: 'ครีม, ดำ', ขนาด: 'M, L' } }

beforeEach(() => {
  vi.resetAllMocks()
  m.expand.mockResolvedValue(new Map([['c', ['c']]]))
  m.product.findFirst.mockResolvedValue(prod)
  m.cip.count.mockResolvedValue(0)
  m.cip.createMany.mockResolvedValue({ count: 1 })
})

describe('addInterestedProduct', () => {
  it('ห้องไม่ใช่ของร้าน → NOT_FOUND', async () => {
    m.expand.mockResolvedValue(new Map())
    expect(await addInterestedProduct(base)).toEqual({ ok: false, code: 'NOT_FOUND' })
  })
  it('สินค้าไม่พบ → PRODUCT_NOT_FOUND', async () => {
    m.product.findFirst.mockResolvedValue(null)
    expect(await addInterestedProduct(base)).toEqual({ ok: false, code: 'PRODUCT_NOT_FOUND' })
  })
  it('ตัวเลือกผิด → INVALID_OPTION', async () => {
    expect(await addInterestedProduct({ ...base, selections: [{ key: 'สี', value: 'แดง' }] })).toEqual({ ok: false, code: 'INVALID_OPTION' })
  })
  it('ครบ 10 → LIMIT_REACHED', async () => {
    m.cip.count.mockResolvedValue(10)
    expect(await addInterestedProduct(base)).toEqual({ ok: false, code: 'LIMIT_REACHED' })
  })
  it('createMany count 0 → DUPLICATE', async () => {
    m.cip.createMany.mockResolvedValue({ count: 0 })
    expect(await addInterestedProduct(base)).toEqual({ ok: false, code: 'DUPLICATE' })
  })
  it('FK P2003 → PRODUCT_NOT_FOUND', async () => {
    m.cip.createMany.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('x', { code: 'P2003', clientVersion: '0' }))
    expect(await addInterestedProduct(base)).toEqual({ ok: false, code: 'PRODUCT_NOT_FOUND' })
  })
  it('สำเร็จ: label + snapshot + รูป', async () => {
    const r = await addInterestedProduct({ ...base, selections: [{ key: 'สี', value: 'ครีม' }, { key: 'ขนาด', value: 'L' }] })
    expect(r.ok && r.item).toMatchObject({ name: 'เสื้อ', optionLabel: 'สี ครีม · ขนาด L', state: 'ACTIVE', imageFileId: 'f1' })
  })
})

describe('removeInterestedProduct', () => {
  it('scope ด้วย shop + cluster และ count 0 → ok:false', async () => {
    m.cip.deleteMany.mockResolvedValue({ count: 0 })
    expect(await removeInterestedProduct({ shopId: 's', conversationId: 'c', rowId: 'r' })).toEqual({ ok: false })
    expect(m.cip.deleteMany).toHaveBeenCalledWith({ where: { id: 'r', shopId: 's', conversationId: { in: ['c'] } } })
  })
})
