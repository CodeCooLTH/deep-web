'use client'

/**
 * MetaNotice — แบนเนอร์บรรทัดเดียวเมื่อบัญชีโฆษณาอ่านไม่ได้ (ไม่เชื่อม/โทเคนหมด/สกุลเงิน/ล้ม) + เขตเวลาไม่ตรงไทย (00094 FR-001 AC-5)
 *
 * Base: src/app/(paces)/seller/(dashboard)/reports/ad-quality/components/CardState.tsx
 *   (`bg-*\/15 text-*-ink rounded px-4 py-3` + ปุ่ม) ซึ่ง Base เป็น theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx
 * 🛑 หัวข้อบรรทัดเดียวเท่านั้น (BR-AIR-13) · ห้ามโทน danger — ตัวเลขของร้านยังถูกต้อง มีแค่ส่วน Meta ที่อ่านไม่ได้ · "ลองใหม่" ดึงสดเฉพาะส่วนที่ล้ม
 * ไม่ใช้ QualityNotice ของหน้าคุณภาพโฆษณา: ข้อความของมันมีคำว่า Deep และย่อหน้าอธิบาย (ขัด BR-AIR-13/14)
 */
import Link from 'next/link'

import Icon from '@/components/wrappers/Icon'
import { metaView } from '@/lib/ad-summary/view'
import type { AdSummaryReport } from '@/lib/ad-summary/types'
import { useT } from '@/i18n/LocaleProvider'
import { cn } from '@/utils/helpers'
import { useRetryUncached } from '../../ad-quality/components/CardState'

const CAPIS = '/settings/capis'
const BTN = 'btn border-default-300 text-default-800 min-h-11 w-full shrink-0 border sm:w-auto lg:min-h-0'

export default function MetaNotice({ meta }: { meta: AdSummaryReport['meta'] }) {
  const t = useT().adSummary
  const { retry, pending } = useRetryUncached()
  const v = metaView(meta.state)
  if (v === 'ok') {
    if (!meta.tzMismatch) return null
    return (
      <div role="status" className="bg-warning/15 text-warning-ink mb-base flex items-center gap-3 rounded px-4 py-3">
        <Icon icon="clock-exclamation" className="shrink-0 text-xl" aria-hidden="true" />
        <p className="mb-0 min-w-0 flex-1 text-sm font-semibold">{t.metaTzTitle}</p>
      </div>
    )
  }
  const warn = v !== 'none'
  const title = v === 'none' ? t.metaNoneTitle : v === 'auth' ? t.metaAuthTitle : v === 'currency' ? t.metaCurrencyTitle : t.metaErrorTitle
  const cta = v === 'none' ? t.metaConnect : v === 'auth' ? t.metaReconnect : v === 'currency' ? t.metaConnect : null
  return (
    <div role="status" className={cn('mb-base flex flex-col gap-3 rounded px-4 py-3 sm:flex-row sm:items-center', warn ? 'bg-warning/15 text-warning-ink' : 'bg-info/15 text-info-ink')}>
      <Icon icon={v === 'none' ? 'plug-connected-x' : 'alert-triangle'} className="hidden shrink-0 text-xl sm:block" aria-hidden="true" />
      <p className="mb-0 min-w-0 flex-1 text-sm font-semibold">{title}</p>
      {cta ? (
        <Link href={CAPIS} className={BTN}>
          <Icon icon="plug-connected" className="text-sm" aria-hidden="true" />
          {cta}
        </Link>
      ) : (
        <button type="button" onClick={retry} disabled={pending} className={BTN}>
          <Icon icon={pending ? 'loader-2' : 'refresh'} className={cn('text-sm', pending && 'animate-spin')} aria-hidden="true" />
          {t.retry}
        </button>
      )}
    </div>
  )
}
