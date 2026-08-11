import { describe, it, expect } from 'vitest'
import { buildLineFlexProductCard } from '@/lib/line/flex-product-card'

function texts(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const n of node) texts(n, out)
    return out
  }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (o.type === 'text' && typeof o.text === 'string') out.push(o.text)
    for (const v of Object.values(o)) texts(v, out)
  }
  return out
}

const base = {
  name: 'เสื้อยืดคอกลม สีขาว ไซส์ L',
  priceText: '฿1,290',
  imageUrl: 'https://cdn.example.com/p.jpg',
  isActive: true,
}

describe('buildLineFlexProductCard', () => {
  it('[blocker] altText ต้องมีทั้งชื่อและราคา — คือสิ่งเดียวที่ลูกค้าเห็นใน notification', () => {
    const c = buildLineFlexProductCard(base)
    expect(c.altText).toContain('เสื้อยืดคอกลม สีขาว ไซส์ L')
    expect(c.altText).toContain('฿1,290')
  })

  it('การ์ดแสดงชื่อ + ราคา + รูป', () => {
    const c = buildLineFlexProductCard(base)
    expect(texts(c.contents)).toContain('เสื้อยืดคอกลม สีขาว ไซส์ L')
    expect(texts(c.contents)).toContain('฿1,290')
    const hero = (c.contents as Record<string, unknown>).hero as Record<string, unknown>
    expect(hero.url).toBe('https://cdn.example.com/p.jpg')
  })

  it('[blocker] ไม่มีรูป → การ์ดต้องไม่มี hero เลย ไม่ใช่ hero ที่ url ว่าง (LINE จะขึ้นกรอบว่าง)', () => {
    const c = buildLineFlexProductCard({ ...base, imageUrl: null })
    expect((c.contents as Record<string, unknown>).hero).toBeUndefined()
    // ชื่อกับราคายังต้องอ่านได้ครบ
    expect(texts(c.contents)).toContain('เสื้อยืดคอกลม สีขาว ไซส์ L')
    expect(texts(c.contents)).toContain('฿1,290')
  })

  it('[blocker] สินค้าหยุดขาย → ขึ้นป้าย "หยุดขายแล้ว" · ขายอยู่ → ต้องไม่มีป้ายนั้น', () => {
    expect(texts(buildLineFlexProductCard({ ...base, isActive: false }).contents)).toContain('หยุดขายแล้ว')
    expect(texts(buildLineFlexProductCard(base).contents).some((t) => t.includes('หยุดขาย'))).toBe(false)
  })

  it('ป้าย "หยุดขายแล้ว" สื่อด้วยคำ ไม่ใช่สีอย่างเดียว (WCAG 1.4.1) และไม่ใช้เฉดที่คอนทราสต์ตก', () => {
    const json = JSON.stringify(buildLineFlexProductCard({ ...base, isActive: false }).contents)
    expect(json).toContain('หยุดขายแล้ว')
    // ห้ามใช้แดง/ส้มเป็นตัวอักษรบนพื้นขาว — คอนทราสต์ต่ำกว่าเกณฑ์ข้อความทุกเฉดที่ design.json มี
    expect(json).not.toContain('#FF4C51')
    expect(json).not.toContain('#FF9F43')
  })

  it('ไม่มีปุ่ม — ระบบไม่มีหน้าสาธารณะของสินค้ารายชิ้นให้ลิงก์ไป (parity กับการ์ดในแอป)', () => {
    const json = JSON.stringify(buildLineFlexProductCard(base).contents)
    expect(json).not.toContain('"type":"button"')
    expect(json).not.toContain('"footer"')
  })

  it('ชื่อสินค้ายาวต้อง wrap · ใช้สีแบรนด์ฝั่งผู้ซื้อ ไม่ใช่ Paces', () => {
    const json = JSON.stringify(buildLineFlexProductCard(base).contents)
    expect(json).toContain('"wrap":true')
    expect(json).not.toContain('#236dc9')
  })
})
