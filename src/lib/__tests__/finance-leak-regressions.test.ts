import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * 00071 — ช่องรั่วเดิม (ก่อน P1) ที่ security review ปลาย P1 เจอ · สแกนซอร์สจริงต่อจุด
 * H1 รีวิวสาธารณะคืน OrderItem.cost + reviewerContact ให้ใครก็ได้
 * H2 ออเดอร์ฝั่งผู้ซื้อคืน cost ของร้าน
 * M1 /categories คำนวณยอดขายรายหมวดให้ทุกบทบาท
 */
const read = (p: string) => readFileSync(p, 'utf8')
// ตัดคอมเมนต์ก่อนจับ — คอมเมนต์ที่อธิบายบั๊กเดิมจะได้ไม่ทำให้เทสแดง/เขียวปลอม
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function fnBody(src: string, name: string): string {
  const i = src.indexOf(`export async function ${name}(`)
  expect(i, name).toBeGreaterThan(-1)
  const next = src.indexOf('\nexport ', i + 1)
  return src.slice(i, next === -1 ? undefined : next)
}

describe('H1 รีวิวสาธารณะ', () => {
  it('getReviewsByUsername ไม่ดึง items', () => {
    expect(fnBody(code('src/services/review.service.ts'), 'getReviewsByUsername')).not.toMatch(/items\s*:/)
  })
  it('API สาธารณะไม่ส่งแถวดิบ · ไม่มี reviewerContact ใน response · take มีเพดาน', () => {
    const s = code('src/app/api/public/reviews/[username]/route.ts')
    expect(s).not.toMatch(/NextResponse\.json\(reviews\)/)
    expect(s).not.toMatch(/reviewerContact\s*:/)
    expect(s).toMatch(/MAX_TAKE/)
  })
})

describe('H2 ออเดอร์ฝั่งผู้ซื้อ', () => {
  it('getOrdersByBuyer omit cost ของ items', () => {
    expect(fnBody(code('src/services/order.service.ts'), 'getOrdersByBuyer')).toMatch(/items:\s*\{\s*omit:\s*\{\s*cost:\s*true\s*\}\s*\}/)
  })
})

describe('M1 /categories', () => {
  const s = code('src/app/(paces)/seller/(dashboard)/categories/page.tsx')
  it('ตัดสินด้วย F1 และไม่คำนวณยอดเมื่อไม่มีสิทธิ์', () => {
    expect(s).toMatch(/const showRevenue = can\(rolesFromMembership\(active\.role\), 'F1'\)/)
    expect(s).toMatch(/const revenue = !showRevenue \? undefined :/)
  })
})
