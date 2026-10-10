/**
 * ChatNoPermission — จอ "บทบาทนี้เข้าแชท/ตั้งค่าแชทไม่ได้" ในเปลือก (chat) (00071 P3 · S-13 · UX spec §1 + QA checklist
 * "การ์ดไม่มีสิทธิ์ในเปลือก (chat) มีทางกลับ")
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx (page shell)
 *   ห่อ NoPermissionCard กลาง + ปุ่มกลับ (markup ปุ่มยกจาก expenses/page.tsx) — เปลือกแชทเต็มจอไม่มี sidebar/breadcrumb
 *   ผู้ใช้ที่ถูกปฏิเสธจึงต้องมีทางกลับในจอเดียวกัน · RSC-safe ไม่มี state
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'
import type { Capability, ShopRole } from '@/lib/shop-permissions'

export default function ChatNoPermission({
  capability,
  viewerRoles,
}: {
  capability: Capability
  viewerRoles: readonly ShopRole[]
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4">
      <NoPermissionCard capability={capability} viewerRoles={viewerRoles} />
      <Link
        href="/dashboard"
        className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 px-6 py-3 font-semibold text-white"
      >
        <Icon icon="arrow-left" width={18} height={18} />
        กลับหน้าหลัก
      </Link>
    </div>
  )
}
