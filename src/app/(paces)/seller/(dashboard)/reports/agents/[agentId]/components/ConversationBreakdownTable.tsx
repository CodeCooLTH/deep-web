'use client'

/**
 * ConversationBreakdownTable — เธรดที่ประกอบเป็นตัวเลขของแอดมินคนนั้น (feature 00059)
 *
 * Base: src/app/(paces)/seller/(dashboard)/customers/components/CustomerTable.tsx
 *   (`.card` + `.card-header` + `DataTable` + `mobileCard` + `TablePagination`)
 *
 * 🛑 มีอยู่เพราะ "ตัวเลขที่ตรวจสอบไม่ได้ = ตัวเลขที่ไม่มีใครเชื่อ" — ผู้จัดการต้องกดจากคำว่า
 * "ปิดการขายได้ 12" ไปดูได้ว่า 12 เธรดนั้นคือเธรดไหน ไม่งั้นพอเลขดูแปลกจะสรุปว่าระบบคำนวณผิด
 * แล้วเลิกใช้ทั้งหน้า (บทเรียนเดียวกับ partial-data-must-be-labeled-or-filled.md)
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'

import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import SellerEmptyState from '../../../../_shared/SellerEmptyState'
import { formatBaht } from '@/lib/format-money'
import { formatDateTime } from '@/lib/format-date'
import { formatResponseDuration } from '@/lib/agent-performance'
import {
  createColumnHelper,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { channelLabel, RESULT_LABEL, RESULT_TONE, SOURCE_LABEL, type BreakdownRow } from '../../components/data'

const columnHelper = createColumnHelper<BreakdownRow>()

export default function ConversationBreakdownTable({
  rows,
  canSeeRevenue,
}: {
  rows: BreakdownRow[]
  canSeeRevenue: boolean
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'startedAtISO', desc: true }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  const columns = useMemo(
    () => [
      columnHelper.accessor('customerName', {
        header: 'ลูกค้า',
        cell: ({ row }) => (
          <Link
            href={`/inbox/${row.original.conversationId}`}
            className="text-default-900 hover:text-primary truncate text-sm font-medium">
            {row.original.customerName}
          </Link>
        ),
      }),
      columnHelper.accessor('channel', {
        header: 'ช่องทาง',
        cell: ({ row }) => (
          <span className="text-default-700 text-sm">
            {channelLabel(row.original.channel)}
            <span className="text-default-400 block text-2xs">
              {SOURCE_LABEL[row.original.source]}
            </span>
          </span>
        ),
      }),
      columnHelper.accessor('assignedAgentName', {
        header: 'ผู้รับผิดชอบ',
        cell: (info) => (
          /* null = ไม่มีคนตอบเลย — เขียนตรง ๆ ห้ามเว้นว่างให้เดาเอง */
          <span className="text-default-700 text-sm">{info.getValue() ?? 'ยังไม่มีผู้ตอบ'}</span>
        ),
      }),
      columnHelper.accessor('startedAtISO', {
        header: 'เริ่มเมื่อ',
        cell: (info) => (
          <span className="text-default-500 text-sm">{formatDateTime(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor((r) => r.firstResponseSec ?? undefined, {
        id: 'firstResponseSec',
        header: 'ตอบครั้งแรก',
        sortUndefined: 'last',
        cell: (info) => (
          <span className="tabular-nums">{formatResponseDuration(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor('durationSec', {
        header: 'ระยะเวลาคุย',
        cell: (info) => (
          <span className="text-default-500 tabular-nums">
            {formatResponseDuration(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('orderNo', {
        header: 'คำสั่งซื้อ',
        cell: (info) => (
          <span className="text-default-700 text-sm tabular-nums">{info.getValue() ?? '—'}</span>
        ),
      }),
      ...(canSeeRevenue
        ? [
            columnHelper.accessor((r) => r.orderValue ?? undefined, {
              id: 'orderValue',
              header: 'มูลค่า',
              sortUndefined: 'last',
              cell: (info) => (
                <span className="tabular-nums">
                  {info.getValue() === undefined ? '—' : formatBaht(info.getValue() as number)}
                </span>
              ),
            }),
          ]
        : []),
      columnHelper.accessor('result', {
        header: 'ผล',
        cell: (info) => (
          <span className={`badge ${RESULT_TONE[info.getValue()]}`}>
            {RESULT_LABEL[info.getValue()]}
          </span>
        ),
      }),
    ],
    [canSeeRevenue],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    filterFns: {},
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const start = rows.length === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, rows.length)

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">บทสนทนาที่เกี่ยวข้อง</h4>
        <span className="text-default-400 text-xs">แสดงสูงสุด {rows.length} รายการของช่วงนี้</span>
      </div>

      <DataTable
        table={table}
        emptyMessage={
          <SellerEmptyState
            compact
            icon="message-off"
            title="ไม่มีบทสนทนาในช่วงนี้"
            description="ลองขยายช่วงเวลา หรือเอาตัวกรองช่องทาง/ที่มาออก"
          />
        }
        mobileCard={(row) => {
          const r = row.original
          return (
            <div className="card mb-3">
              <div className="card-body flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/inbox/${r.conversationId}`}
                    className="text-default-900 hover:text-primary min-w-0 truncate font-medium">
                    {r.customerName}
                  </Link>
                  <span className={`badge shrink-0 ${RESULT_TONE[r.result]}`}>
                    {RESULT_LABEL[r.result]}
                  </span>
                </div>
                <p className="text-default-400 text-2xs">
                  {channelLabel(r.channel)} · {SOURCE_LABEL[r.source]} ·{' '}
                  {formatDateTime(r.startedAtISO)}
                </p>
                <dl className="border-default-200 grid grid-cols-2 gap-y-1 border-t border-dashed pt-2 text-sm">
                  <dt className="text-default-500">ตอบครั้งแรก</dt>
                  <dd className="text-end tabular-nums">
                    {formatResponseDuration(r.firstResponseSec)}
                  </dd>
                  <dt className="text-default-500">ผู้รับผิดชอบ</dt>
                  <dd className="text-end">{r.assignedAgentName ?? 'ยังไม่มีผู้ตอบ'}</dd>
                  {canSeeRevenue && r.orderValue !== null && (
                    <>
                      <dt className="text-default-500">มูลค่า</dt>
                      <dd className="text-end font-semibold tabular-nums">
                        {formatBaht(r.orderValue)}
                      </dd>
                    </>
                  )}
                </dl>
              </div>
            </div>
          )
        }}
      />

      {rows.length > pageSize && (
        <div className="card-footer">
          <TablePagination
            totalItems={rows.length}
            start={start}
            end={end}
            itemsName="บทสนทนา"
            previousPage={table.previousPage}
            canPreviousPage={table.getCanPreviousPage()}
            pageCount={table.getPageCount()}
            pageIndex={pageIndex}
            setPageIndex={table.setPageIndex}
            nextPage={table.nextPage}
            canNextPage={table.getCanNextPage()}
          />
        </div>
      )}
    </div>
  )
}
