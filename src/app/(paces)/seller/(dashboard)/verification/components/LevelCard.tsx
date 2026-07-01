/**
 * LevelCard — การ์ดยืนยันตัวตนต่อระดับ (L1 / L2 / L3)
 * shell re-sourced จาก pricing-tier card (isPopular pattern)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/pricing/components/data.ts
 *
 * Logic + API wiring: คงเดิมจาก E1 — ห้ามเปลี่ยน
 *   - POST /api/upload (returns fileId)
 *   - POST /api/verification ({type:'DOCUMENT',level,documents})
 *   - router.refresh() on success
 *   - onDone() collapse callback
 *   - 5MB file size limit + accept image/PDF
 *   - showForm toggle (canSubmit && level 2|3)
 *   - L2Form / L3Form conditional by level (ใน VerificationForm.tsx)
 *   - toast success/error (pacesToast)
 */

'use client'

import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
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
  // L3 มีเงื่อนไข "ต้องผ่าน Level 2 ก่อน" — สะท้อนสถานะจริงจาก parent (getPreviousApproved)
  previousApproved?: boolean
}

// ไอคอนต่อระดับ — tabler ชื่อ (ไม่มี prefix, ส่งเข้า wrapper)
const levelIcons: Record<number, string> = {
  1: 'phone-check',
  2: 'id-badge-2',
  3: 'building-store',
}

// รายการเอกสารต่อระดับ — แสดงใน features ul (pricing card pattern)
const levelFeatures: Record<number, { title: string; included: boolean }[]> = {
  1: [
    { title: 'ยืนยันเบอร์โทรศัพท์ผ่าน OTP', included: true },
    { title: 'อัตโนมัติเมื่อสมัครผ่านเบอร์โทร', included: true },
    { title: 'ไม่ต้องอัปโหลดเอกสาร', included: true },
  ],
  2: [
    { title: 'บัตรประชาชน', included: true },
    { title: 'Selfie คู่กับบัตรประชาชน', included: true },
    { title: 'รูปหน้าร้าน / ป้ายร้าน', included: true },
    { title: 'แอดมินตรวจสอบภายใน 1–2 วัน', included: true },
  ],
  3: [
    { title: 'เอกสารจดทะเบียนธุรกิจ', included: true },
    { title: 'เลขที่จดทะเบียน', included: true },
    { title: 'แอดมินตรวจสอบภายใน 3–5 วัน', included: true },
    // เงื่อนไข Level 2 = dynamic (เติมใน component จาก previousApproved) ไม่ hardcode
  ],
}

// การ์ด actionable (canSubmit=true) ใช้ isPopular highlight (pricing pattern)
// APPROVED/AUTO_APPROVED → ขอบเขียว เพื่อบ่งบอกว่าผ่านแล้ว
function getCardHighlight(status: LevelCardProps['status'], canSubmit: boolean): string {
  if (canSubmit) return '!bg-primary'
  if (status === 'APPROVED' || status === 'AUTO_APPROVED') return 'border-success/40'
  return ''
}

