// [blocker] ตารางทุกกิ่งของ resolveBuyerNextAction (00068 B1-U1, SRS TFR-003)
// + 9 เคสของ showSlipZone ที่ย้ายมา (TD-009) — ในที่นี้ "โซนสลิป" = `transfer`
import { describe, it, expect } from 'vitest'
import {
  resolveBuyerNextAction,
  resolveTransferAmount,
  type BuyerNextActionInput,
} from '../buyer-next-action'

const base: BuyerNextActionInput = {
  status: 'PENDING',
  isServiceShop: false,
  hasAppointment: false,
  paymentMethod: 'TRANSFER',
  paymentConfirmedAt: null,
  fulfillmentMode: 'SHIPPED',
  hasShipment: false,
  totalAmount: 500,
  outstanding: null,
  hasPayoutAccount: true,
}
const run = (o: Partial<BuyerNextActionInput>) => resolveBuyerNextAction({ ...base, ...o })
const pick = (o: Partial<BuyerNextActionInput>) => {
  const r = run(o)
  return [r.primary, r.statusVariant, r.transfer, r.payoutCard] as const
}

describe('resolveTransferAmount (D-4)', () => {
  it('ร้านขายของ (null) → ยอดเต็ม · ร้านบริการ → ยอดค้าง · ค้าง 0 ไม่ถูกแทนด้วยยอดเต็ม', () => {
    expect(resolveTransferAmount({ totalAmount: 500, outstanding: null })).toBe(500)
    expect(resolveTransferAmount({ totalAmount: 500, outstanding: 200 })).toBe(200)
    expect(resolveTransferAmount({ totalAmount: 500, outstanding: 0 })).toBe(0)
  })
})

describe('กิ่ง 1: สถานะปิด → NONE', () => {
  for (const status of ['CONFIRMED', 'CANCELLED', 'RETURNED', 'DRAFTED', 'WHATEVER', '']) {
    it(`${status || '(ว่าง)'} → NONE ไม่มีโอน แต่การ์ดบัญชียังอยู่ (P0-2)`, () => {
      expect(pick({ status })).toEqual(['NONE', null, false, true])
    })
  }
  it('ปิดแล้ว + CASH → ไม่มีการ์ดบัญชี', () => {
    expect(pick({ status: 'CANCELLED', paymentMethod: 'CASH' })).toEqual(['NONE', null, false, false])
  })
  it('ปิดแล้วแต่มีนัด/นัดรับ → การ์ดข้อมูลยังอยู่ (C-4)', () => {
    const r = run({ status: 'CANCELLED', hasAppointment: true, fulfillmentMode: 'PICKUP' })
    expect(r.appointmentCard).toBe(true)
    expect(r.pickupCard).toBe(true)
    expect(r.primary).toBe('NONE')
  })
})

describe('กิ่ง 2-3: ร้านบริการ + นัด', () => {
  it('2: ต้องโอน → APPOINTMENT + transfer', () => {
    expect(pick({ isServiceShop: true, hasAppointment: true, outstanding: 300 })).toEqual(['APPOINTMENT', null, true, false])
  })
  it('3: outstanding=0 → APPOINTMENT ไม่มีโอน (D-4: ไม่ใช้ยอดเต็ม)', () => {
    expect(pick({ isServiceShop: true, hasAppointment: true, outstanding: 0 })).toEqual(['APPOINTMENT', null, false, true])
  })
  it('ไม่ใช่ร้านบริการ แม้มีนัด → ไม่ใช่ APPOINTMENT', () => {
    expect(run({ isServiceShop: false, hasAppointment: true }).primary).toBe('TRANSFER')
  })
  it('ร้านบริการไม่มีนัด (walk-in) → ไม่ใช่ APPOINTMENT', () => {
    expect(run({ isServiceShop: true, hasAppointment: false, outstanding: 300 }).primary).toBe('TRANSFER')
  })
  it('D-4: QR/ยอดโอนของร้านบริการใช้ยอดค้าง ไม่ใช่ยอดเต็ม', () => {
    // total 500 แต่ค้าง 0 → ไม่มีโซนโอนเลย
    expect(run({ isServiceShop: true, outstanding: 0 }).transfer).toBe(false)
    expect(run({ isServiceShop: true, outstanding: 1 }).transfer).toBe(true)
  })
})

