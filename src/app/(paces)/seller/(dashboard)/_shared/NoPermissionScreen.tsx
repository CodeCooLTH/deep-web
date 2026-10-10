/**
 * NoPermissionScreen — จอ "บทบาทนี้เข้าไม่ได้" แบบมีทางกลับ สำหรับเปลือกเต็มจอ ((chat) / (fullscreen))
 * (00071 P3 · critique P1-1) — เปลือกเหล่านี้ไม่มี sidebar/header/แถบล่าง และใน WebView ของแอปไม่มีปุ่ม back
 * การ์ดเปล่า ๆ จึงเป็นทางตัน → ห่อ NoPermissionCard + ลิงก์กลับ (Link ธรรมดา · แตะง่าย min-h-11 = 44px)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx (page shell)
 *   markup ปุ่มยกจาก expenses/page.tsx (เดิมอยู่ใน ChatNoPermission) · RSC-safe ไม่มี state
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'
import type { Capability, ShopRole } from '@/lib/shop-permissions'

export default function NoPermissionScreen({
  capability,
  viewerRoles,
  backTo = '/dashboard',
  backLabel = 'กลับหน้าหลัก',
}: {
  capability: Capability
  viewerRoles: readonly ShopRole[]
  backTo?: string
  backLabel?: string
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4">
      <NoPermissionCard capability={capability} viewerRoles={viewerRoles} />
      <Link
        href={backTo}
        className="btn bg-primary hover:bg-primary-hover inline-flex min-h-11 items-center gap-2 px-6 py-3 font-semibold text-white"
      >
        <Icon icon="arrow-left" width={18} height={18} />
        {backLabel}
      </Link>
    </div>
  )
}
