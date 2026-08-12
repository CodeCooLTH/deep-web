/**
 * ประเภทงาน — หน้าตั้งค่าของร้าน `SERVICE_QUEUE` (feature 00024, FR-RSV-01)
 *
 * Base: src/app/(paces)/seller/(dashboard)/queues/page.tsx (ของเดิมก่อนแยกหน้า — ยกทั้ง gate
 *   3 ชั้น + โครง PageBreadcrumb + list component มา ไม่ได้ออกแบบใหม่)
 *   ซึ่ง chase ต่อไปที่ theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/components/CustomerTable.tsx
 *
 * ทำไมแยกออกมาจาก `/queues` (user เคาะ 2026-08-12 หลัง grilling เต็มต้นไม้):
 * หน้า `/queues` เอาของ 3 ชนิดมาต่อกันเป็นแถวเดียว — ปฏิทิน (ดูทุกวัน หลายครั้งต่อวัน),
 * รายการประเภทงาน (ตั้งครั้งเดียวจบ), การรับนัด (ตั้งครั้งเดียวจบ) — สองอย่างหลังจึงมาแย่ง
 * พื้นที่ของอย่างแรกทุกครั้งที่เปิดหน้า และยิ่งชัดขึ้นเมื่อครึ่งปฏิทินโตขึ้นจากชีตรายวัน (08-11)
 *
 * 🛑 นี่คือการกลับมติของ user เองเมื่อ 2026-07-31 ("หน้าคิวงานกับปฏิทิน อยากให้รวมเป็นหน้าเดียว
 * ทำทุกอย่างในเมนูคิวงาน" — commit 872f7d92) โดยรู้ตัว: ตอนนั้นครึ่งปฏิทินยังเล็ก การรวมจึงคุ้ม
 * ห้ามรวมกลับโดยไม่ทบทวนว่าสัดส่วนของหน้าเปลี่ยนไปแล้วหรือยัง
 *
 * IMPORTANT: เป็น server component และต้อง gate ด้วย canUseAppointments เอง — การซ่อนเมนู
 * (applyVerticalMenu, feature 00028) ไม่ใช่การควบคุมสิทธิ์ ร้านที่ไม่เข้าเงื่อนไขแล้วพิมพ์ URL ตรง
 * ต้องถูกปฏิเสธ (BR-RSV-02) gate ต้องครบ 3 ชั้น: เมนู, หน้า, API
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { canUseAppointments, type AppointmentGranularity } from '@/lib/appointments'
import { requireActiveShop } from '@/lib/shop-context'
import {
  listServiceResources,
  serializeServiceResource,
} from '@/services/service-resource.service'
import ResourceList from './components/ResourceList'
import GranularitySetting from './components/GranularitySetting'

export const metadata: Metadata = { title: 'ประเภทงาน' }

export default async function JobTypesPage() {
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
      {/* breadcrumb เดสก์ท็อปเท่านั้น — มือถือมีชื่อหน้าใน SellerMobileHeader อยู่แล้ว (กันซ้ำ) */}
      <div className="hidden lg:block">
        <PageBreadcrumb title="ประเภทงาน" />
      </div>
      <div className="flex flex-col gap-5">
        {/* serializeServiceResource แปลง Decimal → string ก่อนข้าม RSC boundary */}
        <ResourceList resources={resources.map(serializeServiceResource)} />

        {/* 🛑 การ์ดแยกใบ ไม่ใช่ footer ของการ์ดประเภทงาน (user เคาะ 2026-08-12)
            เดิมถูกยัดเป็น footer เมื่อ 08-11 เพื่อประหยัดพื้นที่ตอนที่มันยังอยู่ใต้ปฏิทิน —
            พอย้ายมาหน้าของตัวเองแล้วเหตุผลนั้นหมดไป และมันเป็น *สวิตช์ตัวเดียวของทั้งร้าน*
            คนละชนิดกับ *ของที่มีหลายอัน* อย่างประเภทงาน การรวมการ์ดทำให้ความหมายพร่า

            ยังไม่แสดงเมื่อยังไม่มีประเภทงานเลย — จอนั้นเป็น empty CTA ล้วน ยังไม่มีอะไรให้ตั้งค่า */}
        {resources.length > 0 && (
          <GranularitySetting
            value={(active.shop.appointmentGranularity as AppointmentGranularity) ?? 'DAY'}
          />
        )}
      </div>
    </>
  )
}
