/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-details/components/ProductReviews.tsx
 * แสดงรีวิวจาก order ที่ completed สำหรับ product นี้ — ข้อมูลจริงจาก RSC parent
 * ใช้ DataTable + TablePagination + useReactTable พร้อม filterFns: {} (ตาม retro B1)
 * ไม่มี demo data — empty-state ภาษาไทยถ้าไม่มีรีวิว
 */

'use client'

import Rating from '@/components/Rating'
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
        <div className="w-xs px-4 py-3">
          <Rating rating={row.original.rating} />
          {row.original.comment ? (
            <p className="text-default-400 text-sm italic mt-2">{row.original.comment}</p>
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
          {new Date(row.original.createdAt).toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
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
      <div>
        <div className="grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="flex flex-wrap items-start p-7.5 gap-7.5">
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
          <div className="lg:col-span-5">
            <div className="space-y-2.5 p-7.5">
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
