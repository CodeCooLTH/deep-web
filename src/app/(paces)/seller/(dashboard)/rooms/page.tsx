/**
 * Rooms list — ห้องพักของร้าน (feature 00017 Lodging Vertical, Phase 1)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/components/CustomerTable.tsx
 *   — chase ผ่าน src/app/(paces)/seller/(dashboard)/customers/page.tsx ที่ใช้โครงเดียวกันอยู่แล้ว
 *     (PageBreadcrumb + .card + ตาราง desktop / การ์ด mobile)
 *
 * Design Spec: docs/20 - Features/00017 - Lodging Vertical/UX-Design-Spec.md §3
 *
 * IMPORTANT: หน้านี้เป็น server component และต้อง gate ด้วย vertical เอง — การซ่อนเมนู
 * (applyVerticalMenu) ไม่ใช่การควบคุมสิทธิ์ ร้าน GENERAL ที่พิมพ์ URL ตรงต้องถูกปฏิเสธ
 * (BR-LODG-03)
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { listRooms, serializeRoom } from '@/services/room.service'
import RoomList from './components/RoomList'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'

export const metadata: Metadata = { title: 'ห้องพัก' }

export default async function RoomsPage() {
  const session = await getServerSession(authOptions)
  // 00071 P3 (Q1): บทบาทที่ไม่มีสิทธิ์เห็นการ์ดบอกเหตุผล ไม่ใช่หน้าว่าง/404 เงียบ — ตัดก่อน query ข้อมูลของหน้า
  const gate = await gatePage(session, 'Q1')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return (
      <>
        <PageBreadcrumb title="ห้องพัก" />
        <NoPermissionCard capability="Q1" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }
  if (!session?.user) return null

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) return null

  // gate ระดับหน้า — notFound() แทน 403 page เพื่อไม่บอกใบ้ว่า route นี้มีอยู่จริง
  // สำหรับร้านที่ไม่ควรเข้าถึง (ลด information disclosure)
  if (active.shop.vertical !== 'LODGING') notFound()

  const rooms = await listRooms(active.shop.id)

  return (
    <>
      <PageBreadcrumb title="ห้องพัก" />
      {/* serializeRoom แปลง Decimal → string ก่อนข้าม RSC boundary
          (ส่ง Decimal object ตรง ๆ จะ crash runtime แม้ tsc ผ่าน) */}
      <RoomList rooms={rooms.map(serializeRoom)} />
    </>
  )
}
