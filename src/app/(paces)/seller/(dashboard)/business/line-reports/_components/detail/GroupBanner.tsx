'use client'

/**
 * GroupBanner — แบนเนอร์บนสุดของหน้ากลุ่ม (แพ็กเกจหยุด / บอทถูกนำออก / ร้านล็อกหมด) · render จาก `bannerFor` ของ presenter เท่านั้น
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx (`bg-{tone}/15 … rounded px-4 py-3 role="alert"`)
 *   + src/app/(paces)/seller/(dashboard)/business/line-reports/_components/ReportBanner.tsx (โครง icon + ข้อความ + CTA — ตัวนั้น RSC ไม่มีปุ่ม REBIND)
 *   + src/app/(paces)/seller/(dashboard)/business/components/LockedStateBanner.tsx
 *
 * `-ink` บนพื้นจาง ไม่ลอก `text-danger` ของ LockedStateBanner (contrast) · `REBIND` = ปุ่ม (ไม่ใช่ลิงก์) · `LINK` = next/link · null = ไม่มีปุ่ม (Android)
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import type { GroupBanner as Banner } from '@/lib/line-report/presenter'
import { TONE_BADGE } from '../tone'

const ICON: Record<Banner['key'], string> = { PACKAGE_PAUSED: 'lock', BOT_REMOVED: 'link-off', ALL_SHOPS_LOCKED: 'alert-triangle' }

export default function GroupBanner({ banner, onRebind }: { banner: Banner; onRebind: () => void }) {
  const { action } = banner
  return (
    <div
      role={banner.tone === 'danger' ? 'alert' : 'status'}
      className={`mb-base flex flex-col gap-3 rounded-lg px-4 py-3 sm:flex-row sm:items-center ${TONE_BADGE[banner.tone]}`}
    >
      <Icon icon={ICON[banner.key]} className="mt-0.5 shrink-0 text-lg" aria-hidden="true" />
      <p className="mb-0 min-w-0 flex-1 text-sm">{banner.message}</p>
      {action?.kind === 'REBIND' && (
        <button type="button" onClick={onRebind} className="btn btn-sm bg-primary hover:bg-primary-hover shrink-0 text-white">
          {action.label}
        </button>
      )}
      {action?.kind === 'LINK' && (
        <Link href={action.href} className="btn btn-sm bg-primary hover:bg-primary-hover shrink-0 text-white">
          {action.label}
        </Link>
      )}
    </div>
  )
}
