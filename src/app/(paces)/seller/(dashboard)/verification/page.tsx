/**
 * Seller verification page (L1/L2/L3) — ไม่มี Paces verification-workflow template (Explore E1).
 * status header: re-sourced จาก SellerStatisticCard (icon-circle + value + subTitle pattern)
 * level cards: re-sourced จาก pricing/page.tsx + pricing/components/data.ts (isPopular pattern)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(sellers)/seller-details/components/SellerStatisticCard.tsx
 * Base: theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx
 */
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserVerifications, getMaxVerificationLevel } from '@/services/verification.service'
import Icon from '@/components/wrappers/Icon'
import type { Metadata } from 'next'
import LevelCard from './components/LevelCard'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import SellerErrorState from '../_shared/SellerErrorState'

export const metadata: Metadata = { title: 'ยืนยันตัวตนร้านค้า' }

// ─── Level definitions ────────────────────────────────────────────────────────
const LEVEL_DEFS = [
  {
    level: 1 as const,
    title: 'ยืนยันเบอร์โทรศัพท์',
    description: 'ยืนยันตัวตนขั้นพื้นฐานผ่าน OTP (ทำโดยอัตโนมัติเมื่อสมัครสมาชิก)',
  },
  {
    level: 2 as const,
    title: 'ยืนยันตัวตนธุรกิจขั้นต้น',
    description:
      'อัปโหลดบัตรประชาชน + Selfie + รูปหน้าร้าน (FR-2.3 / FR-2.4) — แอดมินตรวจสอบภายใน 1–2 วัน',
  },
  {
    level: 3 as const,
    title: 'ยืนยันธุรกิจเต็มรูปแบบ',
    description:
      'อัปโหลดเอกสารจดทะเบียนธุรกิจ + เลขที่จดทะเบียน (FR-2.5) — แอดมินตรวจสอบภายใน 3–5 วัน',
  },
]

const MAX_LEVEL_LABELS: Record<number, { label: string; sub: string }> = {
  0: { label: 'ยังไม่ได้ยืนยัน', sub: 'ส่งเอกสารเพื่อเพิ่ม Trust Score ของร้าน' },
  1: { label: 'พื้นฐาน', sub: 'ยืนยันเบอร์โทรศัพท์แล้ว' },
  2: { label: 'ธุรกิจขั้นต้น', sub: 'ยืนยันตัวตนและร้านค้าแล้ว' },
  3: { label: 'ธุรกิจเต็มรูปแบบ', sub: 'ยืนยันเอกสารธุรกิจครบถ้วน' },
}

