/**
 * ProductsListing — ตาราง listing สินค้าของ seller
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products/components/ProductsListing.tsx
 * เปลี่ยน:
 *   - columns: name, type, price, status (isActive), totalSold, rating, createdAt, actions
 *     (ตัด sku/category/stock/orders/reviews rating inline; เพิ่ม createdAt column)
 *   - data comes from server (props) — ไม่ใช้ productData mock
 *   - filter by type (PHYSICAL/DIGITAL/SERVICE/SUBSCRIPTION) แทน category
 *   - delete ผ่าน API route แทน local state
 *   - filterFns: {} ใส่ใน useReactTable options ตาม constraint
 *   - Select wrapper แทน native select (ทำแล้วตาม original SafePay version)
 *   - UI copy ภาษาไทย
 *   - T10 (v10): mobile toolbar (search pill + filter chips + ปุ่มเพิ่มสินค้า) + re-skin mobileCard
 *     (icon Solar duotone, thumb 62px, badge status ตาม spec §7, isActive chip filter)
 */

'use client'

import Rating from '@/components/Rating'
import { formatDateTime } from '@/lib/format-date'
import DataTable from '@/components/table/DataTable'
import DeleteConfirmationModal from '@/components/table/DeleteConfirmationModal'
import TablePagination from '@/components/table/TablePagination'
import Select from '@/components/wrappers/Select'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
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
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { pacesToast } from '@/lib/paces-toast'
import type { ProductRow } from './data'

const TYPE_LABELS: Record<ProductRow['type'], string> = {
  PHYSICAL: 'สินค้าจับต้องได้',
  DIGITAL: 'ดิจิทัล',
  SERVICE: 'บริการ',
  SUBSCRIPTION: 'สมาชิก/รอบ',
}

const TYPE_COLORS: Record<ProductRow['type'], string> = {
  PHYSICAL: 'bg-primary/10 text-primary',
  DIGITAL: 'bg-info/10 text-info',
  SERVICE: 'bg-success/10 text-success',
  SUBSCRIPTION: 'bg-warning/10 text-warning',
}

const columnHelper = createColumnHelper<ProductRow>()

type Props = {
  products: ProductRow[]
}

