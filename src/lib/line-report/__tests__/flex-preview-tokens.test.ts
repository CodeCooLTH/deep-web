import { describe, expect, it } from 'vitest'
import { FLEX_COLORS } from '@/lib/line/flex-summary-report'
import { buildSummaryReportFlex } from '@/lib/line/flex-summary-report'
import type { TemplateV1 } from '../template'
import { buildSampleSummary } from '../preview-sample'
import {
  FLEX_INK_CLASS,
  FLEX_SUPPORTED_KEYS,
  GAP,
  ITEMS,
  JUSTIFY,
  MARGIN,
  RADIUS,
  TEXT_SIZE,
  flexBgClass,
  flexColorClass,
  isFlexLength,
} from '../flex-preview-tokens'

describe('flexColorClass', () => {
  it('ทุกสีของ builder มีคลาสของมันเอง (builder เพิ่ม/เปลี่ยนสี → เทสแดง)', () => {
    expect(flexColorClass(FLEX_COLORS.ACCENT)).toBe('text-primary')
    expect(flexColorClass(FLEX_COLORS.SLATE)).toBe('text-default-700')
    expect(flexColorClass(FLEX_COLORS.DANGER)).toBe('text-danger-ink')
    expect(flexColorClass(FLEX_COLORS.INK)).toBe(FLEX_INK_CLASS)
    // สีต่างกันต้องได้คลาสต่างกัน (กัน map ตกไป default หมด)
    expect(flexColorClass(FLEX_COLORS.PENDING_TEXT)).toBe('text-warning-ink')
    // ACCENT/INK/SLATE/DANGER/PENDING_TEXT · GRID_GRAY ตกเป็นเทากลาง · เขียว/เหลืองใช้เป็นพื้นแท่งเท่านั้น (บนตัวอักษรตกเป็นหมึก)
    expect(new Set(Object.values(FLEX_COLORS).map(flexColorClass)).size).toBe(5)
  })
  it('ไม่สนตัวพิมพ์ · ไม่รู้จัก/ไม่ใช่สตริง → หมึกปกติ', () => {
    expect(flexColorClass(FLEX_COLORS.ACCENT.toUpperCase())).toBe('text-primary')
    expect(flexColorClass('#123456')).toBe(FLEX_INK_CLASS)
    expect(flexColorClass(undefined)).toBe(FLEX_INK_CLASS)
  })
})

describe('flexBgClass', () => {
  it('ทุกสีพื้นที่กราฟใช้มีคลาส · ไม่รู้จัก → ไม่ใส่พื้น', () => {
    expect(flexBgClass(FLEX_COLORS.ACCENT)).toBe('bg-primary')
    expect(flexBgClass(FLEX_COLORS.GRID_GRAY)).toBe('bg-default-300')
    expect(flexBgClass('#123456')).toBeUndefined()
  })
})

/** เทมเพลตที่เปิดทุกบล็อก + ข้อความอิสระที่มี span ครบ (ตัวหนา/สีเน้น/โทเคน) + กราฟทั้ง 2 ชนิด × 2 measure */
const TEMPLATE: TemplateV1 = {
  v: 1,
  title: 'ทดสอบ',
  button: { show: true, label: 'เปิด Deep' },
  blocks: [
    { id: 'b0', type: 'orders' },
    { id: 'b1', type: 'sales' },
    { id: 'b2', type: 'cancelled' },
    { id: 'b3', type: 'shops', top3: true, profit: true },
    { id: 'b4', type: 'cycle' },
    { id: 'b5', type: 'profit' },
    { id: 'b6', type: 'text', style: { bold: true, size: 'l', color: 'accent' }, runs: [{ t: 'สวัสดี ' }, { t: 'ตัวหนา', b: true }, { t: ' เน้น', accent: true }, { tok: 'shop_name' }] },
    { id: 'b7', type: 'text', style: { bold: false, size: 's', color: 'slate' }, runs: [{ t: 'ธรรมดา' }] },
    { id: 'b8', type: 'separator' },
    { id: 'b9', type: 'chart_trend', measure: 'sales' },
    { id: 'b10', type: 'chart_trend', measure: 'orders' },
    { id: 'b11', type: 'chart_compare', measure: 'sales' },
    { id: 'b12', type: 'chart_compare', measure: 'orders' },
  ],
}

