'use client'

/**
 * QualityNotice — แบนเนอร์สถานะการเชื่อมของหน้าคุณภาพโฆษณา: AdSpendNotice + ชุดข้อความ adQuality.notice* + "ลองใหม่" ที่ข้ามแคช (มติ O3)
 * Base: src/app/(paces)/seller/(dashboard)/reports/ads/components/AdSpendNotice.tsx (ซึ่ง Base เป็น theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx)
 */
import { useT } from '@/i18n/LocaleProvider'
import AdSpendNotice from '../../ads/components/AdSpendNotice'
import { useRetryUncached } from './CardState'
import type { AdsConn } from './data'

export default function QualityNotice({ ads }: { ads: AdsConn }) {
  const t = useT().adQuality
  const { retry } = useRetryUncached()
  return (
    <AdSpendNotice
      ads={ads} noun="" onRetry={retry}
      copy={{
        noneTitle: t.noticeNoneTitle, noneBody: t.noticeNoneBody, connectCta: t.noticeConnect,
        authTitle: t.noticeAuthTitle, authBody: t.noticeAuthBody, reconnectCta: t.noticeReconnect,
        currencyTitle: t.noticeCurrencyTitle, currencyBody: t.noticeCurrencyBody, errorBody: t.noticeErrorBody, retry: t.noticeRetry,
      }}
    />
  )
}
