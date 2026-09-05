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
import { listRoundsForAdmin } from '@/services/inspection-admin.service'
import InspectionQueueClient from './components/InspectionQueueClient'

export const metadata: Metadata = { title: 'คิวตรวจสอบร้าน' }

export default async function AdminInspectionPage() {
  const admin = await requireAdmin()
  if (!admin) redirect('/admin/auth/sign-in')

  const initial = await listRoundsForAdmin({ assignment: 'ALL', now: new Date() })

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