const ProductsListing = ({ products }: Props) => {
  const router = useRouter()
  const [data, setData] = useState<ProductRow[]>(() => [...products])
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
                <Icon icon="package" className="size-5 text-default-300" />
              </div>
            )}
          </div>
          <div>
            <h5 className="mb-0.5">
              <Link href={`/products/${row.original.id}`} className="hover:text-primary font-medium">
                {row.original.name}
              </Link>
            </h5>
            <p className="text-default-400 text-2xs line-clamp-1 max-w-[180px]">
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
      cell: ({ row }) => (
        <span className={cn('badge py-0 font-semibold text-2xs', TYPE_COLORS[row.original.type])}>
          {TYPE_LABELS[row.original.type]}
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
    columnHelper.accessor('isActive', {
      header: 'สถานะ',
      // T10: เพิ่ม filterFn 'equals' + enableColumnFilter เพื่อให้ mobile chip filter ทำงานได้
      // (boolean column ต้องใช้ 'equals' ไม่ใช่ 'equalsString')
      filterFn: 'equals',
      enableColumnFilter: true,
      cell: ({ row }) => (
        <span
          className={cn(
            'badge py-0 font-semibold text-2xs',
            row.original.isActive ? 'bg-success/10 text-success' : 'bg-default-200 text-default-700',
          )}
        >
          {row.original.isActive ? 'เปิดขาย' : 'ซ่อน'}
        </span>
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
          <button
            type="button"
            className="btn btn-icon btn-sm border border-default-300 text-default-800 hover:border-default-400"
            onClick={() => {
              'use no memo'
              setDeletingId(row.original.id)
            }}
            data-hs-overlay="#confirm-delete-modal"
            suppressHydrationWarning
          >
            <Icon icon="trash" className="text-base" />
          </button>
        </div>
      ),
    },
  ]

  const table = useReactTable({
    data,
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

  const handleDelete = async () => {
    const id = deletingId
    if (!id) return
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('ลบไม่สำเร็จ')
      setData((prev) => prev.filter((p) => p.id !== id))
      setDeletingId(null)
      setPagination({ ...pagination, pageIndex: 0 })
      pacesToast.success('ลบสินค้าเรียบร้อย')
      router.refresh()
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด ลบสินค้าไม่สำเร็จ')
    } finally {
      window.HSOverlay?.close('#confirm-delete-modal')
    }
  }

  const TYPE_OPTIONS = [
    { value: 'All', label: 'ทุกประเภท' },
    { value: 'PHYSICAL', label: 'สินค้าจับต้องได้' },
    { value: 'DIGITAL', label: 'ดิจิทัล' },
    { value: 'SERVICE', label: 'บริการ' },
    { value: 'SUBSCRIPTION', label: 'สมาชิก/รอบ' },
  ]
  const currentTypeFilter = (table.getColumn('type')?.getFilterValue() as string) ?? 'All'

  // HR7: isActive chip filter state — ใช้ 3 ค่า (all/active/inactive)
  // "สินค้าหมด" ไม่มี field จริงใน ProductRow (ไม่มี stockQty) → ไม่เพิ่ม chip
  const [activeChip, setActiveChip] = useState<'all' | 'active' | 'inactive'>('all')

  const handleChipChange = (chip: 'all' | 'active' | 'inactive') => {
    setActiveChip(chip)
    if (chip === 'all') {
      table.getColumn('isActive')?.setFilterValue(undefined)
    } else {
      table.getColumn('isActive')?.setFilterValue(chip === 'active')
    }
  }

  const MOBILE_STATUS_CHIPS = [
    { key: 'all' as const, label: 'ทั้งหมด' },
    { key: 'active' as const, label: 'เปิดขาย' },
    { key: 'inactive' as const, label: 'ปิดการขาย' },
  ]

  return (
    <div className="card">
      {/* ===== Mobile toolbar (ซ่อนบน md ขึ้นไป) ===== */}
      {/* HR7: mobile toolbar แยกจาก desktop card-header เพื่อ re-skin ตาม spec §7
          ไม่มี Paces layout token สำหรับ mobile-specific toolbar — ใช้ flex + overflow-x-auto */}
      <div className="lg:hidden px-4 pt-3 pb-2 space-y-2.5">
        {/* Row 1: search pill + ปุ่มเพิ่มสินค้า */}
        <div className="flex items-center gap-2">
          {/* search pill — icon solar:magnifer-linear ตาม spec §7 */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-default-400">
              <Icon icon="solar:magnifer-linear" className="size-4" />
            </span>
            <input
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
              type="text"
              className="form-input pl-9 rounded-full text-sm w-full"
              placeholder="ค้นหาสินค้า..."
            />
          </div>
          {/* ปุ่มเพิ่มสินค้า mobile: btn btn-sm bg-primary text-white + icon solar:add-square-bold-duotone */}
          <Link
            href="/products/new"
            /* min-h-11 (44px): mobile tap-target ≥44px — btn-sm สูง ~31px ไม่พอ (HR7 arbitrary: ไม่มี touch-min token) */
            className="btn btn-sm bg-primary text-white hover:bg-primary-hover shrink-0 flex items-center gap-1.5 min-h-11 rounded-full"
          >
            <Icon icon="solar:add-square-bold-duotone" className="size-4" />
            <span className="sm:hidden">เพิ่ม</span>
            <span className="hidden sm:inline">เพิ่มสินค้า</span>
          </Link>
        </div>
        {/* Row 2: filter chips เลื่อนแนวนอน (overflow-x-auto ตาม spec §7 + HR7 comment) */}
        {/* HR7: overflow-x-auto + whitespace-nowrap = Tailwind utility — Paces ไม่มี horizontal scroll token; no-scrollbar = safepay-overrides.css */}
        <div className="overflow-x-auto whitespace-nowrap -mx-4 px-4 no-scrollbar">
          <div className="inline-flex gap-2">
            {MOBILE_STATUS_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => handleChipChange(chip.key)}
                className={cn(
                  'badge text-xs font-medium px-3 py-1 rounded-full cursor-pointer border',
                  activeChip === chip.key
                    ? 'bg-primary text-white border-primary'
                    : 'bg-default-100 text-default-500 border-transparent',
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Desktop card-header (ซ่อนบน mobile — ไม่แตะ desktop logic) ===== */}
      <div className="card-header hidden lg:flex">
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
          <Link href="/products/new" className="btn bg-primary text-white hover:bg-primary-hover">
            <Icon icon="plus" />
            เพิ่มสินค้า
          </Link>
        </div>
      </div>

      <DataTable<ProductRow>
        table={table}
        emptyMessage="ไม่พบสินค้า"
        mobileCard={(row) => {
          const p = row.original
          const priceStr = `฿${new Intl.NumberFormat('th-TH').format(p.price)}`
          return (
            <div className="flex items-center gap-3 px-4 py-3.5">
              {/* leading: รูปสินค้า 62px (HR7: size-[62px] = arbitrary เพราะ Paces ไม่มี token ขนาดนี้; spec §7 กำหนด 62px) */}
              <div className="size-[62px] shrink-0">
                {p.image ? (
                  <Image
                    src={p.image}
                    alt={p.name}
                    width={62}
                    height={62}
                    className="size-[62px] rounded-lg object-cover"
                  />
                ) : (
                  <div className="size-[62px] rounded-lg bg-default-100 flex items-center justify-center">
                    {/* icon solar duotone แทน package Tabler ตาม spec §7 + หลักการ §3 */}
                    <Icon icon="solar:box-bold-duotone" className="size-7 text-default-300" />
                  </div>
                )}
              </div>

              {/* main: ชื่อ (link → detail) + ราคา (text-primary font-bold ตาม spec §7) + badge สถานะ */}
              <div className="min-w-0 flex-1">
                <Link
                  href={`/products/${p.id}`}
                  className="text-sm font-medium text-ink hover:text-primary block truncate"
                >
                  {p.name}
                </Link>
                {/* ราคา text-primary font-bold ตาม spec §7 */}
                <p className="text-sm font-bold text-primary mt-0.5">{priceStr}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={cn('badge py-0 text-2xs font-semibold leading-tight', TYPE_COLORS[p.type])}>
                    {TYPE_LABELS[p.type]}
                  </span>
                  {/* badge สถานะ: เปิดขาย bg-success/15 text-success / ปิดการขาย bg-default-100 text-default-500 ตาม spec §7 */}
                  <span className={cn(
                    'badge py-0 text-2xs font-semibold leading-tight',
                    p.isActive ? 'bg-success/15 text-success' : 'bg-default-100 text-default-500',
                  )}>
                    {p.isActive ? 'เปิดขาย' : 'ปิดการขาย'}
                  </span>
                </div>
              </div>

              {/* trailing: ขายแล้ว + action icons */}
              <div className="shrink-0 text-right flex flex-col items-end gap-1.5">
                <p className="text-xs text-default-400 leading-tight whitespace-nowrap">
                  ขายแล้ว {new Intl.NumberFormat('th-TH').format(p.totalSold)}
                </p>
                {/* action: แก้ไข (solar:pen-2-linear ตาม spec §7) / ลบ — touch ≥44px */}
                <div className="flex items-center gap-1.5">
                  <Link
                    href={`/products/${p.id}/edit`}
                    className="btn btn-icon border border-default-300 text-default-800 hover:border-default-400 !size-11 min-h-0"
                    aria-label="แก้ไขสินค้า"
                  >
                    {/* icon solar:pen-2-linear แทน pencil Tabler ตาม spec §7 */}
                    <Icon icon="solar:pen-2-linear" className="text-base" />
                  </Link>
                  <button
                    type="button"
                    className="btn btn-icon border border-default-300 text-default-800 hover:border-default-400 !size-11 min-h-0"
                    onClick={() => {
                      'use no memo'
                      setDeletingId(p.id)
                    }}
                    data-hs-overlay="#confirm-delete-modal"
                    suppressHydrationWarning
                    aria-label="ลบสินค้า"
                  >
                    {/* ไม่มี solar trash duotone variant ที่ชัดเจนพอสำหรับ destructive action — ใช้ solar:trash-bin-2-bold-duotone */}
                    <Icon icon="solar:trash-bin-2-bold-duotone" className="text-base text-danger" />
                  </button>
                </div>
              </div>
            </div>
          )
        }}
      />

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

      <DeleteConfirmationModal
        onConfirm={handleDelete}
        selectedCount={deletingId ? 1 : 0}
        itemName="สินค้า"
        modalTitle="ยืนยันการลบ"
        confirmButtonText="ลบ"
        cancelButtonText="ยกเลิก"
      />
    </div>
  )
}

export default ProductsListing
