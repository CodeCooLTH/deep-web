import { describe, expect, it } from 'vitest'
import { readCarrierCharges } from '../status'

/**
 * ต้นทุนจริงของการจัดส่ง — เกณฑ์การอ่านจาก payload ของ iShip
 *
 * ค่าที่ใช้ในเทสนี้ยึดจาก **แถวจริง** ของบัญชี iShip ร้าน (query_orders 2026-08-09) ไม่ใช่ค่าที่
 * แต่งขึ้นตามข้อสันนิษฐานของโค้ด — เทสที่แต่งค่าเองยืนยันได้แค่ว่า "โค้ดทำตามที่คนเขียนคิด"
 * ไม่ใช่ว่า "คนเขียนคิดถูก" (บทเรียน 2026-08-07 ตำบล/อำเภอสลับ 23 ใบ)
 */
describe('readCarrierCharges', () => {
  it('[blocker] อ่านค่าส่งจริงจาก discount_price ไม่ใช่จาก price/total_price', () => {
    // แถวจริง: TH720590UGDJ4A (FlashExpressA, สมุทรปราการ→สตูล, COD 360)
    const row = {
      discount_price: 34,
      actual_weight: 2.05,
      cod_fee: '7.70',
      // ฟิลด์สองตัวนี้ **ไม่มีจริงใน payload ขาเข้า** ใส่ไว้เพื่อพิสูจน์ว่าถ้าวันหนึ่ง iShip เพิ่มมา
      // เราจะไม่หยิบผิดตัว — ค่าส่งที่ถูกหักจริงคือ 34 ไม่ใช่ 29 ที่ประเมินจากน้ำหนักที่ร้านแจ้ง
      price: 999,
      total_price: 29,
    }
    expect(readCarrierCharges(row)).toEqual({ carrierPrice: 34, actualWeight: 2.05, codFee: 7.7 })
  })

  it('[blocker] ค่าส่ง/น้ำหนักที่เป็น 0 หรือติดลบ = "ยังไม่รู้" ไม่ใช่ "ฟรี"', () => {
    // 0 ที่ถูกบันทึกเป็นต้นทุนจะกลายเป็น "ส่งฟรี" ในสูตรกำไรแล้วไม่มีอะไรฟ้อง
    // (คลาสเดียวกับที่ total_price <= 0 เคยทำให้ขนส่งที่ไม่รองรับเส้นทางชนะ "ถูกที่สุด" ด้วย ฿0)
    const zero = readCarrierCharges({ discount_price: 0, actual_weight: 0, cod_fee: 0 })
    expect(zero.carrierPrice).toBeNull()
    expect(zero.actualWeight).toBeNull()

    const negative = readCarrierCharges({ discount_price: -5, actual_weight: -1 })
    expect(negative.carrierPrice).toBeNull()
    expect(negative.actualWeight).toBeNull()
  })

  it('[blocker] cod_fee = 0 เป็นค่าจริง ไม่ใช่ "ไม่รู้" — พัสดุที่ไม่ใช่ COD มีค่าธรรมเนียม 0 จริง', () => {
    // กติกาต่างจากสองฟิลด์บนโดยตั้งใจ: ตีค่านี้เป็น null จะทำให้ใบที่ไม่ใช่ COD ค้างสถานะ
    // "ยังไม่รู้ค่าธรรมเนียม" ตลอดกาล ทั้งที่รู้แน่นอนแล้วว่าไม่มี
    expect(readCarrierCharges({ cod_fee: 0 }).codFee).toBe(0)
    expect(readCarrierCharges({ cod_fee: '0.00' }).codFee).toBe(0)
    // แต่ "ไม่ส่งฟิลด์มาเลย" ยังเป็น null อยู่ — คนละเรื่องกับ 0
    expect(readCarrierCharges({}).codFee).toBeNull()
  })

  it('รับค่าที่มาเป็น string ได้ (iShip ส่งเงินเป็น string บางฟิลด์)', () => {
    expect(readCarrierCharges({ discount_price: '38', actual_weight: '4.13', cod_fee: '23.11' })).toEqual({
      carrierPrice: 38,
      actualWeight: 4.13,
      codFee: 23.11,
    })
  })

  it('ค่าที่แปลงเป็นตัวเลขไม่ได้ = null ไม่ใช่ NaN', () => {
    // NaN ที่หลุดลง Prisma Decimal จะระเบิดตอนเขียน ไม่ใช่ตอนอ่าน — ไกลจากจุดเกิดเหตุมาก
    const r = readCarrierCharges({ discount_price: 'ฟรี', actual_weight: null, cod_fee: '' })
    expect(r).toEqual({ carrierPrice: null, actualWeight: null, codFee: null })
  })

  it('[blocker] payload ที่ไม่มีฟิลด์ราคาเลย ต้องคืน null ทั้งชุด — ห้ามเดาจากฟิลด์อื่น', () => {
    // get_order ไม่มี actual_weight ให้ (มีแต่ weight ที่ร้านแจ้ง) — ห้ามหยิบ weight มาแทน
    // เพราะ 92 ใน 151 ใบชั่งจริงหนักกว่าที่แจ้ง การแทนกันคือการรายงานต้นทุนต่ำกว่าจริง
    expect(readCarrierCharges({})).toEqual({ carrierPrice: null, actualWeight: null, codFee: null })
  })
})
