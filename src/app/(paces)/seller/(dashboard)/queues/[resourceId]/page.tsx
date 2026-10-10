/**
 * redirect ถาวร — หน้าแก้ไขประเภทงานย้ายไป `/settings/job-types/[resourceId]` แล้ว (2026-08-12)
 * เหตุผลที่ต้องเป็นไฟล์ page ไม่ใช่ next.config ดูที่ `queues/new/page.tsx`
 */
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'

export default async function LegacyEditQueuePage({
  params,
}: {
  params: Promise<{ resourceId: string }>
}) {
  const { resourceId } = await params
  // 00071 P3 (Q1): หน้านี้แค่ redirect แต่ต้องมีด่านตามทะเบียน — ไม่มีสิทธิ์ = การ์ด ไม่ใช่เด้งไปหน้าที่ถูกปฏิเสธต่อ
  const session = await getServerSession(authOptions)
  const gate = await gatePage(session, 'Q1')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return <NoPermissionCard capability="Q1" viewerRoles={await viewerRolesOf(session)} />
  }
  redirect(`/settings/job-types/${resourceId}`)
}
