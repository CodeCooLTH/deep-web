'use client'

/**
 * AdQualityTable — ⑥ คุณภาพรายแอด (FR-005): ค้นหา + จำนวนแถว + โหมด (รายแอด/ตามแคมเปญ) + ตาราง (≥1024) / รายการ (<1024) + แถวรวม
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AnalyticsOverview.tsx
 *   (card-header + `input-icon-group` ค้นหา + `form-select` จำนวนแถว · useReactTable · DataTable · TablePagination)
 *   + sibling src/app/(paces)/seller/(dashboard)/reports/ads/components/AdTableCard.tsx (footerRow · 'use no memo' · FilterDropdown ตัวเรียงมือถือ)
 * ตัด: checkbox/ปุ่มลบ/DeleteConfirmationModal/Actions
 * 🛑 อัตราทุกตัว = Σตัวตั้ง ÷ Σตัวหาร (ไม่เฉลี่ย %) · ตัวหารของคุยต่อ/ตอบกลับ/บล็อก = แชท (Meta) · ของปิดการขาย = แชท (Deep) — เขียนกำกับใต้ตาราง
 * 🛑 ค่า "ตอบกลับ" (replied_7d) ความหมายยังไม่ยืนยันกับ Ads Manager (BRD §6/O5) — ป้ายชั่วคราว
 * ต่างจากสเปก: หัวกลุ่ม Meta/Deep เป็นบรรทัดเล็กเหนือชื่อคอลัมน์ (DataTable ร่วมไม่รองรับหัวกลุ่ม 2 ชั้น — ไม่แก้ตัวร่วม) · หัวคอลัมน์ใช้ normal-case กัน "Meta" → "META"
 */
import {
  createColumnHelper, getCoreRowModel, getExpandedRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type SortingState, type ExpandedState,
} from '@tanstack/react-table'
import { useId, useMemo, useState } from 'react'

import AdThumb from '@/components/safepay/AdThumb'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Icon from '@/components/wrappers/Icon'
import { adDisplayName } from '@/lib/ad-attribution'
import { adLine, campaignLine, groupByCampaign, type QualityLine } from '@/lib/ad-quality-view'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { fmtInt, fmtPct1, type QualityRow } from './data'
import AdQualityMobileRow from './AdQualityMobileList'
import NoDataCell from './NoDataCell'
import RateCell from './RateCell'
import VideoCell from './VideoCell'

const columnHelper = createColumnHelper<QualityLine>()
const PAGE_SIZES = [10, 25, 50]
type Mode = 'ad' | 'campaign'
type SortKey = 'meta' | 'depth3' | 'block' | 'close'

