'use client'

/**
 * AdTableCard — ⑨ ผลลัพธ์รายแอด: ค้นหา + เลือกจำนวนแถว + ตาราง (≥768) / รายการ (<768) + แถวรวมทุกแอด (feature 00091 FR-009)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AnalyticsOverview.tsx
 *   (card-header ชื่อ + `input-icon-group` ค้นหา + select จำนวนแถว · useReactTable + getFilteredRowModel/globalFilter · DataTable · TablePagination)
 *   select: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx (`form-select`)
 *   โครงตาราง/รายการมือถือเดิมของหน้านี้: reports/products/components/ProductSalesTable.tsx + ProductMobileList.tsx
 * เฟส 2 (FR-010): + คอลัมน์ ค่าโฆษณา/ROAS เฉพาะ state OK (ไม่ใช่ OK = ตารางกลับเป็น 5 คอลัมน์) · แถวผี (ไม่มีแชทจากแอด) ไม่คลิกได้
 *   ไม่ได้ทำ table-fixed/colgroup ตามสเปก: DataTable ร่วมไม่รองรับ colgroup — ใช้ w-1/3 ที่หัวคอลัมน์แทน (ดูรายงานส่ง Controller)
 * ตัด: checkbox เลือกแถว · ปุ่มลบ/DeleteConfirmationModal · คอลัมน์ Actions
 *
 * 🛑 แถวรวม (footerRow) = ทุกแอดในช่วง ไม่ใช่เฉพาะหน้า/ผลค้นหา (HR16 — ตัวเลขเท่า summary ของการ์ด ①②) · แชทรวมนับห้องไม่ซ้ำ
 * 🛑 อัตราปิดการขายแสดงค่าจริงแม้เกิน 100% — อธิบายเป็นข้อความเล็กใต้ตาราง · แชท = 0 → "—"
 */
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { useId, useMemo, useState } from 'react'

