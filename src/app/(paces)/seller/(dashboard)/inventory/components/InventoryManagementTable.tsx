/**
 * InventoryManagementTable — ตาราง overview สถานะสต็อกสินค้า PHYSICAL (S-12, feature 00003)
 *
 * Base: src/app/(paces)/seller/(dashboard)/wallet/components/WalletTransactionTable.tsx
 *   (DataTable + TanStack wiring: search/globalFilter/page-size/pagination/mobileCard responsive
 *   — copy ทั้ง pattern toolbar + card-footer + role=region a11y)
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(inventory)/product-stocks/components/ProductStockTable.tsx
 *   (product+image cell — thumbnail+name+link, badge สถานะ cell style bg-{semantic}/15)
 *
 * Adaptations จาก 2 Base:
 * - ตัด sku/category/price/lowStock/checkbox/bulk-delete (ProductStockTable) — เป็น overview/monitoring
 *   list เท่านั้น (TD-005, BRD FR-INV-08-AC-01 — แก้จำนวนสต็อกจริงที่หน้า product form เท่านั้น)
 * - ตัด filter-type dropdown ของ WalletTransactionTable (ตารางนี้ไม่มี type ให้กรอง) เหลือ search + page size
 * - Actions = ปุ่มเดียว btn btn-icon ลิงก์ไป /products/{id}/edit (ไม่มี inline stock edit)
 * - คอลัมน์ "สถานะติดตาม" / "สถานะสต็อก": badge token ตาม Design Spec (bg-primary/15, bg-danger/15)
 * - updatedAt รับเป็น string ที่ parent format ด้วย formatDateTime แล้ว (RSC boundary — ไม่ format ซ้ำที่นี่)
 * - empty state (ไม่มี PHYSICAL product เลย): การ์ด + icon package + CTA /products/new-v2
 * - mobileCard: ผสม leading-thumbnail (ProductStockTable) เข้ากับโครง card list ของ WalletTransactionTable
 */

'use client'

import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import {
  ColumnFiltersState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState } from 'react'

export type InventoryProductRow = {
  id: string
  name: string
  image: string | null
  stockQty: number | null
  updatedAt: string
}

const columnHelper = createColumnHelper<InventoryProductRow>()

type Props = {
  products: InventoryProductRow[]
}

