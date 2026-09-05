/**
 * /inspector — คิวงานของผู้ตรวจ (feature 00060 · T13 · UX Design Spec Surface C)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/issue-tracker/page.tsx (RSC queue wrapper —
 *   pattern เดียวกับที่ /admin/(dashboard)/topups ใช้อยู่แล้ว: service-direct DAL ไม่ผ่าน HTTP
 *   round-trip ไป self)
 *
 * mobile-first single-column task flow (Operate mode) — ไม่มี filter/sort/pagination เพราะคิวงาน
 * ต่อผู้ตรวจหนึ่งคนมีไม่มาก (รอบที่เปิดพร้อมกันสูงสุดคือที่พักทุกหลังของร้านเดียว)
 */
import type { Metadata } from 'next'
import Icon from '@/components/wrappers/Icon'
import { listAssignmentsForInspector } from '@/services/inspection-round.service'
import type { InspectionMethod, InspectionStep } from '@/lib/inspection/checks'
import { requireInspectorPage } from './_shared'
import InspectorHeader from './_components/InspectorHeader'
import AssignmentCard from './_components/AssignmentCard'

export const metadata: Metadata = { title: 'งานตรวจของฉัน' }

export default async function InspectorQueuePage() {
  const { userId } = await requireInspectorPage()
  const rounds = await listAssignmentsForInspector(userId)

  // 🛑 เรียงด้วย dueAt ตาม UX spec (Controller instruction) — service คืนเรียงมาแล้วตาม
  // `[{ dueAt: asc, nulls: last }, { createdAt: asc }]` (เกณฑ์เดียวกับที่ /admin ใช้) ไม่ต้อง
  // sort ซ้ำที่นี่ — sort ซ้ำเสี่ยงใช้เกณฑ์ต่างจาก service แล้ว drift (HR16)

  return (
    <>
      <InspectorHeader title="งานตรวจของฉัน" />

      <div className="space-y-3 p-4">
        {rounds.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Icon icon="clipboard-off" className="text-4xl text-default-300" aria-hidden="true" />
            <p className="text-sm font-medium text-default-500">ยังไม่มีงานที่ได้รับมอบหมาย</p>
          </div>
        ) : (
          rounds.map((r) => (
            <AssignmentCard
              key={r.id}
              id={r.id}
              shopName={r.shopName}
              roomName={r.roomName}
              step={r.step as InspectionStep}
              method={r.method as InspectionMethod}
              dueAtISO={r.dueAt ? r.dueAt.toISOString() : null}
              isOverdue={r.isOverdue}
            />
          ))
        )}
      </div>
    </>
  )
}
