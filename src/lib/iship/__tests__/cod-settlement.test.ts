/**
 * readCodSettlement / parseCarrierTimestamp — ด่านตัดสินใจของการปิดงาน COD อัตโนมัติ
 *
 * ที่มา (2026-08-06): ยิง API จริงด้วย token ร้านจริงบน prod กับพัสดุ TH160390J7DJ1I
 * แล้วพบว่า iShip ส่ง `settlement_at` มาตรง ๆ ("เงินเข้าระบบ" บนหน้าจอเขา) ซึ่งขัดกับ
 * ข้อสรุปเดิมที่เขียนไว้ในโค้ดว่า "ไม่มีสถานะไหนแปลว่าเงินเข้าร้าน" (BRD §13)
 *
 * เทสชุดนี้ล็อกสองอย่างที่ผิดแล้วเสียหายจริงกับเงิน:
 *   1. เขตเวลา — `settlement_at` ไม่มีโซนติดมา แต่ `updated_at` ในออบเจ็กต์เดียวกันเป็น
 *      ISO UTC ถ้าแปลงผิดจะบันทึกเวลาเงินเข้าเพี้ยนไป 7 ชั่วโมง
 *   2. ยอด 0 — ใบที่ไม่ใช่ COD ต้องไม่ถูกตีความว่า "ได้เงินแล้ว ฿0" แล้วยืนยันคำสั่งซื้อ
 *      ให้อัตโนมัติทั้งที่ยังไม่มีใครจ่ายเงิน
 */
import { describe, it, expect } from 'vitest'
import { parseCarrierTimestamp, readCodSettlement } from '../status'

describe('parseCarrierTimestamp', () => {
  it('เวลาไทยไม่มีโซน → ตรึง +07:00 ไม่ใช่เวลาเครื่อง', () => {
    // ค่าจริงจาก TH160390J7DJ1I — 5 ส.ค. 19:00 เวลาไทย = 12:00Z
    const d = parseCarrierTimestamp('2026-08-05 19:00:00')
    expect(d?.toISOString()).toBe('2026-08-05T12:00:00.000Z')
  })

  it('มีโซนติดมาแล้ว → เชื่อตามนั้น ห้ามยัด +07 ทับ', () => {
    // `updated_at` ของแถวเดียวกันมาในรูปนี้ — ปนอยู่ในออบเจ็กต์เดียวกับข้างบน
    const d = parseCarrierTimestamp('2026-08-05T18:16:34.000000Z')
    expect(d?.toISOString()).toBe('2026-08-05T18:16:34.000Z')
  })

  it('สตริงว่าง/ขยะ → null ไม่ใช่ Invalid Date', () => {
    expect(parseCarrierTimestamp('')).toBeNull()
    expect(parseCarrierTimestamp('ไม่ใช่วันที่')).toBeNull()
  })
})

const PAID = 12 // payment_success — ชำระเงินสำเร็จ
const DELIVERED = 3 // จัดส่งแล้ว แต่ยังไม่ได้โอนเงิน

describe('readCodSettlement', () => {
  it('แถวจริงของ TH160390J7DJ1I (สถานะ 12) → อ่านได้ทั้งเวลาและยอด', () => {
    const r = readCodSettlement({ status: PAID, settlement_at: '2026-08-05 19:00:00', cod_amount: '590.00' })
    expect(r).not.toBeNull()
    expect(r!.codAmount).toBe(590)
    expect(r!.settledAt.toISOString()).toBe('2026-08-05T12:00:00.000Z')
  })

  /**
   * เคสนี้คือบั๊กที่ dry-run จับได้ก่อนขึ้น prod (2026-08-06) — โค้ดรุ่นแรกเช็คแค่ว่ามี
   * settlement_at แล้วยืนยันคำสั่งซื้อเลย ซึ่งจะปิดงาน 9 ใบทั้งที่เงินยังไม่เข้าสักบาท
   * แถวจริง TH020390UFH96A0: ส่งถึง 06 ส.ค. 12:48 → นัดโอน 07 ส.ค. 12:48 (delivered+24ชม.)
   */
  it('ส่งถึงแล้วแต่ยังไม่โอน (สถานะ 3 + วันนัดโอนล่วงหน้า) → null', () => {
    expect(
      readCodSettlement({ status: DELIVERED, settlement_at: '2026-08-07 12:48:44', cod_amount: '540.00' }),
    ).toBeNull()
  })

  it('สถานะอื่นที่ไม่ใช่ชำระเงินสำเร็จ → null ทุกตัว', () => {
    for (const status of [1, 3, 4, 5, 6, 13, 14]) {
      expect(readCodSettlement({ status, settlement_at: '2026-08-05 19:00:00', cod_amount: '590.00' })).toBeNull()
    }
  })

  it('ไม่มีสถานะมาเลย → null (ไม่ใช่เดาว่าโอนแล้ว)', () => {
    expect(readCodSettlement({ settlement_at: '2026-08-05 19:00:00', cod_amount: '590.00' })).toBeNull()
  })

  it('สถานะ 12 แต่ settlement_at ว่าง → null (ไม่เดาเวลาให้เอง)', () => {
    expect(readCodSettlement({ status: PAID, settlement_at: null, cod_amount: '590.00' })).toBeNull()
    expect(readCodSettlement({ status: PAID, cod_amount: '590.00' })).toBeNull()
  })

  it('ยอด 0 = ไม่ใช่ใบ COD → null แม้สถานะจะ 12 (BR-ISHIP-45 ข้อ ค)', () => {
    expect(readCodSettlement({ status: PAID, settlement_at: '2026-08-05 19:00:00', cod_amount: '0.00' })).toBeNull()
    expect(readCodSettlement({ status: PAID, settlement_at: '2026-08-05 19:00:00', cod_amount: 0 })).toBeNull()
    expect(readCodSettlement({ status: PAID, settlement_at: '2026-08-05 19:00:00' })).toBeNull()
  })

  it('ยอดเป็นค่าที่อ่านเป็นตัวเลขไม่ได้ → null ไม่ใช่ NaN', () => {
    expect(readCodSettlement({ status: PAID, settlement_at: '2026-08-05 19:00:00', cod_amount: 'ห้าร้อย' })).toBeNull()
  })

  it('วันที่แปลงไม่ได้ → null แม้ยอดจะถูกต้อง', () => {
    expect(readCodSettlement({ status: PAID, settlement_at: 'เมื่อวาน', cod_amount: '590.00' })).toBeNull()
  })

  it('ยอดเป็นตัวเลขจริง (ไม่ใช่ string) ก็ต้องอ่านได้ — iShip ไม่การันตีชนิด', () => {
    const r = readCodSettlement({ status: PAID, settlement_at: '2026-08-05 19:00:00', cod_amount: 1250 })
    expect(r!.codAmount).toBe(1250)
  })
})
