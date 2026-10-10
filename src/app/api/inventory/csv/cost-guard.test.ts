import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** 00071 D-7 — CSV import ที่มี cost จากผู้ไม่ใช่เจ้าของ = 403 · export ไม่มีคอลัมน์ cost (mock service/DB ทั้งหมด) */
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'u1' } })) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
const role = vi.hoisted(() => ({ current: 'ADMIN' as 'OWNER' | 'ADMIN' }))
vi.mock('@/lib/shop-context', () => ({
  resolveActiveShopContext: vi.fn(async () => ({ shopId: 'shop-1', role: role.current, roles: role.current === 'ADMIN' ? ['MANAGER'] : [] })),
}))
vi.mock('@/services/shop.service', () => ({ getShopByUserId: vi.fn(async () => ({ id: 'shop-1', vertical: 'ONLINE_SALES' })) }))
vi.mock('@/services/inventory-entitlement.service', () => ({ isProActive: vi.fn(async () => true) }))
const exportStockToCsv = vi.hoisted(() => vi.fn(async () => 'csv'))
const importRows = vi.hoisted(() => vi.fn(async () => ({ totalRows: 1, successCount: 1, errorCount: 0, results: [] })))
vi.mock('@/services/inventory-stock.service', () => ({ exportStockToCsv, importStockFromCsvRows: importRows }))

import { GET } from './export/route'
import { POST } from './import/route'

const PID = '11111111-1111-4111-8111-111111111111'
const imp = (row: object) =>
  POST(new NextRequest('http://seller.deepth.local/api/inventory/csv/import', { method: 'POST', body: JSON.stringify({ rows: [row] }) }))

beforeEach(() => { vi.clearAllMocks(); role.current = 'ADMIN' })

describe('CSV import', () => {
  it('ADMIN + cost → 403 และไม่เรียก service', async () => {
    const res = await imp({ productId: PID, stockQty: 1, cost: 5 })
    expect(res.status).toBe(403)
    expect(importRows).not.toHaveBeenCalled()
  })
  it('ADMIN ไม่มี cost → 200', async () => {
    expect((await imp({ productId: PID, stockQty: 1 })).status).toBe(200)
  })
  it('OWNER + cost → 200', async () => {
    role.current = 'OWNER'
    expect((await imp({ productId: PID, stockQty: 1, cost: 5 })).status).toBe(200)
  })
})

describe('CSV export', () => {
  it('ADMIN → includeCost=false · OWNER → true', async () => {
    await GET()
    expect(exportStockToCsv).toHaveBeenLastCalledWith('shop-1', { includeCost: false })
    role.current = 'OWNER'
    await GET()
    expect(exportStockToCsv).toHaveBeenLastCalledWith('shop-1', { includeCost: true })
  })
})
