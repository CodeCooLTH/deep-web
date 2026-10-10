import { describe, expect, it } from 'vitest'
import { chatCardPreview, chatItemLabel, chatSoldLine } from '../chat-vocab'

describe('chat-vocab', () => {
  it('ร้านขายออนไลน์/ที่พัก/ค่าไม่รู้จัก ได้คำเดิมเป๊ะ', () => {
    for (const v of ['ONLINE_SALES', 'LODGING', 'X', null, undefined]) {
      expect(chatItemLabel(v)).toBe('สินค้า')
      expect(chatCardPreview('ORDER', v)).toBe('[คำสั่งซื้อ]')
      expect(chatCardPreview('PRODUCT', v)).toBe('[สินค้า]')
      expect(chatSoldLine(v, '3')).toBe('สั่งซื้อแล้ว 3 ชิ้น')
    }
  })
  it('ร้านบริการได้คำบริการ', () => {
    expect(chatItemLabel('SERVICE_QUEUE')).toBe('บริการ')
    expect(chatCardPreview('ORDER', 'SERVICE_QUEUE')).toBe('[บริการ]')
    expect(chatCardPreview('PRODUCT', 'SERVICE_QUEUE')).toBe('[บริการ]')
    expect(chatSoldLine('SERVICE_QUEUE', '3')).toBe('ใช้บริการแล้ว 3 ครั้ง')
  })
})