describe('กิ่ง 4-6: โอน', () => {
  it('4: ร้านขายของ TRANSFER ยังไม่ confirm', () => {
    expect(pick({})).toEqual(['TRANSFER', null, true, false])
  })
  it('5: paymentConfirmedAt มีค่า → ไม่โอน ลงกิ่งถัดไป การ์ดบัญชียังอยู่', () => {
    expect(pick({ paymentConfirmedAt: '2026-10-01T00:00:00Z' })).toEqual(['STATUS', 'PLAIN', false, true])
  })
  it('5b: ยืนยันแล้ว + มีพัสดุ → SHIPMENT', () => {
    expect(pick({ paymentConfirmedAt: '2026-10-01T00:00:00Z', hasShipment: true })).toEqual(['SHIPMENT', null, false, true])
  })
  it('6: PICKUP + TRANSFER → โอนมาก่อน แต่ pickupCard ยังแสดง (ลำดับ TRANSFER ก่อน PICKUP)', () => {
    const r = run({ fulfillmentMode: 'PICKUP' })
    expect(r.primary).toBe('TRANSFER')
    expect(r.pickupCard).toBe(true)
  })
})

describe('กิ่ง 7-9, 12: ไม่ต้องโอน', () => {
  it('7: PICKUP + CASH → PICKUP', () => {
    expect(pick({ fulfillmentMode: 'PICKUP', paymentMethod: 'CASH' })).toEqual(['PICKUP', null, false, false])
  })
  it('7b: PICKUP + โอนที่ confirm แล้ว → PICKUP + การ์ดบัญชี', () => {
    expect(pick({ fulfillmentMode: 'PICKUP', paymentConfirmedAt: 'x' })).toEqual(['PICKUP', null, false, true])
  })
  it('8: COD ไม่มีพัสดุ → STATUS/COD', () => {
    expect(pick({ paymentMethod: 'COD' })).toEqual(['STATUS', 'COD', false, false])
  })
  it('8b: COD มีพัสดุ → SHIPMENT (พัสดุชนะป้ายช่องทางชำระ)', () => {
    expect(pick({ paymentMethod: 'เก็บเงินปลายทาง (COD)', hasShipment: true })[0]).toBe('SHIPMENT')
  })
  it('9: CASH ไม่ใช่ PICKUP → STATUS/CASH', () => {
    expect(pick({ paymentMethod: 'เงินสด' })).toEqual(['STATUS', 'CASH', false, false])
  })
  it('12: ดิจิทัล NO_SHIPPING → STATUS/DIGITAL (โอนที่ confirm แล้ว)', () => {
    expect(pick({ fulfillmentMode: 'NO_SHIPPING', paymentConfirmedAt: 'x' })).toEqual(['STATUS', 'DIGITAL', false, true])
  })
  it('12b: ดิจิทัล + ต้องโอน → TRANSFER ก่อน', () => {
    expect(run({ fulfillmentMode: 'NO_SHIPPING' }).primary).toBe('TRANSFER')
  })
  it('12c: ดิจิทัล COD → COD ชนะ DIGITAL', () => {
    expect(run({ fulfillmentMode: 'NO_SHIPPING', paymentMethod: 'COD' }).statusVariant).toBe('COD')
  })
})

describe('กิ่ง 10-11: SHIPPED', () => {
  it('10: มีพัสดุ → SHIPMENT + การ์ดบัญชี', () => {
    expect(pick({ status: 'SHIPPED', hasShipment: true })).toEqual(['SHIPMENT', null, false, true])
  })
  it('10b: SHIPMENT ต้องเช็ค fulfillmentMode — NO_SHIPPING ที่มี shipment ค้าง ไม่ใช่ SHIPMENT', () => {
    expect(pick({ status: 'SHIPPED', fulfillmentMode: 'NO_SHIPPING', hasShipment: true })).toEqual(['STATUS', 'DIGITAL', false, true])
  })
  it('11: ไม่มีพัสดุ (ร้านส่งเอง) → STATUS/PLAIN', () => {
    expect(pick({ status: 'SHIPPED' })).toEqual(['STATUS', 'PLAIN', false, true])
  })
  it('SHIPPED ไม่เคยเป็น transfer แม้ยังไม่ confirm', () => {
    expect(run({ status: 'SHIPPED' }).transfer).toBe(false)
  })
})

