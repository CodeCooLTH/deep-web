import { can, rolesFromMembership, type Capability } from '@/lib/shop-permissions'

/**
 * ผู้เห็นการเงินเต็ม/กระเป๋า = เจ้าของร้าน (F3) — จุดเดียวที่ T3 ใช้ตัดสิน
 * role มาจาก requireActiveShop/resolveActiveShopContext (อ่านฐานสด ไม่ใช่ JWT)
 */
export function isShopOwnerRole(role: 'OWNER' | 'ADMIN'): boolean {
  return can(rolesFromMembership(role), 'F3')
}

/**
 * เจ้าของร้าน (F3) ของ "ร้านที่ระบุ" — สำหรับ route ที่ร้านมาจากเธรด/คำขอ ไม่ใช่ร้าน active
 * (chat unified inbox) · อ่านฐานสด · ไม่เจอความสัมพันธ์ = false (fail-closed)
 * Shop.userId = เจ้าของหลัก (อาจไม่มีแถว ShopMember) · ไม่ใช่ → ดู ShopMember.role
 */
export async function isShopOwnerOfShop(
  shopId: string,
  userId: string,
  // ค่าตั้งต้น F3 (กระเป๋า) · ผู้เรียกที่ตัดสินเรื่องอื่นต้องส่ง capability ของตัวเอง (เช่น ต้นทุน = P3)
  // กันวันที่ตารางสิทธิ์แยก F3/P3 ออกจากกันแล้ว route นี้ยังใช้เกณฑ์ผิดตัว (review T7)
  cap: Capability = 'F3',
): Promise<boolean> {
  const { prisma } = await import('@/lib/prisma')
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { userId: true } })
  if (!shop) return false
  if (shop.userId === userId) return can(['OWNER'], cap)
  const m = await prisma.shopMember.findUnique({
    where: { shopId_userId: { shopId, userId } },
    select: { role: true },
  })
  return m?.role === 'OWNER' || m?.role === 'ADMIN' ? can(rolesFromMembership(m.role), cap) : false
}
