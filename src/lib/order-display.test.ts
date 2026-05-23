// order-display.test.ts — Vitest unit tests สำหรับ getStatusPill และ getOrderTimeline
// ครอบ 7 combinations ที่ Controller กำหนด + กรณีเพิ่มเติม

import { describe, it, expect } from 'vitest'
import { getStatusPill, getOrderTimeline } from './order-display'

// palette snapshot ใช้ตรวจ bg/text/dot จาก spec §2
const P = {
  pend: { bg: '#FEF3E2', text: '#92400E', dot: '#D97706' },
  ship: { bg: '#E7F1FE', text: '#1E40AF', dot: '#2563EB' },
  succ: { bg: '#E7F6F0', text: '#065F46', dot: '#059669' },
  canc: { bg: '#F1F5F9', text: '#475569', dot: '#94A3B8' },
}

// -------------------------------------------------------------------------
// getStatusPill
// -------------------------------------------------------------------------
describe('getStatusPill', () => {
  it('PENDING transfer physical → label รอชำระเงิน + pend palette', () => {
    const pill = getStatusPill('PENDING', 'SHIPPED', 'โอนเงิน')
    expect(pill.label).toBe('รอชำระเงิน')
    expect(pill.bg).toBe(P.pend.bg)
    expect(pill.text).toBe(P.pend.text)
    expect(pill.dot).toBe(P.pend.dot)
  })

  it('PENDING COD physical → label รอดำเนินการ + pend palette', () => {
    const pill = getStatusPill('PENDING', 'SHIPPED', 'COD')
    expect(pill.label).toBe('รอดำเนินการ')
    expect(pill.bg).toBe(P.pend.bg)
  })

  it('PENDING COD ภาษาไทย (เก็บเงินปลายทาง) → รอดำเนินการ', () => {
    const pill = getStatusPill('PENDING', 'SHIPPED', 'เก็บเงินปลายทาง')
    expect(pill.label).toBe('รอดำเนินการ')
  })

  it('PENDING COD ภาษาไทย (ชำระปลายทาง) → รอดำเนินการ', () => {
    const pill = getStatusPill('PENDING', 'SHIPPED', 'ชำระปลายทาง')
    expect(pill.label).toBe('รอดำเนินการ')
  })

  it('PENDING digital (NO_SHIPPING) → label ส่งมอบแล้ว + ship palette', () => {
    const pill = getStatusPill('PENDING', 'NO_SHIPPING', null)
    expect(pill.label).toBe('ส่งมอบแล้ว')
    expect(pill.bg).toBe(P.ship.bg)
    expect(pill.text).toBe(P.ship.text)
    expect(pill.dot).toBe(P.ship.dot)
  })

  it('SHIPPED physical → label กำลังจัดส่ง + ship palette', () => {
    const pill = getStatusPill('SHIPPED', 'SHIPPED', 'โอนเงิน')
    expect(pill.label).toBe('กำลังจัดส่ง')
    expect(pill.bg).toBe(P.ship.bg)
  })

  it('CONFIRMED physical → label สำเร็จแล้ว + succ palette', () => {
    const pill = getStatusPill('CONFIRMED', 'SHIPPED', 'โอนเงิน')
    expect(pill.label).toBe('สำเร็จแล้ว')
    expect(pill.bg).toBe(P.succ.bg)
    expect(pill.text).toBe(P.succ.text)
    expect(pill.dot).toBe(P.succ.dot)
  })

  it('CONFIRMED digital → label สำเร็จแล้ว + succ palette', () => {
    const pill = getStatusPill('CONFIRMED', 'NO_SHIPPING', undefined)
    expect(pill.label).toBe('สำเร็จแล้ว')
    expect(pill.bg).toBe(P.succ.bg)
  })

  it('CANCELLED → label ยกเลิกแล้ว + canc palette', () => {
    const pill = getStatusPill('CANCELLED', 'SHIPPED', 'โอนเงิน')
    expect(pill.label).toBe('ยกเลิกแล้ว')
    expect(pill.bg).toBe(P.canc.bg)
    expect(pill.text).toBe(P.canc.text)
    expect(pill.dot).toBe(P.canc.dot)
  })
})

