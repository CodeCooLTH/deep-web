/**
 * ReportBanner — แบนเนอร์สถานะเหนือรายการ/หน้ากลุ่ม (แพ็กเกจหยุด ฯลฯ) · RSC
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx (`bg-{tone}/15 … rounded px-4 py-3 role="alert"`)
 * + src/app/(paces)/seller/(dashboard)/business/components/LockedStateBanner.tsx (โครง icon + ข้อความ + CTA ขวา)
 *
 * ใช้ `-ink` ไม่ลอก `text-danger` ของ LockedStateBanner (contrast ตก — DESIGN.md) · ข้อความ/CTA มาจาก presenter
 * `bannerFor` ทั้งหมด · action `REBIND` เป็นปุ่มที่ต้องมี handler → คอมโพเนนต์ client ของหน้ากลุ่ม (E3) ทำเอง ที่นี่ไม่ render
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import type { GroupBanner } from '@/lib/line-report/presenter'

const ICON: Record<GroupBanner['key'], string> = {
  PACKAGE_PAUSED: 'lock',
  BOT_REMOVED: 'link-off',
  ALL_SHOPS_LOCKED: 'alert-triangle',
}
const TONE_BOX = {
  success: 'bg-success/15 text-success-ink',
  warning: 'bg-warning/15 text-warning-ink',
  danger: 'bg-danger/15 text-danger-ink',
  neutral: 'bg-default-100 text-default-700',
} as const

export default function ReportBanner({ banner }: { banner: GroupBanner }) {
  const link = banner.action?.kind === 'LINK' ? banner.action : null
  return (
    <div
      role={banner.tone === 'danger' ? 'alert' : 'status'}
      className={`mb-base flex flex-col gap-3 rounded-lg px-4 py-3 sm:flex-row sm:items-center ${TONE_BOX[banner.tone]}`}
    >
      <Icon icon={ICON[banner.key]} className="mt-0.5 shrink-0 text-lg" aria-hidden="true" />
      <p className="mb-0 min-w-0 flex-1 text-sm">{banner.message}</p>
      {link && (
        <Link href={link.href} className="btn btn-sm bg-primary hover:bg-primary-hover shrink-0 text-white">
          {link.label}
        </Link>
      )}
    </div>
  )
}
