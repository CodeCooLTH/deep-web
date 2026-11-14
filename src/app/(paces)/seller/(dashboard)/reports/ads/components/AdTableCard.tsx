'use client'

/**
 * AdTableCard — ⑨ ผลลัพธ์รายแอด: ค้นหา + เลือกจำนวนแถว + ตาราง (≥768) / รายการ (<768) + แถวรวมทุกแอด (feature 00091 FR-009)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AnalyticsOverview.tsx
 *   (card-header ชื่อ + `input-icon-group` ค้นหา + select จำนวนแถว · useReactTable + getFilteredRowModel/globalFilter · DataTable · TablePagination)
 *   select: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx (`form-select`)
 *   โครงตาราง/รายการมือถือเดิมของหน้านี้: reports/products/components/ProductSalesTable.tsx + ProductMobileList.tsx
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
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { AD_SORT_KEYS, fmtPct, type AdReportView, type AdSortKey, type AdViewRow } from './data'

const columnHelper = createColumnHelper<AdViewRow>()
const PAGE_SIZES = [10, 25, 50]

type Props = { rows: AdViewRow[]; summary: AdReportView['summary']; noun: string; onOpen: (r: AdViewRow) => void }

export default function AdTableCard({ rows, summary, noun, onOpen }: Props) {
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
        cell: ({ row }) => {
          const r = row.original
          return (
            <button type="button" onClick={() => onOpen(r)} className="flex min-w-0 max-w-full items-center gap-3 text-start">
              <AdThumb photoFileId={r.adPhotoFileId} className="size-10 rounded-md" iconClass="text-lg" />
              <span className="min-w-0">
                <span className="text-default-900 hover:text-primary block max-w-full truncate text-sm font-medium" title={nameOf(r)}>{nameOf(r)}</span>
                {/* รหัสแอดเป็นบรรทัดรองเฉพาะตอนมีชื่อ (ไม่มีชื่อ = ชื่อคือรหัสอยู่แล้ว) */}
                {r.adTitle?.trim() && <span className="text-default-500 text-2xs block break-all">{fmt(idFallback, { adId: r.adId })}</span>}
              </span>
            </button>
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
      columnHelper.accessor('cancelledOrReturned', {
        id: 'lost', meta: { align: 'center' }, header: a.colLost,
        cell: ({ row }) => <span className="block text-center tabular-nums">{formatNumberNoSymbol(row.original.cancelledOrReturned)}</span>,
      }),
    ],
    // nameOf/onOpen ผูกกับ t/idFallback/ตัวตั้งค่า state ที่เสถียร — ใส่เฉพาะที่เปลี่ยนจริง
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, noun, idFallback],
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
    const key: Record<AdSortKey, (r: AdViewRow) => number> = { sales: (r) => r.sales, orders: (r) => r.orders, chats: (r) => r.chats, rate: (r) => r.closeRatePct ?? -1 }
    return rows.filter((r) => matches(r, globalFilter)).sort((x, y) => key[mobileSort](y) - key[mobileSort](x))
  }, [rows, globalFilter, mobileSort])
  const mobileRows = mobileFiltered.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize)

  const sortLabel: Record<AdSortKey, string> = { sales: a.colSales, orders: noun, chats: a.sortChats, rate: a.sortRate }

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
          <FilterDropdown align="right" value={mobileSort} options={AD_SORT_KEYS.map((k) => ({ value: k, label: sortLabel[k] }))} onChange={(v) => setMobileSort(v as AdSortKey)} />
        </div>
        <div className="bg-default-100/70 px-4 py-2.5 text-sm">
          <p className="text-default-900 mb-0.5 flex justify-between gap-2 font-semibold">
            <span>{fmt(a.totalRow, { n: rows.length })}</span>
            <span className="shrink-0 tabular-nums">{formatBaht(summary.adSales)}</span>
          </p>
          <p className="text-default-700 mb-0 text-xs tabular-nums">
            {fmt(a.mobileStats, { chats: formatNumberNoSymbol(summary.chats), noun, orders: formatNumberNoSymbol(summary.adOrders), rate: fmtPct(summary.closeRatePct) })}
          </p>
        </div>
        {mobileRows.length === 0 && <p className="text-default-500 px-4 py-8 text-center text-sm">{globalFilter ? a.searchEmpty : `${fmt(a.emptyRangeTitle, { noun })} — ${a.emptyRangeDesc}`}</p>}
        <ul className="divide-default-100 m-0 list-none divide-y p-0">
          {mobileRows.map((r) => (
            <li key={r.adId}>
              <button type="button" onClick={() => onOpen(r)} className="flex min-h-11 w-full items-start gap-3 px-4 py-3 text-start">
                <AdThumb photoFileId={r.adPhotoFileId} className="size-10 rounded-md" iconClass="text-lg" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-default-900 line-clamp-2 text-sm font-medium break-words">{nameOf(r)}</span>
                    <span className="text-default-900 shrink-0 text-sm font-semibold tabular-nums">{formatBaht(r.sales)}</span>
                  </span>
                  <span className="text-default-700 mt-1 block text-xs tabular-nums">
                    {fmt(a.mobileStats, { chats: formatNumberNoSymbol(r.chats), noun, orders: formatNumberNoSymbol(r.orders), rate: fmtPct(r.closeRatePct) })}
                  </span>
                  {r.cancelledOrReturned > 0 && <span className="text-default-500 mt-0.5 block text-xs tabular-nums">{fmt(a.mobileLost, { n: r.cancelledOrReturned })}</span>}
                </span>
              </button>
            </li>
          ))}
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

      <p className="text-default-500 border-default-100 mb-0 flex items-start gap-1.5 border-t px-4 py-3 text-2xs">
        <Icon icon="info-circle" className="mt-px shrink-0 text-sm" aria-hidden="true" />
        <span>{fmt(a.rateTip, { noun })}</span>
      </p>
    </div>
  )
}
