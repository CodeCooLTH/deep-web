/**
 * ProductsTable — ตาราง listing สินค้า desktop (≥lg) — แยกออกจาก ProductsListing.tsx (orchestrator)
 * เมื่อมือถือย้ายไปใช้ ProductCard แยกใบ (ดู ProductsListing.tsx สำหรับ full-bleed mobile layout)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products/components/ProductsListing.tsx
 * ย้าย logic เดิมมาทั้งชุด (columns/useReactTable/pagination) ไม่เปลี่ยนยกเว้น 3 จุด:
 *   1. ปุ่มลบ: DeleteConfirmationModal + data-hs-overlay → pacesConfirm.danger (Swal) — HSOverlay ดิบขัด
 *      Hard Rule 8; ถ้าปล่อยไว้จะมีวิธียืนยันลบ 2 แบบระหว่างมือถือ (⋮ menu) / เดสก์ท็อป
 *   2. คอลัมน์ "ประเภท": ตัด .badge สีออก เหลือ icon+text (ลด noise สี — สีมีความหมายเฉพาะสถานะ)
 *   3. คอลัมน์ "สถานะ": คง badge สี แต่ text-success → text-success-ink (contrast AA บนพื้น /15)
 */

'use client'

import Rating from '@/components/Rating'
import { formatDateTime } from '@/lib/format-date'
import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Select from '@/components/wrappers/Select'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import { formatBaht } from '@/lib/format-money'
import { productMargin } from '@/lib/order-profit'
import {
  ColumnDef,
  ColumnFiltersState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  Row as TableRow,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { PRODUCT_TYPE_LABELS, type ProductRow } from './data'
import PinToggleButton, { type PinChangeResult } from './PinToggleButton'

const columnHelper = createColumnHelper<ProductRow>()

type Props = {
  products: ProductRow[]
  pinSlots: number
  pinnedCount: number
  onPinChange: (result: PinChangeResult) => void
  onDeleteRequest: (productId: string) => void
}

const ProductsTable = ({ products, pinSlots, pinnedCount, onPinChange, onDeleteRequest }: Props) => {
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  const columns: ColumnDef<ProductRow, any>[] = [
    columnHelper.accessor('name', {
      header: 'สินค้า',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="me-1 size-9 shrink-0">
            {row.original.image ? (
              <Image
                src={row.original.image}
                alt={row.original.name}
                width={36}
                height={36}
                className="rounded object-cover size-9"
              />
            ) : (
              <div className="bg-default-100 rounded size-9 flex items-center justify-center">
                <Icon icon="package" className="size-5 text-default-300" aria-hidden="true" />
              </div>
            )}
          </div>
          <div>
            <h5 className="mb-0.5">
              <Link href={`/products/${row.original.id}`} className="hover:text-primary font-medium">
                {row.original.name}
              </Link>
            </h5>
            <p className="text-default-400 text-2xs line-clamp-1 max-w-[180px]"> {/* HR7 carve-out: คงจากไฟล์เดิม — ไม่มี Paces token ล็อกความกว้าง sub-text ในคอลัมน์ตาราง */}
              {row.original.description || '—'}
            </p>
          </div>
        </div>
      ),
    }),
    columnHelper.accessor('type', {
      header: 'ประเภท',
      filterFn: 'equalsString',
      enableColumnFilter: true,
      // เปลี่ยน 2: ตัด badge สีออก เหลือ icon+text เรียบ — สีมีความหมายเฉพาะคอลัมน์สถานะ
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs text-default-600">
          {PRODUCT_TYPE_LABELS[row.original.type]}
        </span>
      ),
    }),
    columnHelper.accessor('price', {
      header: 'ราคา',
      enableColumnFilter: true,
      cell: ({ row }) => (
        <span>฿{new Intl.NumberFormat('th-TH').format(row.original.price)}</span>
      ),
    }),
    // ต้นทุน + มาร์จิ้น รวมเป็นคอลัมน์เดียว 2 บรรทัด (ux Design Spec S3)
    //
    // ทำไมไม่แยก 2 คอลัมน์ตามตัวอักษรของ AC: ตารางนี้กว้าง ~1,254px ตั้งแต่ก่อนเพิ่มฟีเจอร์นี้
    // ซึ่งล้นพื้นที่ content ที่ 1366px อยู่แล้ว (มี overflow-x-auto มาแต่ธีม) แยก 2 คอลัมน์
    // กิน ~150-180px รวมเป็นคอลัมน์เดียวกิน ~110px — และตารางนี้มี precedent อยู่แล้วคือ
    // คอลัมน์ "สินค้า" ที่รวมชื่อ+คำอธิบายไว้ 2 บรรทัดในเซลล์เดียว จึงไม่ใช่ pattern ใหม่
    columnHelper.accessor('cost', {
      header: () => (
        <span className="flex flex-col leading-tight">
          <span>ต้นทุน</span>
          <span className="text-default-400 text-2xs font-normal">กำไร %</span>
        </span>
      ),
      enableColumnFilter: false,
      cell: ({ row }) => {
        const { cost, price } = row.original
        const margin = productMargin({ price, cost })
        // cost = null คือ "ยังไม่รู้ต้นทุน" ไม่ใช่ "ต้นทุน 0" — แสดง — ครั้งเดียวไม่ใช่ 2 บรรทัด
        // เพราะไม่มีอะไรให้อ่านสองชั้น (FR-EXP-15-AC-02)
        if (cost === null) return <span className="text-default-400">—</span>
        const isLoss = margin !== null && margin < 0
        return (
          <span className="flex flex-col leading-tight">
            <span className="text-default-700 tabular-nums">{formatBaht(cost)}</span>
            <span
              className={`text-2xs tabular-nums ${isLoss ? 'text-danger-ink' : 'text-default-500'}`}
            >
              {margin === null ? (
                '—'
              ) : (
                <>
                  {isLoss && (
                    <Icon icon="alert-triangle" className="me-0.5 inline size-3" aria-hidden="true" />
                  )}
                  {margin.toLocaleString('th-TH', { maximumFractionDigits: 1 })}%
                </>
              )}
            </span>
          </span>
        )
      },
    }),
    columnHelper.accessor('isActive', {
      header: 'สถานะ',
      filterFn: 'equals',
      enableColumnFilter: true,
      // เปลี่ยน 3: text-success → text-success-ink (contrast AA บนพื้น bg-success/10)
      cell: ({ row }) => (
        <span
          className={cn(
            'badge py-0 font-semibold text-2xs',
            row.original.isActive ? 'bg-success/10 text-success-ink' : 'bg-default-200 text-default-700',
          )}
        >
          {row.original.isActive ? 'เปิดขาย' : 'ซ่อน'}
        </span>
      ),
    }),
    columnHelper.accessor('pinnedAt', {
      header: 'ปักหมุด',
      cell: ({ row }) => (
        <PinToggleButton
          productId={row.original.id}
          pinnedAt={row.original.pinnedAt}
          isActive={row.original.isActive}
          pinSlots={pinSlots}
          pinnedCount={pinnedCount}
          onChange={onPinChange}
        />
      ),
    }),
    columnHelper.accessor('totalSold', {
      header: 'ขายแล้ว',
      cell: ({ row }) => <span>{new Intl.NumberFormat('th-TH').format(row.original.totalSold)}</span>,
    }),
    columnHelper.accessor('rating', {
      header: 'เรตติ้ง',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Rating rating={row.original.rating} />
          <span className="ms-1 text-default-400 text-xs">({row.original.reviews})</span>
        </div>
      ),
    }),
    columnHelper.accessor('createdAt', {
      header: 'วันที่เพิ่ม',
      cell: ({ row }) => {
        // createdAt เป็น ISO string ที่แปลงแล้วที่ server boundary — รวม date+time ใน cell เดียว
        return <span>{formatDateTime(row.original.createdAt)}</span>
      },
    }),
    {
      id: 'action',
      header: () => <div className="text-center mx-auto">การจัดการ</div>,
      cell: ({ row }: { row: TableRow<ProductRow> }) => (
        <div className="flex justify-center gap-1.5">
          <Link
            href={`/products/${row.original.id}`}
            className="btn btn-icon btn-sm border border-default-300 text-default-800 hover:border-default-400"
          >
            <Icon icon="eye" className="text-base" />
          </Link>
          <Link
            href={`/products/${row.original.id}/edit`}
            className="btn btn-icon btn-sm border border-default-300 text-default-800 hover:border-default-400"
          >
            <Icon icon="pencil" className="text-base" />
          </Link>
          {/* เปลี่ยน 1: pacesConfirm.danger แทน DeleteConfirmationModal + data-hs-overlay */}
          <button
            type="button"
            className="btn btn-icon btn-sm border border-default-300 text-default-800 hover:border-default-400"
            onClick={() => onDeleteRequest(row.original.id)}
          >
            <Icon icon="trash" className="text-base" />
          </button>
        </div>
      ),
    },
  ]

  const table = useReactTable({
    data: products,
    columns,
    state: { sorting, globalFilter, columnFilters, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
    filterFns: {},
    enableColumnFilters: true,
    enableRowSelection: false,
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  const TYPE_OPTIONS = [
    { value: 'All', label: 'ทุกประเภท' },
    { value: 'PHYSICAL', label: PRODUCT_TYPE_LABELS.PHYSICAL },
    { value: 'DIGITAL', label: PRODUCT_TYPE_LABELS.DIGITAL },
    { value: 'SERVICE', label: PRODUCT_TYPE_LABELS.SERVICE },
    { value: 'SUBSCRIPTION', label: PRODUCT_TYPE_LABELS.SUBSCRIPTION },
  ]
  const currentTypeFilter = (table.getColumn('type')?.getFilterValue() as string) ?? 'All'

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex gap-2.5">
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" />
            <input
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
              type="text"
              className="form-input"
              placeholder="ค้นหาชื่อสินค้า..."
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 md:flex-nowrap">
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:gap-3">
            <span className="font-semibold">กรอง:</span>
            <div className="input-icon-group w-full">
              <Icon icon="tag" className="input-icon" />
              <Select
                className="form-select"
                classNamePrefix="react-select"
                isSearchable={false}
                options={TYPE_OPTIONS}
                value={TYPE_OPTIONS.find((o) => o.value === currentTypeFilter) ?? TYPE_OPTIONS[0]}
                onChange={(opt: any) =>
                  table.getColumn('type')?.setFilterValue(opt?.value === 'All' ? undefined : opt?.value)
                }
              />
            </div>
          </div>
          <div>
            <select
              className="form-select"
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
            >
              {[5, 8, 10, 15, 20].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* badge indicator "ปักหมุด n/m" (feature 00013 Pin Products) — ก่อนปุ่มเพิ่มสินค้า */}
          <span className="badge bg-primary/15 text-primary-ink inline-flex items-center gap-1">
            <Icon icon="tabler:pin-filled" className="size-3.5" />
            ปักหมุด {pinnedCount}/{pinSlots}
          </span>
          <Link href="/products/new" className="btn bg-primary text-white hover:bg-primary-hover">
            <Icon icon="plus" />
            เพิ่มสินค้า
          </Link>
        </div>
      </div>

      <DataTable<ProductRow> table={table} emptyMessage="ไม่พบสินค้า" />

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

export default ProductsTable
