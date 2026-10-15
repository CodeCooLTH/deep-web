/**
 * line-report-detail.test.ts — unit (mock prisma/loadPnl) ของ buildDetailSnapshot (00070 EXT-LINK AC-LINK-03-4/03-5/04-3)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const findMany = vi.fn()
const productFindMany = vi.fn()
vi.mock('@/lib/prisma', () => ({
  prisma: { order: { findMany: (a: unknown) => findMany(a) }, product: { findMany: (a: unknown) => productFindMany(a) } },
}))
const loadPnl = vi.fn()
vi.mock('@/services/line-report-summary.service', () => ({ loadPnl: (...a: unknown[]) => loadPnl(...a) }))

import { buildDetailSnapshot, expenseDetailRows } from '@/services/line-report-detail.service'
import type { Block, TemplateV1 } from '@/lib/line-report/template'
import type { GroupSummary, ShopSummary } from '@/lib/line-report/types'

const tpl = (types: Block['type'][]): TemplateV1 => ({
  v: 1,
  button: { show: true, label: 'เปิด Deep' },
  blocks: types.map((type, i) => ({ id: `b${i}`, type }) as Block),
})
const W = { startIso: '2026-09-10', endIso: '2026-09-11', computedAt: '2026-09-12T03:00:00.000Z' }
const shop = (o: Partial<ShopSummary> = {}): ShopSummary => ({
  shop: { id: 's1', name: 'ร้านทดสอบ', vertical: 'ONLINE_SALES' },
  state: 'OK', orders: 3, confirmed: 300, unconfirmed: 120, cancelled: 2,
  finance: { expense: 50, netSales: 370, expenseRecorded: true },
  ...o,
})
const summary = (s: ShopSummary): GroupSummary => ({ window: W, shops: [s], profitSummable: true, mixedFinanceRules: false })
const ord = (i: number, amount: number, status = 'CONFIRMED') => ({
  id: `o${i}`, createdAt: new Date(Date.UTC(2026, 8, 10, 3, 0, 0) - i * 1000), status, totalAmount: amount, serviceClosedAt: null, shipments: [],
})
let detailExtra: (id: string) => Record<string, unknown> = () => ({})
const detailRow = (id: string) => ({
  id, buyerName: 'สมชาย', buyerContact: '0812345678', room: null, salesChannel: null, shopChannel: null,
  items: [{ name: 'สินค้า', qty: 1, productId: null }], ...detailExtra(id),
})

/** query A ตอบ `a` (ครั้งแรก) / `a2` (ครั้งที่สอง) · query B (where.id) ตอบแถวรายละเอียด */
function mockDb(a: ReturnType<typeof ord>[], a2 = a) {
  let aCalls = 0
  findMany.mockImplementation(async (args: { where: { id?: unknown } }) =>
    args.where.id ? (args.where.id as { in: string[] }).in.map(detailRow) : (aCalls++ === 0 ? a : a2),
  )
  return () => aCalls
}
const build = (types: Block['type'][], s = shop()) =>
  buildDetailSnapshot({ summary: summary(s), template: tpl(types), kind: 'DAILY', title: 'รายงาน', window: W, now: new Date('2026-09-12T03:00:00Z'), cache: { pnl: new Map() } as never })

const ABC = [ord(1, 100), ord(2, 200, 'PENDING'), ord(3, 120, 'PENDING')]
const A3 = [ord(1, 300), ord(2, 120, 'PENDING')]

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SELLER_URL', 'https://seller.example.test')
  vi.stubEnv('NEXTAUTH_SECRET', 'test-secret')
  detailExtra = () => ({})
  productFindMany.mockReset()
  productFindMany.mockResolvedValue([])
  findMany.mockReset()
  loadPnl.mockReset()
  loadPnl.mockResolvedValue({
    expense: 50, expenseRecorded: true, shippingCost: 0, returnShippingCost: 0,
    expenses: [{ expenseDate: new Date('2026-09-10T05:00:00Z'), category: 'OTHER', amount: 50, note: 'โน้ต' }],
  })
})

