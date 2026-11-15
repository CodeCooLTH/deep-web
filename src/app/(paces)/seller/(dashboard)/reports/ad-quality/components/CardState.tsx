'use client'

/**
 * CardState — สถานะของการ์ดฝั่ง Meta (FR-008): ไม่มีข้อมูลจาก Meta · Meta ไม่ส่งข้อมูลส่วนนี้ · โหลดไม่สำเร็จ + "ลองใหม่"
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx (`bg-*\/15 text-*-ink rounded px-4 py-3`) ผ่านท่าเดียวกับ
 *   src/app/(paces)/seller/(dashboard)/reports/ads/components/AdSpendNotice.tsx
 * 🛑 ไม่มีสถานะไหนแสดงเป็น 0 · "ลองใหม่" = router.refresh() — ผลล้มเหลวไม่ถูกแคช จึงดึงสดเฉพาะการ์ดที่ล้ม (การ์ดที่สำเร็จใช้แคชเดิม)
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { cn } from '@/utils/helpers'

export function useRetryUncached() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const retry = () => start(() => router.refresh())
  return { retry, pending }
}

/** แอดที่มีแชท (Deep) ไม่อยู่ในบัญชีโฆษณาที่เชื่อม — object = มีปุ่มไปหน้าเชื่อมบัญชี (การ์ด ① ใบเดียว) · true = หัวข้ออย่างเดียว */
export type NotInAccount = { n: number; name: string | null } | true

const CAPIS = '/settings/capis'

export default function CardState({ status, notInAccount }: { status: 'EMPTY' | 'UNAVAILABLE' | 'ERROR' | 'AUTH'; notInAccount?: NotInAccount }) {
  const t = useT().adQuality
  const { retry, pending } = useRetryUncached()
  const warn = status === 'ERROR' || status === 'AUTH'
  const nia = status === 'EMPTY' && notInAccount ? notInAccount : null
  // หัวข้อบรรทัดเดียวเท่านั้น — ไม่มีย่อหน้าอธิบาย (ผู้ใช้สั่ง: หน้ารายงานห้ามข้อความอธิบายยาว)
  const title = nia ? t.stNotInAccountTitle
    : status === 'EMPTY' ? t.stNoDataTitle : status === 'UNAVAILABLE' ? t.stUnavailTitle : status === 'AUTH' ? t.noticeAuthTitle : t.stErrTitle
  // โทเคนหมด/บัญชีผิด แก้ได้ที่หน้าเชื่อมบัญชีเท่านั้น — "ลองใหม่" ไม่ช่วย
  const link = status === 'AUTH' ? t.noticeReconnect : nia && nia !== true ? t.stNotInAccountCta : null
  return (
    <div role="status" className={cn('flex flex-col gap-3 rounded px-4 py-3 sm:flex-row sm:items-center', warn ? 'bg-warning/15 text-warning-ink' : 'bg-default-100 text-default-800')}>
      <Icon icon={warn ? 'alert-triangle' : 'info-circle'} className="hidden shrink-0 text-xl sm:block" aria-hidden="true" />
      <p className="mb-0 min-w-0 flex-1 text-sm font-semibold">{title}</p>
      {link ? (
        <Link href={CAPIS} className="btn border-default-300 text-default-800 min-h-11 w-full shrink-0 border sm:w-auto lg:min-h-0">
          <Icon icon="plug-connected" className="text-sm" aria-hidden="true" />
          {link}
        </Link>
      ) : status === 'ERROR' && (
        <button type="button" onClick={retry} disabled={pending} className="btn border-default-300 text-default-800 min-h-11 w-full shrink-0 border sm:w-auto lg:min-h-0">
          <Icon icon={pending ? 'loader-2' : 'refresh'} className={cn('text-sm', pending && 'animate-spin')} aria-hidden="true" />
          {t.retry}
        </button>
      )}
    </div>
  )
}
