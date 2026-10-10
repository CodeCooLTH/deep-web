/**
 * ตารางงาน — ปฏิทินคิวของร้าน `SERVICE_QUEUE` (feature 00024, FR-RSV-04)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/page.tsx
 *   — โครงเดียวกันเป๊ะ (PageBreadcrumb + gate ระดับหน้า)
 *     ซึ่ง chase ต่อไปที่ theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/components/CustomerTable.tsx
 * Base (empty state ตรงกลางจอ + ปุ่มพาไปตั้งค่า): components/ResourceList.tsx บล็อก empty เดิม
 *
 * 🛑 หน้านี้เหลือ **ปฏิทิน + ชีตรายวัน** อย่างเดียวตั้งแต่ 2026-08-12 — รายการประเภทงานและ
 * การตั้งค่า "การรับนัด" ย้ายไป `/settings/job-types` (เหตุผลเต็มอยู่หัวไฟล์นั้น)
 * ห้ามเอากลับมาต่อท้ายที่นี่: ของที่ตั้งครั้งเดียวจบไม่ควรอยู่บนจอที่ผู้ขายเปิดดูทุกวัน
 *
 * IMPORTANT: เป็น server component และต้อง gate ด้วย canUseAppointments เอง —
 * การซ่อนเมนู (applyVerticalMenu, feature 00028) ไม่ใช่การควบคุมสิทธิ์ ร้านที่ไม่เข้าเงื่อนไขแล้วพิมพ์
 * URL ตรงต้องถูกปฏิเสธ (BR-RSV-02) gate ต้องครบ 3 ชั้น: เมนู, หน้า, API
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import Icon from '@/components/wrappers/Icon'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { canUseAppointments, type AppointmentGranularity } from '@/lib/appointments'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { requireActiveShop } from '@/lib/shop-context'
import { listServiceResources } from '@/services/service-resource.service'
import QueuesCalendarSwitch from './components/QueuesCalendarSwitch'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionCard from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard'
import { can, moneyLevel } from '@/lib/shop-permissions'
import { AppointmentBoardCapsProvider } from '@/components/safepay/appointment-board/AppointmentBoardCaps'

export const metadata: Metadata = { title: 'ตารางงาน' }

export default async function WorkSchedulePage() {
  const session = await getServerSession(authOptions)
  // 00071 P3 (Q1): บทบาทที่ไม่มีสิทธิ์เห็นการ์ดบอกเหตุผล ไม่ใช่หน้าว่าง/404 เงียบ — ตัดก่อน query ข้อมูลของหน้า
  const gate = await gatePage(session, 'Q1')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return (
      <>
        <PageBreadcrumb title="ตารางงาน" />
        <NoPermissionCard capability="Q1" viewerRoles={await viewerRolesOf(session)} />
      </>
    )
  }
  if (!session?.user) return null

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) return null

  // notFound() แทน 403 เพื่อไม่บอกใบ้ว่า route นี้มีอยู่จริง (ลด information disclosure)
  if (!canUseAppointments({ kind: active.kind, vertical: active.shop.vertical })) notFound()

  const resources = await listServiceResources(active.shop.id)
  const activeResources = resources.filter((r) => r.isActive)

  // สิทธิ์ของผู้ดู → การ์ดนัด/ชีตวัน/ปฏิทินซ่อนยอด ทักแชท เลื่อนนัด สร้างงาน (00071 P3 · S-15) · ไม่มี gate = ไม่มีบทบาท = ปิดทั้งหมด
  const viewerRoles = gate.ok ? gate.roles : []
  const caps = {
    showMoney: moneyLevel(viewerRoles) !== 'NONE',
    canChat: can(viewerRoles, 'H1'),
    canReschedule: can(viewerRoles, 'O3'),
    canCreate: can(viewerRoles, 'O2s'),
  }
  // ตั้งประเภทงาน = Q2 (เจ้าของ+ผู้ดูแล) — ผู้ไม่มี Q2 ไม่เห็นปุ่มไปหน้าตั้งค่า
  const canSetupJobTypes = can(viewerRoles, 'Q2')

  return (
    <>
      {/* breadcrumb เดสก์ท็อปเท่านั้น — มือถือมีชื่อหน้าใน SellerMobileHeader อยู่แล้ว (กันซ้ำ)
          ท่าเดียวกับ /orders · ของเดิมทำให้มือถือขึ้นชื่อหน้าสองครั้งซ้อนกันก่อนถึงปฏิทิน
          แล้วปฏิทินถูกดันลงไปเกือบครึ่งจอ (user รายงาน 2026-08-11: "padding เยอะ") */}
      <div className="hidden lg:block">
        <PageBreadcrumb title="ตารางงาน" />
      </div>

      {activeResources.length > 0 ? (
        /* 🛑 mount ตัวเดียว ไม่ใช่ render สองตัวแล้วซ่อนด้วย CSS — `hidden` = display:none
           ซึ่ง **ไม่หยุด effect** ของฝั่งที่ซ่อน ผลบนมือถือคือยิง API ซ้ำ 2 ครั้งต่อการเปิดหน้า
           + โหลด timegrid/list ที่ไม่ได้ใช้ + toast ผีตอนเน็ตล้ม (impeccable audit 2026-08-11)
           เหตุผลเต็มอยู่ในหัวไฟล์ QueuesCalendarSwitch */
        <AppointmentBoardCapsProvider value={caps}>
          <QueuesCalendarSwitch
            resources={activeResources.map((r) => ({
              id: r.id,
              name: r.name,
              capacity: r.capacity,
            }))}
            byDay={(active.shop.appointmentGranularity as AppointmentGranularity) !== 'TIME'}
            createLabelShort={resolveOrderVocab(active.shop.vertical).createLabelShort}
          />
        </AppointmentBoardCapsProvider>
      ) : (
        /* ยังไม่มีประเภทงาน = ยังจองอะไรไม่ได้ → **ซ่อนปฏิทินทั้งอัน** ไม่ใช่โชว์จาง ๆ ไว้ข้างหลัง
           (user เคาะ 2026-08-12) ตารางเดือนเปล่าเต็มจออ่านไม่ออกว่าระบบพัง ยังไม่ตั้งค่า หรือ
           แค่ยังไม่มีนัด — และปฏิทินจาง ๆ ที่กดไม่ได้คือของหลอกตาที่กินพื้นที่ CTA บนมือถือ
           ภาพปลายทางบอกด้วย *ข้อความ* แทน ได้ผลเดียวกันโดยไม่ต้องวาดของปลอม

           IMPORTANT: เกณฑ์คือ "ไม่มีประเภทงานที่ **เปิดใช้งานอยู่**" ไม่ใช่ "ไม่มีเลย" — ร้านที่
           ปิดใช้งานทุกอันก็จองอะไรไม่ได้เหมือนกัน แต่ปุ่มต้องพาไปหน้าเดียวกันเพื่อกลับไปเปิด */
        <div className="card">
          <div className="card-body flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <span className="bg-default-100 text-default-500 flex size-14 items-center justify-center rounded-full">
              <Icon icon="category" className="size-7" aria-hidden="true" />
            </span>
            <h5 className="text-dark text-base font-semibold">
              {resources.length > 0 ? 'ยังไม่มีประเภทงานที่เปิดใช้งาน' : 'ยังไม่มีประเภทงาน'}
            </h5>
            {/* บอกภาพปลายทางให้ชัดว่ากดแล้วจะได้อะไรกลับมา ไม่ใช่แค่บอกว่าตอนนี้ว่าง */}
            <p className="text-default-500 max-w-sm text-sm">
              {canSetupJobTypes
                ? 'ตั้งประเภทงานที่ร้านรับก่อน แล้วตารางนัดของแต่ละวันจะขึ้นที่นี่'
                : 'เจ้าของร้านหรือผู้ดูแลต้องตั้งประเภทงานก่อน ตารางนัดของแต่ละวันถึงจะขึ้นที่นี่'}
            </p>
            {canSetupJobTypes && (
              <Link
                href="/settings/job-types"
                className="btn bg-primary hover:bg-primary-hover mt-1 min-h-11 gap-1.5 text-white"
              >
                <Icon icon="settings" className="size-4" aria-hidden="true" />
                ไปตั้งค่าประเภทงาน
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  )
}
