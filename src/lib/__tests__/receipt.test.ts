import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { thaiBahtText } from '../thai-baht-text'
import { receiptPeriodTH } from '../format-date'
import {
  UpdateReceiptProfileSchema,
  canIssueReceipt,
  formatReceiptNo,
  receiptPaymentMarks,
  resolveReceiptHeader,
  showReceiptButton, canBuyerViewReceipt } from '../receipt'

describe('[blocker] thaiBahtText — คำอ่านยอดเงินบนใบเสร็จ (AC-RCP-20/22/23)', () => {
  it.each([
    [0, 'ศูนย์บาทถ้วน'],
    [1, 'หนึ่งบาทถ้วน'],
    [10, 'สิบบาทถ้วน'],
    [11, 'สิบเอ็ดบาทถ้วน'],
    [20, 'ยี่สิบบาทถ้วน'],
    [21, 'ยี่สิบเอ็ดบาทถ้วน'],
    [101, 'หนึ่งร้อยเอ็ดบาทถ้วน'],
    [3500, 'สามพันห้าร้อยบาทถ้วน'],
    [350.5, 'สามร้อยห้าสิบบาทห้าสิบสตางค์'],
    [0.25, 'ยี่สิบห้าสตางค์'],
    [1.01, 'หนึ่งบาทหนึ่งสตางค์'],
    [1_000_000, 'หนึ่งล้านบาทถ้วน'],
    [1_000_001, 'หนึ่งล้านเอ็ดบาทถ้วน'],
    [11_000_000, 'สิบเอ็ดล้านบาทถ้วน'],
    [21_500_000, 'ยี่สิบเอ็ดล้านห้าแสนบาทถ้วน'],
    [123_456.78, 'หนึ่งแสนสองหมื่นสามพันสี่ร้อยห้าสิบหกบาทเจ็ดสิบแปดสตางค์'],
    // เศษลอยของ JS: 0.1+0.2 = 0.30000000000000004 ต้องเป็น "สามสิบสตางค์" ไม่ใช่ปัดผิด
    [0.1 + 0.2, 'สามสิบสตางค์'],
    [19.99, 'สิบเก้าบาทเก้าสิบเก้าสตางค์'],
  ])('%s → %s', (n, expected) => {
    expect(thaiBahtText(n)).toBe(expected)
  })
})

describe('[blocker] เลขที่ใบเสร็จ (BR-RCP-02/03)', () => {
  it('รูปแบบ CA + YYYYMM + 4 หลัก', () => {
    expect(formatReceiptNo('202609', 43)).toBe('CA2026090043')
    expect(formatReceiptNo('202609', 1)).toBe('CA2026090001')
  })
  it('ตัดเดือนตามเวลาไทย ไม่ใช่ UTC (AC-RCP-16)', () => {
    expect(receiptPeriodTH(new Date('2026-08-31T16:59:59Z'))).toBe('202608')
    expect(receiptPeriodTH(new Date('2026-08-31T17:00:00Z'))).toBe('202609')
    expect(receiptPeriodTH(new Date('2026-12-31T17:00:00Z'))).toBe('202701')
  })
})

describe('[blocker] ออกใบเสร็จได้ไหม (BR-RCP-06/07/08/09)', () => {
  it('เฉพาะร้านบริการ ออเดอร์ที่ไม่ยกเลิก/ไม่ใช่ร่าง', () => {
    expect(canIssueReceipt({ vertical: 'SERVICE_QUEUE', status: 'PENDING' })).toBe(true)
    expect(canIssueReceipt({ vertical: 'SERVICE_QUEUE', status: 'CONFIRMED' })).toBe(true)
    expect(canIssueReceipt({ vertical: 'SERVICE_QUEUE', status: 'CANCELLED' })).toBe(false)
    expect(canIssueReceipt({ vertical: 'SERVICE_QUEUE', status: 'DRAFTED' })).toBe(false)
    expect(canIssueReceipt({ vertical: 'ONLINE_SALES', status: 'PENDING' })).toBe(false)
    expect(canIssueReceipt({ vertical: 'LODGING', status: 'PENDING' })).toBe(false)
  })
  it('ใบที่ออกแล้วเปิดซ้ำได้เสมอ แม้ยกเลิกภายหลัง', () => {
    expect(showReceiptButton({ vertical: 'SERVICE_QUEUE', status: 'CANCELLED', hasReceipt: true })).toBe(true)
    expect(showReceiptButton({ vertical: 'SERVICE_QUEUE', status: 'CANCELLED', hasReceipt: false })).toBe(false)
  })
})

