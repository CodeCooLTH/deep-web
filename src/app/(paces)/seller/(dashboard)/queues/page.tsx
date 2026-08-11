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
 * การซ่อนเมนู (applyVerticalMenu, feature 00028) ไม่ใช่การควบคุมสิทธิ์ ร้านที่ไม่เข้าเงื่อนไขแล้วพิมพ์
 * URL ตรงต้องถูกปฏิเสธ (BR-RSV-02) gate ต้องครบ 3 ชั้น: เมนู, หน้า, API
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { canUseAppointments, type AppointmentGranularity } from '@/lib/appointments'
import { resolveOrderVocab } from '@/lib/seller-menu'
import { requireActiveShop } from '@/lib/shop-context'
import {
  listServiceResources,
  serializeServiceResource,
} from '@/services/service-resource.service'
import AppointmentMonthBoard from '@/components/safepay/appointment-board/AppointmentMonthBoard'
import ResourceList from './components/ResourceList'
import AppointmentCalendar from './components/AppointmentCalendar'
import GranularitySetting from './components/GranularitySetting'

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
      {/* breadcrumb เดสก์ท็อปเท่านั้น — มือถือมีชื่อหน้าใน SellerMobileHeader อยู่แล้ว (กันซ้ำ)
          ท่าเดียวกับ /orders · ของเดิมทำให้มือถือขึ้นคำว่า "คิวงาน" สองครั้งซ้อนกันก่อนถึงปฏิทิน
          แล้วปฏิทินถูกดันลงไปเกือบครึ่งจอ (user รายงาน 2026-08-11: "padding เยอะ") */}
      <div className="hidden lg:block">
        <PageBreadcrumb title="คิวงาน" />
      </div>
      <div className="flex flex-col gap-5">
        {/* ปฏิทินมาก่อนรายการ — งานประจำวันของร้านคือ "ดูว่าวันนี้มีใครเข้ามาบ้าง"
            ส่วนการตั้งค่าคิวงานทำครั้งเดียวตอนเริ่มใช้ (user รวมสองหน้าเป็นหน้าเดียว 2026-07-31)
            ส่ง activeOnly ให้ตัวกรอง — กรองด้วยคิวงานที่ปิดแล้วไม่มีประโยชน์

            IMPORTANT: ยังไม่มีคิวงาน = ยังจองอะไรไม่ได้ → ซ่อนปฏิทินไปเลย
            ไม่งั้นเจ้าของร้านที่เพิ่งเปิดเมนูนี้จะเจอตารางเดือนเปล่าเต็มจอ แล้วไม่รู้ว่า
            ระบบพัง ยังไม่ตั้งค่า หรือแค่ยังไม่มีนัด ส่วน empty state ที่บอกขั้นตอนแรก
            ก็ถูกดันลงไปใต้ปฏิทินจนต้องเลื่อนหา (impeccable critique P1 2026-07-31) */}
        {resources.length > 0 && (
          <>
            {/* มือถือ/แท็บเล็ต (<lg) — ผังเดียวกับชีต "เลือกวันและเวลา" แบบดูอย่างเดียว
                (user สั่ง 2026-08-10) ตารางเดือน 7 คอลัมน์ที่มีป้ายนัดอยู่ในช่องอ่านไม่ออกจริง
                บนจอ 390px ส่วนมุมมองสัปดาห์ที่ของเดิมสลับไปให้ ก็ไม่บอกภาพรวมเดือน

                เส้นสลับคือ lg (1024) ไม่ใช่ 768 ที่ AppointmentCalendar เคยใช้ภายใน —
                1024 คือเส้นเดียวของ seller shell ทั้งตัว (sidebar/topbar หาย, bottom nav โผล่)
                ของเดิมทำให้แท็บเล็ต 768–1023 ได้ปฏิทินทรงเดสก์ท็อปทั้งที่ sidebar หายไปแล้ว */}
            <div className="lg:hidden">
              <AppointmentMonthBoard
                resources={resources
                  .filter((r) => r.isActive)
                  .map((r) => ({ id: r.id, name: r.name, capacity: r.capacity }))}
                byDay={(active.shop.appointmentGranularity as AppointmentGranularity) !== 'TIME'}
                /* คำจาก SSOT ไม่ใช่คำที่พิมพ์ในคอมโพเนนต์ — หน้านี้มี 2 เวอร์ชัน (มือถือ/เดสก์ท็อป)
                   ที่เคยเรียกการกระทำเดียวกันคนละคำ ("สร้างงาน" กับ "จองคิว") ทั้งที่ ORDER_VOCAB
                   ตัดสินไว้แล้วว่าร้านคิวงานเรียกว่าอะไร (HR16) */
                createLabelShort={resolveOrderVocab(active.shop.vertical).createLabelShort}
              />
            </div>
            <div className="hidden lg:block">
              <AppointmentCalendar
                resources={resources
                  .filter((r) => r.isActive)
                  .map((r) => ({ id: r.id, name: r.name, capacity: r.capacity }))}
                createLabelShort={resolveOrderVocab(active.shop.vertical).createLabelShort}
              />
            </div>
          </>
        )}
        {/* serializeServiceResource แปลง Decimal → string ก่อนข้าม RSC boundary */}
        <ResourceList resources={resources.map(serializeServiceResource)} />

        {/* การรับนัด (รายวัน/ระบุช่วงเวลา) — ค่าระดับ **ร้าน** ย้ายมาจาก ResourceForm 2026-08-08
            เดิมอยู่ในฟอร์มคิวงาน (/queues/new, /queues/[resourceId]) ซึ่งเข้าถึงได้เฉพาะตอน
            เพิ่ม/แก้คิวงาน — ร้านที่ตั้งคิวงานเสร็จแล้วไม่มีเหตุผลกลับเข้าไปอีก จึงหาไม่เจอ
            แล้วสรุปว่า "ระบบระบุเวลานัดไม่ได้" (ร้าน BT รายงานจริง 2026-08-08; retro 00024
            บันทึกเป็นหนี้ P2 ไว้ตั้งแต่แรก) ส่วนหน้านี้เป็นหน้าที่ผู้ขายเข้าทุกวันเพื่อดูปฏิทิน

            วาง **ท้ายสุด** ไม่ใช่บนสุด: ปฏิทินกับรายการคิวงานคืองานประจำวัน ส่วนนี่คือค่าที่ตั้ง
            ครั้งเดียวตอนเริ่มใช้ — ยัง reachable ด้วยการเลื่อนหน้าเดียว ไม่ต้องเปลี่ยน route
            และการ์ดนี้บันทึกทันทีที่เลือก (คนละ endpoint กับอะไรทั้งสิ้นในหน้านี้) จึงไม่มีปุ่ม
            บันทึก/ยกเลิกของฟอร์มอื่นมาให้สับสนอีกแล้ว ซึ่งเป็นปัญหาเดิมตอนอยู่ใน ResourceForm */}
        <GranularitySetting
          value={(active.shop.appointmentGranularity as AppointmentGranularity) ?? 'DAY'}
        />
      </div>
    </>
  )
}
