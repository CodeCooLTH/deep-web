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

describe('readCodSettlement', () => {
  it('แถวจริงของ TH160390J7DJ1I → อ่านได้ทั้งเวลาและยอด', () => {
    const r = readCodSettlement({ settlement_at: '2026-08-05 19:00:00', cod_amount: '590.00' })
    expect(r).not.toBeNull()
    expect(r!.codAmount).toBe(590)
    expect(r!.settledAt.toISOString()).toBe('2026-08-05T12:00:00.000Z')
  })

  it('ยังไม่โอน (settlement_at ว่าง) → null', () => {
    expect(readCodSettlement({ settlement_at: null, cod_amount: '590.00' })).toBeNull()
    expect(readCodSettlement({ cod_amount: '590.00' })).toBeNull()
  })

  it('ยอด 0 = ไม่ใช่ใบ COD → null แม้จะมีวันที่มาด้วย (BR-ISHIP-45 ข้อ ค)', () => {
    expect(readCodSettlement({ settlement_at: '2026-08-05 19:00:00', cod_amount: '0.00' })).toBeNull()
    expect(readCodSettlement({ settlement_at: '2026-08-05 19:00:00', cod_amount: 0 })).toBeNull()
    expect(readCodSettlement({ settlement_at: '2026-08-05 19:00:00' })).toBeNull()
  })

  it('ยอดเป็นค่าที่อ่านเป็นตัวเลขไม่ได้ → null ไม่ใช่ NaN', () => {
    expect(readCodSettlement({ settlement_at: '2026-08-05 19:00:00', cod_amount: 'ห้าร้อย' })).toBeNull()
  })

  it('วันที่แปลงไม่ได้ → null แม้ยอดจะถูกต้อง', () => {
    expect(readCodSettlement({ settlement_at: 'เมื่อวาน', cod_amount: '590.00' })).toBeNull()
  })

  it('ยอดเป็นตัวเลขจริง (ไม่ใช่ string) ก็ต้องอ่านได้ — iShip ไม่การันตีชนิด', () => {
    const r = readCodSettlement({ settlement_at: '2026-08-05 19:00:00', cod_amount: 1250 })
    expect(r!.codAmount).toBe(1250)
  })
})
