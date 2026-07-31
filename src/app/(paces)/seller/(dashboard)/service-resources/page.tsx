/**
 * Service resources list — คิวงานที่รับได้ของร้าน (feature 00024, FR-RSV-01)
 *
 * Base: src/app/(paces)/seller/(dashboard)/rooms/page.tsx
 *   — โครงเดียวกันเป๊ะ (PageBreadcrumb + gate ระดับหน้า + list component)
 *     ซึ่ง chase ต่อไปที่ theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/components/CustomerTable.tsx
 *
 * Design Spec: safepay-ux ส่วน A (2026-07-31)
 *
 * IMPORTANT: หน้านี้เป็น server component และต้อง gate ด้วย canUseAppointments เอง —
 * การซ่อนเมนู (applyAppointmentMenu) ไม่ใช่การควบคุมสิทธิ์ ร้านที่ไม่เข้าเงื่อนไขแล้วพิมพ์
 * URL ตรงต้องถูกปฏิเสธ (BR-RSV-02) gate ต้องครบ 3 ชั้น: เมนู, หน้า, API
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { canUseAppointments } from '@/lib/appointments'
import { requireActiveShop } from '@/lib/shop-context'
import {
  listServiceResources,
  serializeServiceResource,
} from '@/services/service-resource.service'
import ResourceList from './components/ResourceList'
import AppointmentCalendar from './components/AppointmentCalendar'

export const metadata: Metadata = { title: 'คิวงาน' }

export default async function ServiceResourcesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null

  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) return null

  // notFound() แทน 403 เพื่อไม่บอกใบ้ว่า route นี้มีอยู่จริง (ลด information disclosure)
  if (!canUseAppointments({ kind: active.kind, vertical: active.shop.vertical })) notFound()

  // ไม่ใส่ activeOnly — หน้าตั้งค่าต้องเห็นรายการที่ปิดใช้งานด้วย เพื่อกลับมาเปิดได้
  const resources = await listServiceResources(active.shop.id)

  return (
    <>
      <PageBreadcrumb title="คิวงาน" />
      <div className="flex flex-col gap-5">
        {/* ปฏิทินมาก่อนรายการ — งานประจำวันของร้านคือ "ดูว่าวันนี้มีใครเข้ามาบ้าง"
            ส่วนการตั้งค่าคิวงานทำครั้งเดียวตอนเริ่มใช้ (user รวมสองหน้าเป็นหน้าเดียว 2026-07-31)
            ส่ง activeOnly ให้ตัวกรอง — กรองด้วยคิวงานที่ปิดแล้วไม่มีประโยชน์

            IMPORTANT: ยังไม่มีคิวงาน = ยังจองอะไรไม่ได้ → ซ่อนปฏิทินไปเลย
            ไม่งั้นเจ้าของร้านที่เพิ่งเปิดเมนูนี้จะเจอตารางเดือนเปล่าเต็มจอ แล้วไม่รู้ว่า
            ระบบพัง ยังไม่ตั้งค่า หรือแค่ยังไม่มีนัด ส่วน empty state ที่บอกขั้นตอนแรก
            ก็ถูกดันลงไปใต้ปฏิทินจนต้องเลื่อนหา (impeccable critique P1 2026-07-31) */}
        {resources.length > 0 && (
          <AppointmentCalendar
            resources={resources
              .filter((r) => r.isActive)
              .map((r) => ({ id: r.id, name: r.name, capacity: r.capacity }))}
          />
        )}
        {/* serializeServiceResource แปลง Decimal → string ก่อนข้าม RSC boundary */}
        <ResourceList resources={resources.map(serializeServiceResource)} />
      </div>
    </>
  )
}
