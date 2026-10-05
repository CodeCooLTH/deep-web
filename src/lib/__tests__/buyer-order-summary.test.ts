import { describe, expect, it } from 'vitest'
import { buildShopSummaryLine, buildSlipMoneyView, resolveStampLabel } from '@/lib/buyer-order-summary'

describe('buildShopSummaryLine', () => {
  it('[blocker] 4 เคส: ทั้งคู่ / มีแต่ออเดอร์ / มีแต่คะแนน / ไม่มีเลย', () => {
    expect(buildShopSummaryLine({ avgRating: 4.7, completedOrders: 38 })).toBe('4.7 ดาว · ออเดอร์สำเร็จ 38 ครั้ง')
    expect(buildShopSummaryLine({ avgRating: null, completedOrders: 38 })).toBe('ออเดอร์สำเร็จ 38 ครั้ง')
    expect(buildShopSummaryLine({ avgRating: 4.7, completedOrders: null })).toBe('4.7 ดาว')
    expect(buildShopSummaryLine({ avgRating: null, completedOrders: null })).toBeNull()
  })
  it('[blocker] null/≤0 ห้ามกลายเป็น "0 ดาว"', () => {
    for (const r of [null, 0, -1, NaN]) {
      expect(buildShopSummaryLine({ avgRating: r, completedOrders: 5 })).toBe('ออเดอร์สำเร็จ 5 ครั้ง')
      expect(buildShopSummaryLine({ avgRating: r, completedOrders: null })).toBeNull()
    }
  })
  it('[blocker] completedOrders null/0 ไม่เขียน "ครั้ง" (null = ไม่รู้ · 0 = มติ D-11)', () => {
    expect(buildShopSummaryLine({ avgRating: 4, completedOrders: null })).not.toMatch(/ครั้ง/)
    expect(buildShopSummaryLine({ avgRating: null, completedOrders: 0 })).toBeNull()
    expect(buildShopSummaryLine({ avgRating: 4.5, completedOrders: 0 })).toBe('4.5 ดาว')
    // ขอบ: 1 ต้องยังแสดง (กัน mutation > 1)
    expect(buildShopSummaryLine({ avgRating: null, completedOrders: 1 })).toBe('ออเดอร์สำเร็จ 1 ครั้ง')
  })
  it('4 → "4.0" · ปัดทศนิยม 1 ตำแหน่ง · คั่นหลักพัน', () => {
    expect(buildShopSummaryLine({ avgRating: 4, completedOrders: 1234 })).toBe('4.0 ดาว · ออเดอร์สำเร็จ 1,234 ครั้ง')
  })
})

const money = (o: Partial<NonNullable<Parameters<typeof buildSlipMoneyView>[0]['money']>> = {}) => ({
  totalAmount: 12900,
  depositAgreed: 2000,
  depositReceived: 0,
  outstanding: 12900,
  hasDeposit: true,
  ...o,
})
const view = (o: Partial<Parameters<typeof buildSlipMoneyView>[0]> = {}) =>
  buildSlipMoneyView({ totalAmount: 2400, status: 'PENDING', paymentConfirmedAt: null, paymentMethod: 'TRANSFER', money: null, ...o })

