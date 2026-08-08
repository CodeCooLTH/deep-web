'use client'

/**
 * Admin orders list — client-side filtered DataTable.
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/components/OrdersList.tsx
 * (same-theme Paces DataTable pattern, itself derived from
 *  theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/orders/).
 * Plus admin chip-row pattern borrowed from
 *  src/app/(paces)/admin/(dashboard)/users/components/UsersTable.tsx (A3).
 *
 * Columns adapted for admin scope: #token, shop (name + @seller), buyer
 * (displayName + @user, fallback masked contact), first item (+อีก N),
 * total, type chip, status chip, date, view link to /o/{token} on the
 * buyer subdomain. Status chip row preserves ?status= in the URL so the
 * filter is SSR-shareable.
 */

import DataTable from '@/components/table/DataTable'
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
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import type {
  AdminOrderRow,
  AdminOrderStatus,
  AdminOrderType,
} from './data'

type StatusTab = 'all' | AdminOrderStatus

const STATUS_TABS: { value: StatusTab; label: string; icon: string; dot?: string }[] = [
  { value: 'all',       label: 'ทั้งหมด',      icon: 'list' },
  { value: 'PENDING',   label: 'รอดำเนินการ',  icon: 'clock',         dot: 'bg-warning' },
  { value: 'SHIPPED',   label: 'จัดส่งแล้ว',   icon: 'truck-delivery', dot: 'bg-info' },
  { value: 'CONFIRMED', label: 'สำเร็จ',        icon: 'check',         dot: 'bg-success' },
  { value: 'CANCELLED', label: 'ยกเลิก',        icon: 'x',             dot: 'bg-danger' },
]

const STATUS_META: Record<AdminOrderStatus, { label: string; cls: string }> = {
  PENDING:   { label: 'รอดำเนินการ', cls: 'bg-warning/10 text-warning' },
  SHIPPED:   { label: 'จัดส่งแล้ว',  cls: 'bg-info/10 text-info' },
  CONFIRMED: { label: 'สำเร็จ',      cls: 'bg-success/10 text-success' },
  CANCELLED: { label: 'ยกเลิก',      cls: 'bg-danger/10 text-danger' },
}

const TYPE_META: Record<AdminOrderType, { label: string; cls: string }> = {
  PHYSICAL: { label: 'สินค้า',   cls: 'bg-primary/10 text-primary' },
  DIGITAL:  { label: 'ดิจิทัล',  cls: 'bg-info/10 text-info' },
  SERVICE:  { label: 'บริการ',   cls: 'bg-warning/10 text-warning' },
}

const thb = (n: number): string =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)

const columnHelper = createColumnHelper<AdminOrderRow>()

type Props = {
  orders: AdminOrderRow[]
  activeStatus: StatusTab
}

