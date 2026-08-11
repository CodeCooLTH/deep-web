import { describe, it, expect } from 'vitest'
import {
  buildMetaProductCard,
  truncateForMeta,
  META_TITLE_MAX,
  META_SUBTITLE_MAX,
} from '@/lib/meta/product-card'

const base = {
  name: 'เสื้อยืดคอกลม สีขาว ไซส์ L',
  priceText: '฿1,290',
  imageUrl: 'https://cdn.example.com/card.jpg',
  isActive: true,
}

function element(card: Record<string, unknown>): Record<string, unknown> {
  const payload = card.payload as Record<string, unknown>
  return (payload.elements as Record<string, unknown>[])[0]
}

describe('truncateForMeta', () => {
  it('สั้นกว่าเพดาน → ไม่แตะเลย', () => {
    expect(truncateForMeta('เสื้อยืด', 80)).toBe('เสื้อยืด')
  })

  it('[blocker] ยาวเกินเพดาน → ต้องไม่เกิน และมี … บอกว่ายังมีต่อ', () => {
    const out = truncateForMeta('ก'.repeat(200), META_TITLE_MAX)
    expect(out.length).toBeLessThanOrEqual(META_TITLE_MAX)
    expect(out.endsWith('…')).toBe(true)
  })

  it('ตัดที่ช่องว่างคำเมื่อทำได้ — ชื่อสินค้าไทยมักคั่นรุ่น/ไซส์ด้วยช่องว่าง', () => {
    const name = 'เสื้อยืดคอกลมผ้าฝ้าย 100 เปอร์เซ็นต์ สีขาวนวล ไซส์ใหญ่พิเศษ สำหรับผู้ชาย'
    const out = truncateForMeta(name, 40)
    expect(out.length).toBeLessThanOrEqual(40)
    // ไม่ควรจบกลางคำ: ตัวก่อน … ต้องไม่ใช่ตัวที่ถูกหั่นจากคำถัดไปแบบมั่ว ๆ
    expect(out).toContain('เสื้อยืดคอกลมผ้าฝ้าย')
  })

  it('ไม่มีช่องว่างเลย (ชื่อไทยติดกันยาว) → ยังตัดได้ ไม่ throw', () => {
    const out = truncateForMeta('เสื้อยืดคอกลมสีขาวนวลผ้าฝ้ายเนื้อดีใส่สบายระบายอากาศ', 20)
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('buildMetaProductCard', () => {
  it('[blocker] โครงตรงสเปก Generic Template ของ Meta', () => {
    const card = buildMetaProductCard(base)
    expect(card.type).toBe('template')
    const payload = card.payload as Record<string, unknown>
    expect(payload.template_type).toBe('generic')
    expect(Array.isArray(payload.elements)).toBe(true)
    expect((payload.elements as unknown[]).length).toBe(1)
  })

  it('ชื่อ/ราคา/รูป ไปอยู่ในช่องที่ถูกต้อง', () => {
    const el = element(buildMetaProductCard(base))
    expect(el.title).toBe('เสื้อยืดคอกลม สีขาว ไซส์ L')
    expect(el.subtitle).toBe('฿1,290')
    expect(el.image_url).toBe('https://cdn.example.com/card.jpg')
  })

  it('[blocker] ไม่มีรูป → ต้องไม่มีคีย์ image_url เลย (ค่าว่าง = Meta ตีตกทั้งข้อความ)', () => {
    const el = element(buildMetaProductCard({ ...base, imageUrl: null }))
    expect('image_url' in el).toBe(false)
    expect(el.title).toBe('เสื้อยืดคอกลม สีขาว ไซส์ L')
  })

  it('[blocker] สินค้าหยุดขาย → subtitle บอกด้วยคำ · ขายอยู่ → ไม่มีคำนั้น', () => {
    expect(element(buildMetaProductCard({ ...base, isActive: false })).subtitle).toContain('หยุดขายแล้ว')
    expect(String(element(buildMetaProductCard(base)).subtitle)).not.toContain('หยุดขาย')
  })

  it('[blocker] title/subtitle ต้องไม่เกินเพดานของ Meta ไม่ว่าชื่อจะยาวแค่ไหน', () => {
    // เกินแล้ว Meta ตัดให้เองแบบไม่บอก — บทเรียนจาก image_grid ที่ user เจอบน prod 2026-08-04
    const el = element(
      buildMetaProductCard({ ...base, name: 'ก'.repeat(300), priceText: '฿' + '9'.repeat(100), isActive: false }),
    )
    expect(String(el.title).length).toBeLessThanOrEqual(META_TITLE_MAX)
    expect(String(el.subtitle).length).toBeLessThanOrEqual(META_SUBTITLE_MAX)
  })

  it('ไม่มีปุ่ม — parity กับการ์ดในแอปและฝั่ง LINE (ไม่มีหน้าสาธารณะของสินค้ารายชิ้น)', () => {
    const el = element(buildMetaProductCard(base))
    expect('buttons' in el).toBe(false)
    expect('default_action' in el).toBe(false)
  })
})
