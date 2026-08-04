/**
 * AdvanceWarningBanner — เตือนล่วงหน้าว่ายอดเงินอาจไม่พอสำหรับรอบต่ออายุ Inventory Add-on
 *
 * Base: src/app/(paces)/seller/(dashboard)/wallet/components/WalletCard.tsx
 * (บรรทัด ~42-52 error-banner block: role="alert" + icon + rounded-lg border/bg
 *  บรรทัด ~91-102 low-balance chip: badge bg-warning/15 text-warning pattern)
 *
 * Adaptations vs WalletCard:
 * - เป็น full-width block (ไม่ใช่ chip เล็กใน row) — ขยาย low-balance chip
 *   ให้เป็น banner เต็มความกว้างเหมือน error-banner แต่สลับสีเป็น warning
 * - severity = warning (เตือนล่วงหน้า) แยกจาก LOCKED banner (danger, สถานะจริงที่ล็อกแล้ว)
 * - เพิ่มลิงก์ "เติมเงิน →" ไป /wallet
 * - server component ล้วน (ไม่มี interactive state) — parent คำนวณ shortfall +
 *   formatDateTime(nextRenewalAt) มาให้แล้ว ไม่ต้อง client-side logic ในนี้
 */
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'

export interface AdvanceWarningBannerProps {
  /** วันที่รอบต่ออายุถัดไป — parent format มาแล้ว (formatDateTime) */
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
        <Icon icon="tabler-alert-triangle" className="size-5 shrink-0" aria-hidden="true" />
        <span>
          ยอดเงินอาจไม่พอสำหรับรอบต่ออายุวันที่ {nextRenewalAt} (ขาดอีก ฿{shortfall.toLocaleString('th-TH')})
        </span>
      </div>

      <Link href="/wallet" className="shrink-0 font-bold underline hover:no-underline">
        เติมเงิน →
      </Link>
    </div>
  )
}