describe('กิ่ง 13-14: paymentMethod null / ยอด 0', () => {
  it('13: paymentMethod=null → needsPay=true → TRANSFER', () => {
    expect(pick({ paymentMethod: null })).toEqual(['TRANSFER', null, true, false])
  })
  it('14: totalAmount=0 → ไม่ใช่ TRANSFER (QR ยอด 0 ไม่มีความหมาย)', () => {
    expect(pick({ totalAmount: 0 })).toEqual(['STATUS', 'PLAIN', false, true])
  })
  it('ยอดติดลบ/NaN → fail-closed ไม่โอน', () => {
    expect(run({ totalAmount: -5 }).transfer).toBe(false)
    expect(run({ totalAmount: NaN }).transfer).toBe(false)
  })
})

// ย้ายจาก order-display.test.ts › showSlipZone (9 เคส) — "โซนสลิป" ⇔ transfer
describe('ย้ายจาก showSlipZone (TD-009)', () => {
  const zone = (status: string, paymentMethod: string | null) => run({ status, paymentMethod }).transfer
  it('PENDING + พร้อมเพย์ → true', () => expect(zone('PENDING', 'พร้อมเพย์ 0812345678')).toBe(true))
  it('PENDING + โอนเงิน → true', () => expect(zone('PENDING', 'โอนเงิน')).toBe(true))
  it('PENDING + null → true', () => expect(zone('PENDING', null)).toBe(true))
  it('PENDING + COD (ไทย) → false', () => expect(zone('PENDING', 'เก็บเงินปลายทาง (COD)')).toBe(false))
  it('PENDING + COD → false', () => expect(zone('PENDING', 'COD')).toBe(false))
  it('SHIPPED + พร้อมเพย์ → false', () => expect(zone('SHIPPED', 'พร้อมเพย์')).toBe(false))
  it('CONFIRMED + โอนเงิน → false', () => expect(zone('CONFIRMED', 'โอนเงิน')).toBe(false))
  it('CANCELLED + โอนเงิน → false', () => expect(zone('CANCELLED', 'โอนเงิน')).toBe(false))
  it('SHIPPED + COD → false', () => expect(zone('SHIPPED', 'COD')).toBe(false))
  // เคสใหม่ (D-5): showSlipZone เดิมตอบ true ให้ CASH
  it('D-5: PENDING + CASH → ไม่มีโซนสลิป', () => {
    expect(zone('PENDING', 'CASH')).toBe(false)
    expect(zone('PENDING', 'เงินสด')).toBe(false)
  })
})

describe('allow-list ของ open (fail-closed)', () => {
  it('สถานะที่ไม่รู้จักไม่ตกเข้ากล่องงานใดเลย แม้ข้อมูลครบทุกกิ่ง', () => {
    for (const status of ['pending', 'PENDING ', 'PAID', 'REFUNDED', 'SOMETHING_NEW']) {
      for (const o of [
        {},
        { isServiceShop: true, hasAppointment: true },
        { fulfillmentMode: 'PICKUP', paymentMethod: 'CASH' },
        { hasShipment: true, paymentMethod: 'COD' },
        { paymentMethod: 'COD' },
      ] as Partial<BuyerNextActionInput>[]) {
        const r = run({ status, ...o })
        expect([r.primary, r.transfer]).toEqual(['NONE', false])
      }
    }
  })
})

describe('[blocker] R-7 transferNoAccount — ต้องโอนแต่ร้านไม่มีบัญชี', () => {
  const r = (o: Partial<BuyerNextActionInput>) => resolveBuyerNextAction({ ...base, ...o })
  it('ต้องโอน + ไม่มีบัญชี = true', () => {
    expect(r({ status: 'PENDING', paymentMethod: 'TRANSFER', hasPayoutAccount: false }).transferNoAccount).toBe(true)
  })
  it('ต้องโอน + มีบัญชี = false', () => {
    expect(r({ status: 'PENDING', paymentMethod: 'TRANSFER', hasPayoutAccount: true }).transferNoAccount).toBe(false)
  })
  it('ไม่ต้องโอน (COD) แม้ไม่มีบัญชี = false', () => {
    expect(r({ status: 'PENDING', paymentMethod: 'COD', hasPayoutAccount: false }).transferNoAccount).toBe(false)
  })
})

