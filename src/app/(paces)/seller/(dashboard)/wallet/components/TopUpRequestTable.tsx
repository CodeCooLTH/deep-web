/**
 * Base: src/app/(paces)/seller/(dashboard)/wallet/components/WalletTransactionTable.tsx
 * (DataTable + TanStack table pattern — in-proj precedent สำหรับ Paces seller)
 *
 * Chain: WalletTransactionTable ← OrdersList.tsx ←
 *   theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx
 *
 * Adaptations from base (WalletTransactionTable.tsx):
 * - data type: TopUpRequestRow แทน TransactionRow
 * - columns: วันที่ยื่น, จำนวน (฿{amount}), สถานะ badge, หมายเหตุ (4 cols แทน 5)
 * - toolbar: ไม่มี search/filter (ลิสต์สั้น — ตาม spec "ลิสต์สั้น ไม่ต้อง search/filter")
 *   แต่คงรูปแบบ card-header consistent กับ WalletTransactionTable
 * - page size: 10/25 (ลดจาก 10/25/50 เพราะ list สั้นกว่า ledger)
 * - status badge: PENDING (warning) / APPROVED (success) / REJECTED (danger)
 * - หมายเหตุ column: REJECTED → rejectedReason, APPROVED → "เพิ่มเครดิตแล้ว", PENDING → "กำลังรอ Deep ตรวจสอบสลิป"
 * - table caption "คำขอเติมเครดิต SMS" เพื่อ a11y
 * - badge aria-label สำหรับแต่ละสถานะ
 * - empty state: "ยังไม่มีคำขอเติมเครดิต"
 * - RC-8: ไม่ log; ไม่แสดง slipFileId เป็นลิงก์ (seller เห็นสถานะเท่านั้น — MVP);
 *   TopUpRequest ไม่มี buyer PII อยู่แล้ว
 */

'use client'

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
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'

// ─── serializable row type (Date → ISO string ที่ RSC boundary) ───────────────
export type TopUpRequestRow = {
  id: string
  amount: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  rejectedReason: string | null
  createdAtISO: string
  reviewedAtISO: string | null
}

// ─── badge meta สำหรับแต่ละ status ──────────────────────────────────────────
const STATUS_META = {
  PENDING:  { label: 'รอตรวจสอบ', cls: 'bg-warning/15 text-warning' },
  APPROVED: { label: 'อนุมัติแล้ว', cls: 'bg-success/15 text-success' },
  REJECTED: { label: 'ปฏิเสธ',     cls: 'bg-danger/15 text-danger'  },
} satisfies Record<'PENDING' | 'APPROVED' | 'REJECTED', { label: string; cls: string }>

// ─── note text ตาม status ─────────────────────────────────────────────────────
function getNoteText(row: TopUpRequestRow): string {
  if (row.status === 'REJECTED') return row.rejectedReason ?? '—'
  if (row.status === 'APPROVED') return 'เพิ่มเครดิตแล้ว'
  return 'กำลังรอ Deep ตรวจสอบสลิป'
}

const columnHelper = createColumnHelper<TopUpRequestRow>()

type Props = {
  topups: TopUpRequestRow[]
}

const TopUpRequestTable = ({ topups }: Props) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  const columns = useMemo(
    () => [
      // คอลัมน์วันที่ยื่น (createdAt th-TH)
      columnHelper.accessor('createdAtISO', {
        header: 'วันที่ยื่น',
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
      // คอลัมน์จำนวนเงิน
      columnHelper.accessor('amount', {
        header: 'จำนวน',
        cell: ({ getValue }) => (
          <span className="font-semibold tabular-nums text-default-700">
            ฿{getValue().toLocaleString('th-TH')}
          </span>
        ),
      }),
      // คอลัมน์สถานะ badge ตาม spec (warning/success/danger)
      columnHelper.accessor('status', {
        header: 'สถานะ',
        cell: ({ getValue }) => {
          const v = getValue()
          const meta = STATUS_META[v]
          return (
            <span
              className={cn('badge', meta.cls)}
              aria-label={`สถานะ: ${meta.label}`}
            >
              {meta.label}
            </span>
          )
        },
      }),
      // คอลัมน์หมายเหตุ — แสดง context ตาม status
      columnHelper.display({
        id: 'note',
        header: 'หมายเหตุ',
        cell: ({ row }) => {
          const note = getNoteText(row.original)
          const isRejected = row.original.status === 'REJECTED'
          return (
            <span
              className={cn(
                'text-sm',
                isRejected ? 'text-danger' : 'text-default-500',
              )}
            >
              {note}
            </span>
          )
        },
      }),
    ],
    [],
  )

  const table = useReactTable({
    data: topups,
    columns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    filterFns: {},
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  // empty state ตาม spec
  const emptyMessage = (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Icon icon="clock-off" className="size-10 text-default-300" aria-hidden="true" />
      <p className="text-sm text-default-400">ยังไม่มีคำขอเติมเครดิต</p>
    </div>
  )

  return (
    <div className="card">
      {/* card-header คงรูปแบบ consistent กับ WalletTransactionTable — แม้ไม่มี filter */}
      <div className="card-header">
        <h5 className="text-base font-semibold">คำขอเติมเครดิต</h5>
        {/* page size selector: 10/25 — ลิสต์สั้นกว่า ledger */}
        <div>
          <select
            className="form-select"
            aria-label="จำนวนรายการต่อหน้า"
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
          >
            {[10, 25].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* DataTable พร้อม aria-label region สำหรับ a11y — ตาม pattern WalletTransactionTable */}
      <div role="region" aria-label="คำขอเติมเครดิต SMS">
        <DataTable<TopUpRequestRow>
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
            itemsName="คำขอ"
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

export default TopUpRequestTable
