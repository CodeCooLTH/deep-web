import { describe, expect, it } from 'vitest'
import { getPrimaryAction, SAVE_FIRST_REASON, STALE_REASON, type PrimaryActionInput } from '../primary-action'

const base: PrimaryActionInput = {
  dirty: false, valid: true, invalidReason: null, saving: false, stale: false, readOnly: false,
  canTest: true, testBlockedReason: null, testing: false,
}
const act = (p: Partial<PrimaryActionInput>) => getPrimaryAction({ ...base, ...p })

describe('getPrimaryAction — primary ช่องเดียวเสมอ', () => {
  it('clean: ส่งทดสอบเป็น primary · บันทึกอยู่ที่เดิมแต่ disabled', () => {
    const a = act({})
    expect(a.primary).toBe('test')
    expect(a.save).toEqual({ visible: true, disabled: true, reason: null })
    expect(a.test.disabled).toBe(false)
  })
  it('clean แต่ canTest=false → ปุ่มทดสอบ disabled พร้อมเหตุ', () => {
    const a = act({ canTest: false, testBlockedReason: 'ครบโควตา' })
    expect(a.primary).toBe('test')
    expect(a.test).toEqual({ disabled: true, reason: 'ครบโควตา' })
  })
  it('กำลังส่งทดสอบ → disabled ไม่มีเหตุ (ไม่โชว์ข้อความผิดบริบท)', () => {
    expect(act({ testing: true }).test).toEqual({ disabled: true, reason: null })
  })
  it('dirty+valid: บันทึกเป็น primary · ทดสอบ disabled "บันทึกก่อน"', () => {
    const a = act({ dirty: true })
    expect(a.primary).toBe('save')
    expect(a.save.disabled).toBe(false)
    expect(a.test).toEqual({ disabled: true, reason: SAVE_FIRST_REASON })
  })
  it('dirty+invalid: บันทึก disabled พร้อมเหตุแรก', () => {
    const a = act({ dirty: true, valid: false, invalidReason: 'ปิดเครื่องหมาย ** ให้ครบ' })
    expect(a.primary).toBe('save')
    expect(a.save).toEqual({ visible: true, disabled: true, reason: 'ปิดเครื่องหมาย ** ให้ครบ' })
  })
  it('saving: ทั้งคู่ disabled', () => {
    const a = act({ dirty: true, saving: true })
    expect(a.primary).toBe('save')
    expect(a.save.disabled).toBe(true)
    expect(a.test.disabled).toBe(true)
  })
  it('stale: ไม่มี primary ทั้งคู่ disabled เหตุเดียวกัน', () => {
    const a = act({ dirty: true, stale: true })
    expect(a.primary).toBe('none')
    expect(a.save.reason).toBe(STALE_REASON)
    expect(a.test.reason).toBe(STALE_REASON)
  })
  it('อ่านอย่างเดียว: ซ่อนบันทึก (ไม่ชวนบันทึก) · ทดสอบ disabled ด้วยเหตุของ presenter · ชนะ stale/dirty', () => {
    const a = act({ readOnly: true, dirty: true, stale: true, canTest: false, testBlockedReason: 'ส่งทดสอบไม่ได้ขณะแพ็กเกจหยุดใช้งาน' })
    expect(a.primary).toBe('none')
    expect(a.save.visible).toBe(false)
    expect(a.test).toEqual({ disabled: true, reason: 'ส่งทดสอบไม่ได้ขณะแพ็กเกจหยุดใช้งาน' })
  })
  it('invariant: ทุกชุดสถานะมี primary ได้ไม่เกินหนึ่ง และปุ่มที่ไม่ใช่ primary ไม่ enabled พร้อมกัน', () => {
    const bools = [false, true]
    for (const dirty of bools) for (const valid of bools) for (const saving of bools) for (const stale of bools)
      for (const readOnly of bools) for (const canTest of bools) for (const testing of bools) {
        const a = act({ dirty, valid, saving, stale, readOnly, canTest, testing })
        const enabledSave = a.save.visible && !a.save.disabled
        const enabledTest = !a.test.disabled
        expect(enabledSave && enabledTest).toBe(false)
        if (a.primary === 'save') expect(a.save.visible).toBe(true)
        if (a.primary === 'test') expect(a.test).toBeDefined()
      }
  })
})