describe('buildSlipMoneyView', () => {
  it('[blocker] totalLabel: "ยอดที่ต้องชำระ" เฉพาะ PENDING + ไม่มี money + ร้านยังไม่ยืนยันรับ', () => {
    expect(view().totalLabel).toBe('ยอดที่ต้องชำระ')
    expect(view({ status: 'SHIPPED' }).totalLabel).toBe('ยอดรวม')
    expect(view({ status: 'CONFIRMED' }).totalLabel).toBe('ยอดรวม')
    expect(view({ money: money() }).totalLabel).toBe('ยอดรวม')
    expect(view({ paymentConfirmedAt: '2026-10-01T00:00:00Z' }).totalLabel).toBe('ยอดรวม')
  })
  it('[blocker] paidChip: ร้านไม่ใช่บริการ + ร้านยืนยันรับแล้ว เท่านั้น · ห้าม "ชำระแล้ว"', () => {
    const v = view({ paymentConfirmedAt: new Date() })
    expect(v.paidChip).toBe('ร้านยืนยันรับเงินแล้ว')
    expect(v.paidChip).not.toMatch(/ชำระแล้ว/)
    expect(view().paidChip).toBeNull()
    expect(view({ paymentConfirmedAt: null }).paidChip).toBeNull()
  })
  it('[blocker] CANCELLED ไม่มี paidChip (R-5)', () => {
    expect(view({ status: 'CANCELLED', paymentConfirmedAt: new Date() }).paidChip).toBeNull()
    expect(view({ status: 'CONFIRMED', paymentConfirmedAt: new Date() }).paidChip).not.toBeNull()
  })

  it('[blocker] COD ไม่มี paidChip แม้มี paymentConfirmedAt — ตรงกับ getPaymentBadge', () => {
    expect(view({ paymentMethod: 'COD', paymentConfirmedAt: new Date() }).paidChip).toBeNull()
  })

  it('[blocker] ร้านบริการ (money != null) ไม่มี paidChip แม้มี paymentConfirmedAt', () => {
    expect(view({ money: money(), paymentConfirmedAt: new Date() }).paidChip).toBeNull()
  })
  it('[blocker] serviceLines เป็น null เมื่อไม่ใช่ร้านบริการ', () => {
    expect(view({ paymentConfirmedAt: new Date() }).serviceLines).toBeNull()
  })
  it('[blocker] มัดจำยังไม่ได้รับ ⇒ ไม่มีป้าย "ร้านยืนยันรับแล้ว" และ received=false', () => {
    const d = view({ money: money({ depositReceived: 0 }) }).serviceLines!.deposit!
    expect(d).toEqual({ amount: 2000, received: false, label: 'มัดจำที่ตกลงไว้' })
  })
  it('[blocker] มัดจำรับแล้ว ⇒ ป้ายรับแล้ว + ยอดที่รับจริง', () => {
    const l = view({ money: money({ depositReceived: 2000, outstanding: 10900 }) }).serviceLines!
    expect(l.deposit).toEqual({ amount: 2000, received: true, label: 'ร้านยืนยันรับแล้ว' })
    expect(l.total).toBe(12900)
    expect(l.outstanding).toBe(10900)
    expect(l.outstandingLabel).toBe('ยังค้างชำระ')
  })
  it('รับมัดจำน้อยกว่าที่ตกลง ⇒ แสดงยอดที่รับจริง ไม่ใช่ยอดที่ตกลง', () => {
    const d = view({ money: money({ depositReceived: 500 }) }).serviceLines!.deposit!
    expect(d.amount).toBe(500)
    expect(d.received).toBe(true)
  })
  it('ไม่มีมัดจำ ⇒ deposit เป็น null · ยอดค้าง 0 คือ 0 จริง', () => {
    const l = view({ money: money({ hasDeposit: false, depositAgreed: 0, outstanding: 0 }) }).serviceLines!
    expect(l.deposit).toBeNull()
    expect(l.outstanding).toBe(0)
  })
})

describe('buildSlipMoneyView — total / settled (B4-L1)', () => {
  it('[blocker] total = totalAmount ที่ส่งเข้า ทั้งร้านขายของและร้านบริการ', () => {
    expect(view().total).toBe(2400)
    expect(view({ totalAmount: 0 }).total).toBe(0)
    expect(view({ totalAmount: 12900, money: money() }).total).toBe(12900)
  })
  it('[blocker] R-9 ชำระครบ ⇒ settled + ป้าย "ชำระเงินแล้ว" (ไม่ใช่ "ยังค้างชำระ")', () => {
    const l = view({ money: money({ depositReceived: 12900, outstanding: 0 }) }).serviceLines!
    expect(l.settled).toBe(true)
    expect(l.outstandingLabel).toBe('ชำระเงินแล้ว')
  })
  it('[blocker] ยังค้าง 1 บาท ⇒ ไม่ settled (ขอบ outstanding)', () => {
    const l = view({ money: money({ outstanding: 1 }) }).serviceLines!
    expect(l.settled).toBe(false)
    expect(l.outstandingLabel).toBe('ยังค้างชำระ')
  })
  it('[blocker] บิลยอด 0 ห้าม settled (ไม่อ้างว่าชำระแล้ว)', () => {
    const l = view({ money: money({ totalAmount: 0, outstanding: 0, hasDeposit: false }) }).serviceLines!
    expect(l.settled).toBe(false)
    expect(l.outstandingLabel).toBe('ยังค้างชำระ')
  })
})

describe('resolveStampLabel', () => {
  it('[blocker] ผู้ซื้อกดเอง ผันตามประเภทร้าน · ทางอื่น = "สำเร็จ"', () => {
    expect(resolveStampLabel(true, false)).toBe('ได้รับแล้ว')
    expect(resolveStampLabel(true, true)).toBe('รับบริการแล้ว')
    expect(resolveStampLabel(false, false)).toBe('สำเร็จ')
    expect(resolveStampLabel(false, true)).toBe('สำเร็จ')
  })
})
