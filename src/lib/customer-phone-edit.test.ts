import { describe, it, expect } from 'vitest'
import { canRenameCustomerPhone, type CustomerPhoneRenameInput } from './customer-phone-edit'

/** เศษที่เกิดจากการคีย์เบอร์ผิด: ไม่มีใครเป็นเจ้าของแถวนี้เลย */
const typoArtifact: CustomerPhoneRenameInput = {
  hasLinkedUserAccount: false,
  otherOrderCount: 0,
  otherContactCount: 0,
  newPhoneTaken: false,
}

describe('canRenameCustomerPhone — [blocker] แก้เบอร์ในแถวเดิมได้เมื่อไหร่', () => {
  it('[blocker] ไม่มีใครเป็นเจ้าของแถวเดิม + เบอร์ใหม่ยังว่าง → แก้ในแถวเดิม (ได้ลูกค้าคนเดิม)', () => {
    expect(canRenameCustomerPhone(typoArtifact)).toBe(true)
  })

  // 4 ข้อล่างนี้คือเหตุผลทั้งหมดที่ห้ามแก้ — แต่ละข้อต้องบล็อกได้ด้วยตัวเองลำพัง
  it('[blocker] แถวเดิมผูกกับบัญชีผู้ซื้อแล้ว → ห้ามแตะ (เบอร์คือตัวตนที่เขายืนยันเอง)', () => {
    expect(canRenameCustomerPhone({ ...typoArtifact, hasLinkedUserAccount: true })).toBe(false)
  })

  it('[blocker] แถวเดิมมีออเดอร์ใบอื่น (ร้านไหนก็ตาม) → ห้ามแตะ ตัวตนข้ามร้าน', () => {
    expect(canRenameCustomerPhone({ ...typoArtifact, otherOrderCount: 1 })).toBe(false)
  })

  it('[blocker] แถวเดิมผูกกับเธรดแชทอื่นอยู่ → ห้ามแตะ', () => {
    expect(canRenameCustomerPhone({ ...typoArtifact, otherContactCount: 1 })).toBe(false)
  })

  it('[blocker] เบอร์ใหม่มีเจ้าของแล้ว → rename ไม่ได้ (unique) ต้องไปรวมกับแถวนั้นแทน', () => {
    expect(canRenameCustomerPhone({ ...typoArtifact, newPhoneTaken: true })).toBe(false)
  })

  it('ติดหลายข้อพร้อมกัน → ยังคงห้าม', () => {
    expect(
      canRenameCustomerPhone({
        hasLinkedUserAccount: true,
        otherOrderCount: 3,
        otherContactCount: 2,
        newPhoneTaken: true,
      }),
    ).toBe(false)
  })
})
