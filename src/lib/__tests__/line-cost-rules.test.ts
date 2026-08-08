// line-cost-rules.test.ts — ล็อกกฎ "ต้นทุนรายบรรทัด" ของ FR-EXP-17 / D-EXT-6
//
// กฎพวกนี้อยู่ใน resolveLineCosts() + การ map itemsCreateData ของ order.service.ts ซึ่งผูกกับ
// prisma transaction จน unit test ตรง ๆ ต้อง mock ทั้งก้อน — เทสชุดนี้จึงล็อก **ตรรกะการตัดสิน**
// ที่แยกออกมาเป็นฟังก์ชันบริสุทธิ์ได้ เพื่อให้กฎถูกเขียนเป็นโค้ดที่รันได้ ไม่ใช่แค่ประโยคในเอกสาร
//
// ทำไมต้องมี: ตรรกะนี้ตัดสิน "เงิน" และถ้าเพี้ยนจะไม่มีอะไรพัง มีแต่กำไรที่ผิดอยู่บนหน้าจอ
// (เหตุผลเดียวกับ order-revenue.test.ts / order-profit.test.ts)

import { describe, expect, it } from 'vitest'

/** ค่าที่จะถูกเขียนลง OrderItem.cost — ก็อปตรรกะจาก order.service.ts::itemsCreateData */
const snapshotCost = (typed: number | undefined, productCost: number | null | undefined) =>
  typed ?? (productCost ?? null)

/** ควร write-back เข้า Product.cost ไหม — ก็อปตรรกะจาก resolveLineCosts() */
const shouldWriteBack = (typed: number | undefined, productCost: number | null | undefined) =>
  typed != null && productCost == null

describe('OrderItem.cost — ค่าที่ถูก snapshot ลงบิล', () => {
  it('ไม่กรอก → ใช้ต้นทุนของสินค้า (พฤติกรรมเดิม FR-EXP-02 ห้ามเปลี่ยน)', () => {
    expect(snapshotCost(undefined, 150)).toBe(150)
  })

  it('ไม่กรอก และสินค้าไม่มีต้นทุน → null (ไม่ใช่ 0)', () => {
    // null = "ไม่รู้" ต้องต่างจาก 0 = "ไม่มีต้นทุนจริง" — computeOrderProfit ข้าม null แต่หัก 0
    expect(snapshotCost(undefined, null)).toBeNull()
    expect(snapshotCost(undefined, undefined)).toBeNull()
  })

  it('[D-EXT-6] กรอกแล้วชนะเสมอ แม้สินค้ามีต้นทุนอยู่ก่อน', () => {
    // ทางเลือกอีกทาง (ให้ต้นทุนสินค้าชนะ) แปลว่าผู้ขายพิมพ์ตัวเลขแล้วมันหายเงียบ ๆ
    expect(snapshotCost(90, 150)).toBe(90)
  })

  it('[D-EXT-6] กรอก 0 ต้องชนะด้วย ไม่ใช่ถูกมองว่า "ไม่ได้กรอก"', () => {
    // จุดที่พลาดง่ายที่สุด: ถ้าเขียน `typed || productCost` แทน `??` เคสนี้จะได้ 150
    expect(snapshotCost(0, 150)).toBe(0)
    expect(snapshotCost(0, null)).toBe(0)
  })
})

describe('Product.cost — เขียนกลับเข้าสินค้าเมื่อไหร่', () => {
  it('[D-EXT-5] สินค้ายังไม่มีต้นทุน + กรอกมา → เขียนกลับ', () => {
    expect(shouldWriteBack(120, null)).toBe(true)
    expect(shouldWriteBack(120, undefined)).toBe(true)
  })

  it('[D-EXT-5] กรอก 0 ก็เขียนกลับ (0 คือค่าจริง ไม่ใช่การเว้นว่าง)', () => {
    expect(shouldWriteBack(0, null)).toBe(true)
  })

  it('[D-EXT-6] สินค้ามีต้นทุนอยู่แล้ว → ห้ามทับ แม้ผู้ขายกรอกค่าอื่น', () => {
    // การเปิดบิลใบเดียวต้องไม่เปลี่ยนต้นทุนอ้างอิงของสินค้าเงียบ ๆ
    expect(shouldWriteBack(90, 150)).toBe(false)
    expect(shouldWriteBack(0, 150)).toBe(false)
  })

  it('ไม่กรอก → ไม่เขียนกลับไม่ว่ากรณีใด', () => {
    expect(shouldWriteBack(undefined, null)).toBe(false)
    expect(shouldWriteBack(undefined, 150)).toBe(false)
  })
})
