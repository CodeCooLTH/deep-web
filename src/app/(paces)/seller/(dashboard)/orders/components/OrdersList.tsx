/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 *
 * Adaptations from theme:
 * - columns: token, buyer contact, orderType, status, createdAt, action (SafePay schema)
 * - Data comes from RSC props (ไม่ใช่ mock data จาก data.ts)
 * - createdAtISO รับเป็น ISO string จาก server; format เป็นไทยใน client
 * - filterFns: {} ใส่ไว้ใน useReactTable options ทุก instance (ป้องกัน warning)
 * - Status filter ผ่าน status tabs (Paces underline style) ไม่ใช่ select dropdown
 * - DeleteConfirmationModal: stripped (SafePay ไม่มี delete order จาก list)
 * - paymentStatus / paymentMethod / amount: stripped (SafePay ไม่มีในหน้านี้)
 * - "Add Order" link เปลี่ยนเป็น Link ธรรมดา (server component ไม่เกี่ยวข้อง — component นี้ client)
 * - ทุก Date object ผ่าน RSC→client แล้วเป็น string (createdAtISO)
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
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import type { OrderRow, OrderStatus } from './data'

// สถานะทั้งหมดของ SafePay Order — tabs สำหรับ filter
const STATUS_TABS: { value: string; label: string; dot?: string }[] = [
  { value: 'all',       label: 'ทั้งหมด' },
  { value: 'PENDING',   label: 'รอดำเนินการ', dot: 'bg-warning' },
  { value: 'SHIPPED',   label: 'จัดส่งแล้ว',  dot: 'bg-info' },
  { value: 'CONFIRMED', label: 'สำเร็จ',      dot: 'bg-success' },
  { value: 'CANCELLED', label: 'ยกเลิก',     dot: 'bg-danger' },
]

// สี badge แต่ละสถานะ SafePay
const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  PENDING:   { label: 'รอดำเนินการ', cls: 'bg-warning/15 text-warning' },
  SHIPPED:   { label: 'จัดส่งแล้ว',  cls: 'bg-info/15 text-info' },
  CONFIRMED: { label: 'สำเร็จ',      cls: 'bg-success/15 text-success' },
  CANCELLED: { label: 'ยกเลิก',     cls: 'bg-danger/15 text-danger' },
}

// แปลง order type เป็นภาษาไทย
const ORDER_TYPE_LABEL: Record<string, string> = {
  PHYSICAL: 'สินค้า',
  DIGITAL:  'ดิจิทัล',
  SERVICE:  'บริการ',
}

const columnHelper = createColumnHelper<OrderRow>()

type Props = {
  orders: OrderRow[]
  activeStatus: string
}

