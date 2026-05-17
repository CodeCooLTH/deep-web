/**
 * Base: src/app/(paces)/seller/(dashboard)/orders/components/OrdersList.tsx
 * (DataTable + TanStack table pattern — in-proj precedent สำหรับ Paces seller)
 *
 * Adaptations from base (OrdersList.tsx):
 * - columns: type (badge TOPUP/DEDUCT), amount (signed), balanceAfter, description, createdAt
 * - No action column (read-only ledger — ตาม Design Spec)
 * - Status tabs → filter type dropdown (ทั้งหมด/เติมเครดิต/ส่ง SMS) เหมือน orderType select
 * - search = description field (globalFilter)
 * - page size: 10/25/50 (ตาม spec แทน 5/8/10/15/20 ของ OrdersList)
 * - DeleteConfirmationModal: stripped (ไม่มี delete บน ledger)
 * - Link column: stripped (ไม่มี action ลิงก์)
 * - createdAt: รับ ISO string แล้ว format เป็น th-TH toLocaleString (ตาม spec)
 * - table caption "ประวัติรายการเครดิต SMS" เพื่อ a11y
 * - badge aria-label สำหรับ TOPUP/DEDUCT
 * - states: loading skeleton (ไม่มีใน RSC pass แต่ client side no-data handled), empty, populated
 * - RC-8: ไม่ log transactions; ไม่แสดง buyer PII (type/amount/balanceAfter/description/refId เท่านั้น)
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
import { useMemo, useState } from 'react'
import type { TransactionRow } from '../page'

// ─── type filter tabs ─────────────────────────────────────────────────────────
const TYPE_FILTER_OPTIONS = [
  { value: 'all',    label: 'ทั้งหมด' },
  { value: 'TOPUP',  label: 'เติมเครดิต' },
  { value: 'DEDUCT', label: 'ส่ง SMS' },
] as const

// ─── badge meta สำหรับ TOPUP / DEDUCT ───────────────────────────────────────
const TYPE_META = {
  TOPUP:  { label: 'เติมเครดิต', cls: 'bg-success/15 text-success', sign: '+' },
  DEDUCT: { label: 'ส่ง SMS',    cls: 'bg-danger/15 text-danger',   sign: '−' },
} satisfies Record<'TOPUP' | 'DEDUCT', { label: string; cls: string; sign: string }>

const columnHelper = createColumnHelper<TransactionRow>()

type Props = {
  transactions: TransactionRow[]
}

const WalletTransactionTable = ({ transactions }: Props) => {
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
  // localType: filter type ที่เลือก ('all' / 'TOPUP' / 'DEDUCT')
  const [localType, setLocalType] = useState<string>('all')

  // กรองตาม type ก่อนส่ง TanStack (เหมือน filteredByStatus ใน OrdersList)
  const filteredByType = useMemo(() => {
    if (localType === 'all') return transactions
    return transactions.filter((t) => t.type === localType)
  }, [transactions, localType])

  const columns = useMemo(
    () => [
      // คอลัมน์ประเภท — badge success/danger
      columnHelper.accessor('type', {
        header: 'ประเภท',
        cell: ({ getValue }) => {
          const v = getValue() as 'TOPUP' | 'DEDUCT'
          const meta = TYPE_META[v]
          return (
            <span
              className={cn('badge', meta.cls)}
              aria-label={meta.label}
            >
              {meta.sign} {meta.label}
            </span>
          )
        },
      }),
      // คอลัมน์จำนวน — สีและเครื่องหมายตาม type
      columnHelper.accessor('amount', {
        header: 'จำนวน (฿)',
        cell: ({ row }) => {
          const v = row.original.amount
          const type = row.original.type as 'TOPUP' | 'DEDUCT'
          const meta = TYPE_META[type]
          const colorCls = type === 'TOPUP' ? 'text-success' : 'text-danger'
          return (
            <span className={cn('font-semibold tabular-nums', colorCls)}>
              {meta.sign}฿{v.toLocaleString('th-TH')}
            </span>
          )
        },
      }),
      // คอลัมน์คงเหลือหลังรายการ
      columnHelper.accessor('balanceAfter', {
        header: 'คงเหลือ (฿)',
        cell: ({ getValue }) => (
          <span className="tabular-nums text-default-700">
            ฿{getValue().toLocaleString('th-TH')}
          </span>
        ),
      }),
      // คอลัมน์รายละเอียด (description)
      columnHelper.accessor('description', {
        header: 'รายละเอียด',
        cell: ({ getValue }) => (
          <span className="text-default-600 text-sm">
            {getValue() ?? '—'}
          </span>
        ),
      }),
      // คอลัมน์วันเวลา — toLocaleString('th-TH') ตาม spec
      columnHelper.accessor('createdAtISO', {
        header: 'วันเวลา',
        cell: ({ getValue }) => {
          const d = new Date(getValue())
          return (
            <span className="text-default-400 text-sm whitespace-nowrap">
              {isNaN(d.getTime())
                ? '—'
                : d.toLocaleString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
            </span>
          )
        },
      }),
    ],
    [],
  )

  const table = useReactTable({
    data: filteredByType,
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
    // filterFns ว่างบังคับต้องมีเพื่อหลีกเลี่ยง TanStack warning (เหมือน OrdersList)
    filterFns: {},
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  const handleTypeChange = (value: string) => {
    setLocalType(value)
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }

  // custom empty message ตาม spec
  const emptyMessage = (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Icon icon="receipt-off" className="size-10 text-default-300" aria-hidden="true" />
      <p className="text-sm text-default-400">ยังไม่มีรายการเครดิต</p>
    </div>
  )

  return (
    <div className="card">
      {/* Toolbar — search description + filter type + page size */}
      <div className="card-header">
        <div className="flex gap-2.5">
          {/* Search description */}
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" aria-hidden="true" />
            <input
              type="text"
              className="form-input"
              placeholder="ค้นหารายละเอียด..."
              aria-label="ค้นหารายละเอียดรายการ"
              value={globalFilter}
              onChange={(e) => {
                setGlobalFilter(e.target.value)
                setPagination((p) => ({ ...p, pageIndex: 0 }))
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 lg:flex-nowrap">
          {/* Filter by type */}
          <div className="input-icon-group">
            <Icon icon="filter" className="input-icon" aria-hidden="true" />
            <select
              className="form-select"
              aria-label="กรองตามประเภทรายการ"
              value={localType}
              onChange={(e) => handleTypeChange(e.target.value)}
            >
              {TYPE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {/* Page size: 10/25/50 ตาม spec */}
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

      {/* DataTable พร้อม caption สำหรับ a11y — ใช้ aria-label บน region wrapper
          เพราะ DataTable ไม่รับ caption prop; ห้ามแตะ DataTable.tsx (parallel stream)
          screen reader จะอ่าน "ตาราง ประวัติรายการเครดิต SMS" */}
      <div role="region" aria-label="ประวัติรายการเครดิต SMS">
        <DataTable<TransactionRow>
          table={table}
          emptyMessage={emptyMessage}
        />
      </div>

      {table.getRowModel().rows.length > 0 && (
        <div className="card-footer">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            itemsName="รายการ"
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

export default WalletTransactionTable
