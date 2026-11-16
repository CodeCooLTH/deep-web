'use client'

/**
 * CompareChartCard — เทียบ แชท (Meta) กับ แชทเข้าร้าน รายโฆษณา (FR-004) · แถวละโฆษณา: รูป + ชื่อ · แถบคู่บาง · ตัวเลข + ป้ายส่วนต่างสูง
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/TotalSubscriber.tsx (แถบ rounded ความกว้าง style)
 *   โครงแถว/การ์ดเดียวกับ reports/ad-revenue/components/StatusMixCard.tsx · หัวการ์ด: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AnalyticsOverview.tsx
 * user อนุมัติม็อกอัพ 2026-11-16: เลิกกราฟแท่ง Apex → แถว HTML (ชุดเดียวกับกราฟสถานะคำสั่งซื้อ)
 * metaOk = false → แท่งเดียว (แชทเข้าร้าน) ไม่วาดแท่ง Meta ว่าง
 * 🛑 แท่งเป็น aria-hidden — ค่าอ่านจากข้อความในแถว + sr-only · สี: Meta = default-400 · แชทเข้าร้าน = primary
 */
import { useMemo } from 'react'

import Icon from '@/components/wrappers/Icon'
import AdThumb from '@/components/safepay/AdThumb'
import { adDisplayName } from '@/lib/ad-attribution'
import { buildCompareBars, highGapCount } from '@/lib/ad-quality-view'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { fmtInt, type QualityRow } from './data'
import GapBadge from './GapBadge'

export default function CompareChartCard({ rows, metaOk }: { rows: QualityRow[]; metaOk: boolean }) {
  const t = useT()
  const a = t.adQuality
  const idFallback = t.inbox.contextBar.adIdFallback
  const bars = useMemo(() => buildCompareBars(rows, metaOk), [rows, metaOk])
  const high = metaOk ? highGapCount(rows) : 0
  const max = Math.max(1, ...bars.map((b) => Math.max(b.chatsMeta ?? 0, b.chatsDeep)))

  return (
    <div className="card h-full min-w-0">
      <div className="card-header flex-wrap gap-2">
        <h4 className="card-title">{metaOk ? a.gTitle : a.deepByAd}</h4>
        {high > 0 && (
          <span className="badge bg-warning/15 text-warning-ink">
            <Icon icon="alert-triangle" className="text-sm" aria-hidden="true" />
            {fmt(a.highAdsBadge, { n: high })}
          </span>
        )}
        <div className="ms-auto flex items-center gap-3 text-sm">
          {metaOk && <span className="flex items-center gap-1.5"><span className="bg-default-400 size-2.5 rounded-full" aria-hidden="true" />{a.chatMeta}</span>}
          <span className="flex items-center gap-1.5"><span className="bg-primary size-2.5 rounded-full" aria-hidden="true" />{a.chatDeep}</span>
        </div>
      </div>
      <div className="card-body">
        {bars.length === 0 ? (
          <p className="text-default-500 mb-0 text-sm">{a.stNoDataTitle}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {bars.map((b) => {
              const name = adDisplayName(b.title, b.adId, idFallback) ?? b.adId
              return (
                <div key={b.adId} className="grid grid-cols-12 items-center gap-3">
                  <span className="col-span-4 flex min-w-0 items-center gap-2">
                    <AdThumb photoFileId={b.photoFileId} className="size-7 rounded-md" iconClass="text-sm" />
                    <span className="text-default-800 min-w-0 truncate text-sm" title={name}>{name}</span>
                  </span>
                  <span className="col-span-5 flex flex-col gap-1" aria-hidden="true">
                    {metaOk && <span className="bg-default-400 h-2 rounded-full" style={{ width: `${((b.chatsMeta ?? 0) / max) * 100}%` }} />}
                    {/* ขั้นต่ำ 0.5% กันแท่งหายเมื่อค่าน้อยมาก */}
                    <span className="bg-primary h-2 rounded-full" style={{ width: `${Math.max((b.chatsDeep / max) * 100, 0.5)}%` }} />
                  </span>
                  <span className="col-span-3 flex items-center justify-end gap-1.5 text-end text-sm whitespace-nowrap tabular-nums">
                    {metaOk && <GapBadge kind={b.badge} />}
                    <span className="text-default-700">
                      {metaOk && <><b className="text-default-900 font-bold">{fmtInt(b.chatsMeta)}</b> · </>}
                      {metaOk ? fmtInt(b.chatsDeep) : <b className="text-default-900 font-bold">{fmtInt(b.chatsDeep)}</b>}
                    </span>
                  </span>
                  <span className="sr-only">{metaOk ? `${name} ${a.chatMeta} ${fmtInt(b.chatsMeta)} ${a.chatDeep} ${fmtInt(b.chatsDeep)}` : `${name} ${fmtInt(b.chatsDeep)}`}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="card-footer">
        <a href="#ad-quality-table" className="text-primary inline-flex min-h-11 items-center gap-1 text-sm lg:min-h-0">
          {a.h1TopLink}
          <Icon icon="arrow-down" className="text-sm" aria-hidden="true" />
        </a>
      </div>
    </div>
  )
}
