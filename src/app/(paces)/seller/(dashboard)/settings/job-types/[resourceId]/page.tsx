/**
 * แก้ไขคิวงานที่รับได้ (feature 00024, FR-RSV-01)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/[roomId]/page.tsx
 *   — โครงเดียวกัน ต่างแค่ service ที่โหลดข้อมูลเดิม
 *
 * IMPORTANT: getServiceResource() scope shopId ใน where ตั้งแต่ query แรก — คิวงานของ
 * ร้านอื่นจะไม่ถูกอ่านขึ้นมาเลย ไม่ใช่อ่านแล้วค่อยเช็คสิทธิ์ทีหลัง (ข้อมูลจะไหลเข้า RSC
 * payload ไปก่อนถูกปฏิเสธ — บทเรียน feedback_rsc_dal_authz)
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { canUseAppointments, ServiceResourceNotFoundError } from '@/lib/appointments'
import { requireActiveShop } from '@/lib/shop-context'
import {
  getServiceResource,
  serializeServiceResource,
} from '@/services/service-resource.service'
import ResourceForm from '../components/ResourceForm'

export const metadata: Metadata = { title: 'แก้ไขประเภทงาน' }

export default async function EditServiceResourcePage({
  params,
}: {
  params: Promise<{ resourceId: string }>
}) {
  const { resourceId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) return null
  if (!canUseAppointments({ kind: active.kind, vertical: active.shop.vertical })) notFound()

  let resource
  try {
    resource = await getServiceResource(active.shop.id, resourceId)
  } catch (e) {
    if (e instanceof ServiceResourceNotFoundError) notFound()
    throw e
  }

  return (
    <>
      <PageBreadcrumb title={resource.name} subtitle="ประเภทงาน" />
      {/* serializeServiceResource แปลง Decimal → string ก่อนข้าม RSC boundary */}
      <ResourceForm resource={serializeServiceResource(resource)} />
    </>
  )
}
