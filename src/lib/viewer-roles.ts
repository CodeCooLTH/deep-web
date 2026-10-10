import 'server-only'
/**
 * viewerRolesOf — บทบาทที่มีผลจริงของผู้ดูในร้านที่ active (ไว้ป้อน NoPermissionCard.viewerRoles)
 *
 * ทำไมแยกจาก gatePage: gatePage ok:false บอกแค่เหตุผล ไม่คืนบทบาท — เรียกเฉพาะทางที่ถูกปฏิเสธ
 * (ไม่ผ่านทางสำเร็จ จึงไม่เพิ่ม query ให้หน้าปกติ) · resolve ไม่ได้ = [] (การ์ดไม่แสดงบรรทัดผู้ดู)
 */
import { effectiveRoles } from '@/lib/shop-capability'
import { requireShopForRequest } from '@/lib/shop-context'
import type { ShopRole } from '@/lib/shop-permissions'

// NextAuth Session ไม่ประกาศ id/activeShopId — รับ object ตรง ๆ (เหมือน shop-capability.ts)
type SessionLike = object | null

export async function viewerRolesOf(session: SessionLike): Promise<ShopRole[]> {
  const r = await requireShopForRequest(session as Parameters<typeof requireShopForRequest>[0])
  if (!r.ok) return []
  return effectiveRoles(r.target.shop, r.target.role, r.target.roles)
}
