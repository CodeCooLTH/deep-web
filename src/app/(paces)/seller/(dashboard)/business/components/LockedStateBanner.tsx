'use client'

/**
 * LockedStateBanner — persistent inline banner แสดงสถานะ locked/quota ของ Business subscription
 *
 * Base: src/app/(paces)/seller/(dashboard)/wallet/components/WalletCard.tsx:42-52
 * (error-banner block: role="alert" + rounded-lg border-danger/20 bg-danger/10 + icon)
 * + Base: src/app/(paces)/seller/(dashboard)/inventory/components/InventoryGate.tsx
 * (LOCKED variant: banner + conditional render ตามสถานะ)
 * + Base: src/app/(paces)/seller/(dashboard)/inventory/components/AdvanceWarningBanner.tsx:40-42
 * (CTA link ฝั่งขวา pattern: flex justify-between + shrink-0 font-bold underline link)
 *
 * Adaptations:
 * - ตัด icon double-prefix bug ของ WalletCard ("tabler-alert-triangle") → ใช้ short-form "alert-triangle"
 *   (Icon wrapper auto-prefix "tabler:" ให้เอง — Design Spec §Constants เตือนไว้ชัดเจนว่าอย่า copy บั๊กนี้)
 * - 2 variant ตาม lockReason: grace-eligible (RENEWAL_FAILED/OWNER_CANCELLED_PACKAGE — countdown 30 วัน
 *   + CTA reactivate/ไปหน้าแพ็กเกจ) vs quota-exceeded (QUOTA_EXCEEDED_* — ไม่มี countdown, CTA อัพเกรด/แก้ไขผู้ดูแล)
 * - 'use client' เพราะ level='subscription' ต้องมีปุ่ม reactivate ที่ยิง POST /api/business/reactivate
 *   ผ่าน Sweet Alerts confirm (Base flow: inventory/components/ReactivateButton.tsx) — ถ้าทำ RSC ล้วน
 *   จะส่ง onClick ข้าม boundary ไม่ได้ เหมือนเหตุผลที่ WalletCard เป็น client
 * - ไม่ใช้ pacesToast/Swal สำหรับตัว banner เอง (persistent inline ตาม design spec) — Swal ใช้เฉพาะ
 *   confirm ก่อนยิง reactivate API เท่านั้น
 */

import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'
import { formatDate } from '@/lib/format-date'

export interface LockedStateBannerProps {
  lockReason: string
  packageLockedAt: Date | string | null
  /** ราคาต่อรอบของ tier ปัจจุบัน — ใช้แสดงในข้อความ confirm ตอน reactivate */
  tierPrice?: number
  /**
   * 🛑 เปิดจากในแอป iOS → คงคำอธิบายว่า "ทำไมถูกล็อก" ไว้ แต่ตัด **ทางจ่ายเงิน** ออกทั้งหมด
   * (ราคา · ปุ่มที่หักเงินทันที · ลิงก์ไปหน้าแพ็กเกจ) — Guideline 3.1.1
   *
   * คงข้อความไว้เพราะสถานะบัญชีไม่ใช่ช่องทางจ่าย และผู้ขายต้องรู้ว่าทำไมใช้ไม่ได้
   * (หลักเดียวกับที่หน้ากระเป๋าเงินยังโชว์ยอดคงเหลือแต่ถอดปุ่มเติมเงิน)
   */
  hidePayments?: boolean
  /** subscription = การ์ดระดับบัญชี (มีปุ่ม reactivate จริง) · shop = การ์ดระดับธุรกิจย่อย (แค่ลิงก์ไปหน้าแพ็กเกจ) */
  level?: 'subscription' | 'shop'
}

const GRACE_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

// lock reason → label ไทย (Design Spec §Constants — mirror SRS §10)
const LOCK_REASON_LABEL: Record<string, string> = {
  RENEWAL_FAILED: 'ต่ออายุไม่สำเร็จ (ยอดเงินไม่พอ)',
  OWNER_CANCELLED_PACKAGE: 'เจ้าของยกเลิกแพ็กเกจ',
  QUOTA_EXCEEDED_BUSINESS_COUNT: 'เกินโควตาจำนวนธุรกิจ',
  QUOTA_EXCEEDED_ADMIN_COUNT: 'เกินโควตาผู้ดูแลต่อธุรกิจ',
}

// reason ที่มี grace period 30 วันก่อนล็อกถาวร (Design Spec §Constants ตาราง Grace 30d)
const GRACE_ELIGIBLE_REASONS = new Set(['RENEWAL_FAILED', 'OWNER_CANCELLED_PACKAGE'])

// map HTTP status → ข้อความ error ของ POST /api/business/reactivate
// (Base: inventory/components/ReactivateButton.tsx reactivateErrorMessage — เพิ่ม 412 PERSONAL_SHOP_REQUIRED)
function reactivateErrorMessage(status: number): string {
  switch (status) {
    case 402:
      return 'ยอดเงินไม่พอ — <a href="/wallet" class="underline">เติมเงินก่อนเปิดใช้อีกครั้ง</a>'
    case 409:
      return 'บัญชีนี้ไม่ได้ถูกล็อก'
    case 412:
      return 'ไม่พบร้านค้าส่วนตัว'
    default:
      return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  }
}

