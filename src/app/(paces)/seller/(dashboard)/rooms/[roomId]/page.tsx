/**
 * แก้ไขห้องพัก (feature 00017 Phase 1)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/new/page.tsx (โครงเดียวกัน ต่างแค่โหลดข้อมูลเดิม)
 *
 * IMPORTANT: getRoom() scope shopId ใน where ตั้งแต่ query แรก — ห้องของร้านอื่นจะไม่ถูกอ่าน
 * ขึ้นมาเลย ไม่ใช่อ่านแล้วค่อยเช็คสิทธิ์ทีหลัง (ข้อมูลจะไหลเข้า RSC payload ไปก่อนถูกปฏิเสธ)
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { getRoom, serializeRoom, RoomNotFoundError } from '@/services/room.service'
import RoomForm from '../components/RoomForm'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'

export const metadata: Metadata = { title: 'แก้ไขห้องพัก' }

export default async function EditRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const { roomId } = await params
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
  if (active.shop.vertical !== 'LODGING') notFound()

  let room
  try {
    room = await getRoom(active.shop.id, roomId)
  } catch (e) {
    if (e instanceof RoomNotFoundError) notFound()
    throw e
  }

  return (
    <>
      <PageBreadcrumb title={room.name} subtitle="ห้องพัก" />
      {/* serializeRoom แปลง Decimal → string ก่อนข้าม RSC boundary */}
      <RoomForm room={serializeRoom(room)} />
    </>
  )
}