// -------------------------------------------------------------------------
// getOrderTimeline
// -------------------------------------------------------------------------
describe('getOrderTimeline', () => {
  it('PENDING transfer physical → step[0] done, step[1] รอชำระเงิน/cur, step[2] จัดส่ง/up', () => {
    const tl = getOrderTimeline('PENDING', 'SHIPPED', 'พร้อมเพย์')
    expect(tl).toHaveLength(3)
    expect(tl[0]).toEqual({ label: 'สั่งซื้อแล้ว', state: 'done' })
    expect(tl[1]).toEqual({ label: 'รอชำระเงิน', state: 'cur' })
    expect(tl[2]).toEqual({ label: 'จัดส่ง', state: 'up' })
  })

  it('PENDING COD physical → step[1] รอยืนยัน/cur', () => {
    const tl = getOrderTimeline('PENDING', 'SHIPPED', 'COD')
    expect(tl[1]).toEqual({ label: 'รอยืนยัน', state: 'cur' })
    expect(tl[2]).toEqual({ label: 'จัดส่ง', state: 'up' })
  })

  it('PENDING digital (NO_SHIPPING) → [สั่งซื้อแล้ว/done, ส่งมอบแล้ว/cur, ยืนยันรับ/up]', () => {
    const tl = getOrderTimeline('PENDING', 'NO_SHIPPING', null)
    expect(tl).toEqual([
      { label: 'สั่งซื้อแล้ว', state: 'done' },
      { label: 'ส่งมอบแล้ว',  state: 'cur'  },
      { label: 'ยืนยันรับ',    state: 'up'   },
    ])
  })

  it('SHIPPED physical → [ยืนยันแล้ว/done, กำลังจัดส่ง/cur, ได้รับสินค้า/up]', () => {
    const tl = getOrderTimeline('SHIPPED', 'SHIPPED', 'โอนเงิน')
    expect(tl).toEqual([
      { label: 'ยืนยันแล้ว',   state: 'done' },
      { label: 'กำลังจัดส่ง',  state: 'cur'  },
      { label: 'ได้รับสินค้า',  state: 'up'   },
    ])
  })

  it('CONFIRMED physical → [ยืนยันแล้ว/done, จัดส่งแล้ว/done, ได้รับแล้ว/fin]', () => {
    const tl = getOrderTimeline('CONFIRMED', 'SHIPPED', 'โอนเงิน')
    expect(tl).toEqual([
      { label: 'ยืนยันแล้ว', state: 'done' },
      { label: 'จัดส่งแล้ว', state: 'done' },
      { label: 'ได้รับแล้ว', state: 'fin'  },
    ])
  })

  it('CONFIRMED digital → [สั่งซื้อแล้ว/done, ส่งมอบแล้ว/done, ได้รับแล้ว/fin]', () => {
    const tl = getOrderTimeline('CONFIRMED', 'NO_SHIPPING', undefined)
    expect(tl).toEqual([
      { label: 'สั่งซื้อแล้ว', state: 'done' },
      { label: 'ส่งมอบแล้ว',   state: 'done' },
      { label: 'ได้รับแล้ว',    state: 'fin'  },
    ])
  })

  it('CANCELLED physical → [สั่งซื้อแล้ว/done, ยกเลิก/cx, จัดส่ง/mute]', () => {
    const tl = getOrderTimeline('CANCELLED', 'SHIPPED', 'โอนเงิน')
    expect(tl).toEqual([
      { label: 'สั่งซื้อแล้ว', state: 'done' },
      { label: 'ยกเลิก',       state: 'cx'   },
      { label: 'จัดส่ง',       state: 'mute' },
    ])
  })

  it('CANCELLED digital → step[2] ยืนยันรับ/mute (ไม่ใช่ จัดส่ง)', () => {
    const tl = getOrderTimeline('CANCELLED', 'NO_SHIPPING', null)
    expect(tl[2]).toEqual({ label: 'ยืนยันรับ', state: 'mute' })
  })

  it('ทุก path คืน array ความยาว 3 เสมอ', () => {
    const cases: Parameters<typeof getOrderTimeline>[] = [
      ['PENDING',   'SHIPPED',     'โอนเงิน'],
      ['PENDING',   'SHIPPED',     'COD'],
      ['PENDING',   'NO_SHIPPING', null],
      ['SHIPPED',   'SHIPPED',     'โอนเงิน'],
      ['CONFIRMED', 'SHIPPED',     'โอนเงิน'],
      ['CONFIRMED', 'NO_SHIPPING', undefined],
      ['CANCELLED', 'SHIPPED',     'โอนเงิน'],
      ['CANCELLED', 'NO_SHIPPING', null],
    ]
    for (const [s, f, p] of cases) {
      expect(getOrderTimeline(s, f, p)).toHaveLength(3)
    }
  })
})
