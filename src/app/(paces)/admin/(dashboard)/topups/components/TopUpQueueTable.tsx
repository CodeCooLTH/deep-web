'use client'

/**
 * TopUpQueueTable — ตาราง DataTable สำหรับแสดงคิว TopUpRequest (admin queue)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/issue-tracker/components/IssueTrackerTable.tsx
 *   (DataTable โครงสร้าง TanStack + Paces card pattern)
 *   ปรับใช้ showHeaders=true (topup เป็น tabular ชัด ต่างจาก issue-tracker ที่ showHeaders=false)
 *   + column structure สำหรับ TopUpRequest (ร้านค้า, จำนวน, วันที่, สถานะ, จัดการ)
 *
 * Precedent ใน project:
 *   src/app/(paces)/admin/(dashboard)/orders/components/OrdersTable.tsx
 *   (DataTable + TablePagination + Paces card-header search pattern)
 *
 * Design Spec:
 *   - columns: ร้านค้า, จำนวน (฿{amount}), วันที่ส่งคำขอ, สถานะ (badge), จัดการ (eye → /topups/{id})
 *   - states: loading skeleton / empty / error / populated
 *   - a11y: status badge aria-label, eye button aria-label "ดูรายละเอียดคำขอ {shopName}"
 *   - path admin สั้น (/topups/{id}) ไม่มี /admin prefix
 *
 * RC-8: table รับ plain props (TopUpRow[]) จาก RSC — ไม่มี buyer PII ใน payload
 */

import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
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
import { useMemo, useState } from 'react'

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type TopUpStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type TopUpRow = {
  id: string
  shopId: string
  shopName: string
  amount: number
  slipFileId: string
  status: TopUpStatus
  /** ISO string — createdAt แปลงจาก Date ใน RSC ก่อนส่ง (serializable) */
  createdAt: string
}

// ──────────────────────────────────────────────────────────────────────────────
// Status meta — badge style + label ภาษาไทย
// ──────────────────────────────────────────────────────────────────────────────

const STATUS_META: Record<TopUpStatus, { label: string; cls: string }> = {
  PENDING:  { label: 'รอตรวจสอบ', cls: 'bg-warning/10 text-warning' },
  APPROVED: { label: 'อนุมัติแล้ว', cls: 'bg-success/10 text-success' },
  REJECTED: { label: 'ปฏิเสธ',    cls: 'bg-danger/10 text-danger' },
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const thb = (n: number): string =>
  `฿${new Intl.NumberFormat('th-TH').format(n)}`

const thDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

// ──────────────────────────────────────────────────────────────────────────────
// Skeleton row — แสดงระหว่างโหลด (state: loading)
// ──────────────────────────────────────────────────────────────────────────────

const SkeletonRows = () => (
  <>
    {Array.from({ length: 5 }).map((_, i) => (
      <tr key={i} className="border-b border-default-200">
        {Array.from({ length: 5 }).map((__, j) => (
          <td key={j} className="px-4 py-3">
            <div className="h-4 rounded bg-default-100 animate-pulse w-3/4" />
          </td>
        ))}
      </tr>
    ))}
  </>
)

// ──────────────────────────────────────────────────────────────────────────────
// Column helper
// ──────────────────────────────────────────────────────────────────────────────

const columnHelper = createColumnHelper<TopUpRow>()

// ──────────────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────────────

type Props = {
  topups: TopUpRow[]
  /** state prop สำหรับ skeleton + error state */
  isLoading?: boolean
  hasError?: boolean
  onRetry?: () => void
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

const TopUpQueueTable = ({ topups, isLoading = false, hasError = false, onRetry }: Props) => {
  const [globalFilter, setGlobalFilter] = useState('')
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  const columns = useMemo(
    () => [
      columnHelper.accessor('shopName', {
        header: 'ร้านค้า',
        cell: ({ getValue }) => (
          <span className="text-sm font-medium text-dark">{getValue()}</span>
        ),
      }),
      columnHelper.accessor('amount', {
        header: 'จำนวน',
        cell: ({ getValue }) => (
          <span className="text-sm font-semibold text-dark">{thb(getValue())}</span>
        ),
      }),
      columnHelper.accessor('createdAt', {
        header: 'วันที่ส่งคำขอ',
        cell: ({ getValue }) => (
          <span className="text-sm text-default-500">{thDate(getValue())}</span>
        ),
        sortingFn: (a, b) =>
          new Date(a.original.createdAt).getTime() -
          new Date(b.original.createdAt).getTime(),
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
              className={cn('badge badge-label text-2xs border-transparent', s.cls)}
              // a11y: อ่านออกเสียง status ชัดเจน
              aria-label={`สถานะ: ${s.label}`}
            >
              {s.label}
            </span>
          )
        },
      }),
      columnHelper.display({
        id: 'action',
        header: () => <div className="text-center">จัดการ</div>,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-center">
            {/* path admin สั้น (/topups/{id}) ตาม proxy map — ไม่มี /admin prefix */}
            <Link
              href={`/topups/${row.original.id}`}
              className="btn btn-icon btn-sm border border-default-300 text-default-800 hover:border-default-400 hover:text-primary"
              aria-label={`ดูรายละเอียดคำขอ ${row.original.shopName}`}
            >
              <Icon icon="eye" className="text-base" />
            </Link>
          </div>
        ),
      }),
    ],
    [],
  )

  const table = useReactTable({
    data: topups,
    columns,
    state: { globalFilter, pagination },
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(pageIndex * pageSize + pageSize, totalItems)

  return (
    <div className="card">
      {/* Card header — search toolbar */}
      <div className="card-header flex flex-wrap items-center justify-between gap-3">
        <div className="input-icon-group w-full md:max-w-xs">
          <Icon icon="search" className="input-icon" />
          <input
            type="search"
            placeholder="ค้นหาร้านค้า…"
            className="form-input"
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value)
              setPagination((p) => ({ ...p, pageIndex: 0 }))
            }}
          />
        </div>
      </div>

      {/* State: error */}
      {hasError && (
        <div className="card-body">
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <Icon icon="alert-circle" className="text-4xl text-danger/60" />
            <p className="text-default-600 font-semibold">โหลดรายการไม่สำเร็จ</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="btn btn-sm bg-primary text-white hover:bg-primary-hover"
              >
                ลองใหม่
              </button>
            )}
          </div>
        </div>
      )}

      {/* State: loading skeleton */}
      {!hasError && isLoading && (
        <div className="overflow-x-auto">
          <table className="table table-hover">
            <thead className="thead-sm">
              <tr className="bg-light/25 text-2xs uppercase">
                {['ร้านค้า', 'จำนวน', 'วันที่ส่งคำขอ', 'สถานะ', 'จัดการ'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <SkeletonRows />
            </tbody>
          </table>
        </div>
      )}

      {/* State: populated + empty (DataTable handles empty message) */}
      {!hasError && !isLoading && (
        <>
          <div className="overflow-x-auto whitespace-normal">
            <DataTable<TopUpRow>
              table={table}
              showHeaders={true}
              emptyMessage={
                <div className="flex flex-col items-center gap-2 py-8">
                  <Icon icon="inbox" className="text-4xl text-default-300" />
                  <p className="text-default-500 font-semibold">ไม่มีคำขอที่รอตรวจสอบ</p>
                </div>
              }
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
        </>
      )}
    </div>
  )
}

export default TopUpQueueTable
