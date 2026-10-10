import { describe, it, expect, vi } from 'vitest'

/** 00071 P3 — ต้นทุนสินค้า: ไม่มีคีย์ (ไม่ใช่ null/0) เมื่อ canSeeCost=false · mock prisma ไม่ต่อ DB */
const findMany = vi.hoisted(() => vi.fn())
vi.mock('@/lib/prisma', () => ({ prisma: { product: { findMany } } }))

import { serializeProduct } from '../product.service'
import { exportStockToCsv } from '../inventory-stock.service'
import { isMissingCost } from '@/app/(paces)/seller/(dashboard)/products/components/data'

const raw = {
  id: 'p1', shopId: 's1', name: 'n', description: null, shortDescription: null, attributes: {},
  price: 10, images: [], type: 'PHYSICAL', fulfillmentMode: 'SHIPPED', billingMode: 'ONE_TIME',
  billingPeriod: null, billingPeriodDays: null, isActive: true, createdAt: new Date(), updatedAt: new Date(),
  tags: [], stockQty: null, lowStockThreshold: null, cost: 7,
} as never

describe('serializeProduct', () => {
  it('canSeeCost=false → ไม่มีคีย์ cost เลย', () => {
    expect('cost' in serializeProduct(raw, { canSeeCost: false })).toBe(false)
  })
  it('canSeeCost=true → cost เป็นตัวเลข · null คงเป็น null', () => {
    expect(serializeProduct(raw, { canSeeCost: true }).cost).toBe(7)
    expect(serializeProduct({ ...(raw as object), cost: null } as never, { canSeeCost: true }).cost).toBeNull()
  })
})

describe('exportStockToCsv', () => {
  findMany.mockResolvedValue([{ id: 'p1', sku: null, name: 'n', stockQty: 3, cost: 7 }])
  it('includeCost=false → ไม่มีหัวคอลัมน์/ค่า cost และไม่ select cost', async () => {
    const csv = await exportStockToCsv('s1', { includeCost: false })
    expect(csv.replace(/^\uFEFF/, '').split(/\r?\n/)[0]).toBe('productId,sku,name,stockQty')
    expect(csv).not.toContain(',7')
    expect(findMany.mock.calls.at(-1)![0].select).not.toHaveProperty('cost')
  })
  it('includeCost=true → มีคอลัมน์ cost', async () => {
    const csv = await exportStockToCsv('s1', { includeCost: true })
    expect(csv.replace(/^\uFEFF/, '').split(/\r?\n/)[0]).toBe('productId,sku,name,stockQty,cost')
  })
})

describe('isMissingCost', () => {
  it('แถวที่ไม่มีคีย์ cost ไม่นับว่า "ยังไม่ตั้ง" · null นับ · 0 ไม่นับ', () => {
    expect(isMissingCost({})).toBe(false)
    expect(isMissingCost({ cost: null })).toBe(true)
    expect(isMissingCost({ cost: 0 })).toBe(false)
  })
})
