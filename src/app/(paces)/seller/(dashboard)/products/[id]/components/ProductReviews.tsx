/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-details/components/ProductReviews.tsx
 * แสดงรีวิวจาก order ที่ completed สำหรับ product นี้ — ข้อมูลจริงจาก RSC parent
 * ใช้ DataTable + TablePagination + useReactTable พร้อม filterFns: {} (ตาม retro B1)
 * ไม่มี demo data — empty-state ภาษาไทยถ้าไม่มีรีวิว
 */

'use client'

import Rating from '@/components/Rating'
import { formatDateTime } from '@/lib/format-date'
import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Icon from '@/components/wrappers/Icon'
import SellerEmptyState from '../../../_shared/SellerEmptyState'
import { ColumnFiltersState, createColumnHelper, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import { useState } from 'react'
import type { ReviewRow } from './data'

interface Props {
  reviews: ReviewRow[]
  avgRating: number
  totalReviews: number
  ratingBreakdown: { stars: number; count: number; progress: number }[]
}

const columnHelper = createColumnHelper<ReviewRow>()


const ProductReviews = ({ reviews, avgRating, totalReviews, ratingBreakdown }: Props) => {
  const columns = [
    columnHelper.accessor('reviewerLabel', {
      header: 'ผู้รีวิว',
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-full bg-default-200 flex items-center justify-center">
            <Icon icon="user" className="size-4 text-default-400" />
          </div>
          <span className="text-sm font-medium">{row.original.reviewerLabel}</span>
        </div>
      ),
      enableSorting: false,
    }),
    columnHelper.accessor('rating', {
      header: 'รีวิว',
      cell: ({ row }) => (
        // ลบ w-xs fixed width — เป็นต้นเหตุ h-scroll บน mobile
        // ใช้ min-w-0 + line-clamp แทน
        <div className="min-w-0 px-4 py-3">
          <Rating rating={row.original.rating} />
          {row.original.comment ? (
            <p className="text-default-400 text-sm italic mt-2 line-clamp-3">{row.original.comment}</p>
          ) : (
            <p className="text-default-400 text-sm italic mt-2">ไม่มีความคิดเห็น</p>
          )}
        </div>
      ),
      enableSorting: false,
    }),
    columnHelper.accessor('createdAt', {
      header: 'วันที่',
      cell: ({ row }) => (
        <span className="text-sm text-default-600">
          {formatDateTime(row.original.createdAt)}
        </span>
      ),
    }),
  ]

  const [data] = useState<ReviewRow[]>(() => [...reviews])
  // filterFns: {} บังคับต้องมีแม้ว่าจะว่าง — ตาม retro B1 (tanstack/react-table constraint)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 5 })

  const table = useReactTable({
    data,
    columns,
    filterFns: {},
    state: { columnFilters, pagination },
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  return (
    <div className="card shadow-none border border-dashed border-default-300">
      <div className="card-header">
        <h4 className="card-title">รีวิวจากลูกค้า</h4>
      </div>

      {/* Summary: avg rating + rating breakdown */}
      {/* Summary: avg rating + rating breakdown
          grid-cols-1 sm:grid-cols-12 — stack เหนือกันบน mobile ป้องกัน cram */}
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-12">
          <div className="sm:col-span-7">
            {/* p-4 sm:p-7.5 — ลด padding บน mobile */}
            <div className="flex flex-wrap items-start p-4 sm:p-7.5 gap-4 sm:gap-7.5">
              <div className="flex flex-col gap-y-2.5">
                <h3 className="text-primary flex items-center gap-2.5 text-xl font-bold">
                  {totalReviews > 0 ? avgRating.toFixed(1) : '-'}
                  <Icon icon="star-filled" className="text-warning text-xl" />
                </h3>
                {totalReviews > 0 ? (
                  <p>จากรีวิวทั้งหมด {totalReviews} รายการ</p>
                ) : (
                  <p className="text-default-400 text-sm">ยังไม่มีรีวิว</p>
                )}
                {totalReviews > 0 && (
                  <p className="text-default-400 text-xs">รีวิวจากลูกค้าที่ซื้อสินค้านี้จริง</p>
                )}
              </div>
            </div>
          </div>
          {/* Distribution bars — sm:col-span-5 */}
          <div className="sm:col-span-5">
            <div className="space-y-2.5 p-4 sm:p-7.5">
              {ratingBreakdown.map((rating, idx) => (
                <div className="flex items-center gap-2" key={idx}>
                  <div className="text-default-800 text-sm text-nowrap">{rating.stars} ดาว</div>
                  <div
                    className="bg-default-200 flex h-2 w-full overflow-hidden rounded-full"
                    role="progressbar"
                    aria-valuenow={rating.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="bg-primary flex flex-col justify-center overflow-hidden rounded-s-full text-center text-xs whitespace-nowrap text-white transition duration-500"
                      style={{ width: `${rating.progress}%` }}
                    />
                  </div>
                  <div className="text-end">
                    <span className="badge bg-light text-dark">{rating.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <DataTable<ReviewRow>
        table={table}
        emptyMessage={
          <SellerEmptyState
            compact
            icon="star-off"
            title="ยังไม่มีรีวิว"
            description="เมื่อมีรีวิวสินค้านี้ จะแสดงที่นี่"
          />
        }
        mobileCard={(row) => {
          const r = row.original
          // ใช้ตัวอักษรแรกของ reviewerLabel เป็น avatar initial
          const initial = r.reviewerLabel.charAt(0).toUpperCase()
          // 3-zone: leading avatar | main content | trailing date
          // items-start เพราะ comment หลายบรรทัด (ไม่ใช่ items-center)
          return (
            <div className="flex items-start gap-3 px-1 py-3.5">
              {/* leading: avatar initial */}
              <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                {initial}
              </div>
              {/* main: ชื่อ + ดาว + comment */}
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-ink truncate">{r.reviewerLabel}</p>
                {/* HR7: text-[13px] — แถวดาวเรตติ้ง คู่ scale กับ comment/ไม่มีความคิดเห็นด้านล่าง (ก็ text-[13px] เท่ากัน); หมายเหตุ: ตรงกับ Paces token text-xs (13px) พอดี — รายงาน Controller แยกว่าอาจแทนด้วย token ได้ (ไม่แก้เองในงานนี้) */}
                <p className="text-[13px] text-warning leading-tight">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</p>
                {/* line-clamp-2 ป้องกัน comment ยาวดัน layout */}
                {r.comment ? (
                  <p className="text-[13px] text-default-600 mt-0.5 line-clamp-2">{r.comment}</p>
                ) : (
                  <p className="text-[13px] text-default-300 italic mt-0.5">ไม่มีความคิดเห็น</p>
                )}
              </div>
              {/* trailing: วันที่ */}
              <div className="shrink-0">
                <p className="text-[11px] text-default-400 leading-tight whitespace-nowrap">
                  {formatDateTime(r.createdAt)}
                </p>
              </div>
            </div>
          )
        }}
      />
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
