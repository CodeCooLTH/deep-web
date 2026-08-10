import { describe, it, expect } from 'vitest'
import {
  getLocalityStatus,
  orderNeedsShippingAddress,
  shopShipsGoods,
  toOrderItemShippingKind,
} from './shipping-address-status'

describe('shopShipsGoods — รายการพิมพ์เองแปลว่าต้องจัดส่งไหม (user 2026-08-07)', () => {
  it('ONLINE_SALES ส่งของ', () => expect(shopShipsGoods('ONLINE_SALES')).toBe(true))
  it('SERVICE_QUEUE ไม่ส่งของ — ลูกค้ามาที่ร้าน', () => expect(shopShipsGoods('SERVICE_QUEUE')).toBe(false))
  it('LODGING ไม่ส่งของ — ผู้เข้าพักมาที่ที่พัก', () => expect(shopShipsGoods('LODGING')).toBe(false))

  // fail-safe ไปทางที่เข้มกว่า: ค่าที่ไม่รู้จักต้องยังบังคับที่อยู่ ไม่ใช่ปล่อยผ่านเงียบ ๆ
  it.each([undefined, null, '', 'SOMETHING_NEW'])('ค่าที่ไม่รู้จัก (%s) → ถือว่าส่งของ', (v) => {
    expect(shopShipsGoods(v)).toBe(true)
  })
})

describe('orderNeedsShippingAddress — [blocker] ใบนี้ต้องมีที่อยู่จัดส่งไหม', () => {
  // 🛑 เคสที่ทำให้ฟังก์ชันนี้เกิดขึ้น (user report 2026-08-10 ร้าน BT สุขสวัสดิ์):
  // ร้านคิวงานที่มีสินค้าติดธง SHIPPED ค้างอยู่ ต้องไม่ถูกขอที่อยู่ — ธงบนสินค้าไม่ใช่หลักฐาน
  // ว่าร้านนี้ส่งของ. ถ้าใครย้าย `shipsGoods` กลับไปกั้นแค่กิ่ง CUSTOM เคสนี้จะแดงทันที
  it('[blocker] ร้านไม่ส่งของ + สินค้าติดธง SHIPPED ค้าง → ไม่ต้องมีที่อยู่', () => {
    expect(
      orderNeedsShippingAddress({ shipsGoods: false, salesChannel: 'FACEBOOK', items: ['SHIPPED'] }),
    ).toBe(false)
  })

  it('[blocker] ร้านไม่ส่งของ + รายการพิมพ์เอง → ไม่ต้องมีที่อยู่ (กฎเดิม 2026-08-07 ต้องไม่หาย)', () => {
    expect(
      orderNeedsShippingAddress({ shipsGoods: false, salesChannel: 'LINE', items: ['CUSTOM'] }),
    ).toBe(false)
  })

  it('[blocker] ร้านขายออนไลน์ + สินค้าที่ต้องส่ง + ช่องทางแชท → ต้องมีที่อยู่', () => {
    expect(
      orderNeedsShippingAddress({
        shipsGoods: true,
        salesChannel: 'FACEBOOK',
        items: ['NO_SHIPPING', 'SHIPPED'],
      }),
    ).toBe(true)
  })

  it('[blocker] ร้านขายออนไลน์ + รายการพิมพ์เอง → ต้องมีที่อยู่ (ไม่รู้ว่าของอะไร ให้ประเภทร้านตอบ)', () => {
    expect(
      orderNeedsShippingAddress({ shipsGoods: true, salesChannel: 'OTHER', items: ['CUSTOM'] }),
    ).toBe(true)
  })

  it('[blocker] ขายหน้าร้าน → ไม่ต้องมีที่อยู่ แม้ของทุกชิ้นจะเป็นของที่ต้องส่ง', () => {
    expect(
      orderNeedsShippingAddress({
        shipsGoods: true,
        salesChannel: 'STOREFRONT',
        items: ['SHIPPED', 'CUSTOM'],
      }),
    ).toBe(false)
  })

  it('ตะกร้าว่าง / มีแต่ของที่ไม่ต้องส่ง → ไม่ต้องมีที่อยู่', () => {
    expect(orderNeedsShippingAddress({ shipsGoods: true, salesChannel: 'FACEBOOK', items: [] })).toBe(false)
    expect(
      orderNeedsShippingAddress({ shipsGoods: true, salesChannel: 'FACEBOOK', items: ['NO_SHIPPING'] }),
    ).toBe(false)
  })
})

