/**
 * NoPermissionCard — การ์ด "บทบาทนี้เข้าหน้านี้ไม่ได้" ทุกหน้าของ dashboard (00071 P3 · UX spec §1)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx (page shell) +
 *   src/app/(paces)/seller/(dashboard)/inventory/page.tsx:70-91 (card markup เดิม) — ย้ายมาจาก ExpenseLockedCard
 *
 * ข้อความมาจาก noPermissionCopy (pure · มีเทส) — การ์ดนี้ไม่ตัดสินอะไรเอง; ไม่มีปุ่ม action โดยตั้งใจ
 * (ผู้ใช้ทำเองไม่ได้ ต้องให้เจ้าของร้านเป็นคนใช้) · RSC-safe ไม่มี state/client directive
 */
import Icon from '@/components/wrappers/Icon'
import { noPermissionCopy } from '@/lib/no-permission-copy'
import type { Capability, ShopRole } from '@/lib/shop-permissions'

export default function NoPermissionCard({
  capability,
  viewerRoles,
  detail,
}: {
  capability: Capability
  viewerRoles: readonly ShopRole[]
  /** ประโยคหลักเฉพาะหน้า (ใช้ได้เมื่อหน้านั้นเจ้าของร้านเท่านั้น) — หน้าการเงินส่งประโยคเดิม */
  detail?: string
}) {
  const { title, body, viewerLine } = noPermissionCopy({ capability, viewerRoles, detail })
  return (
    <div className="card mx-auto max-w-2xl rounded-xl p-6 text-center md:p-10">
      <Icon icon="lock" width={64} height={64} className="text-default-700 mx-auto mb-4" aria-hidden="true" />
      <h2 className="text-dark mb-2 text-xl font-bold">{title}</h2>
      <p className="text-default-700">{body}</p>
      {viewerLine && <p className="text-default-500 mt-3 text-sm">{viewerLine}</p>}
    </div>
  )
}
