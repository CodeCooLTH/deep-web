import { describe, expect, it } from 'vitest'
import { bucketLabels, classifyBucket, ruleOf, toExpenseRow, toOrderRow, type OrderRowInput } from '../detail-snapshot-rows'

const base: OrderRowInput = {
  createdAt: '2026-10-14T03:00:00Z',
  status: 'PENDING',
  serviceClosedAt: null,
  totalAmount: 500,
  buyerName: 'สมชาย ใจดี',
  buyerContact: '0812345678',
  items: [{ name: 'เปลี่ยนน้ำมัน', qty: 1 }],
  room: null,
}
const row = (o: Partial<OrderRowInput>, rule: 'SERVICE' | 'GENERAL' = 'GENERAL') => toOrderRow({ ...base, ...o }, rule)
const fwd = (carrierStatus: string | null) => [{ status: 'CREATED', isDryRun: false, carrierStatus, direction: 'FORWARD' }]

describe('เบอร์ลูกค้า', () => {
  it.each([
    ['0812345678', '•••-•••-678'],
    ['081-234-5678', '•••-•••-678'],
    ['a@b.com', null],
    ['@lineid', null],
    [null, null],
  ])('%s → %s', (c, exp) => {
    expect(row({ buyerContact: c }).phoneMasked).toBe(exp)
  })
  it('serialize ไม่มีเบอร์ดิบ/อีเมล', () => {
    for (const c of ['0812345678', '081-234-5678', 'a@b.com', '@lineid']) {
      const s = JSON.stringify(row({ buyerContact: c }))
      expect(s).not.toMatch(/0\d{9}/)
      expect(s).not.toMatch(/\d{3}-\d{3}-\d{4}/)
      expect(s).not.toContain('@')
    }
  })
})

describe('ชื่อลูกค้า', () => {
  it('ปกติ / ว่าง / ยาวเกิน 60', () => {
    expect(row({}).customerName).toBe('สมชาย ใจดี')
    expect(row({ buyerName: '  ' }).customerName).toBeNull()
    expect(row({ buyerName: null }).customerName).toBeNull()
    expect(row({ buyerName: 'ก'.repeat(100) }).customerName!.length).toBeLessThanOrEqual(60)
  })
  it('ชื่อมีเบอร์/อีเมล → null', () => {
    expect(row({ buyerName: 'สมชาย 0812345678' }).customerName).toBeNull()
    expect(row({ buyerName: 'สมชาย 081-234-5678' }).customerName).toBeNull()
    expect(row({ buyerName: 'x@y.com' }).customerName).toBeNull()
    expect(row({ buyerName: 'ลูกค้า 3 คน' }).customerName).toBe('ลูกค้า 3 คน')
  })
})

describe('ชื่องาน', () => {
  it('0/1/3 items และห้อง', () => {
    expect(row({ items: [] }).title).toBe('รายการ')
    expect(row({ items: [], room: { name: 'ห้อง 101' } }).title).toBe('ห้อง 101')
    expect(row({}).title).toBe('เปลี่ยนน้ำมัน')
    const three = [1, 2, 3].map((n) => ({ name: `ของ${n}`, qty: 1 }))
    expect(row({ items: three }).title).toBe('ของ1 และอีก 2 รายการ')
    expect(row({ items: [{ name: 'ก'.repeat(200), qty: 1 }] }).title.length).toBeLessThanOrEqual(80)
  })
})