const OrdersTable = ({ orders, activeStatus }: Props) => {
  const router = useRouter()

  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<{ id: string; desc: boolean }[]>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  const [localStatus, setLocalStatus] = useState<StatusTab>(activeStatus ?? 'all')

  const filteredByStatus = useMemo(() => {
    if (localStatus === 'all') return orders
    return orders.filter((o) => o.status === localStatus)
  }, [orders, localStatus])

  const columns = useMemo(
    () => [
      columnHelper.accessor('tokenShort', {
        header: 'Token',
        cell: ({ row }) => (
          <a
            href={row.original.viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium font-mono hover:text-primary"
          >
            #{row.original.tokenShort}
          </a>
        ),
      }),
      columnHelper.accessor('shopName', {
        header: 'ร้าน',
        cell: ({ row }) => {
          const o = row.original
          return (
            <div className="min-w-0">
              {/* HR7: max-w-56 — คุมความยาวชื่อร้านในคอลัมน์ตาราง กันชื่อยาวดันคอลัมน์อื่น; Paces ไม่มี token max-width ระดับคอลัมน์ */}
              <div className="text-sm font-medium truncate max-w-56">
                {o.shopName}
              </div>
              {o.sellerUsername && (
                <a
                  href={o.shopUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-default-400 text-xs truncate hover:text-primary"
                >
                  @{o.sellerUsername}
                </a>
              )}
            </div>
          )
        },
      }),
      columnHelper.display({
        id: 'buyer',
        header: 'ผู้ซื้อ',
        cell: ({ row }) => {
          const o = row.original
          if (o.buyerDisplayName) {
            return (
              <div className="min-w-0">
                {/* HR7: max-w-48 — คุมความยาวชื่อผู้ซื้อในคอลัมน์ตาราง (แคบกว่าคอลัมน์ร้านเพราะพื้นที่จำกัดกว่า); Paces ไม่มี token max-width ระดับคอลัมน์ */}
                <div className="text-sm font-medium truncate max-w-48">
                  {o.buyerDisplayName}
                </div>
                {o.buyerUsername && (
                  <div className="text-default-400 text-xs truncate">
                    @{o.buyerUsername}
                  </div>
                )}
              </div>
            )
          }
          if (o.buyerContactMasked) {
            return (
              <span className="text-default-500 font-mono text-sm">
                {o.buyerContactMasked}
              </span>
            )
          }
          return <span className="text-default-400">-</span>
        },
      }),
      columnHelper.display({
        id: 'product',
        header: 'สินค้า',
        cell: ({ row }) => {
          const o = row.original
          if (!o.firstItemName || o.firstItemName === '—') {
            return <span className="text-default-400">—</span>
          }
          return (
            // HR7: max-w-64 — คุมความยาวชื่อสินค้าในคอลัมน์ตาราง (กว้างสุดใน 3 คอลัมน์เพราะชื่อสินค้ามักยาว); Paces ไม่มี token max-width ระดับคอลัมน์
            <div className="min-w-0 max-w-64">
              <div className="text-sm truncate">{o.firstItemName}</div>
              {o.extraItemCount > 0 && (
                <div className="text-default-400 text-xs">
                  +อีก {o.extraItemCount} รายการ
                </div>
              )}
            </div>
          )
        },
      }),
      columnHelper.accessor('total', {
        header: 'ยอดรวม',
        cell: ({ getValue }) => (
          <span className="font-medium">{thb(getValue())}</span>
        ),
      }),
      columnHelper.accessor('type', {
        header: 'ประเภท',
        cell: ({ getValue }) => {
          const t = TYPE_META[getValue()] ?? {
            label: getValue(),
            cls: 'bg-default-100 text-default-700',
          }
          return (
            <span
              className={cn(
                'badge text-xs font-medium px-2 py-1 rounded-md',
                t.cls,
              )}
            >
              {t.label}
            </span>
          )
        },
      }),
      columnHelper.accessor('status', {
        header: 'สถานะ',
        cell: ({ getValue }) => {
          const s = STATUS_META[getValue()] ?? {
            label: getValue(),
            cls: 'bg-default-100 text-default-700',
          }
          return (
            <span
              className={cn(
                'badge text-xs font-medium px-2 py-1 rounded-md',
                s.cls,
              )}
            >
              {s.label}
            </span>
          )
        },
      }),
      columnHelper.accessor('createdAt', {
        header: 'วันที่',
        cell: ({ row }) => (
          <span className="text-default-500 text-sm">
            {row.original.createdAtTh}
          </span>
        ),
        sortingFn: (a, b) =>
          new Date(a.original.createdAt).getTime() -
          new Date(b.original.createdAt).getTime(),
      }),
      columnHelper.display({
        id: 'action',
        header: () => <div className="text-center">ดู</div>,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-center">
            <a
              href={row.original.viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-icon btn-sm border border-default-300 text-default-800 hover:border-default-400 hover:text-primary"
            >
              <Icon icon="eye" className="text-base" />
            </a>
          </div>
        ),
      }),
    ],
    [],
  )

  const table = useReactTable({
    data: filteredByStatus,
    columns,
    filterFns: {},
    state: {
      sorting,
      globalFilter,
      pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
    enableColumnFilters: true,
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(pageIndex * pageSize + pageSize, totalItems)

  const handleStatusTab = (value: StatusTab) => {
    setLocalStatus(value)
    setPagination((p) => ({ ...p, pageIndex: 0 }))
    if (value === 'all') {
      router.push('/orders')
    } else {
      router.push(`?status=${value}`)
    }
  }

  // Counts per status for the tab badges — based on full (unfiltered) set
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length }
    for (const o of orders) {
      counts[o.status] = (counts[o.status] ?? 0) + 1
    }
    return counts
  }, [orders])

  return (
    <div className="card">
      {/* Toolbar */}
      <div className="card-header flex flex-wrap items-center justify-between gap-2.5">
        <div className="input-icon-group w-full md:max-w-xs">
          <Icon icon="search" className="input-icon" />
          <input
            type="search"
            placeholder="ค้นหาชื่อร้าน / ผู้ซื้อ…"
            className="form-input"
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value)
              setPagination((p) => ({ ...p, pageIndex: 0 }))
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-nowrap">แสดง:</label>
          <div className="w-24">
            <Select
              className="select2 react-select"
              classNamePrefix="react-select"
              isSearchable={false}
              options={[
                { value: 10, label: '10' },
                { value: 25, label: '25' },
                { value: 50, label: '50' },
                { value: 100, label: '100' },
              ]}
              value={{ value: pageSize, label: String(pageSize) }}
              onChange={(opt: any) => table.setPageSize(Number(opt?.value ?? 10))}
            />
          </div>
        </div>
      </div>

      {/* Status Tabs — paces underline style */}
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
                  // ring-inset ไม่ใช่ ring ธรรมดา — แท็บเป็นสี่เหลี่ยมในแถว overflow-x-auto
                  // (การตั้ง overflow-x ทำให้ overflow-y กลายเป็น auto ตามสเปก CSS) วงแหวนที่
                  // ยื่นออกนอกกล่องเสี่ยงโดนตัดขอบบน/ล่าง — inset การันตีว่าอยู่ในกล่องตัวเองเสมอ
                  // ไม่เปลี่ยนสีเส้นใต้แทน เพราะจะชนกับสถานะ active ที่เป็น border-primary อยู่แล้ว
                  'border-b-2 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                  active
                    ? 'text-primary border-primary'
                    : 'text-default-500 border-transparent hover:text-primary hover:border-default-400',
                )}
              >
                {tab.dot && (
                  <span
                    className={cn('inline-block size-1.5 rounded-full', tab.dot)}
                  />
                )}
                <Icon icon={tab.icon} className="size-4" />
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'inline-flex items-center justify-center rounded-full text-xs font-semibold leading-none px-2 py-0.5 min-w-5',
                    active
                      ? 'bg-primary text-white'
                      : 'bg-default-100 text-default-700',
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="overflow-x-auto whitespace-normal">
        <DataTable table={table} emptyMessage="ไม่มีออเดอร์ในขณะนี้" />
      </div>

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

export default OrdersTable
