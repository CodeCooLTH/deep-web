/**
 * measureTemplate (EXT 00070 · T6 · AC-EXT-08-2/3) — วัดทั้ง message รวม altText ที่ระดับ 3
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bytesOf } from '@/lib/line/flex-summary-report'
import { defaultTemplateFromFlags, type Block, type TemplateV1 } from '../template'
import { measureTemplate, TEMPLATE_BYTES_LIMIT, TEMPLATE_LARGE_WARNING } from '../template-size'

beforeEach(() => {
  process.env.NEXT_PUBLIC_SELLER_URL = 'https://seller.deepthailand.app'
})
afterEach(() => {
  delete process.env.NEXT_PUBLIC_SELLER_URL
})

const flags = { showOrders: true, showSales: true, showCancelled: true, showTopProducts: true, showProfit: true, attachCycleToDaily: true, monthlyEnabled: true }
const std = defaultTemplateFromFlags(flags)
const noTop3 = defaultTemplateFromFlags({ ...flags, showTopProducts: false })
const text = (i: number, spans: boolean): Block => ({
  id: `t${i}`,
  type: 'text',
  style: { bold: false, size: 'm', color: 'ink' },
  // span หนัก: สลับตัวหนาทุกตัวอักษร → 1 span ต่อตัว (กรณีเลวร้ายของข้อความอิสระ 120 ตัวอักษร)
  runs: Array.from({ length: 120 }, (_, k) => ({ t: 'ก', ...(spans && k % 2 ? { b: true as const } : {}) })),
})
const T = (blocks: Block[]): TemplateV1 => ({ v: 1, button: { show: true, label: 'เปิด Deep' }, blocks })
const withCharts = (): TemplateV1 => ({ ...std, blocks: [...std.blocks, { id: 'c1', type: 'chart_trend', measure: 'sales' }, { id: 'c2', type: 'chart_compare', measure: 'sales' }] })

describe('measureTemplate', () => {
  it('แบบมาตรฐาน (ไม่มี Top3): ผ่าน · ไม่มี warning · bytes ≤ fullBytes · มี Top3 ที่กรณีเลวร้ายสุดล้นระดับ 0 → warning', () => {
    expect(measureTemplate(std).warnings).toEqual([TEMPLATE_LARGE_WARNING])
    const m = measureTemplate(noTop3)
    expect(m.limit).toBe(TEMPLATE_BYTES_LIMIT)
    expect(m.bytes).toBeLessThanOrEqual(30_000)
    expect(m.bytes).toBeLessThanOrEqual(m.fullBytes)
    expect(m.warnings).toEqual([])
  })
  it('ระดับ 0 ล้นแต่ระดับ 3 ผ่าน (Top3 + กราฟ) → บันทึกได้ พร้อม warning', () => {
    const m = measureTemplate(withCharts())
    expect(m.fullBytes).toBeGreaterThan(30_000)
    expect(m.bytes).toBeLessThanOrEqual(30_000)
    expect(m.warnings).toEqual([TEMPLATE_LARGE_WARNING])
  })
  it('ข้อความอิสระ 6×120 ตัวอักษรไทย ไม่ใช้ span → ผ่าน · span หนัก → เกินเพดาน (บันทึกไม่ได้)', () => {
    const plain = measureTemplate(T([std.blocks[0], ...[0, 1, 2, 3, 4, 5].map((i) => text(i, false))]))
    expect(plain.bytes).toBeLessThanOrEqual(30_000)
    const heavy = measureTemplate(T([std.blocks[0], ...[0, 1, 2, 3, 4, 5].map((i) => text(i, true))]))
    expect(heavy.bytes).toBeGreaterThan(30_000)
  })
  it('ผลเท่าเดิมทุกครั้ง (pure · ไม่อ่านนาฬิกา)', () => {
    expect(measureTemplate(std)).toEqual(measureTemplate(std))
  })
  it('bytesOf (TextEncoder) = Buffer.byteLength ทุกชนิดตัวอักษร (AC-EXT-08-3)', () => {
    for (const s of ['abc', 'ก็ ฿18,902,340 ทดสอบ', 'สระซ้อน กิ่ง ผู้ชี้', '😀', JSON.stringify(measureTemplate(std))]) {
      expect(bytesOf(s)).toBe(Buffer.byteLength(s, 'utf8'))
    }
  })
})

describe('EXT-EXP: บล็อกการเงิน (AC-EXP-03-6)', () => {
  const finBlocks: Block[] = [...std.blocks, { id: 'x1', type: 'expense' }, { id: 'x2', type: 'net_sales' }]
  it('การเงินเต็ม + ข้อความอิสระ 6×120 (ไม่ span) → ผลตามจริง ≤ เพดานที่ระดับ 3 และ fixture มี finance (ไบต์เพิ่มจากไม่มีบล็อก)', () => {
    const base = [std.blocks[0], ...[0, 1, 2, 3, 4, 5].map((i) => text(i, false))]
    const m = measureTemplate(T([...base, { id: 'x1', type: 'expense' }, { id: 'x2', type: 'net_sales' }]))
    expect(m.bytes).toBeLessThanOrEqual(30_000)
    expect(m.bytes).toBeGreaterThan(measureTemplate(T(base)).bytes)
  })
  it('แบบมาตรฐาน + การเงิน ไม่ทำให้ระดับ 3 เกินเพดาน', () => {
    expect(measureTemplate(T(finBlocks)).bytes).toBeLessThanOrEqual(30_000)
  })
})
