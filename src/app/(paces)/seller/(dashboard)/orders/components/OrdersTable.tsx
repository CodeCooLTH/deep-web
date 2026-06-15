/**
 * OrdersTable — desktop table view (≥lg) สำหรับ seller /orders
 *
 * ใช้ DataTable + TanStack react-table ตามแบบ Paces theme
 * mobile/tablet (<lg) ใช้ OrdersList card layout เดิม (ไฟล์นี้ไม่แตะ)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 */

'use client'

import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Icon from '@/components/wrappers/Icon'
import { cn } from '@/utils/helpers'
import {
  ColumnFiltersState,
  createColumnHelper,
  FilterFn,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  Row as TableRow,
  Table as TableType,
  useReactTable,
  SortingState,
} from '@tanstack/react-table'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { PAYMENT_LABELS, PAYMENT_ICONS, type OrderRow } from './data'

// ─── status badge config ──────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING:   { label: 'รอดำเนินการ', className: 'bg-warning/15 text-warning' },
  SHIPPED:   { label: 'จัดส่งแล้ว',  className: 'bg-primary/15 text-primary' },
  CONFIRMED: { label: 'สำเร็จ',      className: 'bg-success/15 text-success' },
  CANCELLED: { label: 'ยกเลิก',      className: 'bg-danger/15 text-danger'   },
}

// ─── order type label ─────────────────────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = {
  PHYSICAL:     'สินค้า',
  DIGITAL:      'ดิจิทัล',
  SERVICE:      'บริการ',
  SUBSCRIPTION: 'สมัครสมาชิก',
}

// ─── date range filter (adapt จาก theme dateRangeFilterFn) ───────────────────
const dateRangeFilterFn: FilterFn<OrderRow> = (row, _columnId, selectedRange) => {
  if (!selectedRange || selectedRange === 'All') return true
  const iso = row.original.createdAtISO
  if (!iso) return false
  const cellDate = new Date(iso)
  if (isNaN(cellDate.getTime())) return false
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfToday   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  switch (selectedRange) {
    case 'Today':
      return cellDate >= startOfToday && cellDate < endOfToday
    case 'Last 7 Days': {
      const s = new Date(now); s.setDate(now.getDate() - 7)
      return cellDate >= s && cellDate < endOfToday
    }
    case 'Last 30 Days': {
      const s = new Date(now); s.setDate(now.getDate() - 30)
      return cellDate >= s && cellDate < endOfToday
    }
    case 'This Year': {
      const s = new Date(now.getFullYear(), 0, 1)
      const e = new Date(now.getFullYear() + 1, 0, 1)
      return cellDate >= s && cellDate < e
    }
    default:
      return true
  }
}

// ─── format ISO → ไทย "15 มิ.ย. 2569" ───────────────────────────────────────
function formatThaiDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('th-TH', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch {
    return iso
  }
}

const columnHelper = createColumnHelper<OrderRow>()

type Props = {
  orders: OrderRow[]
}

