import { describe, expect, it } from 'vitest'
import { deliveredConfirmCopy, manualStepToast, reportDispatch, UNDO_TOAST_MS, type StepToaster } from './manual-shipment-client'

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

describe('คำใน Swal ส่งสำเร็จ (TD-011)', () => {
  it('ไม่อ้างว่าเท่ากับลูกค้ายืนยัน และบอกว่าร้านเป็นผู้ปิดงาน', () => {
    for (const cod of [false, true]) {
      const c = deliveredConfirmCopy('คำสั่งซื้อ', cod)
      expect(c.text).not.toContain('เหมือนลูกค้ายืนยัน')
      expect(c.text).toContain('ประวัติจะบันทึกว่าร้านเป็นผู้ปิดงาน')
      expect(c.text).toContain('ย้อนกลับไม่ได้')
    }
    expect(deliveredConfirmCopy('คำสั่งซื้อ', false).text).toBe(
      'คำสั่งซื้อนี้จะเป็น "สำเร็จ" และนับเป็นยอดขาย ย้อนกลับไม่ได้ · ประวัติจะบันทึกว่าร้านเป็นผู้ปิดงาน',
    )
  })
})

describe('reportDispatch / undo toast (TD-010)', () => {
  const mk = () => {
    const calls: { kind: string; message: string; opts?: Parameters<StepToaster['success']>[1] }[] = []
    const toast: StepToaster = {
      success: (message, opts) => calls.push({ kind: 'success', message, opts }),
      info: (message) => calls.push({ kind: 'info', message }),
      error: (message) => calls.push({ kind: 'error', message }),
    }
    return { calls, toast }
  }
  it('changed:true → success พร้อมปุ่มเลิกทำ 5 วิ', () => {
    const { calls, toast } = mk()
    reportDispatch(toast, 'tok', 'คำสั่งซื้อ', { kind: 'ok', changed: true, alreadyClosed: false }, () => {})
    expect(calls[0].message).toBe('บันทึกว่าจัดส่งแล้ว')
    expect(calls[0].opts?.duration).toBe(UNDO_TOAST_MS)
    expect(calls[0].opts?.action?.label).toBe('เลิกทำ')
  })
  it('changed:false / rejected → ไม่มีปุ่มเลิกทำ', () => {
    const a = mk()
    reportDispatch(a.toast, 't', 'n', { kind: 'ok', changed: false, alreadyClosed: false }, () => {})
    expect(a.calls[0].kind).toBe('info')
    expect(a.calls[0].opts).toBeUndefined()
    const b = mk()
    reportDispatch(b.toast, 't', 'n', { kind: 'rejected', message: 'x' }, () => {})
    expect(b.calls[0]).toMatchObject({ kind: 'error', message: 'x' })
  })
  it('undo สำเร็จ → ข้อความกลับเป็นรอจัดส่ง', () => {
    expect(manualStepToast('undo', { kind: 'ok', changed: true, alreadyClosed: false }, 'n').message).toBe('เลิกทำแล้ว กลับเป็น รอจัดส่ง')
  })
})
