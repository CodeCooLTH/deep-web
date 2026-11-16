import { describe, expect, it } from 'vitest'
import {
  AD_NONE,
  EMPTY_ORDERS_FILTERS,
  buildAdOptions,
  countActiveFilters,
  matchesOrdersFilters,
  parseOrdersFilters,
  serializeOrdersFilters,
  type FilterableOrder,
  type OrdersFilters,
} from './orders-filter'

const parse = (qs: string, known?: Parameters<typeof parseOrdersFilters>[1]) =>
  parseOrdersFilters(new URLSearchParams(qs), known)
const toQs = (f: OrdersFilters) => new URLSearchParams(serializeOrdersFilters(f)).toString()

const order = (o: Partial<FilterableOrder> = {}): FilterableOrder => ({
  status: 'PENDING',
  orderType: 'PHYSICAL',
  createdAtISO: '2026-11-10T05:00:00.000Z',
  ad: null,
  ...o,
})
const noCourier = () => null

describe('orders-filter URL', () => {
  it('round-trip: serialize แล้ว parse ได้ค่าเดิม ทุกแกน', () => {
    const f: OrdersFilters = {
      status: 'CONFIRMED',
      stage: 'SHIPPING',
      appt: 'NONE',
      fulfillment: 'PICKUP',
      courier: 'Flash',
      date: '2026-11-10',
      type: 'SERVICE',
      ads: ['123', AD_NONE],
    }
    expect(parse(toQs(f))).toEqual(f)
    expect(toQs(EMPTY_ORDERS_FILTERS)).toBe('')
  })

  it('ค่าที่ไม่รู้จัก/รูปร่างผิดถูกทิ้ง ไม่ throw', () => {
    const f = parse('status=x y&stage=NOPE&appt=ZZZ&fulfillment=FAX&date=yesterday&type=ALIEN&ad=abc&ad=12x&ad=<script>')
    expect(f).toEqual(EMPTY_ORDERS_FILTERS)
  })

  it('ad: เก็บเฉพาะเลขล้วน ≤30 หลัก + token none · ซ้ำถูกยุบ', () => {
    expect(parse(`ad=1&ad=1&ad=${'9'.repeat(31)}&ad=none&ad=-5`).ads).toEqual(['1', AD_NONE])
  })

  it('known: สถานะ/ขนส่งที่ร้านไม่มีถูกทิ้ง', () => {
    const known = { status: new Set(['PENDING']), courier: new Set(['Flash']) }
    expect(parse('status=CANCELLED&courier=Kerry', known)).toEqual(EMPTY_ORDERS_FILTERS)
    expect(parse('status=PENDING&courier=Flash', known).courier).toBe('Flash')
  })
})

describe('countActiveFilters (badge)', () => {
  it('โฆษณาหลายตัวนับ 1', () => {
    expect(countActiveFilters({ ...EMPTY_ORDERS_FILTERS, ads: ['1', '2', '3', AD_NONE] })).toBe(1)
  })
  it('นับทีละแกน และตัวกรองว่างเป็น 0', () => {
    expect(countActiveFilters(EMPTY_ORDERS_FILTERS)).toBe(0)
    expect(countActiveFilters({ ...EMPTY_ORDERS_FILTERS, status: 'PENDING', type: 'DIGITAL', date: 'Today' })).toBe(3)
  })
  it('แถวละ N / คำค้น ไม่ใช่ตัวกรอง — URL ที่มี pageSize/q ไม่ทำให้ badge ขึ้น', () => {
    expect(countActiveFilters(parse('q=สมชาย&pageSize=50&rows=20'))).toBe(0)
  })
})

