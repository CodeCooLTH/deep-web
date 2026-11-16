'use client'

/**
 * QualityTableCard — ผลลัพธ์รายแอด: ออเดอร์ · รับเงินจริง % · ยกเลิก % · ตีกลับ % (00091 เฟส 3 FR-013)
 *
 * Base: src/app/(paces)/seller/(dashboard)/reports/ads/components/AdTableCard.tsx (ผ่าน ReportTable.tsx)
 *   (ซึ่ง Base เป็น theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AnalyticsOverview.tsx)
 * 🛑 อัตรารับเงินจริง = รับเงินแล้ว ÷ ยอดสั่งรวมทุกสถานะ (นับยกเลิกด้วย) ตาม FR-013 · ที่เดียวที่มีอัตราเป็นตัวเลข · ไม่ลงสีเขียว/แดงกับตัวเลข
 */
import AdThumb from '@/components/safepay/AdThumb'
import { adDisplayName } from '@/lib/ad-attribution'
import { placedOf, STATUS_KEYS } from '@/lib/ad-revenue-view'
import { formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { SegBar } from './DashBits'
import InfoTip from './InfoTip'
import ReportTable, { type Col } from './ReportTable'
import { fmtPct, type AdMetrics, type StatusLabels } from './data'

type Ad = Pick<AdMetrics, 'adId' | 'adTitle' | 'adPhotoFileId' | 'status' | 'gross' | 'collectedPlaced'>
const pct = (n: number, whole: number) => (whole > 0 ? Math.round((n / whole) * 1000) / 10 : null)
const grossOf = (a: Ad) => STATUS_KEYS.reduce((s, k) => s + a.gross[k], 0)

export default function QualityTableCard({ ads, noun, labels }: { ads: Ad[]; noun: string; labels: StatusLabels }) {
  const tt = useT()
  const t = tt.adRevenue
  const rows = ads.filter((a) => placedOf(a.status) > 0)
  const nameOf = (a: Ad) => adDisplayName(a.adTitle, a.adId, tt.inbox.contextBar.adIdFallback) ?? a.adId
  const collectedPct = (a: Ad) => pct(a.collectedPlaced, grossOf(a)) // ชุดใบเดียวกับยอดสั่ง ⇒ ไม่เกิน 100%

  const columns: Col<Ad>[] = [
    {
      id: 'ad', header: t.colAd, sort: (a) => nameOf(a),
      cell: (a) => (
        <>
          <AdThumb photoFileId={a.adPhotoFileId} className="size-8 rounded-md" iconClass="text-base" />
          <span className="text-default-900 min-w-0 truncate text-sm font-medium" title={nameOf(a)}>{nameOf(a)}</span>
        </>
      ),
    },
    { id: 'placed', header: fmt(t.colPlacedAll, { noun }), align: 'end', sort: (a) => placedOf(a.status), cell: (a) => formatNumberNoSymbol(placedOf(a.status)) },
    {
      id: 'collected', header: t.colCollectedPct, align: 'end', sort: collectedPct,
      // แถบแบ่งช่อง + ตัวเลขตัวหนา (user 2026-11-16: ความคืบหน้าใช้แถบทึบ ไม่ใช่ข้อความจาง)
      cell: (a) => { const v = collectedPct(a); return <span className="inline-flex items-center justify-end gap-2"><SegBar pct={v ?? 0} tone="success" segments={10} className="w-24" /><b className="text-default-900 w-14 font-bold">{fmtPct(v)}</b></span> },
    },
    { id: 'cancelled', header: labels.CANCELLED, align: 'end', sort: (a) => pct(a.status.CANCELLED, placedOf(a.status)), cell: (a) => fmtPct(pct(a.status.CANCELLED, placedOf(a.status))) },
    { id: 'returned', header: labels.RETURNED, align: 'end', sort: (a) => pct(a.status.RETURNED, placedOf(a.status)), cell: (a) => fmtPct(pct(a.status.RETURNED, placedOf(a.status))) },
  ]
  const placed = rows.reduce((s, a) => s + placedOf(a.status), 0)
  const cancelled = rows.reduce((s, a) => s + a.status.CANCELLED, 0)
  const returned = rows.reduce((s, a) => s + a.status.RETURNED, 0)
  const gross = rows.reduce((s, a) => s + grossOf(a), 0)
  const collected = rows.reduce((s, a) => s + a.collectedPlaced, 0)

  return (
    <ReportTable<Ad>
      title={t.qualityTableTitle}
      badge={<InfoTip text={t.includesLostNote} />}
      rows={rows}
      rowKey={(a) => a.adId}
      columns={columns}
      footer={
        <tr className="bg-default-100/70 font-semibold">
          <td className="text-default-900 text-sm">{fmt(t.totalRow, { n: rows.length })}</td>
          <td className="text-end tabular-nums whitespace-nowrap">{formatNumberNoSymbol(placed)}</td>
          <td className="text-end tabular-nums whitespace-nowrap">{fmtPct(pct(collected, gross))}</td>
          <td className="text-end tabular-nums whitespace-nowrap">{fmtPct(pct(cancelled, placed))}</td>
          <td className="text-end tabular-nums whitespace-nowrap">{fmtPct(pct(returned, placed))}</td>
        </tr>
      }
      matches={(a, q) => nameOf(a).toLowerCase().includes(q) || a.adId.toLowerCase().includes(q)}
      defaultSort={{ id: 'placed', desc: true }}
      empty={fmt(t.emptyRange, { noun })}
      itemsName={t.itemsName}
    />
  )
}
