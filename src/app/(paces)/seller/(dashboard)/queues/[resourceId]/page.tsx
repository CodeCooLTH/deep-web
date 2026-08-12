/**
 * redirect ถาวร — หน้าแก้ไขประเภทงานย้ายไป `/settings/job-types/[resourceId]` แล้ว (2026-08-12)
 * เหตุผลที่ต้องเป็นไฟล์ page ไม่ใช่ next.config ดูที่ `queues/new/page.tsx`
 */
import { redirect } from 'next/navigation'

export default async function LegacyEditQueuePage({
  params,
}: {
  params: Promise<{ resourceId: string }>
}) {
  const { resourceId } = await params
  redirect(`/settings/job-types/${resourceId}`)
}
