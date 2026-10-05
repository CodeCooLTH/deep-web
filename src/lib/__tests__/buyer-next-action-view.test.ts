// [blocker] ส่วนที่ NextActionCard ใช้ (00068 B4-L3): วางการ์ด · สถานะพัสดุ · กล่อง STATUS · หัวกล่องโอน
// ทุกกิ่งนี้เคยเสี่ยงเป็นเทอร์นารีใน JSX ซึ่งเขียนกลับด้านแล้ว tsc/build ไม่จับ (ui-boolean-needs-a-testable-home)
import { describe, it, expect } from 'vitest'
import {
  buildStatusBoxView,
  buildTransferView,
  buyerShipmentStatus,
  planNextActionCards,
  resolveBuyerNextAction,
  STATUS_NO_SHIPPING_COPY,
  STATUS_NO_TRACKING_COPY,
  STATUS_TRACKING_HINT,
  type BuyerNextAction,
} from '../buyer-next-action'
import { deriveShippingStage } from '../order-stage'
import { resolveOrderStatusHeadline } from '../order-status-headline'

const act = (o: Partial<BuyerNextAction>): BuyerNextAction => ({
  primary: 'NONE',
  statusVariant: null,
  transfer: false,
  transferNoAccount: false,
  payoutCard: false,
  pickupCard: false,
  appointmentCard: false,
  ...o,
})

describe('planNextActionCards', () => {
  it('NONE ไม่มี hero · ไม่มีธง = ไม่มีอะไรเลย', () => {
    expect(planNextActionCards(act({}))).toEqual({ hero: null, followUps: [] })
  })
  it('primary ไหน hero ก็เป็นอันนั้น', () => {
    for (const p of ['APPOINTMENT', 'TRANSFER', 'PICKUP', 'SHIPMENT', 'STATUS'] as const) {
      expect(planNextActionCards(act({ primary: p })).hero).toBe(p)
    }
  })
  it('ร้านบริการ: hero นัด + โอนเป็นการ์ดตามติด (ไม่ซ้ำเป็น hero)', () => {
    expect(planNextActionCards(act({ primary: 'APPOINTMENT', transfer: true, appointmentCard: true }))).toEqual({
      hero: 'APPOINTMENT',
      followUps: ['TRANSFER'],
    })
  })
  it('hero โอน + นัดรับ → ข้อมูลนัดรับเป็นการ์ดตามติด (AC-BOP-07-3); โอนไม่ซ้ำ', () => {
    expect(planNextActionCards(act({ primary: 'TRANSFER', transfer: true, pickupCard: true }))).toEqual({
      hero: 'TRANSFER',
      followUps: ['PICKUP'],
    })
  })
  it('hero นัดรับ ไม่มีการ์ดนัดรับซ้ำ · ปิดแล้วการ์ดข้อมูลยังอยู่ (C-4/C-5)', () => {
    expect(planNextActionCards(act({ primary: 'PICKUP', pickupCard: true })).followUps).toEqual([])
    expect(planNextActionCards(act({ primary: 'NONE', payoutCard: true, pickupCard: true, appointmentCard: true }))).toEqual({
      hero: null,
      followUps: ['PAYOUT', 'PICKUP', 'APPOINTMENT'],
    })
  })
  it('เชื่อมกับ resolveBuyerNextAction จริง: PICKUP + โอนยังไม่ยืนยัน', () => {
    const a = resolveBuyerNextAction({
      status: 'PENDING', isServiceShop: false, hasAppointment: false, paymentMethod: 'TRANSFER',
      paymentConfirmedAt: null, fulfillmentMode: 'PICKUP', hasShipment: false, totalAmount: 100,
      outstanding: null, hasPayoutAccount: true,
    })
    expect(planNextActionCards(a)).toEqual({ hero: 'TRANSFER', followUps: ['PICKUP'] })
  })
})

