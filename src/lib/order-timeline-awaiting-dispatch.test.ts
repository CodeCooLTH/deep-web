// feature 00080 — ไทม์ไลน์หน้าลูกค้าต้องพูดตรงกับป้ายขั้น "รอจัดส่ง" (HR16)
import { describe, expect, it } from 'vitest'
import { getOrderTimeline } from './order-display'
import { SHIPPING_STAGE_LABEL } from './order-stage'

describe('getOrderTimeline — รอจัดส่ง (ส่งเอง)', () => {
  it('PENDING + ส่งเอง + มีเลข → สั่งซื้อแล้ว · รอจัดส่ง (ปัจจุบัน) · กำลังจัดส่ง', () => {
    const tl = getOrderTimeline('PENDING', 'SHIPPED', 'โอนเงิน', true)
    expect(tl.map((s) => [s.label, s.state])).toEqual([
      ['สั่งซื้อแล้ว', 'done'],
      ['รอจัดส่ง', 'cur'],
      ['กำลังจัดส่ง', 'up'],
    ])
  })

  it('คำของขั้นปัจจุบัน = ป้ายขั้นเดียวกับรายการ/หัวเรื่องพัสดุ', () => {
    expect(getOrderTimeline('PENDING', 'SHIPPED', 'COD', true)[1].label).toBe(SHIPPING_STAGE_LABEL.AWAITING_DISPATCH)
  })

  it('ไม่ใช่ส่งเอง/ยังไม่มีเลข → ไทม์ไลน์ PENDING เดิม', () => {
    expect(getOrderTimeline('PENDING', 'SHIPPED', 'COD', false)[1].label).toBe('รอยืนยัน')
  })

  it('ธงไม่มีผลกับสถานะอื่นและงานที่ไม่ต้องส่ง', () => {
    expect(getOrderTimeline('SHIPPED', 'SHIPPED', 'โอนเงิน', true)).toEqual(getOrderTimeline('SHIPPED', 'SHIPPED', 'โอนเงิน', false))
    expect(getOrderTimeline('PENDING', 'NO_SHIPPING', null, true)).toEqual(getOrderTimeline('PENDING', 'NO_SHIPPING', null, false))
  })
})