export default async function VerificationPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  if (!user) return null // layout redirect guard handles unauthenticated

  // fetch fail → SellerErrorState (ไม่โยน exception ให้ error boundary)
  let verifications: any[] = []
  let maxLevel = 0
  let fetchFailed = false
  try {
    ;[verifications, maxLevel] = await Promise.all([
      getUserVerifications(user.id),
      getMaxVerificationLevel(user.id),
    ])
  } catch {
    fetchFailed = true
  }

  if (fetchFailed) {
    return (
      <>
        <PageBreadcrumb title="ยืนยันตัวตน" trail={[{ label: 'Setting' }]} />
        <SellerErrorState
          title="โหลดข้อมูลการยืนยันตัวตนไม่สำเร็จ"
          message="เกิดข้อผิดพลาดชั่วคราว ลองโหลดใหม่อีกครั้ง"
          retryHref="/verification"
        />
      </>
    )
  }

  // Build a quick lookup: level → latest record (already desc by createdAt)
  const byLevel: Record<number, (typeof verifications)[0]> = {}
  for (const v of verifications) {
    if (!(v.level in byLevel)) {
      byLevel[v.level] = v
    }
  }

  // Level-1 is auto-approved for phone auth users (phone OTP sign-in)
  const hasPhoneAuth = !!user.id // all users who signed in via phone already have OTP record created
  const l1AutoApproved =
    hasPhoneAuth &&
    (byLevel[1]?.status === 'APPROVED' ||
      verifications.some(
        (v: any) =>
          v.level === 1 && (v.type === 'PHONE_OTP' || v.type === 'EMAIL_OTP') && v.status === 'APPROVED',
      ))

  // Determine per-level status
  function getLevelStatus(
    level: 1 | 2 | 3,
  ): 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_SUBMITTED' | 'AUTO_APPROVED' {
    if (level === 1) {
      if (l1AutoApproved) return 'AUTO_APPROVED'
      const rec = byLevel[1]
      if (rec) return rec.status as 'PENDING' | 'APPROVED' | 'REJECTED'
      return 'NOT_SUBMITTED'
    }
    const rec = byLevel[level]
    if (!rec) return 'NOT_SUBMITTED'
    return rec.status as 'PENDING' | 'APPROVED' | 'REJECTED'
  }

  function getPreviousApproved(level: 1 | 2 | 3): boolean {
    if (level === 1) return true
    const prevStatus = getLevelStatus((level - 1) as 1 | 2 | 3)
    return prevStatus === 'APPROVED' || prevStatus === 'AUTO_APPROVED'
  }

  function canSubmit(level: 1 | 2 | 3): boolean {
    const status = getLevelStatus(level)
    if (status === 'APPROVED' || status === 'AUTO_APPROVED' || status === 'PENDING') return false
    return getPreviousApproved(level)
  }

  const currentLevelInfo = MAX_LEVEL_LABELS[maxLevel] ?? MAX_LEVEL_LABELS[0]

  return (
    <>
      <PageBreadcrumb title="ยืนยันตัวตน" trail={[{ label: 'Setting' }]} />
      {/* Page header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark">ยืนยันตัวตนร้านค้า</h1>
          <p className="text-default-400 mt-1 text-sm">
            เพิ่มระดับการยืนยันเพื่อเสริม Trust Score และรับ Badge ร้านค้า
          </p>
        </div>
      </div>

      {/* Current status card — shell จาก SellerStatisticCard (icon-circle + value + subTitle) */}
      <div className="card mb-6">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <h5 className="card-title text-sm">ระดับปัจจุบัน</h5>
          </div>
          {/* icon-circle + value — ตาม SellerStatisticCard mt-5 mb-2.5 flex items-center gap-2.5 */}
          <div className="mt-5 mb-2.5 flex items-center gap-2.5">
            <div className="size-9 flex items-center justify-center rounded-full bg-primary">
              <Icon icon="shield-check" className="size-5.5 text-white" />
            </div>
            <h3 className="text-xl">
              Level {maxLevel} — {currentLevelInfo.label}
            </h3>
          </div>
          {/* subTitle + hint — ตาม SellerStatisticCard text-default-400 flex items-center justify-between text-sm */}
          <div className="text-default-400 flex items-center justify-between text-sm">
            <div className="flex items-center gap-1">
              <span className="flex items-center gap-1">
                <Icon icon="circle-filled" className="align-middle" />
              </span>
              <span>{currentLevelInfo.sub}</span>
            </div>
            <span className="font-semibold text-default-800">/ 3</span>
          </div>
          {/* hint — ซ่อนเมื่อ maxLevel = 3 */}
          {maxLevel < 3 && (
            <div className="mt-3 flex items-center gap-2 text-primary text-sm">
              <Icon icon="info-circle" className="size-4 shrink-0" />
              <span>
                ยืนยันให้ครบ Level 3 เพื่อรับ Trust Score สูงสุด
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Level cards */}
      <div className="space-y-4">
        {LEVEL_DEFS.map(({ level, title, description }) => {
          const status = getLevelStatus(level)
          const rec = byLevel[level]
          return (
            <LevelCard
              key={level}
              level={level}
              title={title}
              description={description}
              status={status}
              rejectedReason={rec?.rejectedReason ?? null}
              canSubmit={canSubmit(level)}
            />
          )
        })}
      </div>

      {/* Info footer */}
      <div className="mt-6 rounded-xl border border-default-200 bg-default-50 p-4 text-sm text-default-400">
        <div className="flex items-start gap-2">
          <Icon icon="shield-lock" className="mt-0.5 shrink-0 text-default-300 size-4" />
          <p>
            เอกสารทั้งหมดถูกเก็บอย่างปลอดภัย ใช้สำหรับการยืนยันตัวตนเท่านั้น ไม่เปิดเผยต่อสาธารณะ
            ขนาดไฟล์ไม่เกิน 5 MB ต่อไฟล์ รองรับ JPG, PNG, PDF
          </p>
        </div>
      </div>
    </>
  )
}
