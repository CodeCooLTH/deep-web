import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  countsAsCustomerOrder,
  summarizeCustomerBehavior,
  customerBadges,
  hasBehaviorWarning,
  type CustomerOrderEvidence,
} from '@/lib/customer-behavior'
import { matchesCustomerFilter } from '@/lib/customer-directory'
import { th } from '@/i18n/dictionaries/th'

/**
 * 00078 S-5/S-6 (TC-040..052) — ตัวนับกลาง `counted`
 * mutation: ถอดการตัดทีละตัว (DRAFTED/ตีกลับ/NO_SHOW/RETURNED/CANCELLED) ⇒ เคสของตัวนั้นต้องแดง
 */
const ev = (o: Partial<CustomerOrderEvidence> = {}): CustomerOrderEvidence => ({
  status: 'CONFIRMED',
  cancelInitiator: null,
  cancelReason: null,
  activeShipmentCarrierStatus: null,
  appointmentStatus: null,
  ...o,
})
const copy = { ...th.inbox.customerPanel, regularTip: th.chatSignals.customerRegularTip }

describe('[blocker] countsAsCustomerOrder — ใบไหนไม่นับ', () => {
  it('ใบปกติ/ส่งแล้ว นับ', () => {
    expect(countsAsCustomerOrder(ev())).toBe(true)
    expect(countsAsCustomerOrder(ev({ status: 'SHIPPED' }))).toBe(true)
  })
  it('DRAFTED ไม่นับ', () => expect(countsAsCustomerOrder(ev({ status: 'DRAFTED' }))).toBe(false))
  it('CANCELLED ไม่นับ (ทุกต้นเรื่อง)', () => {
    expect(countsAsCustomerOrder(ev({ status: 'CANCELLED', cancelInitiator: 'seller' }))).toBe(false)
    expect(countsAsCustomerOrder(ev({ status: 'CANCELLED', cancelInitiator: 'buyer' }))).toBe(false)
  })
  it('พัสดุตีกลับ (return / return_success) ไม่นับ', () => {
    expect(countsAsCustomerOrder(ev({ activeShipmentCarrierStatus: 'return' }))).toBe(false)
    expect(countsAsCustomerOrder(ev({ activeShipmentCarrierStatus: 'return_success' }))).toBe(false)
  })
  it('นัด NO_SHOW (status ยังไม่ CANCELLED) ไม่นับ', () => {
    expect(countsAsCustomerOrder(ev({ appointmentStatus: 'NO_SHOW' }))).toBe(false)
  })
  it('Order.status RETURNED ไม่นับ', () => expect(countsAsCustomerOrder(ev({ status: 'RETURNED' }))).toBe(false))
})

describe('[blocker] parity — summarize.counted = จำนวนใบที่ countsAsCustomerOrder', () => {
  const mixed = [
    ev(),
    ev({ status: 'SHIPPED' }),
    ev({ status: 'DRAFTED' }),
    ev({ status: 'CANCELLED', cancelInitiator: 'seller' }),
    ev({ activeShipmentCarrierStatus: 'return' }),
    ev({ appointmentStatus: 'NO_SHOW' }),
    ev({ status: 'RETURNED' }),
  ]
  it('ชุดผสม → 2', () => {
    const s = summarizeCustomerBehavior(mixed)
    expect(s.counted).toBe(mixed.filter(countsAsCustomerOrder).length)
    expect(s.counted).toBe(2)
  })
  it('ชุดผสม → ตัวกรอง "ซื้อซ้ำ" และป้ายเห็นตรงกัน (counted 2 = REGULAR)', () => {
    const behavior = summarizeCustomerBehavior(mixed)
    expect(matchesCustomerFilter({ behavior } as never, 'repeat', false)).toBe(true)
    expect(customerBadges(behavior, { hasHistory: true, orderNoun: 'คำสั่งซื้อ', copy }).map((b) => b.key)).toContain('REGULAR')
  })
  it('DRAFTED ไม่เข้า orders ด้วย — ผู้เรียกที่ลืมกรองก็ไม่นับ', () => {
    expect(summarizeCustomerBehavior([ev({ status: 'DRAFTED' })]).orders).toBe(0)
  })
  it('ใบเดียวที่ถูกยกเลิก → ไม่ใช่ NEW และไม่ใช่ซื้อซ้ำ', () => {
    const behavior = summarizeCustomerBehavior([ev({ status: 'CANCELLED', cancelInitiator: 'seller' }), ev({ status: 'CANCELLED', cancelInitiator: 'seller' })])
    expect(matchesCustomerFilter({ behavior } as never, 'repeat', false)).toBe(false)
    expect(customerBadges(behavior, { hasHistory: true, orderNoun: 'x', copy }).map((b) => b.key)).not.toContain('REGULAR')
  })
})

describe('customerBadges — เกณฑ์ 1↔2 (S-6)', () => {
  const run = (n: number) =>
    customerBadges(summarizeCustomerBehavior(Array.from({ length: n }, () => ev())), { hasHistory: true, orderNoun: 'คำสั่งซื้อ', copy })
  it('0 → ไม่มีป้าย · 1 → NEW เดียว · 2 → REGULAR เดียว', () => {
    expect(run(0).map((b) => b.key)).toEqual([])
    expect(run(1).map((b) => b.key)).toEqual(['NEW'])
    expect(run(2).map((b) => b.key)).toEqual(['REGULAR'])
  })
  it('ซื้อซ้ำ ไอคอน repeat + tooltip "ซื้อแล้ว n" และไม่เป็น warning', () => {
    const [b] = run(3)
    expect(b).toMatchObject({ icon: 'repeat', tone: 'info', detail: 'ซื้อแล้ว 3 คำสั่งซื้อ' })
    expect(hasBehaviorWarning(run(3))).toBe(false)
  })
  it('ตีกลับ/ยกเลิกยังออกป้ายเตือนคู่กับ REGULAR', () => {
    const s = summarizeCustomerBehavior([ev(), ev(), ev({ activeShipmentCarrierStatus: 'return' }), ev({ status: 'CANCELLED' })])
    expect(customerBadges(s, { hasHistory: true, orderNoun: 'x', copy }).map((b) => b.key)).toEqual(['REGULAR', 'RETURNED', 'CANCELLED_BY_BUYER'])
  })
})

describe('[blocker] consumer ไม่นับเอง (scope ร้านอยู่ที่ query ของ service)', () => {
  const read = (p: string) => readFileSync(p, 'utf8')
  it('orders/page.tsx เลิก groupBy + orders − cancelled', () => {
    const src = read('src/app/(paces)/seller/(dashboard)/orders/page.tsx')
    expect(src).toContain('behaviorByShopCustomer')
    expect(src).not.toMatch(/orders - stats\.cancelled|cancelledByBuyer \+= r\._count/)
  })
  it('customer.service getCustomerSummary ใช้ตัวนับกลาง ไม่ count({status not CANCELLED})', () => {
    const src = read('src/services/customer.service.ts')
    expect(src).toContain('behaviorByShopCustomer')
    expect(src).not.toMatch(/withoutDrafted\("CANCELLED"\)/)
  })
  it('behaviorByShopCustomer scope ด้วย shopId ใน where', () => {
    expect(read('src/services/customer-behavior.service.ts')).toMatch(/shopId: \{ in: shopIds \}/)
  })
})
