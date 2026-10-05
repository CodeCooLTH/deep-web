import { describe, expect, it } from 'vitest'
import { blockWarning, contextAvailability, libraryAvailability, REASON, top3Availability } from '../availability'
import type { TemplateV1 } from '../template'

const ctx = (monthlyEnabled: boolean, ...v: (string | null)[]) => ({ monthlyEnabled, shops: v.map((vertical) => ({ vertical })) })
const t = (...b: TemplateV1['blocks']): TemplateV1 => ({ v: 1, button: { show: true, label: 'x' }, blocks: b })

describe('availability', () => {
  it('cycle ต้องเปิดรายเดือน', () => {
    expect(contextAvailability('cycle', ctx(false, 'ONLINE_SALES'))).toEqual({ ok: false, reason: REASON.CYCLE_NEEDS_MONTHLY })
    expect(contextAvailability('cycle', ctx(true, 'ONLINE_SALES')).ok).toBe(true)
  })
  it('เทียบรายร้านต้อง ≥2 ร้าน', () => {
    expect(contextAvailability('chart_compare', ctx(true, 'ONLINE_SALES')).ok).toBe(false)
    expect(contextAvailability('chart_compare', ctx(true, 'ONLINE_SALES', 'SERVICE_QUEUE')).ok).toBe(true)
  })
  it('top3 ปิดเมื่อ LODGING ล้วน · ผสมได้', () => {
    expect(top3Availability(ctx(true, 'LODGING', 'LODGING')).ok).toBe(false)
    expect(top3Availability(ctx(true, 'LODGING', 'ONLINE_SALES')).ok).toBe(true)
  })
  it('คลัง: ใช้ครบแล้ว / ครบ 20 / ข้อความครบ 6', () => {
    const c = ctx(true, 'ONLINE_SALES')
    expect(libraryAvailability('orders', t({ id: 'a', type: 'orders' }), c)).toEqual({ ok: false, reason: REASON.USED_UP })
    expect(libraryAvailability('orders', t(), c).ok).toBe(true)
    const full = t(...Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, type: 'separator' as const })))
    expect(libraryAvailability('text', full, c)).toEqual({ ok: false, reason: REASON.BLOCKS_FULL })
    const six = t(...Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, type: 'text' as const, style: { bold: false, size: 's' as const, color: 'ink' as const }, runs: [{ t: 'a' }] })))
    expect(libraryAvailability('text', six, c).ok).toBe(false)
  })
  it('ผืนงาน: warning ไม่ลบเงียบ', () => {
    expect(blockWarning({ id: 'c', type: 'cycle' }, ctx(false, 'ONLINE_SALES'))).toContain('ไม่ถูกส่งตอนนี้')
    expect(blockWarning({ id: 's', type: 'shops', top3: true, profit: false }, ctx(true, 'LODGING'))).toContain('ขายดี 3 อันดับ')
    expect(blockWarning({ id: 's', type: 'shops', top3: false, profit: false }, ctx(true, 'LODGING'))).toBeNull()
    expect(blockWarning({ id: 'o', type: 'orders' }, ctx(false))).toBeNull()
  })
})