describe('[blocker] ช่องติ๊กวิธีชำระเงิน (AC-RCP-24..28)', () => {
  const marks = (paymentMethod: string | null, payments: { method: string; voidedAt: Date | null }[] = []) =>
    receiptPaymentMarks({ paymentMethod, payments })

  it('ไม่รู้วิธีชำระ = ไม่ติ๊กอะไรเลย (ห้ามเดาเป็นโอน)', () => {
    expect(marks(null)).toEqual({ cash: false, transfer: false })
    expect(marks('อื่น ๆ')).toEqual({ cash: false, transfer: false })
  })
  it('เงินสด / โอน จาก paymentMethod', () => {
    expect(marks('CASH')).toEqual({ cash: true, transfer: false })
    expect(marks('โอน SCB 123')).toEqual({ cash: false, transfer: true })
    expect(marks('PROMPTPAY')).toEqual({ cash: false, transfer: true })
  })
  it('ปลายทางไม่ใช่ทั้งสองอย่าง', () => {
    expect(marks('COD')).toEqual({ cash: false, transfer: false })
    expect(marks('เก็บเงินปลายทาง โอนทีหลัง')).toEqual({ cash: false, transfer: false })
  })
  it('รายการรับเงินที่ไม่ถูก void ติ๊กได้ทั้งสองช่อง; ที่ void ไม่นับ', () => {
    expect(
      marks(null, [
        { method: 'CASH', voidedAt: null },
        { method: 'TRANSFER', voidedAt: null },
      ]),
    ).toEqual({ cash: true, transfer: true })
    expect(marks(null, [{ method: 'CASH', voidedAt: new Date() }])).toEqual({ cash: false, transfer: false })
  })
})