export default function LockedStateBanner({
  lockReason,
  packageLockedAt,
  tierPrice,
  hidePayments = false,
  level = 'shop',
}: LockedStateBannerProps) {
  const router = useRouter()

  const isGraceEligible = GRACE_ELIGIBLE_REASONS.has(lockReason)
  const label = LOCK_REASON_LABEL[lockReason] ?? lockReason

  // countdown deadline = packageLockedAt + 30 วัน, clamp ไม่ให้ติดลบ (ล็อกมาเกิน 30 วันแล้วก็ยังโชว์ "0 วัน" ไม่ใช่ค่าติดลบ)
  let daysLeft: number | null = null
  let deadlineLabel: string | null = null
  if (isGraceEligible && packageLockedAt) {
    const lockedDate = packageLockedAt instanceof Date ? packageLockedAt : new Date(packageLockedAt)
    if (!isNaN(lockedDate.getTime())) {
      const deadline = new Date(lockedDate.getTime() + GRACE_DAYS * DAY_MS)
      daysLeft = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / DAY_MS))
      deadlineLabel = formatDate(deadline)
    }
  }

  // Base: inventory/components/ReactivateButton.tsx handleOpenDialog ทั้งฟังก์ชัน
  // (Swal preConfirm + fetch ใน flow เดียว, error ค้าง dialog ผ่าน showValidationMessage)
  const handleReactivate = async () => {
    const priceLabel = tierPrice ? `฿${tierPrice.toLocaleString('th-TH')}` : 'ค่าแพ็กเกจ'
    const result = await Swal.fire({
      buttonsStyling: false,
      icon: 'question',
      title: 'เปิดใช้งานแพ็กเกจอีกครั้ง?',
      text: `ระบบจะหักเงิน ${priceLabel} และเปิดใช้งานทันที ธุรกิจที่ถูกล็อกทั้งหมดจะกลับมาใช้งานได้`,
      showCancelButton: true,
      confirmButtonText: 'เปิดใช้งาน',
      cancelButtonText: 'ยกเลิก',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2 me-2',
        cancelButton: 'btn bg-light hover:text-default-800 mt-2',
      },
      preConfirm: async () => {
        try {
          const res = await fetch('/api/business/reactivate', { method: 'POST' })
          if (res.ok) return true
          Swal.showValidationMessage(reactivateErrorMessage(res.status))
          return false
        } catch {
          Swal.showValidationMessage('เกิดข้อผิดพลาด กรุณาลองใหม่')
          return false
        }
      },
    })

    if (result.isConfirmed && result.value === true) {
      pacesToast.success('เปิดใช้งานแพ็กเกจอีกครั้งสำเร็จ')
      router.refresh()
    }
  }

  // quota reason → CTA ต่างกันตาม reason (BUSINESS_COUNT → อัพเกรด, ADMIN_COUNT → แก้ไขผู้ดูแล)
  const quotaCtaLabel = lockReason === 'QUOTA_EXCEEDED_ADMIN_COUNT' ? 'แก้ไขผู้ดูแล' : 'อัพเกรดแพ็กเกจ'

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-medium text-danger"
    >
      <div className="flex items-start gap-2">
        <Icon icon="alert-triangle" className="size-5 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          {label}
          {isGraceEligible && daysLeft !== null && (
            <>
              {' '}
              — เหลือเวลา {daysLeft} วัน (ล็อกถาวรวันที่ {deadlineLabel})
            </>
          )}
        </span>
      </div>

      {/* CTA ฝั่งขวา — Base: AdvanceWarningBanner.tsx:40-42

          🛑 ในแอป iOS ตัดทั้งบล็อกนี้ทิ้ง (Guideline 3.1.1) เหลือเฉพาะคำอธิบายทางซ้าย:
          ทุกกิ่งข้างล่างเป็นทางไปจ่ายเงินหมด — ปุ่ม "เปิดใช้งานอีกครั้ง" **หักเงินทันที**
          (Swal เขียนเองว่า "ระบบจะหักเงิน ฿X") ส่วนอีกสองกิ่งเป็นลิงก์ไปหน้าแพ็กเกจ

          ห้ามแทนด้วยข้อความ "ไปทำที่เว็บ" — Apple ถือว่าผิดข้อเดียวกัน (ดู AiSuggestPanel) */}
      {!hidePayments &&
        (isGraceEligible ? (
        level === 'subscription' ? (
          <button
            type="button"
            onClick={handleReactivate}
            className="btn bg-primary text-white hover:bg-primary-hover shrink-0 inline-flex items-center gap-1.5 text-sm"
          >
            <Icon icon="refresh" className="size-4" aria-hidden="true" />
            เปิดใช้งานอีกครั้ง
          </button>
        ) : (
          <Link href="/business" className="shrink-0 font-bold underline hover:no-underline">
            ไปหน้าแพ็กเกจ →
          </Link>
        )
      ) : (
        // quota เกิน (ไม่มี grace) — ไม่มีปุ่ม reactivate ให้กด เพราะแก้ที่ต้นตอ (จำนวนธุรกิจ/ผู้ดูแล) เท่านั้น
        // ทั้งสอง reason ยังไม่มี route เฉพาะ (ADMIN_COUNT ต้องรู้ shopId ที่ component ไม่มี prop นี้) → ชี้ /business ก่อน
        <Link href="/business" className="shrink-0 font-bold underline hover:no-underline">
          {quotaCtaLabel} →
        </Link>
        ))}
    </div>
  )
}