export default function LevelCard({
  level,
  title,
  description,
  status,
  rejectedReason,
  canSubmit,
  previousApproved = false,
}: LevelCardProps) {
  // toggle แสดงฟอร์มอัปโหลด — onDone() พับกลับ (คงเดิม)
  const [showForm, setShowForm] = useState(false)

  const isActionable = canSubmit
  const cardHighlight = getCardHighlight(status, isActionable)
  // L3: เติม prerequisite item ตามสถานะจริงของ Level 2 (ผ่านแล้ว → ✓, ยังไม่ผ่าน → ✗)
  const features =
    level === 3
      ? [
          ...(levelFeatures[3] ?? []),
          previousApproved
            ? { title: 'ผ่าน Level 2 แล้ว', included: true }
            : { title: 'ต้องผ่าน Level 2 ก่อน', included: false },
        ]
      : levelFeatures[level] ?? []

  return (
    // shell จาก pricing card: card h-full rounded-md + isPopular → !bg-primary
    <div className={cn('card h-full rounded-md', cardHighlight)}>
      {/* card-body text-center — pricing pattern */}
      <div className="card-body p-7.5">
        {/* header: icon-circle + Level label + ชื่อระดับ */}
        <div className="flex items-center gap-3 mb-1.25">
          <div
            className={cn(
              'size-9 flex items-center justify-center rounded-full',
              isActionable ? 'bg-white/20' : 'bg-primary/10',
            )}
          >
            <Icon
              icon={levelIcons[level]}
              className={cn('size-5', isActionable ? 'text-white' : 'text-primary')}
            />
          </div>
          <div>
            <span
              className={cn(
                'text-xs font-semibold uppercase tracking-wider',
                isActionable ? 'text-white/60' : 'text-default-400',
              )}
            >
              Level {level}
            </span>
            <h3
              className={cn('text-xl font-bold leading-tight', isActionable ? 'text-white' : '')}
            >
              {title}
            </h3>
          </div>
        </div>

        {/* คำอธิบาย — pricing subtitle */}
        <p className={cn('text-default-400 text-sm mb-4', isActionable && 'text-white/50')}>
          {description}
        </p>

        {/* "price" slot → status badge */}
        <div className="my-4 flex justify-start">
          {status === 'APPROVED' && <StatusBadge status="APPROVED" />}
          {status === 'AUTO_APPROVED' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-success/10 text-success">
              <Icon icon="circle-check" className="size-3.5" />
              ยืนยันแล้ว (อัตโนมัติ)
            </span>
          )}
          {status === 'PENDING' && <StatusBadge status="PENDING" />}
          {status === 'REJECTED' && <StatusBadge status="REJECTED" />}
          {status === 'NOT_SUBMITTED' && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
                isActionable
                  ? 'bg-white/20 text-white'
                  : 'bg-default-100 text-default-500',
              )}
            >
              <Icon icon="lock" className="size-3.5" />
              ยังไม่ปลดล็อก
            </span>
          )}
        </div>

        {/* เหตุผลถูกปฏิเสธ */}
        {status === 'REJECTED' && rejectedReason && (
          <div className="mb-4 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            <span className="font-semibold">เหตุผล: </span>
            {rejectedReason}
          </div>
        )}

        {/* features ul + Icon check/x — pricing pattern */}
        <ul className="space-y-2.5">
          {features.map((feature, i) => (
            <li
              key={i}
              className={cn(
                'flex items-center gap-3 text-sm',
                isActionable ? 'text-white' : '',
              )}
            >
              <Icon
                icon={feature.included ? 'check' : 'x'}
                className={cn(
                  'text-sm shrink-0',
                  feature.included ? 'text-success' : 'text-danger',
                  // อักษรขาวบน primary bg → ปรับ icon ให้อ่านง่าย
                  isActionable && feature.included && 'text-white/80',
                  isActionable && !feature.included && 'text-white/40',
                )}
              />
              {feature.title}
            </li>
          ))}
        </ul>

        {/* ฟอร์มอัปโหลดเอกสาร (inline, toggle) — logic คงเดิม */}
        {showForm && (level === 2 || level === 3) && (
          <VerificationForm level={level} onDone={() => setShowForm(false)} />
        )}
      </div>

      {/* footer btn → CTA ตาม canSubmit — pricing px-15 pt-3.75 pb-7.5 */}
      {canSubmit && (level === 2 || level === 3) && !showForm && (
        <div className="px-7.5 pt-3.75 pb-7.5">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="btn w-full rounded-full py-3 font-semibold bg-white text-primary hover:bg-white/90 inline-flex items-center justify-center gap-2"
          >
            <Icon icon="upload" className="size-4" />
            อัปโหลดเอกสาร
          </button>
        </div>
      )}
    </div>
  )
}
