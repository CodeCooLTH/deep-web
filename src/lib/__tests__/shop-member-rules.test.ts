import { describe, it, expect } from 'vitest'
import { checkRoleChange, checkRemove, checkTransfer, staffCountWhere } from '../shop-member-rules'

const P = 'primary'
const owner = (userId: string) => ({ userId, role: 'OWNER' })
const admin = (userId: string) => ({ userId, role: 'ADMIN' })

describe('[blocker] checkRoleChange — BR-MR-01/02', () => {
  it('เจ้าของร่วมเปลี่ยนบทบาทคนอื่นได้', () => {
    expect(checkRoleChange(P, owner('co'), admin('a'))).toBeNull()
  })
  it('ผู้ดูแลเปลี่ยนไม่ได้', () => {
    expect(checkRoleChange(P, admin('a'), admin('b'))).toBe('NOT_OWNER')
  })
  it('คนนอกร้านเปลี่ยนไม่ได้', () => {
    expect(checkRoleChange(P, null, admin('b'))).toBe('NOT_OWNER')
  })
  it('แตะเจ้าของหลักไม่ได้ แม้เป็นเจ้าของหลักเอง', () => {
    expect(checkRoleChange(P, owner('co'), owner(P))).toBe('PRIMARY_OWNER_LOCKED')
    expect(checkRoleChange(P, owner(P), owner(P))).toBe('PRIMARY_OWNER_LOCKED')
  })
  it('เจ้าของร่วมลดตัวเองเป็นผู้ดูแลได้ (เจ้าของหลักยังอยู่)', () => {
    expect(checkRoleChange(P, owner('co'), owner('co'))).toBeNull()
  })
  it('สมาชิกไม่อยู่ในร้าน', () => {
    expect(checkRoleChange(P, owner(P), null)).toBe('NOT_A_MEMBER')
  })
})

describe('[blocker] checkRemove — BR-MR-07', () => {
  it('เจ้าของร่วมลบเจ้าของร่วมอีกคนได้', () => {
    expect(checkRemove(P, owner('co1'), owner('co2'))).toBeNull()
  })
  it('ลบตัวเองไม่ได้', () => {
    expect(checkRemove(P, owner('co'), owner('co'))).toBe('CANNOT_REMOVE_SELF')
  })
  it('ลบเจ้าของหลักไม่ได้', () => {
    expect(checkRemove(P, owner('co'), owner(P))).toBe('PRIMARY_OWNER_LOCKED')
  })
})

describe('[blocker] checkTransfer — BR-MR-03/04', () => {
  const ok = {
    primaryOwnerId: P, callerId: P, target: admin('a'), shopLocked: false,
    recipientPackage: { maxBusinesses: 1, maxAdminsPerBusiness: 1 },
    recipientActiveBusinessCount: 0, memberCount: 2,
  }
  it('ผ่านเมื่อครบเงื่อนไข', () => expect(checkTransfer(ok)).toBeNull())
  it('เจ้าของร่วมโอนไม่ได้', () => expect(checkTransfer({ ...ok, callerId: 'co' })).toBe('NOT_PRIMARY_OWNER'))
  it('ร้านล็อก', () => expect(checkTransfer({ ...ok, shopLocked: true })).toBe('SHOP_LOCKED'))
  it('ผู้รับไม่มีแพ็กเกจ', () => expect(checkTransfer({ ...ok, recipientPackage: null })).toBe('RECIPIENT_NO_PACKAGE'))
  it('ผู้รับร้านเต็มพอดี', () =>
    expect(checkTransfer({ ...ok, recipientActiveBusinessCount: 1 })).toBe('RECIPIENT_BUSINESS_QUOTA'))
  // 3 คน: ผู้รับ + เจ้าของเดิม + อีก 1 = นับโควตา 2 > 1
  it('สมาชิกเกินโควตาผู้รับ', () => expect(checkTransfer({ ...ok, memberCount: 3 })).toBe('RECIPIENT_ADMIN_QUOTA'))
  it('แพ็กเกจไม่จำกัด', () =>
    expect(checkTransfer({
      ...ok, recipientPackage: { maxBusinesses: null, maxAdminsPerBusiness: null },
      recipientActiveBusinessCount: 99, memberCount: 99,
    })).toBeNull())
  it('โอนให้ตัวเองไม่ได้', () => expect(checkTransfer({ ...ok, target: owner(P) })).toBe('PRIMARY_OWNER_LOCKED'))
})

describe('[blocker] staffCountWhere — BR-MR-06 นับเจ้าของร่วมด้วย', () => {
  it('ไม่กรองด้วย role', () => {
    expect(staffCountWhere('s', P)).toEqual({ shopId: 's', userId: { not: P } })
  })
})
