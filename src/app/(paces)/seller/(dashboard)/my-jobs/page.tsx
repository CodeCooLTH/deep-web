/**
 * งานของฉัน — /my-jobs (00086 P3 · T9 · BRD FR-008 · ต้นแบบ screenList)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/list-group/page.tsx (หน้ารายการ)
 *   in-repo precedent: ../queues/page.tsx (gatePage Q1 + NoPermissionCard + breadcrumb เดสก์ท็อปเท่านั้น)
 *
 * ด่าน (ครบ 3 ชั้นแบบ /queues — เมนูไม่ใช่การควบคุมสิทธิ์):
 *  - gatePage Q1 (ตัวเดียวกับ /queues และ endpoint ที่หน้านี้เรียก) · ไม่มีสิทธิ์ = การ์ดบอกเหตุผล
 *  - ไม่ใช่ร้านบริการ → redirect('/orders') — ร้านอื่นไม่มีผู้รับผิดชอบ/งานของฉัน (ลิงก์เก่า/พิมพ์ตรงไม่เจอหน้าว่าง)
 *  - API day/carry-over กั้น Q1 + vertical เองอีกชั้น
 *
 * ทางเข้า: แท็บล่าง "งานของฉัน" (ช่างล้วน ร้านบริการ) + การ์ดหน้าแรก "ดูทั้งหมด" — ไม่มีเมนูซ้าย
 * (เมนูซ้ายกรองด้วย page cap อย่างเดียว ⇒ ถ้าใส่จะโผล่ให้ทุกคนที่มี Q1 · ดูรายงาน T9)
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { canUseAppointments } from '@/lib/appointments'
import { gatePage } from '@/lib/shop-capability'
import { sessionUserId } from '@/lib/session-user'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'
import MyJobsList from './components/MyJobsList'

export const metadata: Metadata = { title: 'งานของฉัน' }

export default async function MyJobsPage() {
  const session = await getServerSession(authOptions)
  const gate = await gatePage(session, 'Q1')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return (
      <>
        <PageBreadcrumb title="งานของฉัน" />
        <NoPermissionCard capability="Q1" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }
  if (!gate.ok) return null

  // ร้านอื่นไม่มีแกนผู้รับผิดชอบ — ส่งไปรายการออเดอร์ (ไม่ใช่ 404: หน้านี้มีอยู่จริงสำหรับร้านบริการ)
  if (!canUseAppointments({ kind: gate.active.kind, vertical: gate.active.shop.vertical })) redirect('/orders')

  return (
    <>
      {/* breadcrumb เดสก์ท็อปเท่านั้น — มือถือมีชื่อหน้าใน SellerMobileHeader (getSellerPageTitle) แล้ว */}
      <div className="hidden lg:block">
        <PageBreadcrumb title="งานของฉัน" />
      </div>
      {/* max-w-3xl: แถวยาวเต็ม 1200px ตาวิ่งจากเวลาไปป้ายไกลเกิน (UX spec T9) */}
      <div className="mx-auto w-full max-w-3xl">
        <MyJobsList viewerUserId={sessionUserId(session)} />
      </div>
    </>
  )
}
