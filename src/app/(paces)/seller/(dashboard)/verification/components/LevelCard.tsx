/**
 * LevelCard — เปลือกการ์ดยืนยันตัวตนต่อระดับ (L1 / L2 / L3)
 *
 * Base (card shell): theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/categories/components/AddCategoryModal.tsx
 *   — ใช้โครงสร้าง card → card-header → card-body → card-footer + button
 *   — E1 investigation (Phase B B0) กำหนดว่า AddCategoryModal เป็น source ที่ถูกต้อง
 *     (guideline row /seller/verification ระบุ SellerStatisticCard ซึ่งผิด
 *      เพราะ SellerStatisticCard ไม่มี CTA/footer slot — ดู Controller task S18 note)
 *
 * Logic + API wiring: คงเดิมจาก E1 — ห้ามเปลี่ยน
 *   - POST /api/upload (returns fileId)
 *   - POST /api/verification ({type:'DOCUMENT',level,documents})
 *   - router.refresh() on success
 *   - onDone() collapse callback
 *   - 5MB file size limit + accept image/PDF
 *   - showForm toggle (canSubmit && level 2|3)
 *   - L2Form / L3Form conditional by level (ใน VerificationForm.tsx)
 *   - toast success/error (react-toastify)
 */

'use client'

import { Icon } from '@iconify/react'
import { useState } from 'react'
import StatusBadge from './StatusBadge'
import VerificationForm from './VerificationForm'

type Status = 'PENDING' | 'APPROVED' | 'REJECTED'

interface LevelCardProps {
  level: 1 | 2 | 3
  title: string
  description: string
  status: Status | 'NOT_SUBMITTED' | 'AUTO_APPROVED'
  rejectedReason?: string | null
  canSubmit: boolean
}

// ไอคอนต่อระดับ — ใช้ tabler prefix สอดคล้อง project convention
const levelIcons: Record<number, string> = {
  1: 'tabler:phone-check',
  2: 'tabler:id-badge-2',
  3: 'tabler:building-store',
}

// border ของ card-header แต่ละสถานะ — semantic Tailwind class เท่านั้น (ไม่มี arbitrary value)
const headerBorderByStatus: Record<string, string> = {
  APPROVED: 'border-success/30',
  AUTO_APPROVED: 'border-success/30',
  PENDING: 'border-warning/30',
  REJECTED: 'border-danger/30',
  NOT_SUBMITTED: 'border-default-200',
}

export default function LevelCard({
  level,
  title,
  description,
  status,
  rejectedReason,
  canSubmit,
}: LevelCardProps) {
  // toggle แสดงฟอร์มอัปโหลด — onDone() พับกลับ
  const [showForm, setShowForm] = useState(false)

  const headerBorderCls = headerBorderByStatus[status] ?? 'border-default-200'

  return (
    // card shell: มาจาก AddCategoryModal "w-full flex flex-col card"
    <div className="w-full flex flex-col card">

      {/* card-header: ระดับ + ชื่อ + status chip — จาก AddCategoryModal card-header p-5 */}
      <div className={`card-header p-5 border-b ${headerBorderCls} flex items-center gap-4`}>
        {/* ไอคอนระดับ */}
        <div className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-primary/10">
          <Icon icon={levelIcons[level]} width={22} height={22} className="text-primary" />
        </div>

        {/* หัวการ์ด */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-default-400 uppercase tracking-wider">
              Level {level}
            </span>

            {/* status chip: StatusBadge (APPROVED/PENDING/REJECTED) หรือ inline สำหรับ AUTO_APPROVED/NOT_SUBMITTED */}
            {status === 'APPROVED' && <StatusBadge status="APPROVED" />}
            {status === 'AUTO_APPROVED' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-success/10 text-success">
                <Icon icon="tabler:circle-check" width={14} height={14} />
                ยืนยันแล้ว (อัตโนมัติ)
              </span>
            )}
            {status === 'PENDING' && <StatusBadge status="PENDING" />}
            {status === 'REJECTED' && <StatusBadge status="REJECTED" />}
            {status === 'NOT_SUBMITTED' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-default-100 text-default-500">
                <Icon icon="tabler:minus-circle" width={14} height={14} />
                ยังไม่ส่ง
              </span>
            )}
          </div>

          <h3 className="text-dark font-semibold text-base leading-snug">{title}</h3>
        </div>
      </div>

      {/* card-body: คำอธิบาย + เหตุผลถูกปฏิเสธ — จาก AddCategoryModal card-body */}
      <div className="card-body">
        <p className="text-default-500 text-sm leading-relaxed">{description}</p>

        {/* แสดงเหตุผลที่ถูกปฏิเสธ — ไม่มี raw filename/PII ที่ส่งมาจาก DB ใน field นี้ */}
        {status === 'REJECTED' && rejectedReason && (
          <div className="mt-3 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            <span className="font-semibold">เหตุผล: </span>
            {rejectedReason}
          </div>
        )}

        {/* ฟอร์มอัปโหลดเอกสาร (inline, toggle) — logic คงเดิม */}
        {showForm && (level === 2 || level === 3) && (
          <VerificationForm level={level} onDone={() => setShowForm(false)} />
        )}
      </div>

      {/* card-footer: CTA button — จาก AddCategoryModal "flex justify-end items-center gap-x-2 border-t ... card-body" */}
      {canSubmit && (level === 2 || level === 3) && !showForm && (
        <div className="flex items-center gap-x-2 border-t border-default-200 card-body">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-2"
          >
            <Icon icon="tabler:upload" width={16} height={16} />
            อัปโหลดเอกสาร
          </button>
        </div>
      )}
    </div>
  )
}