describe('buyerShipmentStatus (R-6 — stage ตัวเดียวป้อนทั้ง headline และ pill)', () => {
  type ShipIn = Parameters<typeof buyerShipmentStatus>[0]
  const base: ShipIn = {
    status: 'SHIPPED', carrierStatus: null, hasShipment: true, paymentMethod: 'TRANSFER',
    fulfillmentMode: 'SHIPPED', problemAt: null,
  }
  const guest = (i: ShipIn) => {
    // อาร์กิวเมนต์เหมือน GuestOrderView ทุกตัว (codReceivedAt: null)
    const stage = deriveShippingStage({ ...i, codReceivedAt: null })
    return { stage, ...resolveOrderStatusHeadline({ status: i.status, stage, hasShipment: i.hasShipment, carrierStatus: i.carrierStatus }) }
  }
  const cases: [string, ShipIn][] = [
    ['ร้านแจ้งส่งเอง', base],
    ['ขนส่งรับของ', { ...base, carrierStatus: 'picked_up' }],
    ['กำลังส่ง', { ...base, carrierStatus: 'in_transit' }],
    ['ส่งถึงแล้ว', { ...base, carrierStatus: 'delivered' }],
    ['มีปัญหา', { ...base, carrierStatus: 'problem', problemAt: '2026-10-01T00:00:00.000Z' }],
    ['ตีกลับ', { ...base, carrierStatus: 'return' }],
    ['ไม่มีพัสดุ', { ...base, hasShipment: false }],
    ['ค่าไม่รู้จัก', { ...base, status: 'ZZZ', carrierStatus: 'ZZZ' }],
  ]
  for (const [name, i] of cases) {
    it(`${name}: ตรงกับจอ guest`, () => {
      const g = guest(i)
      const r = buyerShipmentStatus(i)
      expect([r.stage, r.headline, r.statusPill]).toEqual([g.stage, g.headline, g.statusPill])
    })
  }
  it('ไม่มีพัสดุ → hasShipment=false ไม่มีธงว่าถึงแล้ว', () => {
    const r = buyerShipmentStatus({ ...base, hasShipment: false })
    expect(r.hasShipment).toBe(false)
    expect(r.delivered).toBe(false)
  })
  it('ส่งถึงแล้ว → delivered · กำลังส่ง → ไม่ delivered', () => {
    expect(buyerShipmentStatus({ ...base, carrierStatus: 'delivered' }).delivered).toBe(true)
    expect(buyerShipmentStatus({ ...base, carrierStatus: 'in_transit' }).delivered).toBe(false)
  })
  it('headline กับ pill ไม่ซ้ำกันเอง (ถ้ามี pill ต้องคนละคำกับ headline)', () => {
    for (const [, i] of cases) {
      const r = buyerShipmentStatus(i)
      if (r.statusPill !== null) expect(r.statusPill).not.toBe(r.headline)
    }
  })
})

