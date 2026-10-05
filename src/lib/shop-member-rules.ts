/**
 * กฎเปลี่ยนบทบาท/ลบ/โอนเจ้าของสมาชิกร้าน BUSINESS — ฟังก์ชันบริสุทธิ์ล้วน (service ทำ I/O)
 * เอกสาร: docs/20 - Features/00012 - Shop Staff Invite Links/EXTENSIONS-2026-10-05-member-roles.md
 *
 * "เจ้าของหลัก" = Shop.userId = คนที่แพ็กเกจของเขากำหนดโควตาร้าน — แตะไม่ได้ (BR-MR-02)
 * ร้านจึงมีเจ้าของ ≥1 คนเสมอโดยไม่ต้องนับ
 */

export type MemberRole = 'OWNER' | 'ADMIN'
type Member = { userId: string; role: string }

/** โควตา "แอดมิน" ของแพ็กเกจ = สมาชิกทุกคนยกเว้นเจ้าของหลัก (BR-MR-06)
 *  ห้ามกลับไปนับ role='ADMIN' — เชิญแล้วเลื่อนเป็นเจ้าของจะเลี่ยงโควตาได้ */
export function staffCountWhere(shopId: string, primaryOwnerId: string) {
  return { shopId, userId: { not: primaryOwnerId } }
}

/** null = ทำได้ · string = error code */
export function checkRoleChange(
  primaryOwnerId: string, caller: Member | null, target: Member | null,
): string | null {
  if (caller?.role !== 'OWNER') return 'NOT_OWNER'
  if (!target) return 'NOT_A_MEMBER'
  if (target.userId === primaryOwnerId) return 'PRIMARY_OWNER_LOCKED'
  return null
}

export function checkRemove(
  primaryOwnerId: string, caller: Member | null, target: Member | null,
): string | null {
  const err = checkRoleChange(primaryOwnerId, caller, target)
  if (err) return err
  if (target!.userId === caller!.userId) return 'CANNOT_REMOVE_SELF'
  return null
}

export function checkTransfer(input: {
  primaryOwnerId: string
  callerId: string
  target: Member | null
  shopLocked: boolean
  recipientPackage: { maxBusinesses: number | null; maxAdminsPerBusiness: number | null } | null
  recipientActiveBusinessCount: number
  /** จำนวนสมาชิกร้านนี้ทั้งหมด (รวมเจ้าของหลักเดิม ซึ่งหลังโอนจะกลายเป็นสมาชิกที่นับโควตา) */
  memberCount: number
}): string | null {
  const { primaryOwnerId, callerId, target, recipientPackage: pkg } = input
  if (callerId !== primaryOwnerId) return 'NOT_PRIMARY_OWNER'
  if (!target) return 'NOT_A_MEMBER'
  if (target.userId === primaryOwnerId) return 'PRIMARY_OWNER_LOCKED'
  if (input.shopLocked) return 'SHOP_LOCKED'
  if (!pkg) return 'RECIPIENT_NO_PACKAGE'
  if (pkg.maxBusinesses !== null && input.recipientActiveBusinessCount >= pkg.maxBusinesses) {
    return 'RECIPIENT_BUSINESS_QUOTA'
  }
  // หลังโอน: ทุกคนยกเว้นผู้รับ = สมาชิกที่นับโควตา
  if (pkg.maxAdminsPerBusiness !== null && input.memberCount - 1 > pkg.maxAdminsPerBusiness) {
    return 'RECIPIENT_ADMIN_QUOTA'
  }
  return null
}
