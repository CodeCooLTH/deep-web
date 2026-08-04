/**
 * resolveFulfillmentMode — feature 00030 BR-BKU-13
 *
 * เทสตัวนี้เป็น pure unit test โดยตั้งใจ — ไม่ import prisma ไม่เปิด connection ไม่มีคำสั่งใด ๆ
 * ที่แตะข้อมูล (Hard Rule 13). ตรรกะการล็อก NO_SHIPPING ของร้าน SERVICE_QUEUE ถูกสกัดออกมา
 * เป็นฟังก์ชันบริสุทธิ์เพื่อให้พิสูจน์ได้จริงโดยไม่ต้องมีฐานข้อมูลเลย
 */
import { describe, it, expect } from 'vitest'
import { resolveFulfillmentMode } from '@/services/product.service'

describe('resolveFulfillmentMode — ร้าน SERVICE_QUEUE ล็อก NO_SHIPPING (BR-BKU-13)', () => {
  it('ชนะค่าที่ caller ส่งมาเอง — นี่คือหัวใจของกฎ (00028 เขียนเป็น default จึงไม่ได้ล็อกอะไรจริง)', () => {
    expect(
      resolveFulfillmentMode({ shopVertical: 'SERVICE_QUEUE', explicit: 'SHIPPED' }),
    ).toBe('NO_SHIPPING')
  })

  it('ชนะค่าที่ derive จาก product type', () => {
    expect(
      resolveFulfillmentMode({ shopVertical: 'SERVICE_QUEUE', type: 'PHYSICAL' }),
    ).toBe('NO_SHIPPING')
  })

  it('ชนะแม้ส่งมาทั้งคู่พร้อมกัน', () => {
    expect(
      resolveFulfillmentMode({ shopVertical: 'SERVICE_QUEUE', explicit: 'SHIPPED', type: 'PHYSICAL' }),
    ).toBe('NO_SHIPPING')
  })
})

describe('resolveFulfillmentMode — ร้านประเภทอื่นต้องไม่ถูกกระทบ', () => {
  it.each(['ONLINE_SALES', 'LODGING', undefined, 'ค่าเพี้ยนที่ไม่รู้จัก'])(
    'vertical=%s → ค่าที่ caller ส่งมาชนะตามเดิม',
    (vertical) => {
      expect(resolveFulfillmentMode({ shopVertical: vertical, explicit: 'SHIPPED' })).toBe('SHIPPED')
    },
  )

  it('ONLINE_SALES + PHYSICAL ที่ไม่ส่ง explicit → derive เป็น SHIPPED ตาม registry', () => {
    expect(resolveFulfillmentMode({ shopVertical: 'ONLINE_SALES', type: 'PHYSICAL' })).toBe('SHIPPED')
  })

  it('ONLINE_SALES + DIGITAL ที่ไม่ส่ง explicit → derive เป็น NO_SHIPPING ตาม registry', () => {
    expect(resolveFulfillmentMode({ shopVertical: 'ONLINE_SALES', type: 'DIGITAL' })).toBe(
      'NO_SHIPPING',
    )
  })
})

describe('resolveFulfillmentMode — undefined = ไม่แตะค่าเดิม (partial update)', () => {
  it('ไม่ส่งอะไรเลย → undefined ไม่ใช่ค่า default ใด ๆ', () => {
    expect(resolveFulfillmentMode({})).toBeUndefined()
  })

  it('type ที่ไม่รู้จัก + ไม่มี explicit → undefined (ไม่เดาแทน)', () => {
    expect(resolveFulfillmentMode({ type: 'TYPE_ที่ยังไม่มีใน registry' })).toBeUndefined()
  })

  it('LODGING ที่ไม่ส่งอะไรเลย → undefined (ไม่ถูกล็อกเหมือน SERVICE_QUEUE)', () => {
    expect(resolveFulfillmentMode({ shopVertical: 'LODGING' })).toBeUndefined()
  })
})