describe('buildStatusBoxView', () => {
  const base = {
    status: 'PENDING', fulfillmentMode: 'SHIPPED', paymentMethod: 'COD', paymentConfirmedAt: null,
    totalAmount: 1200, serviceMoney: null,
  }
  it('COD: ป้ายวิธีชำระ · ยอด · บรรทัดท้ายเลขพัสดุ — ไม่ใช่ "โอนเข้าบัญชี"', () => {
    const v = buildStatusBoxView({ ...base, variant: 'COD' })
    expect(v.headline).toBe('รอดำเนินการ')
    expect(v.lines).toEqual(['ชำระเมื่อได้รับสินค้า · ฿1,200', STATUS_TRACKING_HINT])
    expect(v.chatCta).toBe(false)
  })
  it('CASH: "เงินสด · ฿…" ห้ามเรียกว่าโอน', () => {
    const v = buildStatusBoxView({ ...base, paymentMethod: 'CASH', variant: 'CASH' })
    expect(v.lines[0]).toBe('เงินสด · ฿1,200')
    expect(v.lines.join()).not.toContain('โอน')
  })
  it('ค่าดิบของร้านที่บอกเกินป้ายต้องไม่ถูกทิ้ง · ที่ซ้ำป้ายไม่โชว์', () => {
    expect(buildStatusBoxView({ ...base, paymentMethod: 'เก็บเงินปลายทาง ใกล้ BTS', variant: 'COD' }).lines)
      .toContain('เก็บเงินปลายทาง ใกล้ BTS')
    expect(buildStatusBoxView({ ...base, paymentMethod: 'CASH', variant: 'CASH' }).lines).toHaveLength(2)
  })
  it('บรรทัดเลขพัสดุไม่ขึ้นเมื่อไม่มีการจัดส่ง', () => {
    expect(buildStatusBoxView({ ...base, fulfillmentMode: 'NO_SHIPPING', variant: 'COD' }).lines).toEqual(['ชำระเมื่อได้รับสินค้า · ฿1,200'])
  })
  it('โอนแล้วร้านยืนยัน (AC-BOP-05-7) → บอกเวลาที่ร้านยืนยัน', () => {
    const v = buildStatusBoxView({ ...base, paymentMethod: 'TRANSFER', paymentConfirmedAt: '2026-10-04T05:30:00.000Z', variant: 'PLAIN' })
    expect(v.headline).toBe('รอดำเนินการ')
    expect(v.lines[0]).toMatch(/^ร้านยืนยันรับเงินแล้วเมื่อ .+2569/)
    expect(v.lines[1]).toBe(STATUS_TRACKING_HINT)
  })
  it('ร้านบริการชำระครบ → "ชำระเงินแล้ว" + ยอดที่ร้านรับ (ไม่ใช่ ฿0 ค้าง)', () => {
    const v = buildStatusBoxView({
      ...base, paymentMethod: 'TRANSFER', variant: 'PLAIN', fulfillmentMode: 'NO_SHIPPING',
      serviceMoney: { totalAmount: 1200, totalReceived: 1200, outstanding: 0 },
    })
    expect(v.headline).toBe('ชำระเงินแล้ว')
    expect(v.lines).toEqual(['ร้านยืนยันรับครบ ฿1,200'])
  })
  it('ยังค้าง → ห้ามขึ้น "ชำระเงินแล้ว"', () => {
    const v = buildStatusBoxView({
      ...base, paymentMethod: 'TRANSFER', variant: 'PLAIN',
      serviceMoney: { totalAmount: 1200, totalReceived: 200, outstanding: 1000 },
    })
    expect(v.headline).not.toBe('ชำระเงินแล้ว')
  })
  it('SHIPPED ไม่มีพัสดุ (AC-BOP-06-6) → บอกตรง ๆ + ปุ่มแชท', () => {
    const v = buildStatusBoxView({ ...base, status: 'SHIPPED', paymentMethod: 'TRANSFER', paymentConfirmedAt: null, variant: 'PLAIN' })
    expect(v.headline).toBe('กำลังจัดส่ง')
    expect(v.lines).toEqual([STATUS_NO_TRACKING_COPY])
    expect(v.chatCta).toBe(true)
  })
  it('ดิจิทัล → บอกว่าไม่มีการจัดส่ง ไม่พูดเรื่องเลขพัสดุ', () => {
    const v = buildStatusBoxView({ ...base, paymentMethod: 'TRANSFER', fulfillmentMode: 'NO_SHIPPING', variant: 'DIGITAL' })
    expect(v.lines).toEqual([STATUS_NO_SHIPPING_COPY])
  })
})

describe('buildTransferView (D-4 / R-3)', () => {
  it('ร้านขายของ: โอน ฿ยอดเต็ม ให้ร้าน', () => {
    expect(buildTransferView({ amountDue: 2400, totalReceived: 0, slipAttached: false })).toEqual({
      title: 'โอน ฿2,400 ให้ร้าน',
      subtitle: 'โอนแล้วแนบสลิปเพื่อแจ้งร้าน',
    })
  })
  it('ร้านบริการรับมัดจำแล้ว → "โอนส่วนที่ค้าง" + ยอดค้าง', () => {
    expect(buildTransferView({ amountDue: 10900, totalReceived: 2000, slipAttached: false }).title).toBe('โอนส่วนที่ค้าง ฿10,900 ให้ร้าน')
  })
  it('ร้านบริการยังไม่รับเงินเลย → ไม่ใช้คำว่า "ส่วนที่ค้าง"', () => {
    expect(buildTransferView({ amountDue: 12900, totalReceived: 0, slipAttached: false }).title).toBe('โอน ฿12,900 ให้ร้าน')
  })
  it('แนบสลิปแล้ว → พูดเฉพาะข้อเท็จจริง ไม่สัญญาแทนร้าน', () => {
    const v = buildTransferView({ amountDue: 2400, totalReceived: 0, slipAttached: true })
    expect(v).toEqual({ title: 'แนบสลิปแล้ว', subtitle: 'ร้านยังไม่ได้ยืนยันรับเงิน' })
    expect(JSON.stringify(v)).not.toMatch(/ตรวจ|ร้านจะ/)
  })
})
