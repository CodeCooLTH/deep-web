/**
 * สร้างกลุ่มคำใหม่ — /settings/auto-reply/new (feature 00023, S-13)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/auto-reply/page.tsx (โครง RSC + PageBreadcrumb
 *   + card > card-header) ซึ่ง Base เดิม = theme/paces/Admin/TS/src/app/(admin)/apps/users/
 *   account-settings/page.tsx
 *
 * หน้านี้ตั้งใจให้ "เบา" — ขอแค่ชื่อกลุ่ม แล้วพาไปหน้าแก้ไขเต็มทันที เพราะการบังคับกรอกคำตรวจจับ
 * + คำตอบให้ครบตั้งแต่หน้าแรกทำให้ผู้ใช้เจอฟอร์มยาวก่อนเข้าใจว่ากำลังทำอะไรอยู่
 */
import type { Metadata } from 'next'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import NewKeywordForm from './NewKeywordForm'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'

export const metadata: Metadata = { title: 'สร้างกลุ่มคำ' }

export default async function NewKeywordPage() {
  // 00071 S-13 — สร้างกลุ่มคำ = H3: บทบาทไม่ถึงเห็นการ์ดไม่มีสิทธิ์ (ไม่มีร้าน = ปล่อยฟอร์มเดิม · layout ดูแล auth)
  const session = await getServerSession(authOptions)
  const gate = await gatePage(session, 'H3')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return (
      <>
        <div className="hidden lg:block">
          <PageBreadcrumb title="สร้างกลุ่มคำ" />
        </div>
        <NoPermissionCard capability="H3" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }
  return (
    <>
      <PageBreadcrumb
        title="สร้างกลุ่มคำ"
        trail={[
          { label: 'ตั้งค่า', href: '/settings' },
          { label: 'ผู้ช่วยอัตโนมัติ', href: '/settings/auto-reply' },
          { label: 'สร้างกลุ่มคำ' },
        ]}
      />
      <NewKeywordForm />
    </>
  )
}
