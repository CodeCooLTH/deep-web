import { describe, expect, it } from 'vitest'
import { RATE_LIMIT_MESSAGE, SAVE_FALLBACK, classifyFailure, coalescePatch, isEmptyPatch, overlaySettings, saveStatusOf } from '../autosave'

describe('coalescePatch', () => {
  it('คีย์ซ้ำทับค่าเดิม คีย์อื่นคงอยู่', () => {
    expect(coalescePatch({ showSales: true, dailyTimes: [540] }, { showSales: false, cutoffDay: 6 })).toEqual({ showSales: false, dailyTimes: [540], cutoffDay: 6 })
  })
  it('confirmProfit อยู่คู่กับ showProfit:true เท่านั้น — ผู้ใช้ปิดทันทีหลังเปิด → ไม่ส่ง confirm ลอย', () => {
    expect(coalescePatch({}, { showProfit: true, confirmProfit: true })).toEqual({ showProfit: true, confirmProfit: true })
    expect(coalescePatch({ showProfit: true, confirmProfit: true }, { showProfit: false })).toEqual({ showProfit: false })
    // patch อื่นมาต่อ ไม่ทำให้ confirm หาย
    expect(coalescePatch({ showProfit: true, confirmProfit: true }, { showSales: true })).toEqual({ showProfit: true, confirmProfit: true, showSales: true })
  })
  it('ไม่แก้ object เดิม', () => {
    const a = { showSales: true }
    coalescePatch(a, { showOrders: false })
    expect(a).toEqual({ showSales: true })
  })
  it('isEmptyPatch', () => {
    expect(isEmptyPatch({})).toBe(true)
    expect(isEmptyPatch({ showSales: false })).toBe(false)
  })
})

describe('overlaySettings (response ห้ามกระโดดทับคีย์ที่ยังรอส่ง)', () => {
  const server = { showSales: true, showOrders: true, dailyTimes: [540], showProfit: false }
  it('คีย์ใน pending ชนะ server · คีย์อื่นเป็นของ server', () => {
    expect(overlaySettings(server, { showSales: false })).toEqual({ ...server, showSales: false })
  })
  it('confirmProfit ไม่ใช่ setting — ห้ามรั่วเข้า state', () => {
    const r = overlaySettings(server, { showProfit: true, confirmProfit: true })
    expect(r.showProfit).toBe(true)
    expect('confirmProfit' in r).toBe(false)
  })
  it('pending ว่าง = server ตรง ๆ · ไม่แก้ object เดิม', () => {
    expect(overlaySettings(server, {})).toEqual(server)
    overlaySettings(server, { showSales: false })
    expect(server.showSales).toBe(true)
  })
})

describe('classifyFailure', () => {
  it('404 → กลับรายการ', () => expect(classifyFailure(404, { error: 'GROUP_NOT_FOUND', message: 'ไม่พบกลุ่มนี้' })).toEqual({ toast: 'ไม่พบกลุ่มนี้', effect: 'LIST' }))
  it('403 PACKAGE_REQUIRED → refresh · 403 อื่น → revert', () => {
    expect(classifyFailure(403, { error: 'PACKAGE_REQUIRED', message: 'ต้องมีแพ็กเกจธุรกิจที่ใช้งานอยู่' })).toEqual({ toast: 'ต้องมีแพ็กเกจธุรกิจที่ใช้งานอยู่', effect: 'REFRESH' })
    expect(classifyFailure(403, { error: 'NOT_OWNER', message: 'x' })).toEqual({ toast: SAVE_FALLBACK, effect: 'REVERT' })
  })
  it('429 → ข้อความถี่เกินไป (message ของ proxy เป็นอังกฤษ ไม่ใช้) + revert', () => {
    expect(classifyFailure(429, { message: 'Rate limit exceeded' })).toEqual({ toast: RATE_LIMIT_MESSAGE, effect: 'REVERT' })
  })
  it('400 INVALID_SETTINGS → ข้อความตาม rule · ไม่มี rule → message', () => {
    expect(classifyFailure(400, { error: 'INVALID_SETTINGS', message: 'ตั้งค่านี้ไม่ได้', details: { rule: 'METRIC_REQUIRED' } })).toEqual({ toast: 'ต้องแสดงตัวเลขอย่างน้อย 1 รายการ', effect: 'REVERT' })
    expect(classifyFailure(400, { error: 'INVALID_SETTINGS', message: 'ตั้งค่านี้ไม่ได้', details: {} }).toast).toBe('ตั้งค่านี้ไม่ได้')
  })
  it('network/500/body ว่าง → ข้อความสำรอง + revert', () => {
    expect(classifyFailure(0, null)).toEqual({ toast: SAVE_FALLBACK, effect: 'REVERT' })
    expect(classifyFailure(500, { error: 'INTERNAL', message: 'เกิดข้อผิดพลาด ลองอีกครั้ง' })).toEqual({ toast: SAVE_FALLBACK, effect: 'REVERT' })
  })
})

describe('saveStatusOf', () => {
  it('มีของรอส่ง/กำลังส่ง = กำลังบันทึก ชนะ "บันทึกแล้ว"', () => {
    expect(saveStatusOf({ dirty: true, inflight: false, justSaved: true })).toBe('saving')
    expect(saveStatusOf({ dirty: false, inflight: true, justSaved: true })).toBe('saving')
    expect(saveStatusOf({ dirty: false, inflight: false, justSaved: true })).toBe('saved')
    expect(saveStatusOf({ dirty: false, inflight: false, justSaved: false })).toBe('idle')
  })
})
