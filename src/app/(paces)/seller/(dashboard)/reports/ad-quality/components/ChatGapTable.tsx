'use client'

/**
 * ChatGapTable — ⑤ เทียบ แชท (Meta) กับ แชท (Deep) รายแอด (FR-004 · F-01/F-02) · `id="ad-gap-table"`
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AnalyticsOverview.tsx (card + card-header + DataTable)
 *   + sibling src/app/(paces)/seller/(dashboard)/reports/ads/components/AdTableCard.tsx (footerRow · meta.align · useReactTable + 'use no memo')
 * ตัด: checkbox/ปุ่มลบ/DeleteConfirmationModal/คอลัมน์ Actions · pagination (ใช้ "ดูทั้งหมด {n} แอด" ขยายในที่เดิม)
 * 🛑 แถวรวม = Σ แชท (Meta) · Σ แชท (Deep) ของ "ชุดแอดเดียวกัน" (เฉพาะแอดที่มีค่าใน Insights) — ตัวลบนับจากชุดเดียวกับตัวตั้ง
 * 🛑 deepOnly (การเชื่อมไม่พร้อม): ฝั่ง Meta "—" · ซ่อนแถบคู่/ส่วนต่าง/ปุ่ม "ทำไม…"
 * a11y: แถบคู่ aria-hidden (ค่าอ่านจากข้อความ)
 */
