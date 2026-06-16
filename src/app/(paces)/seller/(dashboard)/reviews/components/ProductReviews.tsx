/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/reviews/components/ProductReviews.tsx
 *
 * Adaptations from theme:
 * - Data รับจาก RSC props (ไม่ใช่ productReviewData mock)
 * - Reviewer column: initials avatar แทนรูป (ไม่มี user photo ใน SafePay)
 * - Product column: icon แทนรูปสินค้า (orderItems ไม่มี snapshot image)
 * - Order link: /seller/orders/{token} — internal seller route (proxy rewrite ไม่จำเป็นเพราะ explicit)
 *   ไม่ใช้ /o/{token} เพราะนั่นคือ buyer-domain route ที่จะ 404 บน seller subdomain
 * - date: รับเป็น dateISO (ISO string จาก RSC) แล้ว format เป็นภาษาไทยใน client
 * - filterFns: {} ใส่ใน useReactTable ทุก instance (ป้องกัน TanStack warning)
 * - Stripped: ApexChart review-trend, Delete action, Export dropdown (ไม่มีใน MVP)
 * - Stripped: DeleteConfirmationModal, row selection (SafePay ไม่ให้ seller ลบรีวิว)
 * - Stripped: Status badge (SafePay ไม่มี published/draft บน review)
 * - Stripped: Select wrapper react-select — ใช้ native select แทน (เบากว่า)
 */

'use client'

