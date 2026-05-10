'use client'

import Rating from '@/components/Rating'
import DataTable from '@/components/table/DataTable'
import DeleteConfirmationModal from '@/components/table/DeleteConfirmationModal'
import TablePagination from '@/components/table/TablePagination'
import Select from '@/components/wrappers/Select'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'react-toastify'
import type { ProductRow } from './data'

const STATUS_TABS: { value: string; label: string; icon: string; dot?: string }[] = [
  { value: 'all', label: 'ทั้งหมด', icon: 'list' },
  // Future: { value: 'ACTIVE', label: 'เปิดขาย', icon: 'eye', dot: 'bg-success' },
  //         { value: 'HIDDEN', label: 'ซ่อน',    icon: 'eye-off', dot: 'bg-default-400' },
]

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
  const [sorting, setSorting] = useState<any[]>([])
  const [columnFilters, setColumnFilters] = useState<any[]>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('all')

  // Counts per tab for the badges (only "ทั้งหมด" for now)
  const tabCounts: Record<string, number> = {
    all: products.length,
  }

  const columns = [
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
      cell: ({ row }) => (
        <span className={cn('badge py-0 font-semibold text-2xs', TYPE_COLORS[row.original.type])}>
          {TYPE_LABELS[row.original.type]}
        </span>
      ),
      filterFn: 'equalsString',
      enableColumnFilter: true,
    }),
    columnHelper.accessor('price', {
      header: 'ราคา',
      cell: ({ row }) => (
        <span>฿{new Intl.NumberFormat('th-TH').format(row.original.price)}</span>
      ),
    }),
    columnHelper.accessor('isActive', {
      header: 'สถานะ',
      cell: ({ row }) => (
        <span
          className={cn(
            'badge py-0 font-semibold text-2xs',
            row.original.isActive ? 'bg-success/10 text-success' : 'bg-default-200 text-default-700'
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
    {
      id: 'action',
      header: () => <div className="text-center mx-auto">การจัดการ</div>,
      cell: ({ row }: any) => (
        <div className="flex justify-center gap-1.5">
          <Link
            href={`/products/${row.original.id}`}
            className="btn btn-icon size-7.75 border border-default-300 text-default-800 hover:border-default-400"
          >
            <Icon icon="eye" className="text-base" />
          </Link>
          <Link
            href={`/products/${row.original.id}/edit`}
            className="btn btn-icon size-7.75 border border-default-300 text-default-800 hover:border-default-400"
          >
            <Icon icon="pencil" className="text-base" />
          </Link>
          <button
            type="button"
            className="btn btn-icon size-7.75 border border-default-300 text-default-800 hover:border-default-400"
            onClick={() => {
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
    enableRowSelection: true,
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
      toast.success('ลบสินค้าเรียบร้อย')
      router.refresh()
    } catch {
      toast.error('เกิดข้อผิดพลาด ลบสินค้าไม่สำเร็จ')
    } finally {
      window.HSOverlay?.close('#confirm-delete-modal')
    }
  }

  return (
    <div className="card">
      {/* Status Tabs — paces underline style (matches /orders) */}
      <div className="card-header px-0 pt-0 pb-0 border-b border-default-200">
        <div className="flex gap-1 px-5 overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const active = activeTab === tab.value
            const count = tabCounts[tab.value] ?? 0
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'relative inline-flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap',
                  'border-b-2 transition-colors focus:outline-none',
                  active
                    ? 'text-primary border-primary'
                    : 'text-default-500 border-transparent hover:text-primary hover:border-default-400',
                )}
              >
                {tab.dot && <span className={cn('inline-block size-1.5 rounded-full', tab.dot)} />}
                <Icon icon={tab.icon} className="size-4" />
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'inline-flex items-center justify-center rounded-full text-xs font-semibold leading-none px-2 py-0.5 min-w-[1.25rem]',
                    active ? 'bg-primary text-white' : 'bg-default-100 text-default-700',
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

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
          <div className="items-center gap-3 md:flex">
            <span className="font-semibold">กรอง:</span>
            <div className="flex items-center gap-2">
              <Icon icon="tag" className="text-default-400" />
              <div className="w-48">
                {(() => {
                  const TYPE_OPTIONS = [
                    { value: 'All', label: 'ทุกประเภท' },
                    { value: 'PHYSICAL', label: 'สินค้าจับต้องได้' },
                    { value: 'DIGITAL', label: 'ดิจิทัล' },
                    { value: 'SERVICE', label: 'บริการ' },
                    { value: 'SUBSCRIPTION', label: 'สมาชิก/รอบ' },
                  ]
                  const current = (table.getColumn('type')?.getFilterValue() as string) ?? 'All'
                  return (
                    <Select
                      className="select2 react-select"
                      classNamePrefix="react-select"
                      isSearchable={false}
                      options={TYPE_OPTIONS}
                      value={TYPE_OPTIONS.find((o) => o.value === current) ?? null}
                      onChange={(opt: any) =>
                        table.getColumn('type')?.setFilterValue(opt?.value === 'All' ? undefined : opt?.value)
                      }
                    />
                  )
                })()}
              </div>
            </div>
          </div>
          <div className="w-24">
            <Select
              className="select2 react-select"
              classNamePrefix="react-select"
              isSearchable={false}
              options={[
                { value: 5, label: '5' },
                { value: 10, label: '10' },
                { value: 15, label: '15' },
                { value: 20, label: '20' },
              ]}
              value={{
                value: table.getState().pagination.pageSize,
                label: String(table.getState().pagination.pageSize),
              }}
              onChange={(opt: any) => table.setPageSize(Number(opt?.value ?? 10))}
            />
          </div>
        </div>
        <div>
          <Link href="/products/new" className="btn bg-primary text-white hover:bg-primary-hover">
            <Icon icon="plus" />
            เพิ่มสินค้า
          </Link>
        </div>
      </div>

      <DataTable table={table} emptyMessage="ไม่พบสินค้า" />

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