describe('exposure ตัดที่จุดเขียน', () => {
  it('showSales=false → ไม่มี amount/bucket/buckets/sales/total.sales', async () => {
    mockDb([ord(1, 100), ord(2, 120), ord(3, 200)])
    const snap = await build(['orders'], shop({ orders: 3, confirmed: 300, unconfirmed: 120 }))
    const sh = snap.shops[0]
    expect(sh.buckets).toBeUndefined()
    expect(sh.sales).toBeUndefined()
    expect(snap.total.sales).toBeUndefined()
    expect(sh.rows).toHaveLength(3)
    sh.rows.forEach((r) => { expect('amount' in r).toBe(false); expect('bucket' in r).toBe(false) })
    expect(sh.cancelled).toBeUndefined()
    expect('expense' in sh).toBe(false)
  })
  it('expense=false → ไม่มี key expense และไม่แตะ loadPnl', async () => {
    mockDb(A3)
    const snap = await build(['orders', 'sales'], shop({ orders: 2, confirmed: 300, unconfirmed: 120 }))
    expect('expense' in snap.shops[0]).toBe(false)
    expect(loadPnl).not.toHaveBeenCalled()
  })
  it('เปิดครบ → มีทุกส่วน', async () => {
    mockDb(A3)
    const snap = await build(['orders', 'sales', 'cancelled', 'expense'], shop({ orders: 2 }))
    const sh = snap.shops[0]
    expect(sh.cancelled).toBe(2)
    expect(snap.total).toEqual({ orders: 2, sales: 420, cancelled: 2 })
    expect(sh.buckets!.map((b) => [b.key, b.count, b.amount])).toEqual([['COUNTED', 1, 300], ['PENDING', 1, 120]])
    expect(sh.expense).toMatchObject({ recorded: true, total: 50, rowsTotal: 1 })
    expect(sh.expense!.rows[0].note).toBe('โน้ต')
  })
  it('ปิดทั้งจำนวนและยอดขาย → ไม่ query ออเดอร์เลย', async () => {
    const snap = await build(['cancelled'])
    expect(findMany).not.toHaveBeenCalled()
    expect(snap.shops[0].rows).toEqual([])
  })
})

describe('parity (AC-LINK-04-3)', () => {
  it('drift ครั้งแรกแล้วเท่ากันในการลองซ้ำ → ไม่ติด MISMATCH', async () => {
    const calls = mockDb([ord(1, 100)], A3)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const snap = await build(['orders', 'sales'], shop({ orders: 2, confirmed: 300, unconfirmed: 120 }))
    expect(calls()).toBe(2)
    expect(snap.shops[0].parity).toBeUndefined()
    expect(err).not.toHaveBeenCalled()
    err.mockRestore()
  })
  it('ยังไม่เท่า → MISMATCH · หัวยังเป็นตัวเลขการ์ด · log ไม่มียอด', async () => {
    const calls = mockDb([ord(1, 100)])
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const snap = await build(['orders', 'sales'], shop({ orders: 2, confirmed: 300, unconfirmed: 120 }))
    expect(calls()).toBe(2) // ลองซ้ำครั้งเดียว
    expect(snap.shops[0].parity).toBe('MISMATCH')
    expect(snap.shops[0].orders).toBe(2)
    expect(snap.shops[0].sales).toBe(420)
    expect(snap.total.sales).toBe(420)
    expect(err).toHaveBeenCalledTimes(1)
    expect(String(err.mock.calls[0])).toBe('[line-report] detail parity mismatch')
    err.mockRestore()
  })
})

describe('เพดานแถว (AC-LINK-03-5)', () => {
  it('400 ใบ → rows 150 · rowsTotal 400 · ยอดก้อนจากชุดเต็ม', async () => {
    const all = Array.from({ length: 400 }, (_, i) => ord(i, 10, i % 4 === 0 ? 'CONFIRMED' : 'PENDING'))
    mockDb(all)
    const snap = await build(['orders', 'sales'], shop({ orders: 400, confirmed: 1000, unconfirmed: 3000 }))
    const sh = snap.shops[0]
    expect(sh.parity).toBeUndefined()
    expect(sh.rows).toHaveLength(150)
    expect(sh.rowsTotal).toBe(400)
    expect(sh.rowsTruncated).toBe(true)
    expect(sh.buckets!.map((b) => [b.count, b.amount])).toEqual([[100, 1000], [300, 3000]])
    // query B ขอเฉพาะ 150 id แรก
    const b = findMany.mock.calls.map((c) => c[0]).find((a) => a.where.id)
    expect(b.where.id.in).toHaveLength(150)
    expect(b.where.shopId).toBe('s1')
  })
})

describe('PII', () => {
  it('serialize ไม่มีเบอร์ดิบ/@', async () => {
    mockDb(A3)
    const snap = await build(['orders', 'sales', 'cancelled', 'expense'], shop({ orders: 2 }))
    const j = JSON.stringify(snap)
    expect(j).not.toMatch(/0\d{9}/)
    expect(j).not.toContain('@')
    expect(snap.shops[0].rows[0].phoneMasked).toBe('•••-•••-678')
  })
})

