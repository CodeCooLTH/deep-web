import { describe, expect, it } from 'vitest'
import { buyerNounFor, itemNounFor, orderNounFor } from './api-error-vocab'

describe('api-error-vocab', () => {
  it('SERVICE_QUEUE ได้คำร้านบริการ', () => {
    expect(orderNounFor('SERVICE_QUEUE')).toBe('งานบริการ')
    expect(orderNounFor('SERVICE_QUEUE', 'ออเดอร์')).toBe('งานบริการ')
    expect(buyerNounFor('SERVICE_QUEUE')).toBe('ลูกค้า')
    expect(itemNounFor('SERVICE_QUEUE')).toBe('รายการ')
  })
  it('ONLINE_SALES / LODGING / ไม่รู้ = คำเดิมเป๊ะ', () => {
    for (const v of ['ONLINE_SALES', 'LODGING', undefined, null]) {
      expect(orderNounFor(v)).toBe('คำสั่งซื้อ')
      expect(orderNounFor(v, 'ออเดอร์')).toBe('ออเดอร์')
      expect(buyerNounFor(v)).toBe('ผู้ซื้อ')
      expect(itemNounFor(v)).toBe('สินค้า')
    }
  })
})
