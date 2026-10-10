/**
 * redirect ถาวร — หน้าสร้างประเภทงานย้ายไป `/settings/job-types/new` แล้ว (2026-08-12)
 *
 * 🛑 ต้องเป็นไฟล์ page ไม่ใช่ `redirects` ใน next.config: คอนโซลผู้ขายวิ่งบน subdomain
 * และ `src/proxy.ts` rewrite `seller.deepthailand.app/queues/new` → `/seller/queues/new`
 * ก่อน — กติกาใน next.config จะ match กับพาธ *ก่อน* rewrite ซึ่งไม่ใช่พาธที่ผู้ใช้เห็น
 * ส่วน redirect ในชั้น app router ทำงานหลัง rewrite จึงถูกเสมอ
 *
 * เก็บไว้เพราะร้านอาจ bookmark ไว้ และลิงก์เก่าใน E2E/เอกสารยังชี้มาที่นี่
 */
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'

export default async function LegacyNewQueuePage() {
  // 00071 P3 (Q2): หน้านี้แค่ redirect แต่ต้องมีด่านตามทะเบียน — ไม่มีสิทธิ์ = การ์ด
  const session = await getServerSession(authOptions)
  const gate = await gatePage(session, 'Q2')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return <NoPermissionCard capability="Q2" viewerRoles={await viewerRolesOf(session)} />
  }
  redirect('/settings/job-types/new')
}
