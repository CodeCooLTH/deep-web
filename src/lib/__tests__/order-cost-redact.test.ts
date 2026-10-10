import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { stripOrderItemCost } from '../order-cost-redact'

describe('stripOrderItemCost', () => {
  const order = { id: 'o', items: [{ name: 'a', price: 10, cost: 5 }, { name: 'b', price: 3, cost: null }] }

  it('ผู้ไม่ใช่เจ้าของ: ไม่มีคีย์ cost ทุกบรรทัด (ไม่ใช่ null) · ราคาคงไว้', () => {
    const out = stripOrderItemCost(order, false)
    for (const it of out.items) expect('cost' in it).toBe(false)
    expect(out.items.map((i) => i.price)).toEqual([10, 3])
  })

  it('เจ้าของ: เหมือนเดิม', () => {
    expect(stripOrderItemCost(order, true)).toBe(order)
  })

  it('ไม่มี items: คืนเดิม', () => {
    const noItems: { id: string; items?: object[] } = { id: 'x' }
    expect(stripOrderItemCost(noItems, false)).toEqual({ id: 'x' })
  })
})

// route ที่ส่งออเดอร์ทั้งแถว (items: true) ต้องผ่านตัวตัด — สแกนการเรียกจริง ไม่ใช่แค่ import
describe('route ออเดอร์ส่ง response ผ่าน stripOrderItemCost', () => {
  const src = readFileSync('src/app/api/orders/route.ts', 'utf8')
  it('GET รายการ', () => {
    expect(src).toMatch(/NextResponse\.json\(orders\.map\(\(o\) => stripOrderItemCost\(o, canSeeCost\)\)\)/)
  })
  it('POST สร้าง', () => {
    expect(src).toMatch(/NextResponse\.json\(stripOrderItemCost\(order, canSeeCost\), \{ status: 201 \}\)/)
  })
})
