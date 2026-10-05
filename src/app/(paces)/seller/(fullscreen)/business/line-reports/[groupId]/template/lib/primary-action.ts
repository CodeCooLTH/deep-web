/**
 * primary-action — ปุ่มไหนเป็น primary ของ action bar หน้าจัดข้อความ (feature 00070 EXT · FR-EXT-11 AC-5) · pure
 *
 * ทำไมอยู่ใน lib: "ไม่เคยมี primary สองปุ่มพร้อมกัน" เป็น boolean ที่พังบ่อยใน action bar (orders/new)
 * ต้องมีที่ให้เทสจับ (convention `ui-boolean-needs-a-testable-home`) · ค่า primary คืนช่องเดียวเสมอ
 */
export type PrimaryActionInput = {
  dirty: boolean
  /** ผ่านด่านตรวจฝั่ง client ทั้งหมด (markup / ตัวเลข ≥1 / ขนาด / กำไรยืนยันแล้ว) */
  valid: boolean
  /** เหตุแรกที่บันทึกไม่ได้ (แสดงเป็น aria-describedby) */
  invalidReason: string | null
  saving: boolean
  stale: boolean
  /** แพ็กเกจหยุด / บอทถูกนำออก */
  readOnly: boolean
  /** ส่งทดสอบได้ตาม presenter (canTest) */
  canTest: boolean
  testBlockedReason: string | null
  testing: boolean
}

export type PrimaryAction = {
  primary: 'test' | 'save' | 'none'
  save: { visible: boolean; disabled: boolean; reason: string | null }
  test: { disabled: boolean; reason: string | null }
}

export const STALE_REASON = 'มีการแก้จากที่อื่น โหลดฉบับล่าสุดก่อน'
export const SAVE_FIRST_REASON = 'บันทึกเทมเพลตก่อน จึงส่งทดสอบได้'

/** ลำดับตัดสิน: อ่านอย่างเดียว > stale > กำลังบันทึก > แก้อยู่ > สะอาด */
export function getPrimaryAction(s: PrimaryActionInput): PrimaryAction {
  if (s.readOnly) {
    // ไม่ชวนบันทึก — ซ่อนปุ่มบันทึกทั้งปุ่ม
    return { primary: 'none', save: { visible: false, disabled: true, reason: null }, test: { disabled: true, reason: s.testBlockedReason } }
  }
  if (s.stale) {
    return { primary: 'none', save: { visible: true, disabled: true, reason: STALE_REASON }, test: { disabled: true, reason: STALE_REASON } }
  }
  if (s.saving) {
    return { primary: 'save', save: { visible: true, disabled: true, reason: null }, test: { disabled: true, reason: null } }
  }
  if (s.dirty) {
    return {
      primary: 'save',
      save: { visible: true, disabled: !s.valid, reason: s.valid ? null : s.invalidReason },
      test: { disabled: true, reason: SAVE_FIRST_REASON },
    }
  }
  const testDisabled = !s.canTest || s.testing
  return {
    primary: 'test',
    // ตำแหน่งคงที่ไม่กระโดด: สะอาดแล้วปุ่มบันทึกยังอยู่แต่ disabled
    save: { visible: true, disabled: true, reason: null },
    test: { disabled: testDisabled, reason: !s.canTest ? s.testBlockedReason : null },
  }
}