describe('UpdateReceiptProfileSchema (AC-RCP-03/04)', () => {
  it('ว่างทั้งหมดได้ และช่องว่างกลายเป็น null', () => {
    const r = v.safeParse(UpdateReceiptProfileSchema, { legalName: '  ', taxId: '' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.output).toMatchObject({ legalName: null, taxId: null, stamp: null })
  })
  it('เลขผู้เสียภาษีต้อง 13 หลัก (ตัดขีด/ช่องว่างให้)', () => {
    const ok = v.safeParse(UpdateReceiptProfileSchema, { taxId: '1-1020-03093-35-1' })
    expect(ok.success && ok.output.taxId).toBe('1102003093351')
    expect(v.safeParse(UpdateReceiptProfileSchema, { taxId: '12345' }).success).toBe(false)
    expect(v.safeParse(UpdateReceiptProfileSchema, { taxId: '11020030933512' }).success).toBe(false)
  })
})

describe('resolveReceiptHeader (AC-RCP-06/07/08)', () => {
  const shop = { shopName: 'ร้าน A', address: 'ที่อยู่ร้าน' }
  it('ไม่มีโปรไฟล์ = ใช้ข้อมูลร้าน + isFallback', () => {
    expect(resolveReceiptHeader(shop, null)).toEqual({
      name: 'ร้าน A', address: 'ที่อยู่ร้าน', taxId: null, phone: null, isFallback: true,
    })
  })
  it('ช่องที่ตั้งไว้ชนะ ช่องว่างถอยไปใช้ของร้าน', () => {
    const h = resolveReceiptHeader(shop, { legalName: 'บจก. เอ', address: null, taxId: '1102003093351', phone: '0842492878' })
    expect(h).toEqual({ name: 'บจก. เอ', address: 'ที่อยู่ร้าน', taxId: '1102003093351', phone: '0842492878', isFallback: false })
  })
})

// feature 00073 FR-013 — ลูกค้าเปิดใบเสร็จเอง: ปิดงานแล้ว · ไม่ใช่ไม่มาตามนัด · ค้าง 0 (ฝั่งร้านไม่ผ่านฟังก์ชันนี้)
describe('canBuyerViewReceipt', () => {
  const base = { vertical: 'SERVICE_QUEUE', status: 'PENDING', serviceClosedAt: new Date(), appointmentStatus: 'COMPLETED', outstanding: 0 }
  it('ปิดงานแล้ว + ชำระครบ → true (ทั้งก่อนและหลังลูกค้ายืนยัน · walk-in)', () => {
    expect(canBuyerViewReceipt(base)).toBe(true)
    expect(canBuyerViewReceipt({ ...base, status: 'CONFIRMED' })).toBe(true)
    expect(canBuyerViewReceipt({ ...base, appointmentStatus: null })).toBe(true)
  })
  it('ค้างเงิน · ยังไม่ปิด · ไม่มาตามนัด → false', () => {
    expect(canBuyerViewReceipt({ ...base, outstanding: 1 })).toBe(false)
    expect(canBuyerViewReceipt({ ...base, serviceClosedAt: null })).toBe(false)
    expect(canBuyerViewReceipt({ ...base, appointmentStatus: 'NO_SHOW' })).toBe(false)
  })
  it('ยกเลิก · คืน · ร่าง → false', () => {
    for (const status of ['CANCELLED', 'RETURNED', 'DRAFTED']) expect(canBuyerViewReceipt({ ...base, status })).toBe(false)
  })
  it('[blocker] ร้านที่ไม่ใช่ร้านบริการ → false เสมอ', () => {
    expect(canBuyerViewReceipt({ ...base, vertical: 'ONLINE_SALES' })).toBe(false)
    expect(canBuyerViewReceipt({ ...base, vertical: 'LODGING' })).toBe(false)
  })
})

// feature 00073 — ช่อง วันที่/จำนวนเงิน บนใบเสร็จเติมจากบันทึกรับเงิน "โอน" ที่ไม่ถูกยกเลิกเท่านั้น
describe('buildReceiptSheet — เติมช่องการโอน', () => {
  it('โอน 2 ครั้ง (1 ครั้งถูกยกเลิก) + เงินสด → วันที่ = โอนล่าสุดที่ยังใช้ได้ · จำนวน = ผลรวมโอนที่ยังใช้ได้ · เงินสดล้วน = ไม่เติม', async () => {
    const { buildReceiptSheet } = await import('@/app/(paces)/seller/(fullscreen)/orders/[token]/receipt/receipt-data')
    const base = {
      status: 'PENDING', buyerName: 'ลูกค้า', buyerContact: '0800000000', paymentMethod: null, discount: 0, vatRate: 0, vatAmount: 0,
      totalAmount: 1500, items: [{ name: 'ล้างแอร์ (ค่าบริการ)', description: null, qty: 1, price: 1500 }], createdBy: null,
      receipt: { receiptNo: 'CA2026100001', issuedAt: new Date('2026-10-11T03:00:00Z') },
      shop: { shopName: 'ร้านล้างแอร์', address: null, logo: null, receiptProfile: null },
    }
    const pays = [
      { method: 'TRANSFER', amount: 500, voidedAt: null, receivedAt: new Date('2026-10-01T03:00:00Z') },
      { method: 'TRANSFER', amount: 700, voidedAt: new Date(), receivedAt: new Date('2026-10-09T03:00:00Z') },
      { method: 'TRANSFER', amount: 600, voidedAt: null, receivedAt: new Date('2026-10-05T03:00:00Z') },
      { method: 'CASH', amount: 400, voidedAt: null, receivedAt: new Date('2026-10-10T03:00:00Z') },
    ]
    const { data } = buildReceiptSheet({ ...base, payments: pays } as never)
    expect(data.transfer?.amount).toBe('1,100.00')
    expect(data.transfer?.dateLabel).toContain('5')
    const cashOnly = buildReceiptSheet({ ...base, payments: [pays[3]] } as never)
    expect(cashOnly.data.transfer).toBeNull()
  })
})
