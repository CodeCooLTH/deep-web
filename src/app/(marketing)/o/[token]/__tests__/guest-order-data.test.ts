/**
 * [blocker] ข้อมูลที่ guest เห็นต้องไม่มี PII ดิบหลุดออกไป — feature 00041 (BR-BOE-01/04)
 *
 * D-1 เปิดให้ "ใครก็ตามที่ถือลิงก์" เห็นออเดอร์ได้ ⇒ ไฟล์นี้คือขอบเขตที่ user ยอมรับความเสี่ยงไว้
 * ถ้ามีฟิลด์หลุดเกินจากนี้ มติ D-1 จะกลายเป็นการเปิดเผยเต็มโดยไม่มีใครตั้งใจ
 *
 * เทสตรวจถึงระดับ **ค่าที่อยู่ใน object จริง** ไม่ใช่แค่ชื่อ key — เพราะ key ที่ชื่อถูกต้อง
 * แต่ใส่ค่าดิบเข้าไปก็รั่วเหมือนกัน
 *
 * 🛑 แดง = ห้าม merge
 */

import { describe, it, expect } from 'vitest'
import { buildGuestOrderData } from '../guest-order-data'

const RAW_PHONE = '0812345891'
const RAW_ADDR = {
  line1: '45 ถ.สุขุมวิท',
  subdistrict: 'บางปูใหม่',
  district: 'เมืองสมุทรปราการ',
  province: 'สมุทรปราการ',
  postcode: '10280',
  note: 'ฝากไว้หน้าบ้าน โทร 0899999999',
}

function makeOrder(over: Record<string, unknown> = {}) {
  return {
    publicToken: 'tok_1',
    status: 'SHIPPED',
    createdAt: new Date('2026-08-08T03:00:00.000Z'),
    totalAmount: 1290,
    buyerContact: RAW_PHONE,
    shippingAddress: RAW_ADDR,
    paymentMethod: 'COD',
    items: [
      {
        id: 'it_1',
        name: 'ผ้าเบรกหน้า',
        description: 'ลูกค้าคุณสมชาย ต่อรองเหลือ 600 อย่าบอกคนอื่น',
        qty: 2,
        price: 320,
        product: { images: ['f1.jpg'] },
      },
    ],
    shop: {
      shopName: 'ร้านทดสอบ',
      user: { displayName: 'เจ้าของร้าน', username: 'shop1', trustScore: 26, avatar: null },
    },
    shipmentTracking: null,
    shipments: [
      { trackingNo: 'TH01', courierName: 'Flash', courierCode: 'FLE', carrierStatus: 'in_transit' },
    ],
    ...over,
  } as never
}

describe('buildGuestOrderData', () => {
  it('เบอร์ถูก mask — ค่าดิบต้องไม่ปรากฏที่ไหนใน payload เลย', () => {
    const out = buildGuestOrderData(makeOrder(), 1)

    expect(out.maskedPhone).toBe('•••-•••-891')
    expect(JSON.stringify(out)).not.toContain(RAW_PHONE)
  })

  it('ที่อยู่ถูก mask — จังหวัดเต็ม ท่อนอื่นไม่มีค่าดิบหลุด', () => {
    const out = buildGuestOrderData(makeOrder(), 1)

    expect(out.maskedShippingAddress?.province).toBe('สมุทรปราการ')
    const json = JSON.stringify(out)
    expect(json).not.toContain('45 ถ.สุขุมวิท')
    expect(json).not.toContain('บางปูใหม่')
    expect(json).not.toContain('10280')
  })

  // note มักมีเบอร์สำรอง/จุดสังเกตที่ระบุตัวตนได้ — ห้ามหลุดเด็ดขาด
  it('note ของที่อยู่ไม่หลุดออกไปเลย', () => {
    const out = buildGuestOrderData(makeOrder(), 1)
    expect(JSON.stringify(out)).not.toContain('ฝากไว้หน้าบ้าน')
    expect(JSON.stringify(out)).not.toContain('0899999999')
  })

  // description ของ item เป็น free-text ที่ร้านพิมพ์เอง เคยมีเคสใส่ข้อมูลเฉพาะลูกค้ารายนั้น
  it('description ของรายการสินค้าไม่ถูกส่งไปให้ guest', () => {
    const out = buildGuestOrderData(makeOrder(), 1)
    expect(JSON.stringify(out)).not.toContain('ต่อรองเหลือ 600')
    expect(out.items[0]).not.toHaveProperty('description')
  })

  it('ไม่มีฟิลด์นอก allow-list ติดมา', () => {
    const out = buildGuestOrderData(makeOrder(), 1)
    expect(Object.keys(out).sort()).toEqual(
      [
        'carrierStatus',
        'createdAtIso',
        'items',
        'maskedPhone',
        'maskedShippingAddress',
        'maxVerifyLevel',
        'paymentMethod',
        'publicToken',
        'shipmentTracking',
        'shop',
        'status',
        'totalAmount',
      ].sort(),
    )
  })

  it('ไม่ส่งสลิป/ผู้ซื้อ/ลิงก์เข้าถึง ที่เป็นของเจ้าของออเดอร์เท่านั้น', () => {
    const out = buildGuestOrderData(
      makeOrder({ slipFileId: 'slip_1', accessUrl: 'https://secret', buyerName: 'สมชาย' }),
      1,
    )
    const json = JSON.stringify(out)
    expect(json).not.toContain('slip_1')
    expect(json).not.toContain('https://secret')
    expect(json).not.toContain('สมชาย')
  })

  it('ไม่มีเบอร์ (null) → maskedPhone เป็น null ไม่ใช่สตริงว่าง', () => {
    const out = buildGuestOrderData(makeOrder({ buyerContact: null }), 1)
    expect(out.maskedPhone).toBeNull()
  })

  it('ไม่มีที่อยู่ (NO_SHIPPING) → maskedShippingAddress เป็น null', () => {
    const out = buildGuestOrderData(makeOrder({ shippingAddress: null }), 1)
    expect(out.maskedShippingAddress).toBeNull()
  })

  it('carrierStatus ส่งต่อไปให้คำนวณ stage ได้ (BR-BOE-12)', () => {
    expect(buildGuestOrderData(makeOrder(), 1).carrierStatus).toBe('in_transit')
  })
})