describe('classifyBucket — partition ของชุดเดียวกับการ์ด', () => {
  const closed = new Date()
  it('SERVICE แบ่งด้วย serviceClosedAt รวม RETURNED ทั้งสองก้อน', () => {
    expect(classifyBucket({ status: 'PENDING', serviceClosedAt: closed }, 'SERVICE')).toBe(0)
    expect(classifyBucket({ status: 'PENDING', serviceClosedAt: null }, 'SERVICE')).toBe(1)
    // RETURNED ที่ปิดแล้ว: countsAsServiceRevenue จะตัดทิ้ง แต่การ์ดนับ ⇒ ต้องอยู่ก้อน 0
    expect(classifyBucket({ status: 'RETURNED', serviceClosedAt: closed }, 'SERVICE')).toBe(0)
    expect(classifyBucket({ status: 'RETURNED', serviceClosedAt: null }, 'SERVICE')).toBe(1)
  })
  it('GENERAL: CONFIRMED / SHIPPED+carrier รับแล้ว = 0 · ที่เหลือ = 1', () => {
    expect(classifyBucket({ status: 'CONFIRMED', serviceClosedAt: null }, 'GENERAL')).toBe(0)
    expect(classifyBucket({ status: 'PENDING', serviceClosedAt: null }, 'GENERAL')).toBe(1)
    expect(classifyBucket({ status: 'SHIPPED', serviceClosedAt: null, shipments: fwd('delivered') }, 'GENERAL')).toBe(0)
    expect(classifyBucket({ status: 'SHIPPED', serviceClosedAt: null }, 'GENERAL')).toBe(1)
    expect(
      classifyBucket({ status: 'SHIPPED', serviceClosedAt: null, shipments: [{ ...fwd('delivered')[0], direction: 'RETURN' }] }, 'GENERAL'),
    ).toBe(1)
    expect(classifyBucket({ status: 'RETURNED', serviceClosedAt: null }, 'GENERAL')).toBe(1)
  })
  it('ป้ายและ rule', () => {
    expect(bucketLabels('SERVICE')).toEqual(['ปิดงานแล้ว', 'รอปิดงาน'])
    expect(bucketLabels('GENERAL')).toEqual(['ยืนยันแล้ว', 'รอยืนยัน'])
    expect(ruleOf('SERVICE_QUEUE')).toBe('SERVICE')
    expect(ruleOf('ONLINE_SALES')).toBe('GENERAL')
    expect(ruleOf(null)).toBe('GENERAL')
  })
  it('toOrderRow ใส่ bucket และ axis ตามแกนการ์ด', () => {
    expect(row({ status: 'RETURNED', serviceClosedAt: new Date() }, 'SERVICE')).toMatchObject({ bucket: 0, axis: 'RETURNED' })
    expect(row({ status: 'RETURNED' })).toMatchObject({ axis: 'RETURNED', bucket: 1 })
    expect(row({ status: 'SHIPPED', shipments: fwd('delivered') })).toMatchObject({ axis: 'CONFIRMED', bucket: 0 })
    expect(row({ status: 'SHIPPED' })).toMatchObject({ axis: 'PENDING', bucket: 1 })
    expect(row({ status: 'CONFIRMED' }).axis).toBe('CONFIRMED')
    expect(row({ status: 'PENDING' }).axis).toBe('PENDING')
  })
})

describe('toExpenseRow', () => {
  it('โน้ต ≤200 ต่อ … · ว่าง = null · หมวดภาษาไทย', () => {
    const r = toExpenseRow({ date: '2026-10-14T00:00:00Z', category: 'RENT', amount: 100, note: 'ก'.repeat(300) })
    expect(r.note).toBe(`${'ก'.repeat(200)}…`)
    expect(r.category).toBe('ค่าเช่า')
    expect(toExpenseRow({ date: '2026-10-14', category: 'RENT', amount: 1, note: '  ' }).note).toBeNull()
    expect(toExpenseRow({ date: '2026-10-14', category: 'RENT', amount: 1, note: 'ก'.repeat(200) }).note).toBe('ก'.repeat(200))
    expect(toExpenseRow({ date: '2026-10-14', category: 'X', amount: 1, note: null, system: true })).toMatchObject({ category: 'X', system: true })
  })
})

describe('security L-2: โน้ตค่าใช้จ่ายปิดเบอร์/อีเมล', () => {
  it('ปิดเบอร์ 10 หลัก · มีขีด · อีเมล · คงตัวเลขสั้น', () => {
    const n = (note: string) => toExpenseRow({ date: '2026-10-14', category: 'OTHER', amount: 1, note }).note
    expect(n('โทร 0812345678 ค่าน้ำมัน')).toBe('โทร ••• ค่าน้ำมัน')
    expect(n('จ่าย 081-234-5678')).toBe('จ่าย •••')
    expect(n('ส่งบิล a@b.com')).toBe('ส่งบิล •••')
    expect(n('ค่าน้ำมัน 500 บาท 2 ถัง')).toBe('ค่าน้ำมัน 500 บาท 2 ถัง')
  })
})
