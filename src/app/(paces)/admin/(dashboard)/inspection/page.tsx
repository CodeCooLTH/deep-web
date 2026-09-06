/**
 * /admin/inspection — คิวงานตรวจสอบร้านทั้งระบบ (feature 00060 · T13 · UX Design Spec Surface D)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/issue-tracker/page.tsx (RSC wrapper pattern
 *   เดียวกับ `/admin/topups`, `/admin/verifications` — service-direct DAL, ไม่ fetch API ของ
 *   ตัวเองซ้ำตอน render ครั้งแรก)
 *
 * โหลดข้อมูลตั้งต้นด้วย filter เริ่มต้น (ALL) แล้วส่งต่อให้ client component ทำ filter/สลับ
 * มอบหมายต่อ — ตัวเลขงานค้าง/สัญญาณฉ้อโกงเป็นค่า global ของระบบเสมอ ไม่ผูกกับ filter แถวรายการ
 * (ดูคอมเมนต์ `listRoundsForAdmin` — backlog/fraudSignalCount คำนวณจาก `completedAt: null` /
 * `suspectedFraudNote` ทั้งหมด ไม่กรองตาม assignment/step/method)
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import { requireAdmin } from '@/lib/auth'
import { getIntakeQuotaOverview, listRoundsForAdmin } from '@/services/inspection-admin.service'
import { intakePeriodKey } from '@/lib/inspection/plan-lifecycle'
import InspectionQueueClient from './components/InspectionQueueClient'
import QuotaStatusBanner from './components/QuotaStatusBanner'

export const metadata: Metadata = { title: 'คิวตรวจสอบร้าน' }

export default async function AdminInspectionPage() {
  const admin = await requireAdmin()
  if (!admin) redirect('/admin/auth/sign-in')

  const now = new Date()
  // 🛑 คำนวณสดตอนโหลดหน้า ไม่ใช่ดึง snapshot จาก response ของ cron — ค่าที่คำนวณสดไม่มี lag
  //    และไม่ผูกชะตากับการที่ cron รอบล่าสุดทำงานสำเร็จหรือเปล่า
  // 🛑 เดือนต้องมาจาก `intakePeriodKey()` (เวลาไทย) ไม่ใช่ `now.getMonth()` (เวลาเครื่อง = UTC
  //    บน Vercel) — ทุกสิ้นเดือนจะมีช่วง 7 ชั่วโมงที่สองค่านี้ชี้คนละเดือน แล้วแถบนี้จะอ่านโควตา
  //    ผิดเดือน: ขึ้น "ยังไม่ตั้งโควตา" ทั้งที่ตั้งแล้ว หรือแย่กว่านั้นคือปิดปากตอนที่ยังไม่ได้ตั้งจริง
  const [periodYear, periodMonth] = intakePeriodKey(now).split('-').map(Number)
  const [initial, quotas] = await Promise.all([
    listRoundsForAdmin({ assignment: 'ALL', now }),
    getIntakeQuotaOverview(periodYear!, periodMonth!),
  ])

  return (
    <>
      <PageBreadcrumb
        title="คิวตรวจสอบร้าน"
        trail={[{ label: 'ระบบ' }]}
        action={
          <Link href="/inspection/quota" className="btn btn-sm border border-default-300 text-default-800">
            <Icon icon="calendar-stats" className="size-4" aria-hidden="true" />
            โควตารายเดือน
          </Link>
        }
      />

      <QuotaStatusBanner quotas={quotas} />

      <InspectionQueueClient
        initialRounds={initial.rounds.map((r) => ({
          ...r,
          dueAt: r.dueAt ? r.dueAt.toISOString() : null,
          assignedAt: r.assignedAt ? r.assignedAt.toISOString() : null,
          completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        }))}
        initialBacklog={initial.backlog}
        initialFraudSignalCount={initial.fraudSignalCount}
        initialNextCursor={initial.nextCursor}
      />
    </>
  )
}
