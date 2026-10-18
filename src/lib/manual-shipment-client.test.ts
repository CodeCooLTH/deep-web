import { describe, expect, it } from 'vitest'
import { deliveredConfirmCopy, manualStepToast } from './manual-shipment-client'

describe('manualStepToast', () => {
  it('dispatch ok changed → success · changed:false → info', () => {
    expect(manualStepToast('dispatch', { kind: 'ok', changed: true, alreadyClosed: false }, 'คำสั่งซื้อ').type).toBe('success')
    expect(manualStepToast('dispatch', { kind: 'ok', changed: false, alreadyClosed: false }, 'คำสั่งซื้อ')).toEqual({
      type: 'info',
      message: 'คำสั่งซื้อนี้จัดส่งแล้ว หน้านี้อัปเดตให้แล้ว',
    })
  })
  it('delivered alreadyClosed → info ไม่ใช่ success', () => {
    expect(manualStepToast('delivered', { kind: 'ok', changed: false, alreadyClosed: true }, 'งาน').type).toBe('info')
    expect(manualStepToast('delivered', { kind: 'ok', changed: true, alreadyClosed: false }, 'งาน').message).toBe('ปิดงานแล้ว งานนี้สำเร็จ')
  })
  it('rejected → error ด้วยข้อความ server', () => {
    expect(manualStepToast('delivered', { kind: 'rejected', message: 'x' }, 'n')).toEqual({ type: 'error', message: 'x' })
  })
})

describe('deliveredConfirmCopy', () => {
  it('COD ใช้ warning icon แต่ปุ่มยืนยันยัง primary (คอนทราสต์)', () => {
    const c = deliveredConfirmCopy('คำสั่งซื้อ', true)
    expect(c.icon).toBe('warning')
    expect(c.confirmSemantic).toBe('primary')
    expect(deliveredConfirmCopy('คำสั่งซื้อ', false).icon).toBe('question')
  })
})