describe('matchesOrdersFilters', () => {
  it('โฆษณา OR ภายในแกน + token none = ไม่มีแอด', () => {
    const a = order({ ad: { adId: '1' } })
    const b = order({ ad: { adId: '2' } })
    const n = order({ ad: null })
    const f = (ads: string[]) => ({ ...EMPTY_ORDERS_FILTERS, ads })
    const pick = (ads: string[]) => [a, b, n].filter((o) => matchesOrdersFilters(o, f(ads), noCourier))
    expect(pick(['1'])).toEqual([a])
    expect(pick(['1', '2'])).toEqual([a, b])
    expect(pick([AD_NONE])).toEqual([n])
    expect(pick(['2', AD_NONE])).toEqual([b, n])
    expect(pick([])).toEqual([a, b, n])
  })

  it('AND ระหว่างแกน', () => {
    const o = order({ status: 'CONFIRMED', ad: { adId: '1' } })
    expect(matchesOrdersFilters(o, { ...EMPTY_ORDERS_FILTERS, status: 'CONFIRMED', ads: ['1'] }, noCourier)).toBe(true)
    expect(matchesOrdersFilters(o, { ...EMPTY_ORDERS_FILTERS, status: 'PENDING', ads: ['1'] }, noCourier)).toBe(false)
  })

  it('ขนส่ง: NONE = ยังไม่มีพัสดุ · ชื่อ = ตรงเป๊ะ', () => {
    const keyOf = (o: FilterableOrder) => (o.status === 'SHIPPED' ? 'Flash' : null)
    const shipped = order({ status: 'SHIPPED' })
    const plain = order()
    const none = { ...EMPTY_ORDERS_FILTERS, courier: 'NONE' }
    const flash = { ...EMPTY_ORDERS_FILTERS, courier: 'Flash' }
    expect(matchesOrdersFilters(plain, none, keyOf)).toBe(true)
    expect(matchesOrdersFilters(shipped, none, keyOf)).toBe(false)
    expect(matchesOrdersFilters(shipped, flash, keyOf)).toBe(true)
    expect(matchesOrdersFilters(plain, flash, keyOf)).toBe(false)
  })

  it('นัด/พัสดุ/วิธีส่งมอบ/ประเภท/วัน', () => {
    const now = new Date('2026-11-10T08:00:00.000Z')
    const o = order({ shippingStage: 'SHIPPING', appointment: { stage: 'BOOKED' }, fulfillmentMode: 'SHIPPED', orderType: 'DIGITAL' })
    const m = (p: Partial<OrdersFilters>) => matchesOrdersFilters(o, { ...EMPTY_ORDERS_FILTERS, ...p }, noCourier, now)
    expect(m({ stage: 'SHIPPING' })).toBe(true)
    expect(m({ stage: 'PROBLEM' })).toBe(false)
    expect(m({ appt: 'NONE' })).toBe(false)
    expect(m({ appt: 'BOOKED' })).toBe(true)
    expect(m({ fulfillment: 'PICKUP' })).toBe(false)
    expect(m({ type: 'DIGITAL' })).toBe(true)
    expect(m({ type: 'SERVICE' })).toBe(false)
    expect(m({ date: 'Today' })).toBe(true)
    expect(m({ date: '2026-11-09' })).toBe(false)
  })
})

describe('buildAdOptions', () => {
  it('เฉพาะแอดที่มีออเดอร์ · เรียงมาก→น้อย · นับ none แยก · ชื่อจากใบล่าสุด', () => {
    const ad = (id: string, title: string | null) => ({ adId: id, adTitle: title, adPhotoFileId: null })
    const { ads, noneCount } = buildAdOptions([
      { createdAtISO: '2026-11-01T00:00:00Z', ad: ad('2', 'เก่า') },
      { createdAtISO: '2026-11-03T00:00:00Z', ad: ad('2', 'ใหม่') },
      { createdAtISO: '2026-11-02T00:00:00Z', ad: ad('1', null) },
      { createdAtISO: '2026-11-02T00:00:00Z', ad: ad('3', 'x') },
      { createdAtISO: '2026-11-02T00:00:00Z', ad: null },
    ])
    expect(ads.map((a) => [a.adId, a.count])).toEqual([['2', 2], ['1', 1], ['3', 1]])
    expect(ads[0].adTitle).toBe('ใหม่')
    expect(noneCount).toBe(1)
  })
})
