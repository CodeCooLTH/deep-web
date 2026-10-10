/**
 * ป้าย "สินค้า" ใน dictionary (menu.products / vocab.createProductLabel / vocab.firstItemLabel)
 * ต้องตรง PRODUCT_VOCAB เป๊ะ — dictionary ไทยคือสำเนาของ vocab กลาง ถ้าแก้ฝั่งเดียวเมนูกับหน้าจอจะเรียกไม่ตรงกัน
 */
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/dictionaries/th'
import { PRODUCT_VOCAB, applyMenuLocale, sellerMenuItems, flattenSellerMenu } from '@/lib/seller-menu'

describe('th dictionary ตรงกับ PRODUCT_VOCAB', () => {
  for (const v of ['ONLINE_SALES', 'SERVICE_QUEUE', 'LODGING'] as const) {
    it(v, () => {
      expect(th.menu.products[v]).toBe(PRODUCT_VOCAB[v].productNoun)
      expect(th.vocab.createProductLabel[v]).toBe(PRODUCT_VOCAB[v].createProductLabel)
      expect(th.vocab.firstItemLabel[v]).toBe(PRODUCT_VOCAB[v].firstItemLabel)
    })
  }

  it('เมนู /products ผันตาม vertical, ONLINE_SALES คง "สินค้า"', () => {
    const label = (v: string) =>
      flattenSellerMenu(applyMenuLocale(sellerMenuItems, th, v)).find((i) => i.slug === 'seller:products')?.label
    expect(label('ONLINE_SALES')).toBe('สินค้า')
    expect(label('SERVICE_QUEUE')).toBe('บริการและสินค้า')
  })
})
