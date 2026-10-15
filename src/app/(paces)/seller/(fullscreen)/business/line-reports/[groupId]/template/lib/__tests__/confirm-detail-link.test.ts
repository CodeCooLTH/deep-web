import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TemplateV1 } from '@/lib/line-report/template'

const warning = vi.fn()
vi.mock('@/lib/paces-swal', () => ({ pacesConfirm: { warning: (...a: unknown[]) => warning(...a) } }))
import { confirmDetailLinkExposure, DETAIL_LINK_NEEDS_METRIC_HELPER, detailExposureLines, detailSwitchState, shouldSuggestDetailLabel } from '../confirm-detail-link'

const t = (opts: { detail?: boolean; show?: boolean; label?: string; types?: string[] } = {}): TemplateV1 =>
  ({
    v: 1,
    button: { show: opts.show ?? true, label: opts.label ?? 'เปิด Deep', ...(opts.detail ? { target: 'DETAIL' } : {}) },
    blocks: (opts.types ?? ['orders', 'sales']).map((x, i) => ({ id: `x${i}`, type: x })),
  }) as unknown as TemplateV1
beforeEach(() => warning.mockReset())

describe('confirmDetailLinkExposure', () => {
  it('เปิด DETAIL ครั้งแรก = ถาม · focusCancel + ห้ามคลิกนอก · ยกเลิก=false ยืนยัน=true', async () => {
    warning.mockResolvedValueOnce(false)
    expect(await confirmDetailLinkExposure(t(), t({ detail: true }), false)).toBe(false)
    warning.mockResolvedValueOnce(true)
    expect(await confirmDetailLinkExposure(null, t({ detail: true }), false)).toBe(true)
    expect(warning).toHaveBeenCalledTimes(2)
    expect(warning.mock.calls[0][2]).toMatchObject({ focusCancel: true, allowOutsideClick: false, confirmButtonText: 'เปิดหน้าสรุป' })
  })
  it('ยืนยันแล้วในเซสชัน / บันทึกเป็น DETAIL อยู่แล้ว / ปิด / ไม่ใช่ DETAIL = ไม่ถาม', async () => {
    expect(await confirmDetailLinkExposure(t(), t({ detail: true }), true)).toBe(true)
    expect(await confirmDetailLinkExposure(t({ detail: true }), t({ detail: true }), false)).toBe(true)
    expect(await confirmDetailLinkExposure(t({ detail: true }), t(), false)).toBe(true)
    expect(await confirmDetailLinkExposure(t(), t(), false)).toBe(true)
    expect(warning).not.toHaveBeenCalled()
  })
  it('DETAIL บันทึกแล้ว แต่ค่าใช้จ่ายเพิ่งถูกเปิดเผย = ถามอีกครั้ง', async () => {
    warning.mockResolvedValueOnce(true)
    expect(await confirmDetailLinkExposure(t({ detail: true }), t({ detail: true, types: ['orders', 'expense'] }), false)).toBe(true)
    expect(warning).toHaveBeenCalledTimes(1)
  })
})

describe('detailExposureLines', () => {
  it('ประกอบตามที่เปิดจริง: ยอดเงินรายใบเมื่อมี sales · ค่าใช้จ่ายเมื่อมี expense/net_sales', () => {
    expect(detailExposureLines(t({ types: ['orders'] }))).toEqual([expect.stringContaining('รายการทั้งหมด'), 'ชื่องานหรือสินค้า'])
    const full = detailExposureLines(t({ types: ['orders', 'sales', 'net_sales'] }))
    expect(full[1]).toBe('ชื่องานหรือสินค้า และยอดเงินรายใบ')
    expect(full[2]).toContain('ค่าใช้จ่ายทุกรายการ')
  })
})

describe('detailSwitchState', () => {
  it('ปกติ: เปิดได้ พร้อมข้อความรองตามสถานะ', () => {
    expect(detailSwitchState(t(), false)).toEqual({ checked: false, disabled: false, sub: 'ตอนนี้ปุ่มเปิดหน้า Deep ของร้าน' })
    expect(detailSwitchState(t({ detail: true }), false)).toMatchObject({ checked: true, disabled: false })
  })
  it('readOnly = disabled ไม่มีข้อความรอง · ซ่อนปุ่ม = disabled + บอกให้เปิดปุ่มก่อน', () => {
    expect(detailSwitchState(t(), true)).toEqual({ checked: false, disabled: true, sub: null })
    expect(detailSwitchState(t({ show: false }), false)).toMatchObject({ disabled: true, sub: 'เปิดแสดงปุ่มก่อน จึงตั้งปลายทางได้' })
  })
  it('ไม่มี orders/sales: ปิดอยู่ = disabled · เปิดอยู่ = ยังกดปิดได้', () => {
    expect(detailSwitchState(t({ types: ['cancelled'] }), false)).toMatchObject({ disabled: true, sub: DETAIL_LINK_NEEDS_METRIC_HELPER })
    expect(detailSwitchState(t({ types: ['cancelled'], detail: true }), false)).toMatchObject({ checked: true, disabled: false })
  })
})

describe('shouldSuggestDetailLabel', () => {
  it('เสนอเฉพาะ DETAIL + ป้ายยังเป็นค่าตั้งต้น', () => {
    expect(shouldSuggestDetailLabel(t({ detail: true }), 'เปิด Deep')).toBe(true)
    expect(shouldSuggestDetailLabel(t({ detail: true, label: 'ดูสรุป' }), 'เปิด Deep')).toBe(false)
    expect(shouldSuggestDetailLabel(t(), 'เปิด Deep')).toBe(false)
  })
})
