// S-17 (00071): ตัดสิน activeShopId + บทบาทใน session แบบ pure
// BRD ห้ามมี fallback เป็น OWNER — อ่านสมาชิกล้ม/ไม่เจอ = role null ถอยไปร้านส่วนตัว
import { rolesFromMembership, type ShopRole } from '@/lib/shop-permissions'

export type SessionShopRole = 'OWNER' | 'ADMIN'

/** ผลอ่าน ShopMember ของร้านที่ token ชี้ (เฉพาะเมื่อไม่ใช่ร้านส่วนตัว): แถว | ไม่เจอ | query ล้ม */
export type ActiveShopMembership = { shopId: string; role: SessionShopRole; roles?: readonly string[] } | null | 'ERROR'

export function resolveSessionActiveShop(input: {
  personalShopId: string | null
  tokenActiveShopId: string | null
  membership: ActiveShopMembership
}): { activeShopId: string | null; role: SessionShopRole | null; roles: ShopRole[] | null } {
  const { personalShopId, tokenActiveShopId, membership } = input
  if (
    tokenActiveShopId &&
    tokenActiveShopId !== personalShopId &&
    membership &&
    membership !== 'ERROR' &&
    membership.shopId === tokenActiveShopId
  ) {
    // roles = แสดงผลเท่านั้น (ป้ายตัวสลับบัญชี) — ห้ามใช้ตัดสินสิทธิ์; สิทธิ์จริงอ่านจากแถวสดที่ shop-api-guard
    return {
      activeShopId: tokenActiveShopId,
      role: membership.role,
      roles: rolesFromMembership(membership.role, membership.roles ?? []),
    }
  }
  // ร้านส่วนตัวเป็นของ user เสมอ; ไม่มีร้านส่วนตัว (ผู้ถูกเชิญล้วน) = ไม่มีบทบาท
  return personalShopId
    ? { activeShopId: personalShopId, role: 'OWNER', roles: ['OWNER'] }
    : { activeShopId: null, role: null, roles: null }
}
