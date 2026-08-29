/**
 * resolveOrderStatusBadge — ป้ายสถานะต้องพูดตรงกับความจริงของพัสดุ
 *
 * เคสต้นเรื่อง (user เจอบน prod 2026-08-06): DP25690853C0FA9B — Order.status=SHIPPED,
 * paymentMethod=COD, codReceivedAt=null, พัสดุ carrierStatus='delivered'
 * → Command Center จัดอยู่กอง "รอเงิน COD" แต่ป้ายในหน้า /orders ขึ้น "กำลังจัดส่ง"
 *
 * เทสชุดนี้ล็อก 3 อย่าง: (1) เคสบั๊กไม่กลับมา (2) CONFIRMED/CANCELLED ห้ามโดนพัสดุทับ
 * (3) ร้านที่ไม่ใช่ ONLINE_SALES ต้องได้ของเดิมเป๊ะทุกฟิลด์
 */
import { describe, it, expect } from 'vitest'
import { resolveOrderStatusBadge, deriveShippingStage } from '../order-stage'
import { ORDER_STATUS_META } from '../order-display'

describe('resolveOrderStatusBadge', () => {
  it('เคสจริง DP25690853C0FA9B — COD ส่งถึงแล้วแต่ยังไม่ได้เงิน = "รอเงิน COD" ไม่ใช่ "กำลังจัดส่ง"', () => {
    // stage มาจาก deriveShippingStage ตัวจริง ไม่ใช่ค่าที่เดาใส่มือ — ถ้าวันหลังนิยาม
    // AWAITING_COD เปลี่ยน เทสนี้ต้องแดงด้วย ไม่ใช่ผ่านไปเงียบ ๆ
    const stage = deriveShippingStage({
      fulfillmentMode: 'SHIPPED',
      status: 'SHIPPED',
      carrierStatus: 'delivered',
      hasShipment: true,
      paymentMethod: 'COD',
      codReceivedAt: null,
    })
    expect(stage).toBe('AWAITING_COD')

    const badge = resolveOrderStatusBadge('SHIPPED', stage)
    expect(badge.label).toBe('รอเงิน COD')
    expect(badge.tone).toBe('warning')
    // Verified-Means-Green: ของถึงแล้วแต่เงินยังไม่เข้า = งานร้านยังไม่จบ ห้ามเขียว
    expect(badge.cls).not.toContain('success')
  })

  it('COD ที่ร้านกดรับเงินแล้ว → "ส่งถึงแล้ว" เขียว', () => {
    const stage = deriveShippingStage({
      fulfillmentMode: 'SHIPPED',
      status: 'SHIPPED',
      carrierStatus: 'delivered',
      hasShipment: true,
      paymentMethod: 'COD',
      codReceivedAt: new Date('2026-08-06T03:03:24Z'),
    })
    expect(stage).toBe('DONE')

    const badge = resolveOrderStatusBadge('SHIPPED', stage)
    expect(badge.label).toBe('ส่งถึงแล้ว')
    expect(badge.tone).toBe('success')
  })

  it('พัสดุยังเดินทางอยู่ → คำเดิม "กำลังจัดส่ง" ไม่เปลี่ยน', () => {
    const badge = resolveOrderStatusBadge('SHIPPED', 'SHIPPING')
    expect(badge.label).toBe(ORDER_STATUS_META.SHIPPED.label)
    expect(badge.tone).toBe('info')
  })

  it('พัสดุมีปัญหา → แดง แม้ Order.status จะเป็น SHIPPED', () => {
    const badge = resolveOrderStatusBadge('SHIPPED', 'PROBLEM')
    expect(badge.label).toBe('พัสดุมีปัญหา')
    expect(badge.tone).toBe('danger')
  })

  it('CONFIRMED ห้ามให้สถานะพัสดุทับ — เขียวของมันแปลว่า "ผู้ซื้อยืนยันเอง" (BR-ISHIP-41)', () => {
    for (const stage of ['AWAITING_COD', 'PROBLEM', 'SHIPPING', 'DONE'] as const) {
      expect(resolveOrderStatusBadge('CONFIRMED', stage)).toEqual(ORDER_STATUS_META.CONFIRMED)
    }
  })

  it('CANCELLED ห้ามให้สถานะพัสดุทับ — เป็นการตัดสินใจเชิงธุรกิจ ไม่ใช่สถานะพัสดุ', () => {
    for (const stage of ['AWAITING_COD', 'PROBLEM', 'DONE'] as const) {
      expect(resolveOrderStatusBadge('CANCELLED', stage)).toEqual(ORDER_STATUS_META.CANCELLED)
    }
  })

  it('ร้านที่ไม่ใช่ ONLINE_SALES (stage=undefined) ได้ของเดิมเป๊ะทุกฟิลด์', () => {
    for (const status of ['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED']) {
      expect(resolveOrderStatusBadge(status, undefined)).toEqual(ORDER_STATUS_META[status])
    }
  })

  it('stage ต้นทาง (ยังไม่เปิดพัสดุ / รอขนส่งมารับ) ไม่ override — "รอดำเนินการ" ครอบคลุมแล้ว', () => {
    expect(resolveOrderStatusBadge('PENDING', 'AWAITING_PARCEL')).toEqual(ORDER_STATUS_META.PENDING)
    expect(resolveOrderStatusBadge('PENDING', 'AWAITING_PICKUP')).toEqual(ORDER_STATUS_META.PENDING)
  })

  it('status ที่ไม่รู้จักต้องคืนป้ายเสมอ ห้ามคืน undefined — ป้ายหายทั้งแถวแย่กว่าป้ายหยาบ', () => {
    const badge = resolveOrderStatusBadge('SOMETHING_NEW', 'AWAITING_COD')
    expect(badge.label).toBeTruthy()
    expect(badge.cls).toBeTruthy()
  })
})
