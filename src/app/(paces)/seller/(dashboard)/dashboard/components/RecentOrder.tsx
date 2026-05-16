/**
 * RecentOrder — ตารางออเดอร์ล่าสุด
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/RecentOrder.tsx
 *
 * เปลี่ยน copy เป็นภาษาไทย; เพิ่ม filterFns: {} ตาม retro B1 (tanstack/react-table debt)
 * รับ orders prop จาก server — ถ้าไม่มีออเดอร์ fallback เป็น empty array + empty state
 * ลบ mock orderData ออก (S5-rework-2) ป้องกัน fake order บน dashboard
 */
'use client'
import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Icon from '@/components/wrappers/Icon'
import { cn, toPascalCase } from '@/utils/helpers'
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useState } from 'react'
import type { OrderType } from './data'

const columnHelper = createColumnHelper<OrderType>()

// แปลงสถานะจาก state machine ใหม่เป็นภาษาไทยสำหรับ badge
const STATUS_LABEL: Record<string, string> = {
  PENDING:   'รอดำเนินการ',
  SHIPPED:   'จัดส่งแล้ว',
  CONFIRMED: 'สำเร็จ',
  CANCELLED: 'ยกเลิก',
}

const RecentOrder = ({ orders = [] }: { orders?: OrderType[] }) => {
  const [data] = useState<OrderType[]>(orders)
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 5,
  })

  const columns = [
    columnHelper.accessor('token', {
      header: 'รหัส',
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-default-500">
          {getValue().slice(0, 8).toUpperCase()}
        </span>
      ),
    }),

    columnHelper.accessor('buyerLabel', {
      header: 'ผู้ซื้อ',
      cell: ({ getValue }) => (
        <span className="font-semibold">{getValue()}</span>
      ),
    }),

    columnHelper.accessor('createdAtISO', {
      header: 'วันที่',
      cell: ({ getValue }) => {
        // format วันที่เป็น th-TH ที่ client (หลีกเลี่ยง hydration mismatch)
        const d = new Date(getValue())
        return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
      },
    }),

    columnHelper.accessor('totalAmount', {
      header: 'ยอด',
      cell: ({ getValue }) =>
        new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(
          getValue()
        ),
    }),

    columnHelper.accessor('type', {
      header: 'ประเภท',
      cell: ({ getValue }) => {
        const typeLabel: Record<string, string> = {
          PHYSICAL: 'สินค้า',
          DIGITAL: 'ดิจิทัล',
          SERVICE: 'บริการ',
        }
        return typeLabel[getValue()] ?? getValue()
      },
    }),

    columnHelper.accessor('status', {
      header: 'สถานะ',
      cell: ({ row }) => {
        const s = row.original.status
        return (
          <span
            className={cn('badge', {
              'bg-success/15 text-success': s === 'CONFIRMED',
              'bg-warning/15 text-warning': s === 'PENDING',
              'bg-info/15 text-info':       s === 'SHIPPED',
              'bg-danger/15 text-danger':   s === 'CANCELLED',
            })}
          >
            {STATUS_LABEL[s] ?? toPascalCase(s)}
          </span>
        )
      },
    }),
  ]

  // filterFns: {} required — tanstack v8 retro B1 debt fix
  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    filterFns: {},
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length

  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  return (
    <div className="card h-full">
      <div className="card-header">
        <h4 className="card-title">
          ออเดอร์ล่าสุด
        </h4>
        <div>
          <button className="btn btn-sm border-default-300 hover:border-default-400 font-semibold me-1">
            <Icon icon="cloud-upload" /> ส่งออก
          </button>
          <button className="btn btn-sm bg-light hover:text-primary font-semibold">
            <Icon icon="download" /> นำเข้า
          </button>
        </div>
      </div>
      <div className="card-body p-0">
        {data.length === 0 ? (
          // empty state — แสดงเมื่อยังไม่มีออเดอร์ในร้าน
          <div className="flex flex-col items-center justify-center py-12 text-center text-default-400">
            <Icon icon="shopping-cart-off" className="text-4xl mb-3 opacity-40" />
            <p className="font-medium">ยังไม่มีออเดอร์</p>
            <p className="text-xs mt-1">เมื่อมีออเดอร์เข้ามา จะแสดงที่นี่</p>
          </div>
        ) : (
          <DataTable<OrderType> table={table} emptyMessage="ไม่พบออเดอร์" className="table-centered table-hover" />
        )}
      </div>
      {data.length > 0 && (
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

export default RecentOrder
