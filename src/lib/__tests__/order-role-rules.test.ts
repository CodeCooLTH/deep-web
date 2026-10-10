import { describe, expect, it } from 'vitest'
import { canEditOrderAs, filterActionSetByRoles, isBillingOnly, isBillingOnlyEditor, isBillingOnlyFor } from '@/lib/order-role-rules'
import type { OrderActionSet } from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/order-action-set'
import type { ShopRole } from '@/lib/shop-permissions'

const a = (key: string) => ({ key, label: key, icon: 'x' })
// ชุดปุ่มเต็มของใบ PENDING ที่ส่งของ: ปุ่มหลัก = แจ้งเลขพัสดุ · เมนู = ส่ง SMS/คัดลอก/แก้ไข/ยกเลิก
const FULL: OrderActionSet = {
  primary: a('report-tracking'),
  ghosts: [a('copy-link'), a('record-payment')],
  menu: [a('send-sms'), a('copy-address'), a('edit-order'), a('cancel-order'), a('return-order'), a('print-receipt')],
}
const keys = (s: OrderActionSet) => [s.primary?.key, ...s.ghosts.map((x) => x.key), ...s.menu.map((x) => x.key)].filter(Boolean)

describe('isBillingOnly (O2s แต่ไม่มี O2)', () => {
  it.each<[ShopRole[], boolean]>([
    [['BILLING'], true],
    [['BILLING', 'CHAT'], false], // CHAT มี O2 ⇒ เปิดบิลได้ทุกประเภท
    [['OWNER'], false],
    [['MANAGER'], false],
    [['CHAT'], false],
    [['TECHNICIAN'], false],
    [[], false],
  ])('%j → %s', (roles, expected) => expect(isBillingOnly(roles)).toBe(expected))
})

describe('isBillingOnlyEditor / isBillingOnlyFor', () => {
  it('BILLING ล้วน = ผู้แก้แบบมีเงื่อนไข · มีบทบาทอื่นที่ O3 = ไม่มีเงื่อนไข', () => {
    expect(isBillingOnlyEditor(['BILLING'])).toBe(true)
    expect(isBillingOnlyEditor(['BILLING', 'CHAT'])).toBe(false)
    expect(isBillingOnlyEditor(['TECHNICIAN'])).toBe(false) // ไม่มี O3 เลย ≠ แก้แบบมีเงื่อนไข
  })
  it('P1 ของ BILLING = เฉพาะบริการ', () => {
    expect(isBillingOnlyFor(['BILLING'], 'P1')).toBe(true)
    expect(isBillingOnlyFor(['BILLING', 'MANAGER'], 'P1')).toBe(false)
  })
})

describe('canEditOrderAs (O3 + เงื่อนไขต่อใบ)', () => {
  it.each<[string, ShopRole[], { type: string; unpaid: boolean }, boolean]>([
    ['BILLING แก้บิลบริการที่ยังไม่ชำระได้', ['BILLING'], { type: 'SERVICE', unpaid: true }, true],
    ['BILLING แก้บิลที่รับเงินแล้วไม่ได้', ['BILLING'], { type: 'SERVICE', unpaid: false }, false],
    ['BILLING แก้บิลที่ไม่ใช่บริการไม่ได้ (แม้ยังไม่ชำระ)', ['BILLING'], { type: 'PHYSICAL', unpaid: true }, false],
    ['MANAGER แก้ใบที่รับเงินแล้วได้', ['MANAGER'], { type: 'PHYSICAL', unpaid: false }, true],
    ['CHAT แก้ได้ (O3)', ['CHAT'], { type: 'PHYSICAL', unpaid: false }, true],
    ['BILLING+CHAT แก้ใบที่รับเงินแล้วได้ (CHAT ปลดเงื่อนไข)', ['BILLING', 'CHAT'], { type: 'PHYSICAL', unpaid: false }, true],
    ['TECHNICIAN แก้ไม่ได้', ['TECHNICIAN'], { type: 'SERVICE', unpaid: true }, false],
  ])('%s', (_n, roles, order, expected) => expect(canEditOrderAs(roles, order)).toBe(expected))
})

describe('filterActionSetByRoles — ปุ่มที่โชว์ตามสิทธิ์', () => {
  it('OWNER เห็นครบ', () => {
    expect(keys(filterActionSetByRoles(FULL, ['OWNER']))).toEqual(keys(FULL))
  })
  it('MANAGER เห็นครบ (O6/O5/S1/O3/O7/D1 ล้วนมี)', () => {
    expect(keys(filterActionSetByRoles(FULL, ['MANAGER']))).toEqual(keys(FULL))
  })
  it('CHAT: ไม่มียกเลิก (O6) และไม่มีคืนของ (O6) · มีแจ้งเลขพัสดุ(S1)/รับเงิน(O5)/แก้ไข(O3)/SMS(O7)', () => {
    const k = keys(filterActionSetByRoles(FULL, ['CHAT']))
    expect(k).not.toContain('cancel-order')
    expect(k).not.toContain('return-order')
    expect(k).toEqual(expect.arrayContaining(['report-tracking', 'record-payment', 'edit-order', 'send-sms', 'print-receipt']))
  })
  it('BILLING: ไม่มีส่งของ(S1)/ยกเลิก(O6) · มีรับเงิน(O5)/SMS(O7)/ใบเสร็จ(D1)/แก้ไข(O3)', () => {
    const s = filterActionSetByRoles(FULL, ['BILLING'])
    expect(s.primary).toBeNull() // ปุ่มหลักเดิมคือแจ้งเลขพัสดุ — BILLING ไม่มี S1
    const k = keys(s)
    expect(k).not.toContain('report-tracking')
    expect(k).not.toContain('cancel-order')
    expect(k).toEqual(expect.arrayContaining(['record-payment', 'send-sms', 'print-receipt', 'edit-order']))
  })
  it('TECHNICIAN: ไม่เห็นปุ่มเปลี่ยนข้อมูลสักปุ่ม เหลือคัดลอก', () => {
    expect(keys(filterActionSetByRoles(FULL, ['TECHNICIAN']))).toEqual(['copy-link', 'copy-address'])
  })
  it('editLocked ซ่อนแก้ไขแม้บทบาทมี O3 (บิลที่ BILLING แก้ไม่ได้แล้ว)', () => {
    const k = keys(filterActionSetByRoles(FULL, ['BILLING'], { editLocked: true }))
    expect(k).not.toContain('edit-order')
    expect(keys(filterActionSetByRoles(FULL, ['BILLING']))).toContain('edit-order')
  })
  it('ไม่มีบทบาท (ชุดว่าง) = ไม่เห็นปุ่มเปลี่ยนข้อมูลเลย — ปิดเป็นค่าตั้งต้น', () => {
    expect(keys(filterActionSetByRoles(FULL, []))).toEqual(['copy-link', 'copy-address'])
  })
})