const InventoryManagementTable = ({ products }: Props) => {
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  const columns = useMemo(
    () => [
      // คอลัมน์สินค้า — thumbnail + name + link ไปหน้า product detail
      columnHelper.accessor('name', {
        header: 'สินค้า',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="size-9 shrink-0">
              {row.original.image ? (
                <Image
                  src={row.original.image}
                  alt={row.original.name}
                  width={36}
                  height={36}
                  className="size-9 rounded object-cover"
                />
              ) : (
                <div className="bg-default-100 flex size-9 items-center justify-center rounded">
                  <Icon icon="package" className="text-default-300 size-5" />
                </div>
              )}
            </div>
            <Link href={`/products/${row.original.id}`} className="hover:text-primary font-medium">
              {row.original.name}
            </Link>
          </div>
        ),
      }),
      // คอลัมน์สถานะติดตาม — badge ติดตาม (stockQty !== null) / ไม่ติดตาม
      columnHelper.accessor('stockQty', {
        id: 'tracked',
        header: 'สถานะติดตาม',
        cell: ({ row }) => {
          const tracked = row.original.stockQty !== null
          return (
            <span
              className={cn('badge', tracked ? 'bg-primary/15 text-primary' : 'bg-default-100 text-default-500')}
            >
              {tracked ? 'ติดตาม' : 'ไม่ติดตาม'}
            </span>
          )
        },
      }),
      // คอลัมน์จำนวนคงเหลือ — stockQty หรือ "—" ถ้า untracked
      columnHelper.accessor('stockQty', {
        id: 'qty',
        header: 'จำนวนคงเหลือ',
        cell: ({ row }) => (
          <span className="text-default-700 tabular-nums">
            {row.original.stockQty !== null ? row.original.stockQty : '—'}
          </span>
        ),
      }),
      // คอลัมน์สถานะสต็อก — badge "หมด" เมื่อ stockQty===0 เท่านั้น (low-stock alert = out of scope)
      columnHelper.display({
        id: 'stockStatus',
        header: 'สถานะสต็อก',
        cell: ({ row }) => {
          if (row.original.stockQty === 0) {
            return <span className="badge bg-danger/15 text-danger">หมด</span>
          }
          return <span className="text-default-400">—</span>
        },
      }),
      // คอลัมน์อัปเดตล่าสุด — รับ formatDateTime string จาก parent แล้ว (RSC boundary)
      columnHelper.accessor('updatedAt', {
        header: 'อัปเดตล่าสุด',
        cell: ({ getValue }) => (
          <span className="text-default-400 text-sm whitespace-nowrap">{getValue()}</span>
        ),
      }),
      // Actions — ปุ่มเดียวลิงก์ไป product edit (ไม่มี inline stock edit — TD-005)
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex justify-center">
            <Link
              href={`/products/${row.original.id}/edit`}
              className="btn btn-icon btn-sm border-default-300 text-default-800 hover:border-default-400 border"
              aria-label={`แก้ไข ${row.original.name}`}
            >
              <Icon icon="edit" className="text-base" />
            </Link>
          </div>
        ),
      }),
    ],
    [],
  )

  const table = useReactTable({
    data: products,
    columns,
    state: {
      sorting,
      globalFilter,
      columnFilters,
      pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
    enableColumnFilters: true,
    // filterFns ว่างบังคับต้องมีเพื่อหลีกเลี่ยง TanStack warning (เหมือน WalletTransactionTable)
    filterFns: {},
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  // Empty state ทั้งตาราง (ไม่มี PHYSICAL product เลย) — การ์ด + icon + CTA เพิ่มสินค้า
  if (products.length === 0) {
    return (
      <div className="card">
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <Icon icon="package" className="text-default-300 size-12" aria-hidden="true" />
          <p className="text-default-400 text-sm">
            ยังไม่มีสินค้าประเภทจับต้องได้ — เพิ่มสินค้าก่อนเพื่อเริ่มจัดการสต็อก
          </p>
          <Link
            href="/products/new-v2"
            className="btn bg-primary hover:bg-primary-hover inline-flex items-center gap-2 text-white"
          >
            <Icon icon="plus" className="text-base" />
            เพิ่มสินค้า
          </Link>
        </div>
      </div>
    )
  }

  // custom empty message เมื่อค้นหาแล้วไม่เจอ (มีสินค้าอยู่ แต่ globalFilter ไม่ตรง)
  const emptyMessage = (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Icon icon="search-off" className="text-default-300 size-10" aria-hidden="true" />
      <p className="text-default-400 text-sm">ไม่พบสินค้าที่ค้นหา</p>
    </div>
  )

  return (
    <div className="card">
      {/* Toolbar — search ชื่อสินค้า + page size (ตัด filter-type dropdown ตาม Design Spec) */}
      <div className="card-header">
        <div className="flex gap-2.5">
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" aria-hidden="true" />
            <input
              type="text"
              className="form-input"
              placeholder="ค้นหาชื่อสินค้า..."
              aria-label="ค้นหาชื่อสินค้า"
              value={globalFilter}
              onChange={(e) => {
                setGlobalFilter(e.target.value)
                setPagination((p) => ({ ...p, pageIndex: 0 }))
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 lg:flex-nowrap">
          {/* Page size: 10/25/50 ตาม pattern WalletTransactionTable */}
          <div>
            <select
              className="form-select"
              aria-label="จำนวนรายการต่อหน้า"
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
            >
              {[10, 25, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* role=region สำหรับ a11y (DataTable ไม่รับ caption prop) — เหมือน WalletTransactionTable */}
      <div role="region" aria-label="รายการสต็อกสินค้า">
        <DataTable<InventoryProductRow>
          table={table}
          emptyMessage={emptyMessage}
          mobileCard={(row) => {
            const p = row.original
            const tracked = p.stockQty !== null
            const outOfStock = p.stockQty === 0
            return (
              <div className="flex items-center gap-3 px-1 py-3.5">
                {/* leading: thumbnail สินค้า — tap target ≥44px */}
                <div className="size-10 shrink-0">
                  {p.image ? (
                    <Image
                      src={p.image}
                      alt={p.name}
                      width={40}
                      height={40}
                      className="size-10 rounded object-cover"
                    />
                  ) : (
                    <div className="bg-default-100 flex size-10 items-center justify-center rounded">
                      <Icon icon="package" className="text-default-300 size-5" />
                    </div>
                  )}
                </div>
                {/* main: ชื่อสินค้า + badge สถานะติดตาม/สต็อก */}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/products/${p.id}`}
                    className="hover:text-primary block truncate text-sm font-medium text-ink"
                  >
                    {p.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        'badge',
                        tracked ? 'bg-primary/15 text-primary' : 'bg-default-100 text-default-500',
                      )}
                    >
                      {tracked ? 'ติดตาม' : 'ไม่ติดตาม'}
                    </span>
                    {outOfStock && <span className="badge bg-danger/15 text-danger">หมด</span>}
                    {tracked && !outOfStock && (
                      <span className="text-default-500 text-xs tabular-nums">คงเหลือ {p.stockQty}</span>
                    )}
                  </div>
                </div>
                {/* trailing: ปุ่มแก้ไข — tap target ≥44px */}
                <Link
                  href={`/products/${p.id}/edit`}
                  className="btn btn-icon btn-sm border-default-300 text-default-800 hover:border-default-400 shrink-0 border"
                  aria-label={`แก้ไข ${p.name}`}
                >
                  <Icon icon="edit" className="text-base" />
                </Link>
              </div>
            )
          }}
        />
      </div>

      {table.getRowModel().rows.length > 0 && (
        <div className="card-footer">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            itemsName="สินค้า"
            showInfo
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

export default InventoryManagementTable
