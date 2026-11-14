'use client'

/**
 * AdSalesClient — การ์ดสรุป + ตาราง/การ์ดมือถือ + ชีตของรายงานยอดขายตามโฆษณา (feature 00091)
 *
 * Base (แถบสัดส่วน): theme/paces/Admin/TS/src/app/(admin)/ui/progress/page.tsx (`MultipleBar` — `bg-default-100 flex h-4 w-full
 *   overflow-hidden rounded` + ลูก `role="progressbar"` + `style={{ width }}` ค่าไดนามิก ธีมเองก็ทำแบบนี้)
 * Base (ตาราง): src/app/(paces)/seller/(dashboard)/reports/products/components/ProductSalesTable.tsx
 *   (useReactTable + DataTable + TablePagination · 'use no memo') ซึ่ง copy มาจาก
 *   theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products/components/ProductsListing.tsx
 * Base (รายการมือถือ): reports/products/components/ProductMobileList.tsx · ตัวเรียงมือถือ: FilterDropdown (ท่าเดียวกับ ListControlDropdown)
 *
 * 🛑 One Voice: น้ำเงิน (bg-primary) ใช้เฉพาะส่วน "จากโฆษณา" ของแถบสัดส่วน — ไม่มีเขียว/แดง (0 คำสั่งซื้อไม่ใช่ความล้มเหลว)
 * 🛑 อัตราปิดการขายแสดงค่าจริงแม้เกิน 100% (คลิกก่อนช่วงแล้วสั่งในช่วง) + tooltip อธิบายที่หัวคอลัมน์ · แชท = 0 → "—"
 */