import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Rating from '@/components/Rating'
import { formatDateTime } from '@/lib/format-date'
import Icon from '@/components/wrappers/Icon'
import ratingsImg from '@/assets/images/ratings.svg'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import {
  ColumnFiltersState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { ReviewRow, SummaryData } from './data'

type Props = {
  reviews: ReviewRow[]
  summary: SummaryData
}

const starRatings = [5, 4, 3, 2, 1] as const

const columnHelper = createColumnHelper<ReviewRow>()


const ProductReviews = ({ reviews, summary }: Props) => {
  const [globalFilter, setGlobalFilter] = useState('')
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 5 })

  const columns = [
    columnHelper.accessor('productName', {
      header: 'สินค้า',
      cell: ({ row }) => (
        <div className="flex items-center gap-base">
          {/* Product image omitted — orderItems ไม่มี snapshot image */}
          <div className="bg-default-100 text-default-400 size-11 rounded flex items-center justify-center">
            <Icon icon="package" className="text-lg" />
          </div>
          <h5>
            <span className="text-default-800 text-sm font-medium">{row.original.productName}</span>
          </h5>
        </div>
      ),
    }),
    columnHelper.accessor('reviewerLabel', {
      header: 'ผู้รีวิว',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          {/* Avatar initials — ไม่มีรูปผู้ใช้ใน SafePay MVP */}
          <div className="bg-primary/10 text-primary rounded-full size-10 flex items-center justify-center font-bold shrink-0">
            {row.original.reviewerInitial}
          </div>
          <div>
            <h5 className="text-sm leading-tight font-medium text-default-800">
              {row.original.reviewerLabel}
            </h5>
          </div>
        </div>
      ),
    }),
    columnHelper.accessor('rating', {
      header: 'รีวิว',
      enableSorting: false,
      cell: ({ row }) => (
        <>
          <Rating rating={row.original.rating} />
          <p className={`mt-2 text-sm ${row.original.comment ? 'text-default-700 italic' : 'text-default-300 italic'}`}>
            {row.original.comment ?? 'ไม่มีความคิดเห็น'}
          </p>
        </>
      ),
    }),
    columnHelper.accessor('dateISO', {
      header: 'วันที่',
      cell: ({ row }) => (
        <span className="text-default-500 text-sm">
          {formatDateTime(row.original.dateISO)}
        </span>
      ),
    }),
    {
      id: 'actions',
      header: 'ออเดอร์',
      enableSorting: false,
      enableColumnFilter: false,
      cell: ({ row }: { row: { original: ReviewRow } }) => (
        // seller subdomain route — proxy rewrite ครอบ /orders/{token} → /seller/orders/{token}
        // ไม่ใช้ /o/{token} เพราะเป็น buyer-domain route — 404 บน seller.deepth.local
        <Link
          href={`/orders/${row.original.orderToken}`}
          className="btn btn-sm border border-default-300 text-default-800 hover:border-default-400 flex items-center gap-1"
        >
          <Icon icon="receipt" className="text-base" />
          ดู
        </Link>
      ),
    },
  ]

  const table = useReactTable({
    data: reviews,
    columns,
    state: { columnFilters, pagination, globalFilter },
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // filterFns object บังคับต้องมีแม้ว่าจะว่าง เพื่อหลีกเลี่ยง TanStack warning
    filterFns: {},
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  return (
    <div className="card">
      {/* ── Summary header: ซ้าย = rating overview + distribution, ขวา = chart placeholder ── */}
      {/* grid-cols-1 sm:grid-cols-12 — stack เหนือกันบน mobile ป้องกัน cram */}
      <div className="border-default-300 border-b border-dashed">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* ซ้าย: rating overview + distribution bars */}
          {/* lg:border-e — ลบขอบลอยตอน stack บน mobile */}
          <div className="border-default-300 grid grid-cols-1 sm:grid-cols-12 lg:border-e border-dashed">
            <div className="sm:col-span-7">
              {/* p-4 sm:p-7.5 — ลด padding บน mobile */}
              <div className="flex items-center gap-base p-4 sm:p-7.5 sm:gap-7.5">
                {/* w-16 sm:w-[95px] — ย่อรูปบน mobile */}
                <Image src={ratingsImg} alt="Ratings" className="h-auto w-16 sm:w-[95px]" width={95} />
                <div className="flex flex-col gap-y-2.5">
                  <h3 className="flex items-center gap-2.5 text-xl font-bold">
                    {summary.total > 0 ? summary.avgRating.toFixed(1) : '—'}
                    <Icon icon="star-filled" className="text-xl text-warning" />
                  </h3>
                  <p className="text-default-500 text-sm">
                    จาก {summary.total} รีวิวที่ยืนยันแล้ว
                  </p>
                  <div>
                    <span className="badge badge-label bg-success/15 font-semibold text-success">
                      คะแนนจริงจากลูกค้า
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Distribution bars (5 → 1 ดาว) */}
            <div className="sm:col-span-5">
              <div className="space-y-2.5 mt-2 p-4 sm:p-5">
                {starRatings.map((star) => {
                  const count = summary.distribution[star] ?? 0
                  const pct = summary.total > 0 ? Math.round((count / summary.total) * 100) : 0
                  return (
                    <div className="flex items-center gap-2.5" key={star}>
                      <div className="text-sm text-nowrap min-w-12.5">{star} ดาว</div>
                      <div
                        className="bg-default-100 flex h-2 w-full overflow-hidden rounded-full"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="bg-primary flex flex-col justify-center overflow-hidden rounded-s-full text-center text-xs whitespace-nowrap text-white transition duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-end">
                        <span className="badge bg-light text-dark">{count}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ขวา: placeholder chart — ตัด ApexChart เพราะไม่มี time-series review data ใน MVP */}
          <div className="flex items-center justify-center p-4 sm:p-7.5 text-default-300">
            <div className="text-center">
              <Icon icon="chart-bar" className="text-5xl mb-2" />
              <p className="text-sm">กราฟแนวโน้มรีวิว</p>
              <p className="text-xs">จะแสดงเมื่อมีข้อมูลเพียงพอ</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="card-header">
        <div className="flex gap-2">
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" />
            <input
              type="search"
              placeholder="ค้นหารีวิว..."
              className="form-input w-full ps-10"
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
            />
          </div>
        </div>
        <div className="ms-auto">
          <div className="flex items-center gap-2.5">
            {/* Native select แทน react-select เพื่อลด bundle size */}
            <select
              className="form-select"
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
            >
              {[5, 10, 15, 20].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Data table ── */}
      <DataTable
        table={table}
        emptyMessage={
          <div className="py-10 text-center">
            <Icon icon="star" className="text-5xl text-default-200 mb-3" />
            <p className="text-default-400">ยังไม่มีรีวิว</p>
            <p className="text-default-300 text-sm mt-1">รีวิวจะปรากฏที่นี่หลังลูกค้ายืนยันออเดอร์</p>
          </div>
        }
        mobileCard={(row) => {
          const r = row.original
          // 3-zone: leading avatar | main content | trailing date
          // items-start เพราะ comment หลายบรรทัด (ไม่ใช่ items-center)
          return (
            <div className="flex items-start gap-3 px-1 py-3.5">
              {/* leading: avatar initial ผู้รีวิว */}
              <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                {r.reviewerInitial}
              </div>
              {/* main: ชื่อ + ดาว + comment + ชื่อสินค้า/ออเดอร์ */}
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-ink truncate">{r.reviewerLabel}</p>
                <p className="text-[13px] text-warning leading-tight">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</p>
                {/* line-clamp-2 ป้องกัน comment ยาวดัน layout */}
                {r.comment ? (
                  <p className="text-[13px] text-default-600 mt-0.5 line-clamp-2">{r.comment}</p>
                ) : (
                  <p className="text-[13px] text-default-300 italic mt-0.5">ไม่มีความคิดเห็น</p>
                )}
                {/* ชื่อสินค้า + ปุ่มดูออเดอร์ (tap ≥44px: inline-flex min-h-11 + padding) */}
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-[11px] text-default-400 truncate">{r.productName}</span>
                  <Link
                    href={`/orders/${r.orderToken}`}
                    className="inline-flex items-center gap-1 min-h-11 px-2 -mr-2 text-[12px] font-medium text-primary shrink-0"
                  >
                    ดูออเดอร์
                    <Icon icon="chevron-right" className="text-sm" />
                  </Link>
                </div>
              </div>
              {/* trailing: วันที่ */}
              <div className="shrink-0">
                <p className="text-[11px] text-default-400 leading-tight whitespace-nowrap">
                  {formatDateTime(r.dateISO)}
                </p>
              </div>
            </div>
          )
        }}
      />

      {/* ── Pagination ── */}
      {table.getRowModel().rows.length > 0 && (
        <div className="card-footer border-light">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            showInfo
            itemsName="รีวิว"
            previousPage={table.previousPage}
            canPreviousPage={table.getCanPreviousPage()}
            pageCount={table.getPageCount()}
            pageIndex={table.getState().pagination.pageIndex}
            setPageIndex={table.setPageIndex}
            nextPage={table.nextPage}
            canNextPage={table.getCanNextPage()}
          />
        </div>
      )}
    </div>
  )
}

export default ProductReviews