const OrdersList = ({ orders, activeStatus }: Props) => {
  const router = useRouter()

  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
  const [localStatus, setLocalStatus] = useState<string>(activeStatus ?? 'all')

  // กรอง orders ตาม status tab ที่เลือก (ทุก order fetch มาแล้ว)
  const filteredByStatus = useMemo(() => {
    if (localStatus === 'all' || !localStatus) return orders
    return orders.filter((o) => o.status === localStatus)
  }, [orders, localStatus])

  const columns = useMemo(
    () => [
      columnHelper.accessor('id', {
        header: 'คำสั่งซื้อ #',
        cell: ({ row }) => (
          <h5 className="text-sm font-medium font-mono">
            <Link
              href={`/orders/${row.original.publicToken}`}
              className="hover:text-primary"
            >
              #{row.original.id}
            </Link>
          </h5>
        ),
      }),
      columnHelper.accessor('buyer', {
        header: 'ผู้ซื้อ',
        cell: ({ getValue }) => (
          <span className="text-default-700">{getValue()}</span>
        ),
      }),
      columnHelper.accessor('orderType', {
        header: 'ประเภท',
        filterFn: 'equalsString',
        enableColumnFilter: true,
        cell: ({ getValue }) => {
          const v = getValue()
          return (
            <span className="badge bg-default-100 text-default-700">
              {ORDER_TYPE_LABEL[v] ?? v}
            </span>
          )
        },
      }),
      columnHelper.accessor('status', {
        header: 'สถานะ',
        filterFn: 'equalsString',
        enableColumnFilter: true,
        cell: ({ getValue }) => {
          const s = STATUS_META[getValue()] ?? { label: getValue(), cls: 'bg-default-100 text-default-700' }
          return <span className={cn('badge', s.cls)}>{s.label}</span>
        },
      }),
      columnHelper.accessor('createdAtISO', {
        header: 'วันที่สั่ง',
        cell: ({ getValue }) => {
          // แปลง ISO string → วันที่ภาษาไทยใน client
          const d = new Date(getValue())
          return (
            <span className="text-default-400 text-sm">
              {isNaN(d.getTime())
                ? '—'
                : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )
        },
      }),
      {
        id: 'action',
        header: () => <div className="text-center">จัดการ</div>,
        enableSorting: false,
        cell: ({ row }: { row: { original: OrderRow } }) => (
          <div className="flex justify-center gap-1.5">
            <Link
              href={`/orders/${row.original.publicToken}`}
              className="btn btn-icon btn-sm border border-default-300 text-default-800 hover:border-default-400"
            >
              <Icon icon="eye" className="text-base" />
            </Link>
          </div>
        ),
      },
    ],
    [],
  )

  const table = useReactTable({
    data: filteredByStatus,
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
    // filterFns object บังคับต้องมีแม้ว่าจะว่าง เพื่อหลีกเลี่ยง TanStack warning
    filterFns: {},
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  const handleStatusTab = (value: string) => {
    setLocalStatus(value)
    setPagination((p) => ({ ...p, pageIndex: 0 }))
    // sync URL search param เพื่อให้ reload แล้ว SSR render tab เดิม
    if (value === 'all') {
      router.push('/orders')
    } else {
      router.push(`?status=${value}`)
    }
  }

  // นับจำนวน order ต่อ status สำหรับ badge บน tab
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length }
    for (const o of orders) {
      counts[o.status] = (counts[o.status] ?? 0) + 1
    }
    return counts
  }, [orders])

  return (
    <div className="card">
      {/* Toolbar — search + page size + new order */}
      <div className="card-header">
        <div className="flex gap-2.5">
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" />
            <input
              type="text"
              className="form-input"
              placeholder="ค้นหาออเดอร์..."
              value={globalFilter}
              onChange={(e) => {
                setGlobalFilter(e.target.value)
                setPagination((p) => ({ ...p, pageIndex: 0 }))
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 lg:flex-nowrap">
          <div className="flex flex-wrap items-center gap-2.5 md:flex-nowrap">
            {/* Filter by order type */}
            <div className="input-icon-group">
              <Icon icon="package" className="input-icon" />
              <select
                className="form-select"
                value={(table.getColumn('orderType')?.getFilterValue() as string) ?? 'All'}
                onChange={(e) =>
                  table.getColumn('orderType')?.setFilterValue(
                    e.target.value === 'All' ? undefined : e.target.value,
                  )
                }
              >
                <option value="All">ประเภทออเดอร์</option>
                <option value="PHYSICAL">สินค้า</option>
                <option value="DIGITAL">ดิจิทัล</option>
                <option value="SERVICE">บริการ</option>
              </select>
            </div>
            {/* Page size */}
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
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/orders/new"
            className="btn bg-primary text-white hover:bg-primary-hover"
          >
            <Icon icon="plus" />
            สร้างออเดอร์
          </Link>
        </div>
      </div>

      {/* Status tabs — Paces underline style */}
      <div className="card-header px-0 pt-0 pb-0 border-b border-default-200">
        <div className="flex gap-1 px-5 overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const active = localStatus === tab.value
            const count = statusCounts[tab.value] ?? 0
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => handleStatusTab(tab.value)}
                className={cn(
                  'relative inline-flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap',
                  'border-b-2 transition-colors focus:outline-none',
                  active
                    ? 'text-primary border-primary'
                    : 'text-default-500 border-transparent hover:text-primary hover:border-default-400',
                )}
              >
                {tab.dot && (
                  <span className={cn('inline-block size-1.5 rounded-full', tab.dot)} />
                )}
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'inline-flex items-center justify-center rounded-full text-xs font-semibold leading-none px-2 py-0.5 min-w-5',
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

      <DataTable<OrderRow> table={table} emptyMessage="ไม่มีออเดอร์ในขณะนี้" />

      {table.getRowModel().rows.length > 0 && (
        <div className="card-footer">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            itemsName="ออเดอร์"
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

export default OrdersList
