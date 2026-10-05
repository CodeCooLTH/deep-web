import { describe, expect, it } from 'vitest'
import { defaultTemplateFromFlags, type TemplateV1 } from '@/lib/line-report/template'
import { buildPreviewContents, previewTemplate } from '../preview-data'

const shops = [
  { id: 'a', name: 'ร้านหนึ่ง', vertical: 'ONLINE_SALES', state: 'OK' },
  { id: 'b', name: 'ร้านสอง', vertical: 'ONLINE_SALES', state: 'OK' },
  { id: 'c', name: 'ร้านสาม', vertical: 'ONLINE_SALES', state: 'OK' },
  { id: 'd', name: 'ร้านล็อก', vertical: 'ONLINE_SALES', state: 'LOCKED' },
]
const tpl = (): TemplateV1 => defaultTemplateFromFlags({ showOrders: true, showSales: true, showCancelled: true, showTopProducts: true, showProfit: false, attachCycleToDaily: false, monthlyEnabled: false })
const args = { template: tpl(), shops, kind: 'DAILY' as const, monthlyEnabled: false, cycle: null, serverNowIso: '2026-10-05T05:00:00.000Z' }

describe('preview-data', () => {
  it('ใช้ composer จริง: ได้ bubble ที่มีชื่อร้าน 50 ตัวอักษรและยอดหลักล้าน', () => {
    const json = JSON.stringify(buildPreviewContents(args))
    expect(json).toContain('18,902,340')
    expect(json).toContain('ร้านชื่อยาวที่สุด')
    expect(json).toContain('ร้านล็อก')
  })
  it('ไม่ throw เมื่อมีบล็อกข้อความว่าง (ตัดออกก่อนส่งเข้า composer)', () => {
    const t = { ...tpl(), blocks: [...tpl().blocks, { id: 't', type: 'text' as const, style: { bold: false, size: 'm' as const, color: 'ink' as const }, runs: [] }] }
    expect(previewTemplate(t).blocks.some((b) => b.id === 't')).toBe(false)
    expect(() => buildPreviewContents({ ...args, template: t })).not.toThrow()
  })
  it('รายเดือน + บล็อกกราฟ/ยอดสะสม ไม่ throw', () => {
    const t: TemplateV1 = { ...tpl(), blocks: [...tpl().blocks, { id: 'c1', type: 'chart_trend', measure: 'sales' }, { id: 'c2', type: 'chart_compare', measure: 'orders' }, { id: 'cy', type: 'cycle' }, { id: 'p', type: 'profit' }] }
    const cycle = { startIso: '2026-10-01', endIso: '2026-10-31' }
    expect(() => buildPreviewContents({ ...args, template: t, kind: 'MONTHLY', monthlyEnabled: true, cycle })).not.toThrow()
    expect(() => buildPreviewContents({ ...args, template: t, kind: 'DAILY', monthlyEnabled: true, cycle })).not.toThrow()
  })
})
