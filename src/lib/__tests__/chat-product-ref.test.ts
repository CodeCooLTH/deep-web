import { describe, expect, it } from 'vitest'
import { soloProductRefId } from '../chat-product-ref'

describe('soloProductRefId', () => {
  it('แถวเก่า: productRefId เดี่ยว', () => expect(soloProductRefId('a', [])).toBe('a'))
  it('ส่งออก LINE/Meta: ใบเดียวเก็บเป็น array', () => expect(soloProductRefId(null, ['b'])).toBe('b'))
  it('carousel ≥2 ใบ ไม่ใช่การ์ดใบเดียว', () => expect(soloProductRefId(null, ['a', 'b'])).toBeNull())
  it('ไม่มีอะไรเลย', () => expect(soloProductRefId(null, undefined)).toBeNull())
})
