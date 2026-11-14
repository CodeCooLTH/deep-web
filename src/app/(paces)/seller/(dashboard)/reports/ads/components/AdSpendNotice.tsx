'use client'

/**
 * AdSpendNotice — แบนเนอร์บอกสถานะการอ่านค่าโฆษณา (feature 00091 FR-010 เฟส 2) · กล่องเดียวตาม state
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx (`bg-*\/15 text-* flex rounded px-4 py-3` role="alert" → ใช้ role="status")
 *   ปุ่ม: ท่า BTN_PRIMARY/BTN_PLAIN ของ settings/capis/components/AudienceCard.tsx
 * 🛑 ห้ามโทน danger — ยอดขายยังถูกต้อง มีแค่ค่าโฆษณาที่อ่านไม่ได้ · state OK ไม่วาดอะไร
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'
import type { AdReportView } from './data'

const BTN_PRIMARY = 'btn bg-primary hover:bg-primary-hover min-h-11 w-full shrink-0 text-white sm:w-auto lg:min-h-0'
const BTN_PLAIN = 'btn border-default-300 text-default-800 min-h-11 w-full shrink-0 border sm:w-auto lg:min-h-0'
const CAPIS = '/settings/capis'

export default function AdSpendNotice({ ads, noun }: { ads: AdReportView['ads']; noun: string }) {
  const t = useT().adReport
  const router = useRouter()
  if (ads.state === 'OK') return null

  const warn = ads.state !== 'NOT_CONNECTED'
  const content =
    ads.state === 'NOT_CONNECTED'
      ? { icon: 'plug-connected-x', title: t.spendNoneTitle, body: fmt(t.spendNoneBody, { noun }), cta: t.spendConnectCta }
      : ads.state === 'AUTH'
        ? { icon: 'alert-triangle', title: t.spendAuthTitle, body: fmt(t.spendAuthBody, { noun }), cta: t.spendReconnectCta }
        : ads.state === 'CURRENCY'
          ? { icon: 'alert-triangle', title: fmt(t.spendCurrencyTitle, { currency: ads.currency ?? '' }), body: t.spendCurrencyBody, cta: t.spendConnectCta }
          : { icon: 'alert-triangle', title: null, body: fmt(t.spendErrorBody, { noun }), cta: null }

  return (
    <div
      role="status"
      className={cn(
        'mb-base flex flex-col gap-3 rounded px-4 py-3 sm:flex-row sm:items-center',
        warn ? 'bg-warning/15 text-warning-ink' : 'bg-default-100 text-default-800',
      )}>
      <Icon icon={content.icon} className="hidden shrink-0 text-xl sm:block" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {content.title && <p className="mb-0.5 text-sm font-semibold">{content.title}</p>}
        <p className="mb-0 text-sm">{content.body}</p>
      </div>
      {ads.state === 'ERROR' ? (
        <button type="button" className={BTN_PLAIN} onClick={() => router.refresh()}>
          <Icon icon="refresh" className="text-sm" aria-hidden="true" />
          {t.spendRetry}
        </button>
      ) : (
        content.cta && (
          <Link href={CAPIS} className={BTN_PRIMARY}>
            {content.cta}
          </Link>
        )
      )}
    </div>
  )
}