import AdThumb from '@/components/safepay/AdThumb'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Icon from '@/components/wrappers/Icon'
import { adDisplayName } from '@/lib/ad-attribution'
import { costPerOrder, roas, sortNullLast } from '@/lib/ad-report-view'
import { formatBaht, formatBahtCompact, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { AD_SORT_KEYS, fmtPct, fmtRoas, type AdReportView, type AdSortKey, type AdViewRow } from './data'

const columnHelper = createColumnHelper<AdViewRow>()
const PAGE_SIZES = [10, 25, 50]

type Props = { rows: AdViewRow[]; summary: AdReportView['summary']; ads: AdReportView['ads']; noun: string; onOpen: (r: AdViewRow) => void }

export default function AdTableCard({ rows, summary, ads, noun, onOpen }: Props) {
  // useReactTable คืนฟังก์ชันที่ memo ไม่ได้อย่างปลอดภัย — ปิด React Compiler เฉพาะ component นี้ (ท่าเดียวกับ ProductSalesTable)
  'use no memo'
  const t = useT()
  const a = t.adReport
  const idFallback = t.inbox.contextBar.adIdFallback
  const searchId = useId()
  const [sorting, setSorting] = useState<SortingState>([{ id: 'sales', desc: true }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
  const [globalFilter, setGlobalFilter] = useState('')
  const [mobileSort, setMobileSort] = useState<AdSortKey>('sales')

  const showSpend = ads.state === 'OK'
  const noSpend = (
    <>
      —<span className="sr-only">{a.noSpendSr}</span>
    </>
  )
  // ≥ ฿1,000,000 ใช้แบบย่อ + title ให้เห็นเต็ม (คอลัมน์แคบ)
  const baht = (v: number) => (v >= 1_000_000 ? <span title={formatBaht(v)}>{formatBahtCompact(v)}</span> : formatBaht(v))
  const ghosts = useMemo(() => rows.filter((r) => r.noChats), [rows])
  const ghostSpend = ghosts.reduce((s, r) => s + (r.spend ?? 0), 0)
  const nameOf = (r: AdViewRow) => adDisplayName(r.adTitle, r.adId, idFallback) ?? r.adId
  const lostTotal = useMemo(() => rows.reduce((s, r) => s + r.cancelledOrReturned, 0), [rows])
  const avgTotal = summary.adOrders > 0 ? summary.adSales / summary.adOrders : null
  const matches = (r: AdViewRow, q: string) => {
    const s = q.trim().toLowerCase()
    return !s || (r.adTitle ?? '').toLowerCase().includes(s) || r.adId.toLowerCase().includes(s)
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor((r) => r.adTitle ?? r.adId, {
        id: 'ad',
        header: a.colAd,
        enableSorting: false,
        meta: { headerClassName: 'w-1/3', cellClassName: 'max-w-xs' },
        cell: ({ row }) => {
          const r = row.original
          const inner = (
            <>
              <AdThumb photoFileId={r.adPhotoFileId} className="size-10 rounded-md" iconClass="text-lg" />
              <span className="min-w-0">
                <span className="text-default-900 block max-w-full truncate text-sm font-medium" title={nameOf(r)}>{nameOf(r)}</span>
                {/* รหัสแอดเป็นบรรทัดรองเฉพาะตอนมีชื่อ (ไม่มีชื่อ = ชื่อคือรหัสอยู่แล้ว) */}
                {r.adTitle?.trim() && <span className="text-default-500 text-2xs block break-all">{fmt(idFallback, { adId: r.adId })}</span>}
                {r.noChats && <span className="bg-default-100 text-default-800 text-2xs mt-0.5 inline-block rounded px-1.5 py-0.5">{a.noChatsBadge}</span>}
              </span>
            </>
          )
          // แถวผี: ไม่มีคำสั่งซื้อให้เปิดดู → div ไม่ใช่ปุ่ม (ไม่อยู่ใน tab order)
          return r.noChats ? (
            <div className="flex min-w-0 max-w-full items-center gap-3">{inner}</div>
          ) : (
            <button type="button" onClick={() => onOpen(r)} className="hover:text-primary flex min-w-0 max-w-full items-center gap-3 text-start">{inner}</button>
          )
        },
      }),
      columnHelper.accessor('chats', {
        id: 'chats', meta: { align: 'center' }, header: a.colChats,
        cell: ({ row }) => <span className="block text-center tabular-nums">{formatNumberNoSymbol(row.original.chats)}</span>,
      }),
      columnHelper.accessor('orders', {
        id: 'orders', meta: { align: 'center' }, header: noun,
        cell: ({ row }) => (
          <span className="block text-center tabular-nums">
            {formatNumberNoSymbol(row.original.orders)}
            <span className="text-default-500 text-2xs block">{fmt(a.closeLine, { p: fmtPct(row.original.closeRatePct) })}</span>
          </span>
        ),
      }),
      columnHelper.accessor('sales', {
        id: 'sales', meta: { align: 'center' }, header: a.colSales,
        cell: ({ row }) => (
          <span className="block text-center">
            <span className="text-default-900 block text-sm font-semibold tabular-nums">{formatBaht(row.original.sales)}</span>
            <span className="text-default-500 text-2xs block tabular-nums">
              {row.original.avgPerOrder === null ? '—' : fmt(a.avgLine, { v: formatBaht(row.original.avgPerOrder) })}
            </span>
          </span>
        ),
      }),
      ...(showSpend
        ? [
            columnHelper.accessor((r) => r.spend ?? undefined, {
              id: 'spend', meta: { align: 'center' }, header: a.colSpend, sortUndefined: 'last',
              cell: ({ row }) => {
                const r = row.original
                if (r.spend === null) return <span className="block text-center">{noSpend}</span>
                const c = costPerOrder(r.spend, r.orders)
                return (
                  <span className="block text-center">
                    <span className="text-default-900 block text-sm tabular-nums">{baht(r.spend)}</span>
                    <span className="text-default-500 text-2xs block tabular-nums">{c === null ? noSpend : fmt(a.costPerLine, { v: formatBaht(c), noun })}</span>
                  </span>
                )
              },
            }),
            columnHelper.accessor((r) => roas(r.sales, r.spend) ?? undefined, {
              id: 'roas', meta: { align: 'center' },
              sortUndefined: 'last',
              // หัวคอลัมน์มีข้อความอธิบายสูตรที่เห็นได้เสมอ (ไม่พึ่ง hover)
              header: () => (
                <span className="inline-flex flex-col items-center normal-case">
                  <span className="inline-flex items-center gap-1 uppercase">{a.colRoas}<Icon icon="info-circle" className="text-sm" aria-hidden="true" /></span>
                  <span className="text-default-500 text-2xs font-normal">{a.roasTip}</span>
                </span>
              ),
              cell: ({ row }) => {
                const v = roas(row.original.sales, row.original.spend)
                return <span className="text-default-900 block text-center text-sm tabular-nums">{v === null ? noSpend : fmtRoas(v)}</span>
              },
            }),
          ]
        : []),
      columnHelper.accessor('cancelledOrReturned', {
        id: 'lost', meta: { align: 'center' }, header: a.colLost,
        cell: ({ row }) => <span className="block text-center tabular-nums">{formatNumberNoSymbol(row.original.cancelledOrReturned)}</span>,
      }),
    ],
    // nameOf/onOpen ผูกกับ t/idFallback/ตัวตั้งค่า state ที่เสถียร — ใส่เฉพาะที่เปลี่ยนจริง
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, noun, idFallback, showSpend],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination, globalFilter },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _id, q: string) => matches(row.original, q),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: false,
  })

  const { pageIndex, pageSize } = table.getState().pagination
  const filtered = table.getFilteredRowModel().rows.length
  const start = filtered === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, filtered)

  // มือถือ: เรียงเองตามตัวเรียง FilterDropdown แล้วแบ่งหน้าด้วย state เดียวกับตาราง
  const mobileFiltered = useMemo(() => {
    const key: Record<AdSortKey, (r: AdViewRow) => number | null> = {
      sales: (r) => r.sales, orders: (r) => r.orders, chats: (r) => r.chats, rate: (r) => r.closeRatePct ?? -1,
      spend: (r) => r.spend, roas: (r) => roas(r.sales, r.spend),
    }
    return sortNullLast(rows.filter((r) => matches(r, globalFilter)), key[mobileSort], true)
  }, [rows, globalFilter, mobileSort])
  const mobileRows = mobileFiltered.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize)

  const sortLabel: Record<AdSortKey, string> = { sales: a.colSales, orders: noun, chats: a.sortChats, rate: a.sortRate, spend: a.sortSpend, roas: a.sortRoas }
  const sortKeys = AD_SORT_KEYS.filter((k) => showSpend || (k !== 'spend' && k !== 'roas'))
  const ghostSort = () => {
    setSorting([{ id: 'spend', desc: true }])
    setMobileSort('spend')
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }

  const total = (
    <tr className="bg-default-100/70 font-semibold">
      <td className="text-default-900 text-sm">{fmt(a.totalRow, { n: rows.length })}</td>
      <td className="text-center tabular-nums">{formatNumberNoSymbol(summary.chats)}</td>
      <td className="text-center tabular-nums">
        {formatNumberNoSymbol(summary.adOrders)}
        <span className="text-default-500 text-2xs block font-normal">{fmt(a.closeLine, { p: fmtPct(summary.closeRatePct) })}</span>
      </td>
      <td className="text-center tabular-nums">
        {formatBaht(summary.adSales)}
        <span className="text-default-500 text-2xs block font-normal">{avgTotal === null ? '—' : fmt(a.avgLine, { v: formatBaht(avgTotal) })}</span>
      </td>
      {showSpend && (
        <>
          <td className="text-center tabular-nums">
            {ads.summary.spend === null ? noSpend : baht(ads.summary.spend)}
            <span className="text-default-500 text-2xs block font-normal">
              {ads.summary.costPerOrder === null ? noSpend : fmt(a.costPerLine, { v: formatBaht(ads.summary.costPerOrder), noun })}
            </span>
          </td>
          <td className="text-center tabular-nums">{ads.summary.roas === null ? noSpend : fmtRoas(ads.summary.roas)}</td>
        </>
      )}
      <td className="text-center tabular-nums">{formatNumberNoSymbol(lostTotal)}</td>
    </tr>
  )

  const onSearch = (v: string) => {
    setGlobalFilter(v)
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }

  return (
    <div id="ad-table" className="card scroll-mt-24 min-w-0">
      <div className="card-header flex-wrap gap-2">
        <h4 className="card-title">{a.tableTitle}</h4>
        <div className="ms-auto flex flex-wrap items-center gap-2.5">
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" aria-hidden="true" />
            <input id={searchId} type="search" className="form-input min-h-11 lg:min-h-0" placeholder={a.searchPlaceholder} aria-label={a.searchPlaceholder} value={globalFilter} onChange={(e) => onSearch(e.target.value)} />
          </div>
          <select className="form-select min-h-11 lg:min-h-0" aria-label={a.rowsPerPage} value={pageSize} onChange={(e) => setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })}>
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {showSpend && ghosts.length > 0 && (
        <p className="text-warning-ink mb-0 flex flex-wrap items-center gap-x-2 px-4 pb-3 text-xs">
          <span>{fmt(a.ghostNote, { n: ghosts.length, amount: formatBaht(ghostSpend) })}</span>
          <button type="button" onClick={ghostSort} className="text-primary min-h-11 underline lg:min-h-0">{a.ghostSort}</button>
        </p>
      )}

      {/* ── ตาราง (≥768) ── */}
      <div className="max-md:hidden">
        <DataTable<AdViewRow> table={table} emptyMessage={globalFilter ? a.searchEmpty : fmt(a.emptyRangeTitle, { noun })} footerRow={total} />
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
      </div>

      {/* ── รายการมือถือ (<768): แถวเป็น <button> · แถวรวมอยู่บนสุด ── */}
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-2 px-4 pb-2">
          <span className="text-default-700 text-sm">{a.sortBy}</span>
          <FilterDropdown align="right" value={mobileSort} options={sortKeys.map((k) => ({ value: k, label: sortLabel[k] }))} onChange={(v) => setMobileSort(v as AdSortKey)} />
        </div>
        {/* หัวตาราง desktop (มีคำอธิบาย ROAS) ซ่อนบนมือถือ — อธิบายไว้ตรงนี้แทน */}
        {showSpend && <p className="text-default-500 text-2xs mb-0 px-4 pb-2">ROAS = {a.roasTip}</p>}
        <div className="bg-default-100/70 px-4 py-2.5 text-sm">
          <p className="text-default-900 mb-0.5 flex justify-between gap-2 font-semibold">
            <span>{fmt(a.totalRow, { n: rows.length })}</span>
            <span className="shrink-0 tabular-nums">{formatBaht(summary.adSales)}</span>
          </p>
          <p className="text-default-700 mb-0 text-xs tabular-nums">
            {fmt(a.mobileStats, { chats: formatNumberNoSymbol(summary.chats), noun, orders: formatNumberNoSymbol(summary.adOrders), rate: fmtPct(summary.closeRatePct) })}
            {showSpend && ads.summary.spend !== null && ` · ${fmt(a.mobileTotalSpend, { spend: formatBaht(ads.summary.spend), roas: fmtRoas(ads.summary.roas) })}`}
          </p>
        </div>
        {mobileRows.length === 0 && <p className="text-default-500 px-4 py-8 text-center text-sm">{globalFilter ? a.searchEmpty : `${fmt(a.emptyRangeTitle, { noun })} — ${a.emptyRangeDesc}`}</p>}
        <ul className="divide-default-100 m-0 list-none divide-y p-0">
          {mobileRows.map((r) => {
            const rv = roas(r.sales, r.spend)
            const c = costPerOrder(r.spend, r.orders)
            const body = (
              <>
                <AdThumb photoFileId={r.adPhotoFileId} className="size-10 rounded-md" iconClass="text-lg" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-default-900 line-clamp-2 text-sm font-medium break-words">{nameOf(r)}</span>
                    <span className="shrink-0 text-end">
                      <span className="text-default-900 block text-sm font-semibold tabular-nums">{formatBaht(r.sales)}</span>
                      {showSpend && rv !== null && <span className="text-default-700 block text-xs tabular-nums">{fmt(a.mobileRoas, { v: fmtRoas(rv) })}</span>}
                    </span>
                  </span>
                  {r.noChats && <span className="bg-default-100 text-default-800 text-2xs mt-1 inline-block rounded px-1.5 py-0.5">{a.noChatsBadge}</span>}
                  <span className="text-default-700 mt-1 block text-xs tabular-nums">
                    {fmt(a.mobileStats, { chats: formatNumberNoSymbol(r.chats), noun, orders: formatNumberNoSymbol(r.orders), rate: fmtPct(r.closeRatePct) })}
                  </span>
                  {showSpend && r.spend !== null && (
                    <span className="text-default-700 mt-0.5 block text-xs tabular-nums">
                      {c === null ? fmt(a.mobileSpendOnly, { spend: formatBaht(r.spend) }) : fmt(a.mobileSpend, { spend: formatBaht(r.spend), cost: formatBaht(c), noun })}
                    </span>
                  )}
                  {r.cancelledOrReturned > 0 && <span className="text-default-500 mt-0.5 block text-xs tabular-nums">{fmt(a.mobileLost, { n: r.cancelledOrReturned })}</span>}
                </span>
              </>
            )
            return (
              <li key={r.adId}>
                {r.noChats ? (
                  <div className="flex w-full items-start gap-3 px-4 py-3">{body}</div>
                ) : (
                  <button type="button" onClick={() => onOpen(r)} className="flex min-h-11 w-full items-start gap-3 px-4 py-3 text-start">{body}</button>
                )}
              </li>
            )
          })}
        </ul>
        {mobileFiltered.length > 0 && (
          <div className="border-default-100 flex items-center justify-between gap-2 border-t px-4 py-3">
            <button type="button" className="btn border-default-300 min-h-11 border" disabled={pageIndex === 0} onClick={() => setPagination((p) => ({ ...p, pageIndex: p.pageIndex - 1 }))}>
              <Icon icon="chevron-left" aria-hidden="true" /> {a.prevPage}
            </button>
            <span className="text-default-700 text-center text-xs tabular-nums">
              {fmt(a.showingRange, { a: pageIndex * pageSize + 1, b: Math.min((pageIndex + 1) * pageSize, mobileFiltered.length), n: mobileFiltered.length })}
            </span>
            <button type="button" className="btn border-default-300 min-h-11 border" disabled={(pageIndex + 1) * pageSize >= mobileFiltered.length} onClick={() => setPagination((p) => ({ ...p, pageIndex: p.pageIndex + 1 }))}>
              {a.nextPage} <Icon icon="chevron-right" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {showSpend && ads.summary.uncoveredAds > 0 && (
        <p className="text-default-700 border-default-100 mb-0 border-t px-4 py-3 text-xs">{fmt(a.uncoveredNote, { n: ads.summary.uncoveredAds })}</p>
      )}

      <p className="text-default-500 border-default-100 mb-0 flex items-start gap-1.5 border-t px-4 py-3 text-2xs">
        <Icon icon="info-circle" className="mt-px shrink-0 text-sm" aria-hidden="true" />
        <span>{fmt(a.rateTip, { noun })}</span>
      </p>
    </div>
  )
}
