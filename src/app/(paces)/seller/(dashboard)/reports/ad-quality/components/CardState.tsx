'use client'

/**
 * CardState — สถานะของการ์ดฝั่ง Meta (FR-008): ไม่มีข้อมูลจาก Meta · Meta ไม่ส่งข้อมูลส่วนนี้ · โหลดไม่สำเร็จ + "ลองใหม่"
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx (`bg-*\/15 text-*-ink rounded px-4 py-3`) ผ่านท่าเดียวกับ
 *   src/app/(paces)/seller/(dashboard)/reports/ads/components/AdSpendNotice.tsx
 * 🛑 ไม่มีสถานะไหนแสดงเป็น 0 · "ลองใหม่" = router.refresh() — ผลล้มเหลวไม่ถูกแคช จึงดึงสดเฉพาะการ์ดที่ล้ม (การ์ดที่สำเร็จใช้แคชเดิม)
 */
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

export default function CardState({ status, adSelected = false }: { status: 'EMPTY' | 'UNAVAILABLE' | 'ERROR' | 'AUTH'; adSelected?: boolean }) {
  const t = useT().adQuality
  const { retry, pending } = useRetryUncached()
  const warn = status === 'ERROR'
  const title = status === 'EMPTY' ? t.stNoDataTitle : status === 'UNAVAILABLE' ? t.stUnavailTitle : t.stErrTitle
  const body = status === 'EMPTY' ? (adSelected ? t.stNoDataBodyAd : t.stNoDataBody) : status === 'UNAVAILABLE' ? t.stUnavailBody : t.stErrBody
  return (
    <div role="status" className={cn('flex flex-col gap-3 rounded px-4 py-3 sm:flex-row sm:items-center', warn ? 'bg-warning/15 text-warning-ink' : 'bg-default-100 text-default-800')}>
      <Icon icon={warn ? 'alert-triangle' : 'info-circle'} className="hidden shrink-0 text-xl sm:block" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-sm font-semibold">{title}</p>
        <p className="mb-0 text-sm">{body}</p>
      </div>
      {warn && (
        <button type="button" onClick={retry} disabled={pending} className="btn border-default-300 text-default-800 min-h-11 w-full shrink-0 border sm:w-auto lg:min-h-0">
          <Icon icon={pending ? 'loader-2' : 'refresh'} className={cn('text-sm', pending && 'animate-spin')} aria-hidden="true" />
          {t.retry}
        </button>
      )}
    </div>
  )
}
