import { describe, it, expect } from 'vitest'
import { buildLineFlexOrderCard } from '@/lib/line/flex-order-card'

/** เดินลง tree ของ flex เก็บ text ทั้งหมด — เทสจะได้ไม่ผูกกับตำแหน่ง index ที่ขยับได้ทุกครั้งที่จัด layout */
function allTexts(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const n of node) allTexts(n, out)
    return out
  }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (o.type === 'text' && typeof o.text === 'string') out.push(o.text)
    for (const v of Object.values(o)) allTexts(v, out)
  }
  return out
}

function findButton(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findButton(n)
      if (f) return f
    }
    return null
  }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (o.type === 'button') return o
    for (const v of Object.values(o)) {
      const f = findButton(v)
      if (f) return f
    }
  }
  return null
}

const base = {
  title: 'เสื้อยืดสีขาว',
  extraItemCount: 0,
  totalText: '฿590',
  url: 'https://deepthailand.app/o/abc123',
}

describe('buildLineFlexOrderCard', () => {
  it('[blocker] altText ต้องมีทั้งชื่อของและยอดเงิน — มันคือสิ่งเดียวที่ลูกค้าเห็นใน notification', () => {
    // flex ไม่ถูกเรนเดอร์ในรายการแชท/การแจ้งเตือน ถ้า altText ไม่มีเนื้อหา ลูกค้าจะไม่รู้เลยว่ามี
    // ออเดอร์เข้ามาจนกว่าจะเปิดห้องแชท
    const c = buildLineFlexOrderCard(base)
    expect(c.altText).toContain('เสื้อยืดสีขาว')
    expect(c.altText).toContain('฿590')
  })

  it('altText ยาวเกิน 1500 ตัวอักษรต้องถูกตัด (LINE ปฏิเสธทั้งข้อความถ้าเกิน)', () => {
    const c = buildLineFlexOrderCard({ ...base, title: 'ก'.repeat(3000) })
    expect(c.altText.length).toBeLessThanOrEqual(1500)
  })

  it('การ์ดแสดงชื่อสินค้าและยอดสุทธิ', () => {
    const texts = allTexts(buildLineFlexOrderCard(base).contents)
    expect(texts).toContain('เสื้อยืดสีขาว')
    expect(texts).toContain('฿590')
    expect(texts).toContain('ยอดสุทธิ')
  })

  it('[blocker] มีหลายรายการ → บอก "และอีก n รายการ" · มีรายการเดียว → ต้องไม่มีบรรทัดนั้น', () => {
    const many = allTexts(buildLineFlexOrderCard({ ...base, extraItemCount: 2 }).contents)
    expect(many).toContain('และอีก 2 รายการ')

    const one = allTexts(buildLineFlexOrderCard({ ...base, extraItemCount: 0 }).contents)
    expect(one.some((t) => t.includes('และอีก'))).toBe(false)
  })

  it('[blocker] ปุ่มต้องเป็น uri action ที่ชี้ลิงก์ออเดอร์จริง และป้ายไม่เกิน 20 ตัวอักษร', () => {
    const btn = findButton(buildLineFlexOrderCard(base).contents)
    expect(btn).not.toBeNull()
    const action = btn!.action as Record<string, unknown>
    expect(action.type).toBe('uri')
    expect(action.uri).toBe('https://deepthailand.app/o/abc123')
    // เกิน 20 ตัว = LINE ตีข้อความตกทั้งใบ ไม่ใช่แค่ตัดป้าย
    expect(String(action.label).length).toBeLessThanOrEqual(20)
  })

  it('ใช้สีแบรนด์ฝั่งผู้ซื้อ ไม่ใช่สี Paces ของฝั่งผู้ขาย (การ์ดนี้ไปโผล่ในแอป LINE ของลูกค้า)', () => {
    const json = JSON.stringify(buildLineFlexOrderCard(base).contents)
    expect(json).toContain('#7367F0') // design.json → colorMeta.primary.canonical
    expect(json).not.toContain('#236dc9') // paces-primary = surface ของผู้ขายเท่านั้น (HR7)
    expect(json).not.toContain('#000000') // Ink Plum ไม่ใช่ดำสนิท
  })

  it('ชื่อสินค้ายาวต้อง wrap ไม่ใช่ถูกตัดหาย', () => {
    const json = JSON.stringify(buildLineFlexOrderCard({ ...base, title: 'ชื่อสินค้ายาวมาก '.repeat(10) }).contents)
    expect(json).toContain('"wrap":true')
  })
})