export default function AdQualityTable({ rows, noun, totals }: { rows: QualityRow[]; noun: string; totals: { chatsMeta: number | null; chatsDeep: number; orders: number } }) {
  'use no memo'
  const t = useT()
  const a = t.adQuality
  const idFallback = t.inbox.contextBar.adIdFallback
  const searchId = useId()
  const [mode, setMode] = useState<Mode>('ad')
  const [query, setQuery] = useState('')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'meta', desc: true }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
  const [expanded, setExpanded] = useState<ExpandedState>({})

  const q = query.trim().toLowerCase()
  const hit = (r: QualityRow) => !q || (r.title ?? '').toLowerCase().includes(q) || (r.campaign ?? '').toLowerCase().includes(q) || r.adId.toLowerCase().includes(q)
  const lines = useMemo<QualityLine[]>(() => {
    if (mode === 'ad') return rows.filter(hit).map(adLine)
    // โหมดแคมเปญ: แคมเปญที่ชื่อตรงแสดงทุกแอด · ไม่ตรงชื่อแต่มีแอดตรง → แสดงเฉพาะแอดที่ตรง (อัตราแคมเปญคำนวณจากแอดที่เห็น)
    return groupByCampaign(rows.filter(hit)).map(campaignLine)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, mode, q])

  const H = (title: string, group?: 'Meta' | 'Deep') => (
    <span className="inline-flex flex-col items-center normal-case">
      {group && <span className="text-default-500 text-2xs font-normal">{group === 'Meta' ? a.groupMeta : a.groupDeep}</span>}
      <span>{title}</span>
    </span>
  )
  const nameOf = (l: QualityLine) => (l.kind === 'campaign' ? l.title ?? a.noCampaign : adDisplayName(l.title, l.adId ?? '', idFallback) ?? l.adId ?? '')
  const rateCol = (id: string, title: string, key: 'depth2' | 'depth3' | 'replied' | 'block') =>
    columnHelper.accessor((l) => l.rates[key].pct ?? undefined, {
      id, meta: { align: 'center' }, header: () => H(title, 'Meta'), sortUndefined: 'last',
      cell: ({ row }) => <RateCell {...row.original.rates[key]} />,
    })

  const columns = useMemo(
    () => [
      columnHelper.accessor((l) => nameOf(l), {
        id: 'ad', header: () => H(a.colAd), enableSorting: false, meta: { headerClassName: 'w-1/4', cellClassName: 'max-w-xs' },
        cell: ({ row }) => {
          const l = row.original
          return (
            <span className="flex min-w-0 max-w-full items-center gap-3">
              {l.kind === 'campaign' ? (
                <button type="button" className="btn btn-icon btn-sm border-default-300 shrink-0 border" aria-expanded={row.getIsExpanded()} aria-label={row.getIsExpanded() ? a.collapseRow : fmt(a.adsIn, { n: l.adCount })} onClick={row.getToggleExpandedHandler()}>
                  <Icon icon={row.getIsExpanded() ? 'chevron-up' : 'chevron-down'} aria-hidden="true" />
                </button>
              ) : (
                <AdThumb photoFileId={l.photoFileId} className="size-10 rounded-md" iconClass="text-lg" />
              )}
              <span className="min-w-0">
                <span className="text-default-900 block max-w-full truncate text-sm font-medium" title={nameOf(l)}>{nameOf(l)}</span>
                <span className="text-default-500 text-2xs block truncate">
                  {l.kind === 'campaign' ? fmt(a.adsIn, { n: l.adCount }) : [l.campaign, l.adset].filter(Boolean).join(' › ')}
                </span>
              </span>
            </span>
          )
        },
      }),
      columnHelper.accessor((l) => l.impressions ?? undefined, {
        id: 'impr', meta: { align: 'center' }, header: () => H(a.colImprCtr, 'Meta'), enableSorting: false,
        cell: ({ row }) => (
          <span className="block text-center tabular-nums">
            {row.original.impressions === null ? <NoDataCell /> : fmtInt(row.original.impressions)}
            <span className="text-default-500 text-2xs block">{row.original.ctr === null ? <NoDataCell /> : fmtPct1(row.original.ctr)}</span>
          </span>
        ),
      }),
      columnHelper.accessor((l) => l.chatsMeta ?? undefined, {
        id: 'meta', meta: { align: 'center' }, header: () => H(a.chatMeta, 'Meta'), sortUndefined: 'last',
        cell: ({ row }) => <span className="block text-center tabular-nums">{row.original.chatsMeta === null ? <NoDataCell /> : fmtInt(row.original.chatsMeta)}</span>,
      }),
      rateCol('depth2', a.colDepth2, 'depth2'),
      rateCol('depth3', a.colDepth3, 'depth3'),
      rateCol('replied', a.colReplied, 'replied'),
      rateCol('block', a.colBlock, 'block'),
      columnHelper.accessor((l) => l.closeRate ?? undefined, {
        id: 'close', meta: { align: 'center', headerClassName: 'bg-primary/10' }, header: () => H(a.colClose, 'Deep'), sortUndefined: 'last',
        cell: ({ row }) => <RateCell pct={row.original.closeRate} num={row.original.orders} den={row.original.chatsDeep} />,
      }),
      columnHelper.display({ id: 'video', meta: { align: 'center' }, header: () => H(a.colVideo, 'Meta'), cell: ({ row }) => <VideoCell line={row.original} /> }),
    ],
    // nameOf/rateCol ผูกกับ t/idFallback — ใส่เฉพาะที่เปลี่ยนจริง
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, idFallback],
  )

  const table = useReactTable({
    data: lines, columns, getSubRows: (l) => l.subRows,
    state: { sorting, pagination, expanded }, onSortingChange: setSorting, onPaginationChange: setPagination, onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), getExpandedRowModel: getExpandedRowModel(),
  })
  const { pageIndex, pageSize } = table.getState().pagination
  const filtered = lines.length
  const start = filtered === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, filtered)

  const sortLabel: Record<SortKey, string> = { meta: a.chatMeta, depth3: a.colDepth3, block: a.colBlock, close: a.colClose }
  const mobileSort = (sorting[0]?.id as SortKey | undefined) ?? 'meta'

  const total = (
    <tr className="bg-default-100/70 font-semibold">
      <td className="text-default-900 text-sm">{fmt(a.adsIn, { n: rows.length })}</td>
      <td />
      <td className="text-center tabular-nums">{fmtInt(totals.chatsMeta)}</td>
      <td /><td /><td /><td />
      <td className="text-center tabular-nums">{fmtInt(totals.orders)} / {fmtInt(totals.chatsDeep)}</td>
      <td />
    </tr>
  )
  const onSearch = (v: string) => { setQuery(v); setPagination((p) => ({ ...p, pageIndex: 0 })) }

  return (
    <div id="ad-quality-table" className="card scroll-mt-24 min-w-0">
      <div className="card-header flex-wrap gap-2">
        <h4 className="card-title">{a.qTitle}</h4>
        <div className="ms-auto flex flex-wrap items-center gap-2.5">
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" aria-hidden="true" />
            <input id={searchId} type="search" className="form-input min-h-11 lg:min-h-0" placeholder={a.search} aria-label={a.search} value={query} onChange={(e) => onSearch(e.target.value)} />
          </div>
          <select className="form-select min-h-11 lg:min-h-0" aria-label={a.modeLabel} value={mode} onChange={(e) => { setMode(e.target.value as Mode); setExpanded({}); setPagination((p) => ({ ...p, pageIndex: 0 })) }}>
            <option value="ad">{a.modeAd}</option>
            <option value="campaign">{a.modeCampaign}</option>
          </select>
          <select className="form-select min-h-11 lg:min-h-0" aria-label={a.rowsPerPage} value={pageSize} onChange={(e) => setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 pb-2 lg:hidden">
        <span className="text-default-700 text-sm">{a.sortBy}</span>
        <FilterDropdown align="right" value={mobileSort} options={(Object.keys(sortLabel) as SortKey[]).map((k) => ({ value: k, label: sortLabel[k] }))} onChange={(v) => setSorting([{ id: v, desc: true }])} />
      </div>

      <DataTable<QualityLine>
        table={table}
        emptyMessage={query ? a.searchEmpty : a.stNoDataTitle}
        footerRow={total}
        mobileCard={(row) => (
          <AdQualityMobileRow
            line={row.original} depth={row.depth}
            expandable={row.original.kind === 'campaign'} expanded={row.getIsExpanded()} onToggleGroup={row.getToggleExpandedHandler()}
          />
        )}
      />
      {filtered > 0 && (
        <div className="card-footer">
          <TablePagination
            totalItems={filtered} start={start} end={end} itemsName={a.itemsName} showInfo
            previousPage={table.previousPage} canPreviousPage={table.getCanPreviousPage()}
            pageCount={table.getPageCount()} pageIndex={pageIndex} setPageIndex={table.setPageIndex}
            nextPage={table.nextPage} canNextPage={table.getCanNextPage()}
          />
        </div>
      )}
      <p className="text-default-500 border-default-100 text-2xs mb-0 flex items-start gap-1.5 border-t px-4 py-3">
        <Icon icon="info-circle" className="mt-px shrink-0 text-sm" aria-hidden="true" />
        <span>{fmt(a.qNote, { noun })}</span>
      </p>
    </div>
  )
}
