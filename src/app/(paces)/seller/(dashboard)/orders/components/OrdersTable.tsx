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
import { formatDateTime } from '@/lib/format-date'
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
  RowSelectionState,
} from '@tanstack/react-table'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import { PAYMENT_LABELS, PAYMENT_ICONS, SALES_CHANNEL_ICONS, SALES_CHANNEL_LABELS, type OrderRow } from './data'
import BuyerAvatar from './BuyerAvatar'
import OrderActions from './OrderActions'
import BulkActionBar from './BulkActionBar'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import { useRouter } from 'next/navigation'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'

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


const columnHelper = createColumnHelper<OrderRow>()

type Props = {
  orders: OrderRow[]
}

export default function OrdersTable({ orders }: Props) {
  const router = useRouter()
  const [globalFilter,   setGlobalFilter]   = useState('')
  const [sorting,        setSorting]        = useState<SortingState>([])
  const [columnFilters,  setColumnFilters]  = useState<ColumnFiltersState>([])
  const [pagination,     setPagination]     = useState({ pageIndex: 0, pageSize: 10 })
  const [rowSelection,   setRowSelection]   = useState<RowSelectionState>({})

  // buyer base URL — resolve client-side ครั้งเดียว (กัน hydration mismatch) สำหรับ copy ลิงก์กลุ่ม
  const [buyerBaseUrl, setBuyerBaseUrl] = useState('')
  useEffect(() => {
    setBuyerBaseUrl(resolveBuyerBaseUrl())
  }, [])

  // cancel — OrderActions (centralized) ส่ง token มาขอ; confirm ผ่าน Sweet Alerts (Hard Rule safepay-ux #8)
  const handleCancelRequest = async (token: string) => {
    const o = orders.find((x) => x.publicToken === token)
    const label = o ? `ออเดอร์ #${o.id.toUpperCase()}` : 'ออเดอร์นี้'
    const ok = await pacesConfirm.danger('ยกเลิกออเดอร์นี้?', `${label} จะถูกปิด · ย้อนกลับไม่ได้`, {
      confirmButtonText: 'ยืนยันยกเลิก',
      cancelButtonText: 'ไม่ใช่ตอนนี้',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/orders/${token}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        pacesToast.success('ยกเลิกออเดอร์แล้ว')
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        pacesToast.error(typeof data?.error === 'string' ? data.error : 'ยกเลิกออเดอร์ไม่สำเร็จ กรุณาลองใหม่')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

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
        <h5 className="flex items-center gap-1.5 text-sm font-medium">
          <Link href={`/orders/${row.original.publicToken}`} className="hover:text-primary">
            #{row.original.id.toUpperCase()}
          </Link>
          {row.original.isFromAuction && (
            <span className="badge bg-warning/15 text-warning inline-flex items-center gap-0.5" title="จากการประมูล">
              <Icon icon="gavel" className="size-3" />
              ประมูล
            </span>
          )}
        </h5>
      ),
    }),

    // ─ ลูกค้า ─
    columnHelper.accessor('buyerName', {
      header: 'ลูกค้า',
      cell: ({ row }) => {
        const { buyerName, buyer, buyerPhone, buyerUsername, buyerAvatar, salesChannel } = row.original
        const displayName = buyerName ?? 'ลูกค้า'
        const chIcon = salesChannel ? SALES_CHANNEL_ICONS[salesChannel] : null
        return (
          <div className="flex items-center gap-3">
            {/* รูป buyer (User.avatar) + fallback ตัวอักษรแรก */}
            <BuyerAvatar src={buyerAvatar} name={displayName} />
            <div className="min-w-0">
              {/* verified check หน้าชื่อ + channel icon ท้ายชื่อ (inline flex กัน icon เด้งลงบรรทัด) */}
              <p className="flex items-center gap-1 font-medium text-default-900">
                {buyerUsername && (
                  <Icon icon="rosette-discount-check-filled" className="shrink-0 text-sm text-primary" />
                )}
                <span className="truncate">{displayName}</span>
                {chIcon && (
                  <span className="shrink-0" title={salesChannel ? SALES_CHANNEL_LABELS[salesChannel] : undefined}>
                    <Icon icon={chIcon} className="text-sm text-default-400" />
                  </span>
                )}
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

    // ─ วันที่/เวลา ─
    columnHelper.accessor('createdAtISO', {
      header: 'วันที่/เวลา',
      filterFn: dateRangeFilterFn,
      enableColumnFilter: true,
      cell: ({ row }) => (
        <span className="text-sm text-default-700">
          {formatDateTime(row.original.createdAtISO)}
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
    // meta: w-px + whitespace-nowrap → column หดพอดีความกว้างปุ่ม (ไม่กินพื้นที่เกิน)
    {
      id: 'action',
      header: () => <div>จัดการ</div>,
      meta: { headerClassName: 'w-px whitespace-nowrap', cellClassName: 'w-px whitespace-nowrap' },
      cell: ({ row }: { row: TableRow<OrderRow> }) => (
        // centralized OrderActions (ชุดเดียวกับ mobile card) — variant table = icon only
        <OrderActions order={row.original} onCancelRequest={handleCancelRequest} variant="table" />
      ),
    },
  ]

  const table = useReactTable({
    data: orders,
    columns,
    state: { sorting, globalFilter, columnFilters, pagination, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
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
    <>
    <div className="card">
      {/* ─── toolbar — เรียงตาม theme orders OrdersList.tsx: [search ซ้าย] [กรอง:+filter กลาง] [Add ขวา] ───
          Base/source: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
          (ดู docs/system/ui-guideline/seller/page-sourcing.md → orders). คง w-* บน select กัน flex บีบ label หาย */}
      <div className="card-header">
        {/* ซ้าย: search */}
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

        {/* กลาง: กรอง: + Single Button Dropdown (สถานะ/ประเภท/ช่วงเวลา) + page size
            Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (SingleButtonDropdowns)
            ใช้ FilterDropdown (custom React + theme .dropdown-item) — ไม่ใช่ native select */}
        <div className="flex flex-wrap items-center gap-2.5 lg:flex-nowrap">
          <span className="font-semibold text-nowrap">กรอง:</span>

          {/* สถานะ */}
          <FilterDropdown
            icon="truck"
            defaultLabel="สถานะ"
            resetValue="All"
            value={(table.getColumn('status')?.getFilterValue() as string) ?? 'All'}
            options={[
              { value: 'All', label: 'ทั้งหมด' },
              { value: 'PENDING', label: 'รอดำเนินการ' },
              { value: 'SHIPPED', label: 'จัดส่งแล้ว' },
              { value: 'CONFIRMED', label: 'สำเร็จ' },
              { value: 'CANCELLED', label: 'ยกเลิก' },
            ]}
            onChange={(v) => {
              table.getColumn('status')?.setFilterValue(v === 'All' ? undefined : v)
              setPagination((p) => ({ ...p, pageIndex: 0 }))
            }}
          />

          {/* ประเภท */}
          <FilterDropdown
            icon="package"
            defaultLabel="ประเภท"
            resetValue="All"
            value={(table.getColumn('orderType')?.getFilterValue() as string) ?? 'All'}
            options={[
              { value: 'All', label: 'ทั้งหมด' },
              { value: 'PHYSICAL', label: 'สินค้า' },
              { value: 'DIGITAL', label: 'ดิจิทัล' },
              { value: 'SERVICE', label: 'บริการ' },
            ]}
            onChange={(v) => {
              table.getColumn('orderType')?.setFilterValue(v === 'All' ? undefined : v)
              setPagination((p) => ({ ...p, pageIndex: 0 }))
            }}
          />

          {/* ช่วงเวลา */}
          <FilterDropdown
            icon="calendar"
            defaultLabel="ช่วงเวลา"
            resetValue="All"
            value={(table.getColumn('createdAtISO')?.getFilterValue() as string) ?? 'All'}
            options={[
              { value: 'All', label: 'ทั้งหมด' },
              { value: 'Today', label: 'วันนี้' },
              { value: 'Last 7 Days', label: '7 วันที่ผ่านมา' },
              { value: 'Last 30 Days', label: '30 วันที่ผ่านมา' },
              { value: 'This Year', label: 'ปีนี้' },
            ]}
            onChange={(v) => {
              table.getColumn('createdAtISO')?.setFilterValue(v === 'All' ? undefined : v)
              setPagination((p) => ({ ...p, pageIndex: 0 }))
            }}
          />

          {/* page size — โชว์ตัวเลขเสมอ, เปิดลงขวา กัน overflow */}
          <FilterDropdown
            align="right"
            value={String(pageSize)}
            options={[5, 10, 15, 20].map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(v) => table.setPageSize(Number(v))}
          />
        </div>

        {/* ขวา: สร้างออเดอร์ */}
        <div className="flex items-center gap-2">
          <Link href="/orders/new" className="btn bg-primary text-white hover:bg-primary-hover">
            <Icon icon="plus" className="size-4.5" />
            สร้างออเดอร์
          </Link>
        </div>
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

    {/* bulk action bubble — โผล่เมื่อเลือก checkbox ≥1 (desktop) */}
    <BulkActionBar
      selectedRows={table.getSelectedRowModel().rows}
      onClear={() => table.resetRowSelection()}
      buyerBaseUrl={buyerBaseUrl}
    />
    </>
  )
}
