/**
 * [blocker] การ์ดโอนเงินฝั่งผู้ซื้อต้องดูสถานะออเดอร์ก่อนโชว์ QR ที่สแกนจ่ายได้จริง
 * (impeccable critique P0-2, 2026-08-29)
 *
 * ทำไม: เดิม `PayoutAccountCard.tsx` gate ด้วย `needsPayoutAccount(order.paymentMethod)`
 * อย่างเดียว ไม่รู้จัก `status`/`paymentConfirmedAt` เลย ⇒ ออเดอร์ที่ร้านยืนยันรับเงินแล้ว/
 * ปิดงานแล้ว/**ถูกยกเลิกแล้ว** ยังโชว์ "ยอดที่ต้องโอน" + QR พร้อมสแกนเสมอ — โอนซ้ำ/โอนเข้า
 * ออเดอร์ที่ยกเลิกแล้ว = เงินหาย ระบบไม่มีกลไกตามคืน (กลุ่มผู้สูงวัยที่ PRODUCT.md ผูกไว้พลาด
 * ง่ายเป็นพิเศษเพราะ QR กลางจอ + ตัวเลขใหญ่ ชนะป้ายเล็กมุมขวาบนเสมอ)
 *
 * เทสอ่านซอร์ส (รีโปไม่มี jsdom) — แพตเทิร์นเดียวกับ `buyer-order-guardrails.test.ts`
 * ในโฟลเดอร์เดียวกัน
 *
 * 🛑 แดง = ห้าม merge
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

const DIR = join(process.cwd(), 'src/app/(marketing)/o/[token]')

/** ตัดคอมเมนต์ก่อนตรวจ — ไฟล์เหล่านี้อธิบายบั๊กเดิมไว้ในคอมเมนต์ด้วยตัวอักษรเดียวกับที่ห้าม */
function read(rel: string): string {
  return readFileSync(join(DIR, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')
}

describe('PayoutAccountCard: QR ต้องหายเมื่อออเดอร์ชำระ/ปิดงาน/ยกเลิกแล้ว (P0-2)', () => {
  it('isSettled คำนวณจาก status CONFIRMED/CANCELLED หรือ paymentConfirmedAt (OR ไม่ใช่ AND)', () => {
    const src = read('PayoutAccountCard.tsx')
    expect(src).toMatch(
      /const isSettled = status === 'CONFIRMED' \|\| isCancelled \|\| Boolean\(paymentConfirmedAt\)/,
    )
  })

  it('บล็อก QR ต้องเช็ค !isSettled ก่อนเสมอ ไม่ใช่แค่ qrPayload', () => {
    const src = read('PayoutAccountCard.tsx')
    // เดิมคือ `{qrPayload && (` เฉย ๆ — ต้องมี !isSettled นำหน้าเสมอ
    expect(src).toMatch(/\{!isSettled && qrPayload && \(/)
    expect(src).not.toMatch(/\{qrPayload && \(/)
  })

  it('ออเดอร์ที่ยกเลิกแล้วต้องมีคำเตือนห้ามโอน', () => {
    const src = read('PayoutAccountCard.tsx')
    expect(src).toContain('ออเดอร์นี้ถูกยกเลิกแล้ว — ห้ามโอนเงิน')
  })

  it('หัวข้อยอดผันเป็น "ยอดที่ชำระ" เมื่อ isSettled', () => {
    const src = read('PayoutAccountCard.tsx')
    expect(src).toMatch(/isSettled \? 'ยอดที่ชำระ' : 'ยอดที่ต้องโอน'/)
  })

  it('ทั้ง GuestOrderView และ OrderDetailMobile ต้องส่ง status + paymentConfirmedAt เข้าการ์ด', () => {
    for (const file of ['GuestOrderView.tsx', 'OrderDetailMobile.tsx']) {
      const src = read(file)
      const match = src.match(/<PayoutAccountCard[\s\S]{0,400}?(?:\/>|contactShopAction=)/)
      expect(match, `${file}: ไม่พบ <PayoutAccountCard`).not.toBeNull()
      expect(match?.[0], `${file}: ขาด status prop`).toMatch(/status=\{order\.status\}/)
      expect(match?.[0], `${file}: ขาด paymentConfirmedAt prop`).toMatch(
        /paymentConfirmedAt=\{order\.paymentConfirmedAt\}/,
      )
    }
  })
})