function fixtureMessage() {
  const base = buildSampleSummary({
    shops: [
      { id: 'a', name: 'ร้าน A', vertical: 'ONLINE_SALES', state: 'OK' },
      { id: 'b', name: 'ร้าน B', vertical: 'ONLINE_SALES', state: 'OK' },
      { id: 'c', name: 'ร้าน C', vertical: 'ONLINE_SALES', state: 'OK' },
    ],
    window: { startIso: '2026-10-05', endIso: '2026-10-05' },
    computedAtIso: '2026-10-05T11:00:00.000Z',
  })
  // ร้าน C ล้ม → หมายเหตุสีแดง · trendPartial → หมายเหตุกราฟไม่ครบ
  const summary = { ...base, shops: base.shops.map((s, i) => (i === 2 ? { ...s, state: 'ERROR' as const } : { ...s, profit: { netProfit: 1000, capped: false } })), trendPartial: true }
  const totals = { orders: 500, confirmed: 2_000_000, unconfirmed: 0, cancelled: 3 }
  return buildSummaryReportFlex({ summary, kind: 'TEST', template: TEMPLATE, cycleToDate: { startIso: '2026-10-01', endIso: '2026-10-05', totals } })[0].contents as Record<string, unknown>
}

function walk(n: unknown, visit: (n: Record<string, unknown>) => void) {
  if (!n || typeof n !== 'object') return
  const node = n as Record<string, unknown>
  if (typeof node.type === 'string') visit(node)
  for (const k of ['body', 'footer']) walk(node[k], visit)
  if (Array.isArray(node.contents)) node.contents.forEach((c) => walk(c, visit))
}

describe('พรีวิวรู้จักทุกอย่างที่ composer ปล่อย (T11d)', () => {
  const seen = { types: new Set<string>(), bg: new Set<string>(), spans: 0, pctHeight: 0, pctWidth: 0 }
  const problems: string[] = []
  walk(fixtureMessage(), (n) => {
    const t = n.type as string
    seen.types.add(t)
    const keys = FLEX_SUPPORTED_KEYS[t]
    if (!keys) return void problems.push(`ชนิดโหนดที่พรีวิวไม่รู้จัก: ${t}`)
    for (const k of Object.keys(n)) if (!keys.includes(k)) problems.push(`${t}.${k} ไม่อยู่ใน FLEX_SUPPORTED_KEYS`)
    const enumOf = (k: string, m: Record<string, string>) => {
      if (typeof n[k] === 'string' && !(n[k] in m)) problems.push(`${t}.${k}=${n[k]} ไม่มี mapping`)
    }
    if (t === 'box') {
      enumOf('margin', MARGIN)
      enumOf('spacing', GAP)
      enumOf('cornerRadius', RADIUS)
      enumOf('alignItems', ITEMS)
      enumOf('justifyContent', JUSTIFY)
      for (const k of ['height', 'width']) if (n[k] !== undefined && !isFlexLength(n[k])) problems.push(`box.${k}=${String(n[k])} ไม่ใช่ px/%`)
      if (typeof n.height === 'string' && n.height.endsWith('%')) seen.pctHeight++
      if (typeof n.width === 'string' && n.width.endsWith('%')) seen.pctWidth++
      if (n.backgroundColor !== undefined) {
        seen.bg.add(String(n.backgroundColor))
        if (!flexBgClass(n.backgroundColor)) problems.push(`box.backgroundColor=${String(n.backgroundColor)} ไม่มีคลาสพื้น`)
      }
    }
    if (t === 'text') {
      enumOf('margin', MARGIN)
      enumOf('size', TEXT_SIZE)
    }
    if (t === 'span') seen.spans++
    if (typeof n.color === 'string' && t !== 'button' && flexColorClass(n.color) === FLEX_INK_CLASS && n.color.toLowerCase() !== FLEX_COLORS.INK.toLowerCase()) {
      problems.push(`${t}.color=${n.color} ไม่มี mapping (ตกเป็นหมึก)`)
    }
  })

  it('ไม่มี key/ค่า/สีที่พรีวิวไม่รู้จัก', () => {
    expect(problems).toEqual([])
  })
  it('fixture ครอบคลุมจริง: span · แท่ง % สูง/กว้าง · filler · สีพื้น 2 สี', () => {
    expect(seen.spans).toBeGreaterThan(0)
    expect(seen.pctHeight).toBeGreaterThan(0)
    expect(seen.pctWidth).toBeGreaterThan(0)
    expect(seen.types.has('filler')).toBe(true)
    // ทุกสีพื้นที่ composer ปล่อยต้องมีคลาส (ไม่โปร่งเงียบ)
    for (const h of seen.bg) expect(flexBgClass(h), h).toBeDefined()
    expect(seen.bg.size).toBeGreaterThanOrEqual(2)
  })
})
