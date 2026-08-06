/**
 * resolvePaymentSync — ให้วิธีชำระเงินของคำสั่งซื้อตรงกับพัสดุที่เปิดจริง
 *
 * ที่มา (user 2026-08-06): พบใบ TH140290UGSM3H บน prod ที่พัสดุเปิดแบบเก็บเงินปลายทาง
 * ฿360 จริง แต่คำสั่งซื้อบันทึก paymentMethod = "CASH" — ใบแบบนี้หลุดทั้งจากกอง
 * "รอเงิน COD" และจากการปิดงานอัตโนมัติ
 *
 * เทสชุดนี้ล็อก **ความไม่สมมาตร** ของสองทิศทางเป็นหลัก เพราะมันคือจุดที่คนอ่านโค้ด
 * ทีหลังจะอยากทำให้ "สมมาตรเพื่อความสวย" แล้วเปิดช่องให้ของออกไปโดยไม่มีใครเก็บเงิน
 */
import { describe, it, expect } from 'vitest'
import { resolvePaymentSync } from '../payment-sync'

describe('resolvePaymentSync', () => {
  it('พัสดุ COD + คำสั่งซื้อไม่ใช่ COD → แก้ให้เป็น COD (เคสจริง TH140290UGSM3H)', () => {
    const r = resolvePaymentSync({ orderPaymentMethod: 'CASH', parcelCodAmount: 360 })
    expect(r.action).toBe('SET_COD')
    if (r.action !== 'SET_COD') return
    expect(r.from).toBe('CASH')
    expect(r.codAmount).toBe(360)
    expect(r.message).toContain('฿360')
    // clarify gate: ห้ามพูดคำเดิมซ้ำในประโยคเดียว
    expect(r.message.match(/เก็บเงินปลายทาง/g)).toHaveLength(1)
  })

  it('คำสั่งซื้อไม่เคยระบุวิธีชำระเลย (null) ก็ต้องแก้ให้', () => {
    const r = resolvePaymentSync({ orderPaymentMethod: null, parcelCodAmount: 590 })
    expect(r.action).toBe('SET_COD')
    if (r.action === 'SET_COD') expect(r.from).toBeNull()
  })

  /**
   * ทิศตรงข้ามต้องไม่สมมาตร — การแก้คำสั่งซื้อให้เป็น "ไม่เก็บปลายทาง" คือการกลบ
   * ความผิดพลาดที่ร้านต้องไปแก้ที่พัสดุ ผลคือของออกไปโดยไม่มีใครเก็บเงิน
   */
  it('คำสั่งซื้อ COD + พัสดุไม่ COD → เตือนอย่างเดียว ห้ามแก้', () => {
    const r = resolvePaymentSync({ orderPaymentMethod: 'COD', parcelCodAmount: 0 })
    expect(r.action).toBe('WARN_NO_COD')
  })

  it('ตรงกันอยู่แล้ว ทั้งสองแบบ → ไม่ต้องทำอะไร', () => {
    expect(resolvePaymentSync({ orderPaymentMethod: 'COD', parcelCodAmount: 360 }).action).toBe('NONE')
    expect(resolvePaymentSync({ orderPaymentMethod: 'TRANSFER', parcelCodAmount: 0 }).action).toBe('NONE')
  })

  it('ข้อความไทยที่ร้านพิมพ์เองก็ต้องถูกจับว่าเป็น COD — ไม่ใช่เทียบ enum เป๊ะ ๆ', () => {
    for (const m of ['เก็บเงินปลายทาง', 'ปลายทาง', 'cod', 'COD ค่ะ']) {
      expect(resolvePaymentSync({ orderPaymentMethod: m, parcelCodAmount: 360 }).action).toBe('NONE')
      expect(resolvePaymentSync({ orderPaymentMethod: m, parcelCodAmount: 0 }).action).toBe('WARN_NO_COD')
    }
  })

  it('ยอดที่ไม่ใช่ตัวเลข (NaN) ถือว่าไม่ใช่ COD — ห้ามแก้คำสั่งซื้อจากค่าขยะ', () => {
    expect(resolvePaymentSync({ orderPaymentMethod: 'CASH', parcelCodAmount: NaN }).action).toBe('NONE')
    expect(resolvePaymentSync({ orderPaymentMethod: 'CASH', parcelCodAmount: -5 }).action).toBe('NONE')
  })
})