describe('toOrderItemShippingKind — แปลงแถวในตะกร้าเป็นชนิดเดียวกันทุก call site', () => {
  it('ไม่มี productId = รายการพิมพ์เอง → CUSTOM (ไม่ใช่ NO_SHIPPING)', () => {
    expect(toOrderItemShippingKind(null, undefined)).toBe('CUSTOM')
    expect(toOrderItemShippingKind(undefined, 'SHIPPED')).toBe('CUSTOM')
  })
  it('สินค้าในแคตตาล็อก → ตามธงของมัน', () => {
    expect(toOrderItemShippingKind('p1', 'SHIPPED')).toBe('SHIPPED')
    expect(toOrderItemShippingKind('p1', 'NO_SHIPPING')).toBe('NO_SHIPPING')
  })
  // สินค้าที่หาไม่เจอใน catalog (โหลดไม่ทัน/ถูกลบ) ต้องไม่กลายเป็น "ต้องส่ง" เงียบ ๆ
  it('หาสินค้าไม่เจอ (undefined) → NO_SHIPPING', () => {
    expect(toOrderItemShippingKind('p-หาย', undefined)).toBe('NO_SHIPPING')
  })
})

describe('getLocalityStatus — สถานะที่อยู่จัดส่งบนหน้าจอ', () => {
  it('ฟอร์มว่างสนิท + ยังไม่กดบันทึก → empty (ห้ามขึ้นแดงตั้งแต่ยังไม่กรอกอะไร)', () => {
    const r = getLocalityStatus(undefined)
    expect(r.state).toBe('empty')
    expect(r.hasAnyData).toBe(false)
    expect(r.recommendedGap).toBe(false)
  })

  it('ฟอร์มว่างสนิท + กดบันทึกแล้วไม่ผ่าน → incomplete (ต้องมีสัญญาณบนฟอร์ม ไม่ใช่มีแต่ toast)', () => {
    const r = getLocalityStatus({}, true)
    expect(r.state).toBe('incomplete')
    expect(r.missingRequired).toEqual(['จังหวัด', 'รหัสไปรษณีย์'])
  })

  // เคสที่ทำให้เกิดบั๊ก: วางข้อความ กทม. → ได้ตำบล/อำเภอ แต่ไม่ได้จังหวัด/รหัสไปรษณีย์
  it('มีตำบล/อำเภอ แต่ขาดจังหวัด+รหัสไปรษณีย์ → incomplete ไม่ใช่ "เลือกแล้ว"', () => {
    const r = getLocalityStatus({ subdistrict: 'คลองตัน', district: 'คลองเตย' })
    expect(r.state).toBe('incomplete')
    expect(r.missingRequired).toEqual(['จังหวัด', 'รหัสไปรษณีย์'])
    expect(r.hasAnyData).toBe(true)
  })

  it('ขาดช่องเดียว → บอกเฉพาะช่องนั้น', () => {
    expect(
      getLocalityStatus({ subdistrict: 'บางรัก', district: 'เมือง', province: 'ชลบุรี' }).missingRequired,
    ).toEqual(['รหัสไปรษณีย์'])
    expect(
      getLocalityStatus({ subdistrict: 'บางรัก', district: 'เมือง', postcode: '20000' }).missingRequired,
    ).toEqual(['จังหวัด'])
  })

  it('ครบ 4 ช่อง → complete และไม่มีคำเตือนอะไร', () => {
    const r = getLocalityStatus({
      subdistrict: 'คลองตัน',
      district: 'คลองเตย',
      province: 'กรุงเทพ',
      postcode: '10110',
    })
    expect(r.state).toBe('complete')
    expect(r.missingRequired).toEqual([])
    expect(r.recommendedGap).toBe(false)
  })

  it('มีจังหวัด+รหัสไปรษณีย์ แต่ไม่มีตำบล/อำเภอ → complete (บันทึกได้) พร้อมเตือนไว้เปิดพัสดุ', () => {
    const r = getLocalityStatus({ province: 'กรุงเทพ', postcode: '10110' })
    expect(r.state).toBe('complete')
    expect(r.recommendedGap).toBe(true)
  })

  it('ช่องว่าง/เว้นวรรคล้วน นับเป็นไม่มีค่า', () => {
    const r = getLocalityStatus({ province: '   ', postcode: '10110', subdistrict: 'คลองตัน', district: 'คลองเตย' })
    expect(r.state).toBe('incomplete')
    expect(r.missingRequired).toEqual(['จังหวัด'])
  })

  it('แก้จนครบแล้วลบจังหวัดออก → กลับเป็น incomplete ทันที (ไม่ค้างที่ complete)', () => {
    const complete = getLocalityStatus({
      subdistrict: 'คลองตัน',
      district: 'คลองเตย',
      province: 'กรุงเทพ',
      postcode: '10110',
    })
    expect(complete.state).toBe('complete')
    const after = getLocalityStatus({ subdistrict: 'คลองตัน', district: 'คลองเตย', postcode: '10110' })
    expect(after.state).toBe('incomplete')
  })
})