describe('expenseDetailRows', () => {
  it('ใหม่→เก่า · บรรทัดระบบอยู่หน้า · Σ = ยอดรวมก่อนตัด', () => {
    const rows = expenseDetailRows(
      [
        { expenseDate: new Date('2026-09-10T05:00:00Z'), category: 'RENT', amount: 10.25, note: null },
        { expenseDate: new Date('2026-09-11T05:00:00Z'), category: 'OTHER', amount: '20', note: 'x' },
      ],
      { shippingCost: 5, returnShippingCost: 0 },
      new Date('2026-09-11T00:00:00Z'),
    )
    expect(rows.map((r) => [r.category, r.amount, !!r.system])).toEqual([['ค่าส่ง (จ่ายขนส่ง)', 5, true], ['อื่นๆ', 20, false], ['ค่าเช่า', 10.25, false]])
  })
})

describe('รูปสินค้า + ช่องทางขาย', () => {
  const withItems = (id: string, productId: string | null) => ({ items: [{ name: 'ก', qty: 1, productId }] })
  it('คีย์ในบัคเก็ต → imageUrl first-party · คีย์ภายนอก/ไม่มีสินค้า → ไม่มี key · query สินค้าจำกัดร้าน', async () => {
    mockDb([ord(1, 100), ord(2, 100), ord(3, 100)])
    detailExtra = (id) => withItems(id, id === 'o1' ? 'p1' : id === 'o2' ? 'p2' : null)
    productFindMany.mockResolvedValue([
      { id: 'p1', images: ['shops/a/p1.png'] },
      { id: 'p2', images: ['https://cdn.example.com/x.jpg'] },
    ])
    const snap = await build(['orders', 'sales'], shop({ orders: 3, confirmed: 300, unconfirmed: 0 }))
    const [r1, r2, r3] = snap.shops[0].rows
    expect(r1.imageUrl).toMatch(/^https:\/\/seller\.example\.test\/api\/line-report\/product-image\?k=/)
    expect('imageUrl' in r2).toBe(false)
    expect('imageUrl' in r3).toBe(false)
    expect(productFindMany).toHaveBeenCalledTimes(1)
    expect(productFindMany.mock.calls[0][0].where).toEqual({ id: { in: ['p1', 'p2'] }, shopId: 's1' })
  })
  it('สินค้าร้านอื่น (ไม่ถูกคืนจาก query ที่จำกัดร้าน) ไม่ได้รูป', async () => {
    mockDb([ord(1, 100)])
    detailExtra = (id) => withItems(id, 'other-shop-product')
    productFindMany.mockResolvedValue([])
    const snap = await build(['orders', 'sales'], shop({ orders: 1, confirmed: 100, unconfirmed: 0 }))
    expect('imageUrl' in snap.shops[0].rows[0]).toBe(false)
  })
  it('channel: shopChannel ชนะ salesChannel · ไม่มีทั้งคู่ = ไม่มี key · query B ไม่ขอ avatarUrl · payload ไม่มี URL นอกโดเมน', async () => {
    mockDb([ord(1, 100), ord(2, 100), ord(3, 100)])
    detailExtra = (id) =>
      id === 'o1' ? { salesChannel: 'FACEBOOK', shopChannel: { provider: 'LINE', avatarUrl: 'https://scontent.fbcdn.net/a.jpg' } }
      : id === 'o2' ? { salesChannel: 'TIKTOK' } : {}
    const snap = await build(['orders', 'sales'], shop({ orders: 3, confirmed: 300, unconfirmed: 0 }))
    const [r1, r2, r3] = snap.shops[0].rows
    expect(r1.channel).toBe('LINE')
    expect(r2.channel).toBe('TIKTOK')
    expect('channel' in r3).toBe(false)
    const b = findMany.mock.calls.map((c) => c[0]).find((a) => a.where.id)
    expect(b.select.shopChannel).toEqual({ select: { provider: true } })
    const j = JSON.stringify(snap)
    expect(j).not.toContain('fbcdn')
    for (const u of j.match(/https?:\/\/[^"\\]+/g) ?? []) expect(u.startsWith('https://seller.example.test/')).toBe(true)
  })
  it('channel: ค่าเก่า MESSENGER → FACEBOOK · คีย์ที่ไม่รู้จัก = ไม่มี key (ไม่โชว์คำดิบ)', async () => {
    mockDb([ord(1, 100), ord(2, 100)])
    detailExtra = (id) => (id === 'o1' ? { salesChannel: 'MESSENGER' } : { salesChannel: 'WHATEVER' })
    const snap = await build(['orders', 'sales'], shop({ orders: 2, confirmed: 200, unconfirmed: 0 }))
    const [r1, r2] = snap.shops[0].rows
    expect(r1.channel).toBe('FACEBOOK')
    expect('channel' in r2).toBe(false)
  })
})