import { createColumnHelper, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { useId, useMemo, useState } from 'react'

import AdThumb from '@/components/safepay/AdThumb'
import DataTable from '@/components/table/DataTable'
import Icon from '@/components/wrappers/Icon'
import { adDisplayName } from '@/lib/ad-attribution'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { cn } from '@/utils/helpers'
import { fmtInt, fmtPct1, type CardStatus, type QualityRow, type QualityTotals } from './data'
import CardState, { type NotInAccount } from './CardState'
import GapBadge from './GapBadge'
import NoDataCell from './NoDataCell'
import WhyDifferentPanel from './WhyDifferentPanel'

const columnHelper = createColumnHelper<QualityRow>()
const COLLAPSED = 8

export default function ChatGapTable({ rows, totals, deepOnly, status, notInAccount }: { rows: QualityRow[]; totals: QualityTotals | null; deepOnly: boolean; status: CardStatus; notInAccount?: NotInAccount }) {
  'use no memo'
  const t = useT()
  const a = t.adQuality
  const idFallback = t.inbox.contextBar.adIdFallback
  const whyId = useId()
  const [showAll, setShowAll] = useState(false)
  const [whyOpen, setWhyOpen] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([])
  const showMeta = !deepOnly && status === 'OK'

  // เรียงเริ่มต้น: แอดติดป้ายเตือนก่อน แล้วตามแชท (Meta) มาก→น้อย (แอดไม่มีค่า Meta ท้ายสุดเรียงตาม Deep)
  const data = useMemo(
    () => [...rows].sort((x, y) => Number(y.badge === 'HIGH' || y.badge === 'NO_DEEP') - Number(x.badge === 'HIGH' || x.badge === 'NO_DEEP') || (y.chatsMeta ?? -1) - (x.chatsMeta ?? -1) || y.chatsDeep - x.chatsDeep),
    [rows],
  )
  const nameOf = (r: QualityRow) => adDisplayName(r.title, r.adId, idFallback) ?? r.adId
  const H = (s: string) => <span className="normal-case">{s}</span>
  const metaCell = (v: number | null) => (showMeta && v !== null ? fmtInt(v) : <NoDataCell />)
  const highCount = rows.filter((r) => r.badge === 'HIGH' || r.badge === 'NO_DEEP').length
  const maxBar = Math.max(1, ...rows.map((r) => Math.max(r.chatsMeta ?? 0, r.chatsDeep)))

  const columns = useMemo(
    () => [
      columnHelper.accessor((r) => nameOf(r), {
        id: 'ad', header: () => H(a.colAd), enableSorting: false, meta: { headerClassName: 'w-1/3', cellClassName: 'max-w-xs' },
        cell: ({ row }) => {
          const r = row.original
          return (
            <span className="flex min-w-0 max-w-full items-center gap-3">
              <AdThumb photoFileId={r.photoFileId} className="size-10 rounded-md" iconClass="text-lg" />
              <span className="min-w-0">
                <span className="text-default-900 block max-w-full truncate text-sm font-medium" title={nameOf(r)}>{nameOf(r)}</span>
                {showMeta && !r.inInsights && <span className="text-default-500 text-2xs block">{a.gNotFound}</span>}
              </span>
            </span>
          )
        },
      }),
      columnHelper.accessor((r) => r.chatsMeta ?? undefined, {
        id: 'meta', meta: { align: 'center' }, header: () => H(a.chatMeta), sortUndefined: 'last',
        cell: ({ row }) => <span className="block text-center tabular-nums">{metaCell(row.original.chatsMeta)}</span>,
      }),
      columnHelper.accessor('chatsDeep', {
        id: 'deep', meta: { align: 'center' }, header: () => H(a.chatDeep),
        cell: ({ row }) => <span className="block text-center tabular-nums">{fmtInt(row.original.chatsDeep)}</span>,
      }),
      ...(showMeta
        ? [
            columnHelper.display({
              id: 'bars', header: () => '', enableSorting: false,
              cell: ({ row }) => (
                <span className="block w-24" aria-hidden="true">
                  <span className="bg-default-100 mb-1 block h-1.25 rounded"><span className="bg-default-400 block h-full rounded" style={{ width: `${((row.original.chatsMeta ?? 0) / maxBar) * 100}%` }} /></span>
                  <span className="bg-default-100 block h-1.25 rounded"><span className="bg-primary block h-full rounded" style={{ width: `${(row.original.chatsDeep / maxBar) * 100}%` }} /></span>
                </span>
              ),
            }),
            columnHelper.accessor((r) => r.gap ?? undefined, {
              id: 'gap', meta: { align: 'center' }, header: () => H(a.colGap), sortUndefined: 'last',
              cell: ({ row }) => <GapCell r={row.original} />,
            }),
          ]
        : []),
    ],
    // nameOf/metaCell ผูกกับ t/showMeta/idFallback — ใส่เฉพาะที่เปลี่ยนจริง
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, showMeta, idFallback, maxBar],
  )

  const table = useReactTable({
    data, columns, state: { sorting, pagination: { pageIndex: 0, pageSize: showAll ? Math.max(data.length, 1) : COLLAPSED } },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(),
  })

  const total = totals && showMeta ? (
    <tr className="bg-default-100/70 font-semibold">
      <td className="text-default-900 text-sm">{fmt(a.gTotal, { n: totals.adsCounted })}</td>
      <td className="text-center tabular-nums">{fmtInt(totals.chatsMeta)}</td>
      <td className="text-center tabular-nums">{fmtInt(totals.chatsDeepSameSet)}</td>
      <td />
      <td className="text-center tabular-nums">{totals.gap === null ? <NoDataCell /> : totals.gap < 0 ? fmt(a.deepMore, { p: Math.abs(totals.gap).toFixed(1) }) : fmtPct1(totals.gap)}</td>
    </tr>
  ) : undefined

  return (
    <div id="ad-gap-table" className="card scroll-mt-24 min-w-0">
      <div className="card-header flex-wrap gap-2">
        <h4 className="card-title">{a.gTitle}</h4>
        {showMeta && (
          <button type="button" className="btn btn-sm border-default-300 text-default-700 hover:bg-default-100 ms-auto min-h-11 border lg:min-h-0" aria-expanded={whyOpen} aria-controls={whyId} onClick={() => setWhyOpen((v) => !v)}>
            <Icon icon="help-circle" className="text-sm" aria-hidden="true" />
            {a.gWhy}
            <Icon icon={whyOpen ? 'chevron-up' : 'chevron-down'} className="text-sm" aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="text-default-700 mb-0 px-5 pb-3 text-xs">{a.gDesc}</p>
      {showMeta && highCount > 0 && (
        <p className="text-warning-ink mb-0 px-5 pb-3 text-xs">
          <button type="button" className="min-h-11 underline lg:min-h-0" aria-expanded={whyOpen} aria-controls={whyId} onClick={() => setWhyOpen(true)}>{fmt(a.gHighLine, { n: highCount })}</button>
        </p>
      )}
      {whyOpen && showMeta && <WhyDifferentPanel id={whyId} />}
      {!deepOnly && status !== 'OK' && <div className="px-5 pb-3"><CardState status={status as 'EMPTY' | 'UNAVAILABLE' | 'ERROR' | 'AUTH'} notInAccount={notInAccount} /></div>}

      <DataTable<QualityRow>
        table={table}
        emptyMessage={a.stNoDataTitle}
        footerRow={total}
        mobileCard={(row) => {
          const r = row.original
          return (
            <div className="px-4 py-3">
              <div className="flex items-start gap-3">
                <AdThumb photoFileId={r.photoFileId} className="size-10 rounded-md" iconClass="text-lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-default-900 mb-1 line-clamp-2 break-words text-sm font-medium">{nameOf(r)}</p>
                  <p className="text-default-700 mb-0 text-xs tabular-nums">{a.chatMeta} {metaCell(r.chatsMeta)} · {a.chatDeep} {fmtInt(r.chatsDeep)}</p>
                  {showMeta && <div className="mt-1 flex flex-wrap items-center gap-x-2"><GapCell r={r} /></div>}
                  {showMeta && !r.inInsights && <p className="text-default-500 text-2xs mb-0">{a.gNotFound}</p>}
                </div>
              </div>
            </div>
          )
        }}
      />
      {total && totals && (
        <p className="text-default-900 border-default-100 mb-0 border-t px-4 py-3 text-sm font-semibold tabular-nums lg:hidden">
          {fmt(a.gTotal, { n: totals.adsCounted })} · {a.chatMeta} {fmtInt(totals.chatsMeta)} · {a.chatDeep} {fmtInt(totals.chatsDeepSameSet)}
        </p>
      )}
      {data.length > COLLAPSED && (
        <div className="card-footer">
          <button type="button" className={cn('btn btn-sm border-default-300 text-default-700 hover:bg-default-100 min-h-11 border lg:min-h-0')} onClick={() => setShowAll((v) => !v)}>
            {showAll ? a.gShowLess : fmt(a.gShowAll, { n: data.length })}
          </button>
        </div>
      )}
    </div>
  )
}

function GapCell({ r }: { r: QualityRow }) {
  const a = useT().adQuality
  if (r.gap === null) return <span className="block text-center"><NoDataCell /></span>
  return (
    <span className="block text-center tabular-nums">
      {r.gap < 0 ? fmt(a.deepMore, { p: Math.abs(r.gap).toFixed(1) }) : fmtPct1(r.gap)}
      <span className="mt-0.5 block"><GapBadge kind={r.badge} /></span>
    </span>
  )
}
