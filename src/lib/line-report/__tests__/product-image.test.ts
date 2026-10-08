import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { lineProductImageUrl, verifyProductImageSig } from '../product-image'

const env = { ...process.env }
beforeEach(() => {
  process.env.NEXT_PUBLIC_SELLER_URL = 'https://seller.example.app'
  process.env.NEXTAUTH_SECRET = 'test-secret'
})
afterEach(() => {
  process.env = { ...env }
})
const parse = (u: string) => new URL(u).searchParams

describe('ลายเซ็นรูปสินค้าในรายงาน LINE', () => {
  it('URL ที่ออกให้ verify ผ่าน · คงที่ต่อคีย์ (retry ส่ง payload เดิม)', () => {
    const u = lineProductImageUrl('2026/10/08/a.png')!
    expect(verifyProductImageSig(parse(u).get('k')!, parse(u).get('s')!)).toBe(true)
    expect(lineProductImageUrl('2026/10/08/a.png')).toBe(u)
  })
  it('คีย์อื่น/ลายเซ็นปลอม/secret ต่าง → ไม่ผ่าน (ใช้ลายเซ็นของรูปสินค้าอ่านไฟล์อื่นไม่ได้)', () => {
    const s = parse(lineProductImageUrl('2026/10/08/a.png')!).get('s')!
    expect(verifyProductImageSig('2026/10/08/kyc.png', s)).toBe(false)
    expect(verifyProductImageSig('2026/10/08/a.png', s.slice(0, -1) + (s.endsWith('A') ? 'B' : 'A'))).toBe(false)
    expect(verifyProductImageSig('2026/10/08/a.png', '')).toBe(false)
    process.env.NEXTAUTH_SECRET = 'other'
    expect(verifyProductImageSig('2026/10/08/a.png', s)).toBe(false)
  })
  it('ไม่ใช่คีย์บัคเก็ต / path traversal / ไม่มี env → ไม่ออก URL และ verify ไม่ผ่าน', () => {
    for (const k of ['https://cdn.x/a.jpg', '/images/a.png', '../etc/passwd', 'a b.png', '']) expect(lineProductImageUrl(k)).toBeUndefined()
    expect(verifyProductImageSig('../x', 'whatever')).toBe(false)
    delete process.env.NEXTAUTH_SECRET
    expect(lineProductImageUrl('2026/10/08/a.png')).toBeUndefined()
  })
})
