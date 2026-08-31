import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { getPaymentBadge, PAYMENT_STATE_LABEL } from '@/lib/order-display'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** ด่านต้องดู *โค้ด* ไม่ใช่คำอธิบาย — ไฟล์เหล่านี้เล่าเหตุผลไว้ยาวและมีชื่อสัญลักษณ์ในคอมเมนต์ */
const code = (rel: string) =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const CLIENT = 'src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderDetailClient.tsx'
const BILLING = 'src/app/(paces)/seller/(dashboard)/orders/[token]/components/BillingDetails.tsx'
const RECEIVED = 'src/app/(paces)/seller/(dashboard)/orders/[token]/components/PaymentReceivedCard.tsx'

/**
 * "ได้เงินหรือยัง" มีเจ้าของคำถามคนละคนตามประเภทร้าน (Hard Rule 16)
 *
 * | ประเภทร้าน | เจ้าของ | ที่มา |
 * |---|---|---|
 * | SERVICE_QUEUE | บัญชีเงิน `OrderPayment` | feature 00050 (มัดจำ + ส่วนที่เหลือ) |
 * | ONLINE_SALES  | ธง `paymentConfirmedAt`  | feature 00062 (จ่ายก้อนเดียว) |
 * | COD (ทุก vertical) | `codReceivedAt` | มีมาก่อน + CHECK ที่ DB กันชนกับธง |
 *
 * 🛑 `00062/PRD.md` D-2 เขียนเองว่า "ไม่ปลดล็อก OrderPayment/00050 ให้ ONLINE_SALES"
 * ⇒ แยกกันมาตั้งแต่ออกแบบ แต่ **ด่านมีข้างเดียว**: 00050 กั้นด้วย vertical ครบ 4 จุด + เทส
 * `[blocker]` ส่วน 00062 กั้นด้วย `canSellerConfirmPayment()` ซึ่งตัดสินจาก *วิธีชำระ* เท่านั้น
 * ⇒ การ์ดของ 00062 ไหลเข้าร้านบริการทั้งที่ PRD ของตัวเองบอกว่าอยู่นอกขอบเขต
 *
 * วัดจอจริง 2026-08-31 (บิลบริการ PENDING ฿900 มัดจำ 900): ปุ่ม "รับเงินแล้ว" กับ
 * "ได้รับเงินแล้ว" โผล่พร้อมกัน · การ์ดชื่อ "การชำระเงิน" ซ้ำ 2 ใบ · สองระบบไม่เขียนถึงกันเลย
 */
describe('[blocker] "ได้เงินยัง" — เจ้าของคำถามต่างกันตามประเภทร้าน', () => {
  const money = (totalAmount: number, totalReceived: number) => ({
    totalAmount,
    totalReceived,
    outstanding: Math.max(0, totalAmount - totalReceived),
  })

  describe('บัญชีเงินชนะ Order.status เมื่อร้านมีบัญชี', () => {
    it('🛑 CONFIRMED + บัญชี 0 บาท → "รอชำระ" ไม่ใช่ "ชำระแล้ว"', () => {
      /* เคสที่หัวหน้าเจอเองบนจอ: ผู้ซื้อยืนยันรับบริการแล้ว (status=CONFIRMED) แต่ร้านยัง
         ไม่ได้บันทึกเงินสักบาท — ป้ายเดิมขึ้นเขียว "ชำระแล้ว" ซึ่งเป็นคำโกหก */
      const b = getPaymentBadge('CONFIRMED', 'CASH', null, null, money(2500, 0))
      expect(b?.label).toBe(PAYMENT_STATE_LABEL.outstanding)
      expect(b?.tone).toBe('warning')
    })

    it('รับครบแล้ว → เขียว "ชำระเงินแล้ว" (Verified-Means-Green: ครบจริงถึงเขียว)', () => {
      const b = getPaymentBadge('PENDING', 'CASH', null, null, money(900, 900))
      expect(b?.label).toBe(PAYMENT_STATE_LABEL.paid)
      expect(b?.tone).toBe('success')
    })

    it('รับมัดจำมาแล้วแต่ยังไม่ครบ → "รับบางส่วน" (ไม่ใช่ "รอชำระ" ซึ่งสั่งให้ทวงทั้งก้อน)', () => {
      const b = getPaymentBadge('PENDING', 'CASH', null, null, money(22000, 900))
      expect(b?.label).toBe(PAYMENT_STATE_LABEL.partial)
      expect(b?.tone).toBe('warning')
    })

    it('ยกเลิกแล้วชนะทุกอย่าง — เรื่องเงินไม่เปลี่ยนข้อเท็จจริงนั้น', () => {
      const b = getPaymentBadge('CANCELLED', 'CASH', null, null, money(900, 0))
      expect(b?.label).toBe('ยกเลิก')
      expect(b?.tone).toBe('neutral')
    })

    it('บิลยอด 0 ตกไปตรรกะเดิม — ไม่มีเรื่องเงินให้ตัดสิน', () => {
      /* เกณฑ์เดียวกับ `resolveServiceOrderBadge` ในไฟล์เดียวกัน ห้ามให้สองที่ตอบไม่ตรงกัน */
      const b = getPaymentBadge('CONFIRMED', 'CASH', null, null, money(0, 0))
      expect(b?.label).toBe('ชำระแล้ว')
    })
  })

  describe('🛑 ร้านที่ไม่มีบัญชีเงิน — ป้ายต้องเหมือนเดิมทุกกรณี (AC-SQ-07)', () => {
    /* ไม่ส่ง money = ONLINE_SALES / LODGING ⇒ ผลต้องเท่ากับก่อนเพิ่มพารามิเตอร์เป๊ะ
       ตารางนี้คือเส้นแบ่งว่า "ของเดิมยังไม่ถูกแตะ" — แดงเมื่อไหร่แปลว่ากระทบ vertical อื่น */
    const CASES: [string, string | null, string | null, string | null, string][] = [
      ['CONFIRMED', 'TRANSFER', null, null, 'ชำระแล้ว'],
      ['CANCELLED', 'TRANSFER', null, null, 'ยกเลิก'],
      ['SHIPPED', 'COD', null, null, 'รอเก็บปลายทาง'],
      ['PENDING', 'TRANSFER', null, '2026-08-31T00:00:00Z', 'ร้านยืนยันรับเงินแล้ว'],
      ['PENDING', 'TRANSFER', 'file-1', null, 'รอตรวจสอบสลิป'],
      ['PENDING', 'TRANSFER', null, null, 'รอชำระ'],
      ['PENDING', 'PROMPTPAY', null, null, 'รอชำระ'],
      ['PENDING', 'CASH', null, null, 'ยังไม่ยืนยันการชำระ'],
      ['PENDING', 'พร้อมเพย์ 081-234-5678', null, null, 'ยังไม่ยืนยันการชำระ'],
    ]
    for (const [status, pm, slip, confirmed, label] of CASES) {
      it(`${status} · ${pm} → "${label}"`, () => {
        expect(getPaymentBadge(status, pm, slip, confirmed)?.label).toBe(label)
      })
    }
  })
})

