import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import DeskToolbar, { ZOOM_MAX, ZOOM_MIN, type DeskToolbarProps } from '../DeskToolbar'
import DeskLegend from '../DeskLegend'

const base: DeskToolbarProps = {
  zoom: 1, onRotate: () => {}, onZoomIn: () => {}, onZoomOut: () => {}, hideNumbers: false, onToggleNumbers: () => {},
  fullscreen: { supported: true, active: false, toggle: () => {} }, filterSlot: <button type="button">ตัวกรอง-slot</button>,
}
const html = (p: Partial<DeskToolbarProps> = {}) => renderToStaticMarkup(<DeskToolbar {...base} {...p} />)

describe('DeskToolbar', () => {
  it('ปุ่มทุกตัวมี aria-label ไทย · ตัวเลขเป็นปุ่มสลับ aria-pressed', () => {
    const h = html()
    for (const l of ['หมุนมุมมอง', 'ซูมออก', 'ซูมเข้า', 'ตัวเลข', 'เต็มจอ']) expect(h).toContain(`aria-label="${l}"`)
    expect(h).toContain('ตัวกรอง-slot')
    expect(h).toMatch(/aria-label="ตัวเลข"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="ตัวเลข"/)
    expect(html({ hideNumbers: true })).toMatch(/aria-label="ตัวเลข"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*aria-label="ตัวเลข"/)
  })

  it('ไม่รองรับ Fullscreen API = ไม่มีปุ่มเต็มจอเลย (ไม่ใช่ปุ่ม disabled) · เต็มจออยู่ = "ออกจากเต็มจอ"', () => {
    expect(html({ fullscreen: { supported: false, active: false, toggle: () => {} } })).not.toContain('เต็มจอ')
    expect(html({ fullscreen: { supported: true, active: true, toggle: () => {} } })).toContain('aria-label="ออกจากเต็มจอ"')
  })

  it('ซูมถึงขอบ = ปุ่มนั้น disabled', () => {
    expect(html({ zoom: ZOOM_MIN })).toMatch(/aria-label="ซูมออก"[^>]*disabled|disabled=""[^>]*aria-label="ซูมออก"/)
    expect(html({ zoom: ZOOM_MAX })).toMatch(/disabled=""[^>]*aria-label="ซูมเข้า"|aria-label="ซูมเข้า"[^>]*disabled/)
  })

  it('ไม่มีปุ่ม "ปิด" (FR-CD-12)', () => {
    expect(html()).not.toContain('aria-label="ปิด"')
  })
})

describe('DeskLegend', () => {
  const h = renderToStaticMarkup(<DeskLegend />)
  it('8 รายการ 2 แถว ใช้คำ "ตอบจากนอกระบบ" และไม่มี "ต่อคิวหน้าโต๊ะ"', () => {
    for (const l of ['เดินเข้า/ออก', 'รอคำตอบ', 'ร้านเพิ่งตอบ (ภายใน 3 นาที)', 'เกินเวลาตอบ', 'แอดมิน', 'ตอบจากนอกระบบ', 'Meta AI / กล่องของเพจ', 'บอท Deep']) expect(h).toContain(l)
    expect(h).not.toContain('ต่อคิว')
  })
})
