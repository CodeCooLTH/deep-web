import { describe, expect, it } from 'vitest'
import { fitToBudget, parseSnapshot, MAX_PAYLOAD_BYTES, type DetailShop, type DetailSnapshotV1, type OrderRow } from '../detail-snapshot'
import { toExpenseRow, toOrderRow } from '../detail-snapshot-rows'

const mkRow = (n: number): OrderRow =>
  toOrderRow(
    {
      createdAt: '2026-10-14T03:00:00Z', status: 'CONFIRMED', serviceClosedAt: null,
      totalAmount: 100 + n, buyerName: 'ลูกค้าทดสอบ', buyerContact: '0812345678',
      items: [{ name: 'ก'.repeat(80), qty: 1 }], room: null,
    },
    'GENERAL',
  )
const mkShop = (i: number, rows: number, exps: number): DetailShop => ({
  name: `ร้าน${i}`, state: 'OK', rule: 'GENERAL', orderWord: 'คำสั่งซื้อ', itemColLabel: 'สินค้า', orders: rows, sales: rows * 100, cancelled: 0,
  buckets: [
    { key: 'COUNTED', label: 'ยืนยันแล้ว', count: rows, amount: rows * 100 },
    { key: 'PENDING', label: 'รอยืนยัน', count: 0, amount: 0 },
  ],
  rows: Array.from({ length: rows }, (_, n) => mkRow(n)), rowsTotal: rows, rowsTruncated: false,
  expense: {
    recorded: true, total: exps * 10, rowsTotal: exps, rowsTruncated: false,
    rows: Array.from({ length: exps }, () => toExpenseRow({ date: '2026-10-14', category: 'RENT', amount: 10, note: 'ข'.repeat(200) })),
  },
})
const mkSnap = (shops: DetailShop[]): DetailSnapshotV1 => ({
  v: 1, kind: 'DAILY',
  window: { startIso: '2026-10-14T00:00:00Z', endIso: '2026-10-14T23:59:59Z', computedAt: '2026-10-15T00:00:00Z' },
  title: 'สรุปวันที่ 14', orderWord: 'คำสั่งซื้อ', orderWordMixed: false, mixedFinanceRules: false, expiresAt: '2026-10-16T16:59:59Z',
  exposure: { orders: true, sales: true, cancelled: true, expense: true },
  total: { orders: shops.reduce((a, s) => a + s.orders, 0), sales: shops.reduce((a, s) => a + (s.sales ?? 0), 0), cancelled: 0 },
  shops,
})

describe('parseSnapshot', () => {
  it('fixture ผ่าน · serialize ไม่มีเบอร์/@', () => {
    const s = mkSnap([mkShop(1, 3, 2)])
    expect(parseSnapshot(JSON.parse(JSON.stringify(s)))).not.toBeNull()
    const j = JSON.stringify(s)
    expect(j).not.toMatch(/0\d{9}/)
    expect(j).not.toMatch(/\d{3}-\d{3}-\d{4}/)
    expect(j).not.toContain('@')
  })
  it.each([
    ['buyerContact ในแถว', (s: any) => { s.shops[0].rows[0].buyerContact = '0812345678' }],
    ['address ในแถว', (s: any) => { s.shops[0].rows[0].address = 'x' }],
    ['orderNo ในแถว', (s: any) => { s.shops[0].rows[0].orderNo = 'A1' }],
    ['ฟิลด์เกินระดับราก', (s: any) => { s.publicToken = 't' }],
    ['ฟิลด์เกินระดับร้าน', (s: any) => { s.shops[0].profit = 1 }],
    ['ขาด title', (s: any) => { delete s.title }],
    ['v ผิด', (s: any) => { s.v = 2 }],
  ])('ปฏิเสธ: %s', (_n, mut) => {
    const s = JSON.parse(JSON.stringify(mkSnap([mkShop(1, 2, 1)])))
    mut(s)
    expect(parseSnapshot(s)).toBeNull()
  })
  it('exposure ปิด: ไม่มี amount/bucket/buckets ก็ผ่าน', () => {
    const s = JSON.parse(JSON.stringify(mkSnap([mkShop(1, 2, 0)])))
    delete s.shops[0].buckets; delete s.shops[0].expense; delete s.total.sales
    s.shops[0].rows.forEach((r: any) => { delete r.amount; delete r.bucket })
    expect(parseSnapshot(s)).not.toBeNull()
  })
})

describe('fitToBudget', () => {
  it('เล็กอยู่แล้ว = เนื้อหาเท่าเดิม', () => {
    const s = mkSnap([mkShop(1, 5, 2)])
    expect(fitToBudget(s)).toEqual(s)
  })
  it('12 ร้าน × 400 แถว × โน้ต 200 ตัว ≤400KB ยอดไม่เปลี่ยน ติดป้ายตัดทอน', () => {
    const s = mkSnap(Array.from({ length: 12 }, (_, i) => mkShop(i, 400, 300)))
    const out = fitToBudget(s)
    expect(Buffer.byteLength(JSON.stringify(out))).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES)
    expect(out.total).toEqual(s.total)
    out.shops.forEach((sh, i) => {
      expect(sh.rows.length).toBeLessThan(400)
      expect(sh.rowsTotal).toBe(400)
      expect(sh.rowsTruncated).toBe(true)
      expect(sh.buckets).toEqual(s.shops[i].buckets)
      expect(sh.sales).toBe(s.shops[i].sales)
      expect(sh.expense!.rowsTotal).toBe(300)
      expect(sh.expense!.rowsTruncated).toBe(true)
    })
    expect(parseSnapshot(out)).not.toBeNull()
  })
})