export default function OrdersTable({ orders }: Props) {
  const [globalFilter,   setGlobalFilter]   = useState('')
  const [sorting,        setSorting]        = useState<SortingState>([])
  const [columnFilters,  setColumnFilters]  = useState<ColumnFiltersState>([])
  const [pagination,     setPagination]     = useState({ pageIndex: 0, pageSize: 10 })

  // ─── columns (adapt จาก theme; ปรับ field ให้ตรง OrderRow) ───────────────
  const columns = [
    // ─ checkbox select ─
    {
      id: 'select',
      header: ({ table }: { table: TableType<OrderRow> }) => (
        <input
          type="checkbox"
          className="form-checkbox form-checkbox-light size-4.5"
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      ),
      cell: ({ row }: { row: TableRow<OrderRow> }) => (
        <input
          type="checkbox"
          className="form-checkbox form-checkbox-light size-4.5"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
      enableSorting: false,
      enableColumnFilter: false,
    },

    // ─ เลขออเดอร์ ─
    columnHelper.accessor('id', {
      header: 'เลขออเดอร์',
      cell: ({ row }) => (
        <h5 className="text-sm font-medium">
          <Link href={`/orders/${row.original.publicToken}`} className="hover:text-primary">
            #{row.original.id.toUpperCase()}
          </Link>
        </h5>
      ),
    }),

    // ─ ลูกค้า ─
    columnHelper.accessor('buyerName', {
      header: 'ลูกค้า',
      cell: ({ row }) => {
        const { buyerName, buyer, buyerPhone, buyerUsername } = row.original
        const displayName = buyerName ?? 'ลูกค้า'
        return (
          <div className="flex items-center gap-3">
            {/* avatar placeholder — ไม่มี image ใน OrderRow จึงใช้ initial */}
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              {/* verified check หน้าชื่อ (ตรงกับ mobile) + inline (flex กัน icon เด้งลงบรรทัด) */}
              <p className="flex items-center gap-1 font-medium text-default-900">
                {buyerUsername && (
                  <Icon icon="rosette-discount-check-filled" className="shrink-0 text-sm text-primary" />
                )}
                <span className="truncate">{displayName}</span>
              </p>
              <p className="text-xs text-default-400">
                {/* แสดงเบอร์จริง (seller เห็นลูกค้าตัวเอง) หรือ masked contact */}
                {buyerPhone ?? buyer}
              </p>
            </div>
          </div>
        )
      },
    }),

    // ─ สินค้า ─
    columnHelper.accessor('items', {
      header: 'สินค้า',
      enableSorting: false,
      cell: ({ row }) => {
        const items = row.original.items
        if (!items || items.length === 0) {
          return <span className="text-default-400 text-sm">—</span>
        }
        const first = items[0]
        const extra = items.length - 1
        return (
          <div className="flex items-center gap-2.5">
            {first.imageUrl ? (
              <Image
                src={first.imageUrl}
                alt={first.name}
                width={36}
                height={36}
                className="size-9 rounded-lg object-cover"
              />
            ) : (
              /* placeholder เมื่อไม่มีรูป */
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-default-100">
                <Icon icon="package" className="text-sm text-default-400" />
              </div>
            )}
            <div>
              <p className="line-clamp-1 text-sm font-medium text-default-900">{first.name}</p>
              {extra > 0 && (
                <p className="text-xs text-default-400">+{extra} รายการ</p>
              )}
            </div>
          </div>
        )
      },
    }),

    // ─ ประเภท ─
    columnHelper.accessor('orderType', {
      header: 'ประเภท',
      filterFn: 'equalsString',
      enableColumnFilter: true,
      cell: ({ row }) => (
        <span className="text-sm text-default-700">
          {TYPE_LABEL[row.original.orderType] ?? row.original.orderType}
        </span>
      ),
    }),

    // ─ ยอดรวม ─
    columnHelper.accessor('total', {
      header: 'ยอดรวม',
      cell: ({ row }) => (
        <span className="tabular-nums text-sm font-semibold text-default-900">
          ฿{row.original.total.toLocaleString('th-TH')}
        </span>
      ),
    }),

    // ─ การชำระเงิน ─
    columnHelper.accessor('paymentMethod', {
      header: 'การชำระเงิน',
      cell: ({ row }) => {
        const pm = row.original.paymentMethod
        if (!pm) return <span className="text-sm text-default-400">—</span>
        return (
          <span className="inline-flex items-center gap-1.5 text-sm text-default-700">
            <Icon icon={PAYMENT_ICONS[pm] ?? 'wallet'} className="text-base text-default-500" />
            {PAYMENT_LABELS[pm] ?? pm}
          </span>
        )
      },
    }),

    // ─ วันที่ ─
    columnHelper.accessor('createdAtISO', {
      header: 'วันที่',
      filterFn: dateRangeFilterFn,
      enableColumnFilter: true,
      cell: ({ row }) => (
        <span className="text-sm text-default-700">
          {formatThaiDate(row.original.createdAtISO)}
        </span>
      ),
    }),

    // ─ สถานะ ─
    columnHelper.accessor('status', {
      header: 'สถานะ',
      filterFn: 'equalsString',
      enableColumnFilter: true,
      cell: ({ row }) => {
        const cfg = STATUS_CONFIG[row.original.status] ?? { label: row.original.status, className: 'bg-default-200 text-default-600' }
        return <span className={cn('badge', cfg.className)}>{cfg.label}</span>
      },
    }),

    // ─ action ─
    {
      id: 'action',
      header: () => <div className="text-center">จัดการ</div>,
      cell: ({ row }: { row: TableRow<OrderRow> }) => {
        const o = row.original
        const canEdit = o.status === 'PENDING'
        // icon buttons แบบ Paces theme (👁 ดู / ✏️ แก้) — next/link ใน 'use client' (Hard Rule 2 ผ่าน)
        return (
          <div className="flex justify-center gap-1.5">
            <Link
              href={`/orders/${o.publicToken}`}
              className="btn btn-sm border-default-300 text-default-700 hover:bg-default-100"
            >
              <Icon icon="eye" className="text-base" />
              ดูรายละเอียด
            </Link>
            {canEdit && (
              <Link
                href={`/orders/${o.publicToken}/edit`}
                className="btn btn-sm border-default-300 text-default-700 hover:bg-default-100"
              >
                <Icon icon="pencil" className="text-base" />
                แก้ไข
              </Link>
            )}
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data: orders,
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
    enableColumnFilters: true,
    enableRowSelection: true,
    filterFns: {
      dateRange: dateRangeFilterFn,
    },
  })

  const pageIndex  = table.getState().pagination.pageIndex
  const pageSize   = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start      = pageIndex * pageSize + 1
  const end        = Math.min(start + pageSize - 1, totalItems)

  return (
    <div className="card">
      {/* ─── card-header: search + filter controls — แถวเดียว (nowrap) บน desktop ───────── */}
      <div className="card-header !flex-nowrap gap-3">
        {/* search global */}
        <div className="input-icon-group shrink">
          <Icon icon="search" className="input-icon" />
          <input
            type="text"
            className="form-input"
            placeholder="ค้นหาออเดอร์..."
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value)
              // reset page เมื่อค้นหา
              setPagination((p) => ({ ...p, pageIndex: 0 }))
            }}
          />
        </div>

        {/* filter group — nowrap แถวเดียว */}
        <div className="flex flex-nowrap items-center gap-2.5">
          {/* filter by status */}
          <div className="input-icon-group">
            <Icon icon="truck" className="input-icon" />
            <select
              className="form-select"
              value={(table.getColumn('status')?.getFilterValue() as string) ?? 'All'}
              onChange={(e) => {
                table.getColumn('status')?.setFilterValue(e.target.value === 'All' ? undefined : e.target.value)
                setPagination((p) => ({ ...p, pageIndex: 0 }))
              }}
            >
              <option value="All">ทุกสถานะ</option>
              <option value="PENDING">รอดำเนินการ</option>
              <option value="SHIPPED">จัดส่งแล้ว</option>
              <option value="CONFIRMED">สำเร็จ</option>
              <option value="CANCELLED">ยกเลิก</option>
            </select>
          </div>

          {/* filter by type */}
          <div className="input-icon-group">
            <Icon icon="package" className="input-icon" />
            <select
              className="form-select"
              value={(table.getColumn('orderType')?.getFilterValue() as string) ?? 'All'}
              onChange={(e) => {
                table.getColumn('orderType')?.setFilterValue(e.target.value === 'All' ? undefined : e.target.value)
                setPagination((p) => ({ ...p, pageIndex: 0 }))
              }}
            >
              <option value="All">ทุกประเภท</option>
              <option value="PHYSICAL">สินค้า</option>
              <option value="DIGITAL">ดิจิทัล</option>
              <option value="SERVICE">บริการ</option>
            </select>
          </div>

          {/* filter by date range */}
          <div className="input-icon-group">
            <Icon icon="calendar" className="input-icon" />
            <select
              className="form-select"
              value={(table.getColumn('createdAtISO')?.getFilterValue() as string) ?? 'All'}
              onChange={(e) => {
                table.getColumn('createdAtISO')?.setFilterValue(e.target.value === 'All' ? undefined : e.target.value)
                setPagination((p) => ({ ...p, pageIndex: 0 }))
              }}
            >
              <option value="All">ช่วงเวลาทั้งหมด</option>
              <option value="Today">วันนี้</option>
              <option value="Last 7 Days">7 วันที่ผ่านมา</option>
              <option value="Last 30 Days">30 วันที่ผ่านมา</option>
              <option value="This Year">ปีนี้</option>
            </select>
          </div>

          {/* page size */}
          <select
            className="form-select"
            value={pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
          >
            {[5, 10, 15, 20].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>

        {/* สร้างออเดอร์ */}
        <Link href="/orders/new" className="btn bg-primary text-white hover:bg-primary-hover shrink-0 ms-auto">
          <Icon icon="plus" />
          สร้างออเดอร์
        </Link>
      </div>

      {/* ─── DataTable ───────────────────────────────────────────────────────── */}
      <DataTable<OrderRow> table={table} emptyMessage="ไม่พบออเดอร์" />

      {/* ─── pagination ──────────────────────────────────────────────────────── */}
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
