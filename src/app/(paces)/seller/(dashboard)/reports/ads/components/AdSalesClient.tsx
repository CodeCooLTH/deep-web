'use client'

/**
 * AdSalesClient — ตัวประกอบกริดแดชบอร์ดของรายงานยอดขายตามโฆษณา (feature 00091 FR-009 เฟส 1)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/page.tsx (กริด 4 แถว `grid xl:grid-cols-N md:grid-cols-2 grid-cols-1 gap-base mb-base`)
 * การ์ดแต่ละใบมี Base ของตัวเองในหัวไฟล์ (AdSalesCard / AdShareCard / TopAdsCard / DailyOverviewCard / AdDonutCard / ProvinceCard / ChannelCard / PageSplitCard / AdTableCard)
 *
 * ที่นี่ถือ state เดียว: ชีตคำสั่งซื้อของแอด (openRow) · ตัดสินว่าการ์ดไหนวาด/ซ่อน (ไม่มีสูตรตัวเลข — ทุกตัวเลขมาจาก service เดียว HR16)
 *  - ⑥ ซ่อนเมื่อไม่มี {noun} จากแอด · ⑦ ซ่อนเมื่อกรองเพจเดียว/ไม่มียอด · ⑧ วาดเฉพาะร้านมีเพจ ≥2 และไม่ได้กรองเพจ
 * ช่วงคำนวณใหม่: กริด aria-busy + opacity-60 + role=status (state มาจากตัวกรองผ่าน PendingContext)
 */
import { useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'
import AdDonutCard from './AdDonutCard'
import AdOrdersSheet from './AdOrdersSheet'
import AdSalesCard from './AdSalesCard'
import AdShareCard from './AdShareCard'
import AdTableCard from './AdTableCard'
import ChannelCard from './ChannelCard'
import DailyOverviewCard from './DailyOverviewCard'
import PageSplitCard from './PageSplitCard'
import { useAdReportPending } from './PendingContext'
import ProvinceCard from './ProvinceCard'
import TopAdsCard from './TopAdsCard'
import type { AdReportView, AdViewRow } from './data'

type Props = {
  rows: AdViewRow[]
  report: AdReportView
  noun: string
  /** `from=&to=&shopChannelId=` ของช่วงที่ดูอยู่ — ใช้ยิง API ชีต */
  rangeQuery: string
  /** จำนวนเพจ/บัญชีที่ร้านเชื่อมไว้ */
  pageCount: number
  /** กำลังกรองเพจเดียวอยู่ */
  pageFiltered: boolean
}

export default function AdSalesClient({ rows, report, noun, rangeQuery, pageCount, pageFiltered }: Props) {
  const t = useT().adReport
  const { pending } = useAdReportPending()
  const [openRow, setOpenRow] = useState<AdViewRow | null>(null)
  const { summary } = report

  const showProvince = summary.adOrders > 0
  const showChannel = !pageFiltered && report.channels.some((c) => c.sales > 0)
  const showPages = !pageFiltered && pageCount >= 2 && summary.adOrders > 0 && report.pages.some((p) => p.sales > 0)

  if (rows.length === 0) {
    return (
      <div className="card">
        <div className="card-body py-10 text-center">
          <p className="text-default-900 mb-1 text-md font-semibold">{fmt(t.emptyRangeTitle, { noun })}</p>
          <p className="text-default-700 mb-0 text-sm">{t.emptyRangeDesc}</p>
        </div>
      </div>
    )
  }

  return (
    <div aria-busy={pending} className={cn('transition-opacity', pending && 'opacity-60')}>
      {pending && <span className="sr-only" role="status">{t.calculating}</span>}

      {report.truncated && (
        <p className="text-warning-ink bg-warning/15 mb-base flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>{fmt(t.truncated, { noun })}</span>
        </p>
      )}

      {/* แถว 1: ① ② ③ — tablet: ①② คู่ · ③ เต็ม */}
      <div className="gap-base mb-base grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        <AdSalesCard report={report} noun={noun} />
        <AdShareCard report={report} noun={noun} />
        <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <TopAdsCard rows={rows} adSales={summary.adSales} noun={noun} onOpen={setOpenRow} />
        </div>
      </div>

      {/* แถว 2: ④ (3 ส่วน) + ⑤ — tablet: ④ เต็ม · ⑤ คู่กับ ⑧ */}
      <div className="gap-base mb-base grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0 md:col-span-2 xl:col-span-3">
          <DailyOverviewCard report={report} noun={noun} />
        </div>
        <div className="min-w-0">
          <AdDonutCard rows={rows} adSales={summary.adSales} noun={noun} />
        </div>
        {showPages && (
          <div className="min-w-0 xl:hidden">
            <PageSplitCard report={report} />
          </div>
        )}
      </div>

      {/* แถว 3: ⑥ (7) + ⑦ (5) */}
      {(showProvince || showChannel) && (
        <div className="gap-base mb-base grid grid-cols-1 xl:grid-cols-12">
          {showProvince && (
            <div className={cn('min-w-0', showChannel ? 'xl:col-span-7' : 'xl:col-span-12')}>
              <ProvinceCard report={report} />
            </div>
          )}
          {showChannel && (
            <div className={cn('min-w-0', showProvince ? 'xl:col-span-5' : 'xl:col-span-12')}>
              <ChannelCard report={report} />
            </div>
          )}
        </div>
      )}

      {/* แถว 4: ⑧ (1) + ⑨ (3) — เดสก์ท็อปเท่านั้นที่ ⑧ อยู่ข้างตาราง (tablet ย้ายไปคู่กับ ⑤ ในแถว 2) */}
      <div className="gap-base grid grid-cols-1 xl:grid-cols-4">
        {showPages && (
          <div className="min-w-0 max-xl:hidden">
            <PageSplitCard report={report} />
          </div>
        )}
        <div className={cn('min-w-0', showPages ? 'xl:col-span-3' : 'xl:col-span-4')}>
          <AdTableCard rows={rows} summary={summary} noun={noun} onOpen={setOpenRow} />
        </div>
      </div>

      {openRow && <AdOrdersSheet row={openRow} noun={noun} rangeQuery={rangeQuery} onClose={() => setOpenRow(null)} />}
    </div>
  )
}
