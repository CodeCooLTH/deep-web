'use client'

/**
 * CustomerTable — ตาราง customers ของ seller
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/components/CustomerTable.tsx
 *
 * เปลี่ยน: ใช้ CustomerRow จาก real data แทน CustomerType demo
 * ตัด: AddCustomerModal, DeleteConfirmationModal, checkbox select, demo data import,
 *       country column, avatar image — seller ไม่มี action เหล่านี้
 * เปลี่ยน columns: displayName, contact (PDPA masked), totalOrders, lastOrderISO (แสดงเป็น locale date)
 * เพิ่ม: filterFns: {} ใน useReactTable (ป้องกัน type error)
 * Date: lastOrderISO รับมาเป็น ISO string (RSC→client ปลอดภัย) แล้ว format ใน cell
 */

import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Icon from '@/components/wrappers/Icon'
import { formatDate } from '@/lib/format-date'
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useEffect, useState } from 'react'
import type { CustomerRow } from './data'

// ลบ: import Link from 'next/link' — ลิงก์ชื่อลูกค้าข้ามโดเมน (buyer) ใช้ <a> แทน next/link
// เพื่อหลีกเลี่ยง proxy /seller/u/{username} → 404

// TODO(F1): resolveBuyerBaseUrl ที่ canonical คือ @/lib/buyer-url → resolveBuyerBaseUrl
// คงไว้ที่นี่เพื่อป้องกัน regress (CustomerTable อยู่นอก scope Phase A Unit B)
// เมื่อ refactor CustomerTable ครั้งต่อไป ให้ import จาก @/lib/buyer-url แทน
function resolveBuyerBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_BUYER_URL
  if (envUrl) return envUrl.replace(/\/$/, '')
  if (typeof window !== 'undefined') {
    const { protocol, host } = window.location
    // Seller อยู่บน `seller.<buyerHost>` — ตัด prefix ออกเพื่อได้ buyer domain
    const buyerHost = host.replace(/^seller\./, '')
    return `${protocol}//${buyerHost}`
  }
  return 'https://deepthailand.app'
}

const columnHelper = createColumnHelper<CustomerRow>()

type CustomerTableProps = {
  customers: CustomerRow[]
}

const CustomerTable = ({ customers }: CustomerTableProps) => {
  // buyerBase ต้องเป็น state เพราะ window ไม่พร้อมตอน SSR
  const [buyerBase, setBuyerBase] = useState('https://deepthailand.app')

  useEffect(() => {
    setBuyerBase(resolveBuyerBaseUrl())
  }, [])

  const columns = [
    columnHelper.accessor('displayName', {
      header: 'ลูกค้า',
      cell: ({ row }) => (
        <div className="flex gap-3 items-center">
          {/* Avatar placeholder: ใช้ initial แทน image — ไม่มี avatar ใน MVP */}
          <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
            {row.original.initial}
          </div>
          <h5 className="text-sm font-medium">
            {row.original.isRegistered && row.original.username ? (
              // ใช้ <a> แทน next/link เพราะเป็น cross-domain nav ไปยัง buyer domain
              // href เป็น absolute URL เพื่อป้องกัน proxy /seller/u/{username} → 404
              <a
                href={`${buyerBase}/u/${row.original.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary"
              >
                {row.original.displayName}
              </a>
            ) : (
              <span>{row.original.displayName}</span>
            )}
          </h5>
        </div>
      ),
    }),
    columnHelper.accessor('contact', {
      header: 'ติดต่อ',
      cell: ({ row }) => (
        <span className="text-default-500 font-mono text-sm">{row.original.contact}</span>
      ),
    }),
    columnHelper.accessor('totalOrders', {
      header: 'ออเดอร์ทั้งหมด',
      cell: ({ row }) => (
        <span className="font-medium">{row.original.totalOrders}</span>
      ),
    }),
    columnHelper.accessor('lastOrderISO', {
      header: 'ออเดอร์ล่าสุด',
      cell: ({ row }) => (
        // แปลง ISO string → formatDate (พ.ศ., tz ไทย) — date-only, ไม่มี time ใน column นี้
        <span className="text-default-500 text-sm">
          {formatDate(row.original.lastOrderISO)}
        </span>
      ),
    }),
  ]

  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 8 })

  const table = useReactTable({
    data: customers,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
    // filterFns ว่างเพื่อให้ type inference ถูกต้อง — ไม่มี custom column filter ใน page นี้
    filterFns: {},
    enableColumnFilters: true,
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex gap-2.5">
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" />
            <input
              type="search"
              placeholder="ค้นหาลูกค้า..."
              className="form-input"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2.5 items-center flex-wrap md:flex-nowrap">
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

      <DataTable<CustomerRow>
        table={table}
        emptyMessage="ยังไม่มีลูกค้า — รอผู้ซื้อสั่งซื้อสินค้าจากร้านค้าของคุณ"
        mobileCard={(row) => {
          const c = row.original
          const lastDate = formatDate(c.lastOrderISO)
          return (
            <div className="flex items-center gap-3 px-1 py-3.5">
              {/* leading: avatar initial */}
              <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                {c.initial}
              </div>
              {/* main: ชื่อ (link ถ้า registered) + ติดต่อ */}
              <div className="min-w-0 flex-1">
                {c.isRegistered && c.username ? (
                  <a
                    href={`${buyerBase}/u/${c.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[14px] font-medium text-ink hover:text-primary block truncate"
                  >
                    {c.displayName}
                  </a>
                ) : (
                  <p className="text-[14px] font-medium text-ink truncate">{c.displayName}</p>
                )}
                <p className="text-[12px] text-default-500 font-mono truncate">{c.contact}</p>
              </div>
              {/* trailing: จำนวนออเดอร์ + ล่าสุด */}
              <div className="shrink-0 text-right">
                <p className="text-[14px] font-semibold text-ink leading-tight">{c.totalOrders}</p>
                <p className="text-[11px] text-default-400 leading-tight">{lastDate}</p>
              </div>
            </div>
          )
        }}
      />

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

export default CustomerTable
