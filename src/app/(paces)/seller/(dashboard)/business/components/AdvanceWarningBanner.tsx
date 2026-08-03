/**
 * AdvanceWarningBanner — เตือนล่วงหน้าว่ายอดเงิน Personal wallet อาจไม่พอสำหรับรอบต่ออายุ Business Package
 *
 * Base: src/app/(paces)/seller/(dashboard)/inventory/components/AdvanceWarningBanner.tsx (ทั้งไฟล์ —
 *   copy ตรง 1:1 เพราะข้อความเดิมเป็น generic อยู่แล้ว ไม่มีคำว่า "Inventory" ผูกอยู่; ไม่ import ข้าม
 *   feature โดยตรงตาม pattern ที่ business/components/LockedStateBanner.tsx วางไว้ — แต่ละ feature
 *   มีสำเนา component ของตัวเอง)
 *
 * server component ล้วน — parent (page.tsx) คำนวณ shortfall + formatDate(nextRenewalAt) มาให้แล้ว
 */
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'

export interface AdvanceWarningBannerProps {
  /** วันที่รอบต่ออายุถัดไป — parent format มาแล้ว (formatDate) */
  nextRenewalAt: string
  /** จำนวนเงินที่ขาด (บาท) — parent คำนวณมาแล้ว */
  shortfall: number
}

export default function AdvanceWarningBanner({ nextRenewalAt, shortfall }: AdvanceWarningBannerProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/20 bg-warning/15 px-4 py-3 text-sm font-medium text-warning"
    >
      <div className="flex items-center gap-2">
        <Icon icon="alert-triangle" className="size-5 shrink-0" aria-hidden="true" />
        <span>
          ยอดเงินอาจไม่พอสำหรับรอบต่ออายุแพ็กเกจวันที่ {nextRenewalAt} (ขาดอีก ฿{shortfall.toLocaleString('th-TH')})
        </span>
      </div>

      <Link href="/wallet" className="shrink-0 font-bold underline hover:no-underline">
        เติมเงิน →
      </Link>
    </div>
  )
}