describe('[blocker] การ์ดยืนยันรับเงินของ 00062 ต้องไม่เข้าร้านบริการ', () => {
  it('🛑 `PaymentReceivedCard` ถูกกั้นด้วย `!isServiceQueue`', () => {
    const c = code(CLIENT)
    expect(c, 'ต้องนิยาม isServiceQueue จาก vertical').toMatch(
      /const isServiceQueue = vertical === 'SERVICE_QUEUE'/,
    )
    expect(c, 'ต้องกั้นก่อน render การ์ด').toMatch(
      /!isServiceQueue &&[\s\S]{0,200}<PaymentReceivedCard/,
    )
  })

  it('🛑 กันเฉพาะ SERVICE_QUEUE — ห้ามเป็น allow-list ที่ตัด vertical ใหม่ทิ้งเงียบ ๆ', () => {
    /* LODGING ยังไม่มีร้านจริงสักร้าน (ตรวจฐาน 2026-08-31) และธงใบเดียวคือกลไกเงินเดียวที่มันมี
       ⇒ ค่า vertical ที่ไม่รู้จักต้องได้พฤติกรรมเดิมไว้ก่อน ไม่ใช่ถูกซ่อน */
    const c = code(CLIENT)
    expect(c).not.toMatch(/isOnlineSales &&[\s\S]{0,200}<PaymentReceivedCard/)
    expect(c).not.toMatch(/vertical === 'ONLINE_SALES'[\s\S]{0,200}<PaymentReceivedCard/)
  })

  it('🛑 ป้ายบนจอร้านต้องกินบัญชีเงิน ไม่ใช่คำนวณเอง', () => {
    for (const rel of [BILLING, 'src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderSummary.tsx']) {
      expect(code(rel), `${rel} ต้องส่ง serviceMoney เข้า getPaymentBadge`).toMatch(
        /getPaymentBadge\([^)]*serviceMoney/,
      )
    }
  })

  it('🛑 ชุดเงินที่ป้อน "ป้าย" ต้องไม่ผ่าน hasMoneyStory — ไม่งั้นใบที่โกหกอยู่ยังโกหกต่อ', () => {
    const page = code('src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx')
    expect(page).toMatch(/serviceMoney=\{serviceMoney\}/)
  })

  it('🛑 ชื่อการ์ดสองใบต้องไม่ชนกัน — เคยขึ้น "การชำระเงิน" ซ้ำ 2 ใบในหน้าเดียว', () => {
    const title = (rel: string) => read(rel).match(/<h4 className="card-title">([^<]+)<\/h4>/)?.[1]
    const a = title(BILLING)
    const b = title(RECEIVED)
    expect(a, 'ไม่เจอชื่อการ์ด BillingDetails').toBeTruthy()
    expect(b, 'ไม่เจอชื่อการ์ด PaymentReceivedCard').toBeTruthy()
    expect(a, `การ์ดสองใบใช้ชื่อเดียวกัน: "${a}"`).not.toBe(b)
  })
})
