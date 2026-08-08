// order-profit.test.ts — ล็อกสูตรกำไรรายออเดอร์ + มาร์จิ้นรายสินค้า
//
// เหตุผลเดียวกับ order-revenue.test.ts: สูตรพวกนี้เพี้ยนแล้วไม่มีอะไรพัง มีแต่ตัวเลขที่ผิด
// อยู่บนหน้าจอที่ร้านใช้ตัดสินใจตั้งราคา — เทสคือด่านเดียวที่ส่งเสียงได้

import { describe, expect, it } from 'vitest'
import { computeOrderProfit, productMargin } from './order-profit'

describe('computeOrderProfit', () => {
  it('ต้นทุนครบทุกรายการ → กำไร = ยอดรวม − ต้นทุนรวม', () => {
    // ตรงกับ TC-EXT-04: (300×2 + 150×1) ขาย 750, ทุน 180×2 + 90×1 = 450
    expect(
      computeOrderProfit({
        totalAmount: 750,
        items: [
          { cost: 180, qty: 2 },
          { cost: 90, qty: 1 },
        ],
      }),
    ).toEqual({ amount: 300, hasMissingCost: false })
  })

  it('รายการที่ยังไม่ตั้งต้นทุนถูก "ข้าม" ไม่ใช่นับเป็น 0 + ชูธงเตือน', () => {
    // จุดที่คนอ่านโค้ดพลาดบ่อยที่สุด: ผลลัพธ์ 570 ไม่ใช่กำไรจริง มันคือ "เพดานบน"
    // เพราะต้นทุนของรายการที่สองยังไม่ถูกหักออกเลย — ถ้าเผลอนับ null เป็น 0
    // ตัวเลขจะเท่ากันเป๊ะ แต่ความหมายต่างกันสิ้นเชิง จึงต้องมีธงมาด้วยเสมอ
    expect(
      computeOrderProfit({
        totalAmount: 750,
        items: [
          { cost: 180, qty: 1 },
          { cost: null, qty: 3 },
        ],
      }),
    ).toEqual({ amount: 570, hasMissingCost: true })
  })

  it('ไม่มีรายการไหนตั้งต้นทุนเลย → กำไรเท่ากับยอดขายทั้งก้อน + ธงขึ้น', () => {
    expect(computeOrderProfit({ totalAmount: 500, items: [{ cost: null, qty: 2 }] })).toEqual({
      amount: 500,
      hasMissingCost: true,
    })
  })

  it('ออเดอร์ไม่มีรายการเลย → ไม่ชูธง (ไม่มีอะไรขาด)', () => {
    expect(computeOrderProfit({ totalAmount: 0, items: [] })).toEqual({
      amount: 0,
      hasMissingCost: false,
    })
  })

  it('ขายต่ำกว่าทุน → กำไรติดลบ ไม่ clamp เป็น 0', () => {
    // TC-EXT-08 — การกลบเป็น 0 คือการซ่อนข้อมูลชิ้นที่ร้านต้องรีบรู้ที่สุด
    expect(computeOrderProfit({ totalAmount: 150, items: [{ cost: 200, qty: 1 }] })).toEqual({
      amount: -50,
      hasMissingCost: false,
    })
  })

  it('รับ Decimal ของ Prisma (object ที่ toString ได้) ไม่ใช่เฉพาะ number', () => {
    // Prisma คืน Decimal ไม่ใช่ number — ถ้าสูตรไม่ผ่าน Number() จะได้ NaN เงียบ ๆ
    const decimal = (v: string) => ({ toString: () => v, valueOf: () => v })
    expect(
      computeOrderProfit({ totalAmount: decimal('750.00'), items: [{ cost: decimal('180.50'), qty: 2 }] }),
    ).toEqual({ amount: 389, hasMissingCost: false })
  })

  it('ปัดเศษแบบเดียวกับ pnl.service (ไม่ให้ float หลุดออกไปหน้าจอ)', () => {
    // 0.1 + 0.2 ปัญหาคลาสสิก — ถ้าไม่ปัด จะได้ 33.33000000000001 บนหน้าจอจริง
    const r = computeOrderProfit({
      totalAmount: 100,
      items: [{ cost: 66.67, qty: 1 }],
    })
    expect(r.amount).toBe(33.33)
  })
})

describe('productMargin', () => {
  it('คำนวณ % จากราคาขายเป็นฐาน', () => {
    expect(productMargin({ price: 200, cost: 150 })).toBe(25)
    expect(productMargin({ price: 100, cost: 40 })).toBe(60)
  })

  it('ยังไม่ตั้งต้นทุน → null (คือ "ไม่รู้" ไม่ใช่ "0%")', () => {
    // TC-EXT-09 — UI ต้องแปลง null เป็น "—" ห้ามเป็น 0%
    expect(productMargin({ price: 200, cost: null })).toBeNull()
    expect(productMargin({ price: 200, cost: undefined })).toBeNull()
  })

  it('ราคา 0 หรือติดลบ → null (กันหารศูนย์)', () => {
    expect(productMargin({ price: 0, cost: 50 })).toBeNull()
    expect(productMargin({ price: -10, cost: 5 })).toBeNull()
  })

  it('ต้นทุนสูงกว่าราคาขาย → มาร์จิ้นติดลบ', () => {
    expect(productMargin({ price: 150, cost: 200 })).toBe(-33.33)
  })

  it('ต้นทุน 0 (ของแถม/ผลิตเอง) → 100% ไม่ใช่ null', () => {
    // ต่างจาก cost=null ให้ขาด: 0 คือ "ตั้งไว้แล้วว่าไม่มีต้นทุน" ซึ่งเป็นค่าจริง
    expect(productMargin({ price: 120, cost: 0 })).toBe(100)
  })

  it('ค่าที่แปลงเป็นตัวเลขไม่ได้ → null ไม่ใช่ NaN หลุดออกไป', () => {
    expect(productMargin({ price: 'ห้าสิบ', cost: 10 })).toBeNull()
  })
})