import {
  createColumnHelper,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'

import AdThumb from '@/components/safepay/AdThumb'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Icon from '@/components/wrappers/Icon'
import { adDisplayName } from '@/lib/ad-attribution'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import AdOrdersSheet from './AdOrdersSheet'
import { AD_SORT_KEYS, type AdSortKey, type AdViewRow } from './data'

const columnHelper = createColumnHelper<AdViewRow>()

type Summary = { adSales: number; nonAdSales: number; adOrders: number; nonAdOrders: number; adSharePct: number | null }

type Props = {
  rows: AdViewRow[]
  summary: Summary
  noun: string
  /** `from=&to=&shopChannelId=` ของช่วงที่ดูอยู่ — ใช้ยิง API ชีต */
  rangeQuery: string
  truncated: boolean
}

const pct = (v: number | null) => (v === null ? '—' : `${formatNumberNoSymbol(v)}%`)

export default function AdSalesClient({ rows, summary, noun, rangeQuery, truncated }: Props) {
  // useReactTable คืนฟังก์ชันที่ memo ไม่ได้อย่างปลอดภัย — ปิด React Compiler เฉพาะ component นี้ (ท่าเดียวกับ ProductSalesTable)
  'use no memo'
  const t = useT()
  const idFallback = t.inbox.contextBar.adIdFallback
  const [sorting, setSorting] = useState<SortingState>([{ id: 'sales', desc: true }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const [openRow, setOpenRow] = useState<AdViewRow | null>(null)
  const [mobileSort, setMobileSort] = useState<AdSortKey>('sales')

  const adCell = (r: AdViewRow) => {
    const name = adDisplayName(r.adTitle, r.adId, idFallback) ?? r.adId
    return (
      <button
        type="button"
        onClick={() => setOpenRow(r)}
        className="flex min-w-0 max-w-full items-center gap-3 text-start">
        <AdThumb photoFileId={r.adPhotoFileId} className="size-10 rounded-md" iconClass="text-lg" />
        <span className="min-w-0">
          <span className="text-default-900 hover:text-primary block max-w-full truncate text-sm font-medium" title={name}>{name}</span>
          {/* รหัสแอดเป็นบรรทัดรองเฉพาะตอนมีชื่อ (ไม่มีชื่อ = ชื่อคือรหัสอยู่แล้ว) */}
          {r.adTitle?.trim() && <span className="text-default-500 block break-all text-2xs">{fmt(idFallback, { adId: r.adId })}</span>}
        </span>
      </button>
    )
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor((r) => r.adTitle ?? r.adId, {
        id: 'ad',
        header: t.adReport.colAd,
        cell: ({ row }) => adCell(row.original),
        enableSorting: false,
      }),
      columnHelper.accessor('chats', {
        id: 'chats',
        header: t.adReport.colChats,
        cell: ({ row }) => <span className="block text-end tabular-nums">{formatNumberNoSymbol(row.original.chats)}</span>,
      }),
      columnHelper.accessor('orders', {
        id: 'orders',
        header: noun,
        cell: ({ row }) => (
          <span className="block text-end tabular-nums">
            {formatNumberNoSymbol(row.original.orders)}
            {/* แท็บเล็ต: ยกเลิก/คืน ลงเป็นบรรทัดรอง · ≥1280 เป็นคอลัมน์เต็ม */}
            <span className="text-default-500 block text-2xs xl:hidden">{fmt(t.adReport.mobileLost, { n: row.original.cancelledOrReturned })}</span>
          </span>
        ),
      }),
      columnHelper.accessor((r) => r.closeRatePct ?? -1, {
        id: 'rate',
        header: () => (
          <span className="inline-flex items-center gap-1" title={fmt(t.adReport.rateTip, { noun })}>
            {t.adReport.colRate}
            <Icon icon="info-circle" className="text-default-500 text-sm" aria-hidden="true" />
          </span>
        ),
        cell: ({ row }) => <span className="block text-end tabular-nums">{pct(row.original.closeRatePct)}</span>,
      }),
      columnHelper.accessor('sales', {
        id: 'sales',
        header: t.adReport.colSales,
        cell: ({ row }) => (
          <span className="block text-end">
            <span className="text-default-900 block text-sm font-semibold tabular-nums">{formatBaht(row.original.sales)}</span>
            <span className="text-default-500 block text-2xs tabular-nums xl:hidden">
              {t.adReport.colAvg} {row.original.avgPerOrder === null ? '—' : formatBaht(row.original.avgPerOrder)}
            </span>
          </span>
        ),
      }),
      columnHelper.accessor((r) => r.avgPerOrder ?? -1, {
        id: 'avg',
        header: t.adReport.colAvg,
        cell: ({ row }) => <span className="block text-end tabular-nums">{row.original.avgPerOrder === null ? '—' : formatBaht(row.original.avgPerOrder)}</span>,
        meta: { headerClassName: 'max-xl:hidden', cellClassName: 'max-xl:hidden' },
      }),
      columnHelper.accessor('cancelledOrReturned', {
        id: 'lost',
        header: t.adReport.colLost,
        cell: ({ row }) => <span className="block text-end tabular-nums">{formatNumberNoSymbol(row.original.cancelledOrReturned)}</span>,
        meta: { headerClassName: 'max-xl:hidden', cellClassName: 'max-xl:hidden' },
      }),
    ],
    // adCell ผูก t/idFallback/setOpenRow ที่เสถียร — ใส่ที่ใช้จริงเท่านั้น
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, noun, idFallback],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: false,
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  const mobileRows = useMemo(() => {
    const key: Record<AdSortKey, (r: AdViewRow) => number> = {
      sales: (r) => r.sales,
      orders: (r) => r.orders,
      chats: (r) => r.chats,
      rate: (r) => r.closeRatePct ?? -1,
    }
    return [...rows].sort((a, b) => key[mobileSort](b) - key[mobileSort](a))
  }, [rows, mobileSort])

  const sortLabel: Record<AdSortKey, string> = {
    sales: t.adReport.colSales,
    orders: noun,
    chats: t.adReport.sortChats,
    rate: t.adReport.sortRate,
  }

  const adWidth = summary.adSharePct ?? 0

  return (
    <>
      {/* ── การ์ดสรุป (พระเอกของหน้า): ยอดขายจากโฆษณา + แถบสัดส่วน 2 ส่วน ── */}
      <div className="card mb-4">
        <div className="card-body grid gap-4 lg:grid-cols-3 lg:items-center">
          <div className="lg:col-span-1">
            <p className="text-default-700 mb-1 text-sm">{t.adReport.summaryHeading}</p>
            <p className="text-default-900 mb-1 text-xl font-bold tabular-nums">{formatBaht(summary.adSales)}</p>
            <p className="text-default-700 mb-0 text-xs">
              {summary.adSharePct === null ? '—' : fmt(t.adReport.summaryShare, { p: formatNumberNoSymbol(summary.adSharePct) })}
            </p>
          </div>
          <div className="lg:col-span-2">
            <div className="bg-default-100 flex h-4 w-full overflow-hidden rounded">
              {/* ความกว้างเป็นค่าไดนามิกตามสัดส่วน — ธีม Paces ทำแบบเดียวกัน (style width) ไม่ใช่ arbitrary Tailwind */}
              <div className="bg-primary" style={{ width: `${adWidth}%` }} role="progressbar" aria-label={t.adReport.legendFromAd} aria-valuenow={adWidth} aria-valuemin={0} aria-valuemax={100} />
              <div className="bg-default-300" style={{ width: `${summary.adSharePct === null ? 0 : 100 - adWidth}%` }} role="progressbar" aria-label={t.adReport.legendNotFromAd} aria-valuenow={summary.adSharePct === null ? 0 : 100 - adWidth} aria-valuemin={0} aria-valuemax={100} />
            </div>
            <ul className="text-default-700 mt-2 mb-0 flex list-none flex-col gap-1 ps-0 text-xs sm:flex-row sm:flex-wrap sm:gap-x-6">
              <li className="flex items-center gap-1.5">
                <span className="bg-primary size-2.5 rounded-full" aria-hidden="true" />
                {t.adReport.legendFromAd}
                <span className="text-default-900 tabular-nums">{formatBaht(summary.adSales)} · {formatNumberNoSymbol(summary.adOrders)} {t.adReport.countUnit}</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="bg-default-300 size-2.5 rounded-full" aria-hidden="true" />
                {t.adReport.legendNotFromAd}
                <span className="text-default-900 tabular-nums">{formatBaht(summary.nonAdSales)} · {formatNumberNoSymbol(summary.nonAdOrders)} {t.adReport.countUnit}</span>
              </li>
            </ul>
            <p className="text-default-500 mt-2 mb-0 text-2xs">{fmt(t.adReport.basisNote, { noun })}</p>
          </div>
        </div>
      </div>

      {truncated && (
        <p className="text-warning-ink bg-warning/15 mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
          <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span>{fmt(t.adReport.truncated, { noun })}</span>
        </p>
      )}

      {/* ── ตาราง (≥768) ── */}
      <div className="card max-md:hidden">
        <DataTable<AdViewRow> table={table} emptyMessage={fmt(t.adReport.emptyRangeTitle, { noun })} />
        {totalItems > 0 && (
          <div className="card-footer">
            <TablePagination
              totalItems={totalItems}
              start={start}
              end={end}
              itemsName={t.adReport.colAd}
              showInfo
              previousPage={table.previousPage}
              canPreviousPage={table.getCanPreviousPage()}
              pageCount={table.getPageCount()}
              pageIndex={pageIndex}
              setPageIndex={table.setPageIndex}
              nextPage={table.nextPage}
              canNextPage={table.getCanNextPage()}
            />
          </div>
        )}
      </div>

      {/* ── รายการมือถือ (<768): ทั้งการ์ดเป็น <button> เปิดชีต ── */}
      <div className="md:hidden">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-default-700 text-sm">{t.adReport.sortBy}</span>
          <FilterDropdown
            align="right"
            value={mobileSort}
            options={AD_SORT_KEYS.map((k) => ({ value: k, label: sortLabel[k] }))}
            onChange={(v) => setMobileSort(v as AdSortKey)}
          />
        </div>
        {mobileRows.length === 0 && (
          <p className="text-default-500 py-8 text-center text-sm">{fmt(t.adReport.emptyRangeTitle, { noun })} — {t.adReport.emptyRangeDesc}</p>
        )}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {mobileRows.map((r) => {
            const name = adDisplayName(r.adTitle, r.adId, idFallback) ?? r.adId
            return (
              <li key={r.adId}>
                <button
                  type="button"
                  onClick={() => setOpenRow(r)}
                  className="card flex min-h-11 w-full items-start gap-3 p-3 text-start">
                  <AdThumb photoFileId={r.adPhotoFileId} className="size-10 rounded-md" iconClass="text-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-default-900 line-clamp-2 break-words text-sm font-medium">{name}</span>
                      <span className="text-default-900 shrink-0 text-sm font-semibold tabular-nums">{formatBaht(r.sales)}</span>
                    </span>
                    <span className="text-default-700 mt-1 block text-xs tabular-nums">
                      {fmt(t.adReport.mobileStats, { chats: formatNumberNoSymbol(r.chats), noun, orders: formatNumberNoSymbol(r.orders), rate: pct(r.closeRatePct) })}
                    </span>
                    {r.cancelledOrReturned > 0 && (
                      <span className="text-default-500 mt-0.5 block text-xs tabular-nums">{fmt(t.adReport.mobileLost, { n: r.cancelledOrReturned })}</span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {openRow && <AdOrdersSheet row={openRow} noun={noun} rangeQuery={rangeQuery} onClose={() => setOpenRow(null)} />}
    </>
  )
}
