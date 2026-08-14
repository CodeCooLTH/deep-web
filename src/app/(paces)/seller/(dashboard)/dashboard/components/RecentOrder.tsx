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
import { formatDateTime } from '@/lib/format-date'
import { formatOrderNo } from '@/lib/order-no'
import { cn, toPascalCase } from '@/utils/helpers'
import SellerEmptyState from '../../_shared/SellerEmptyState'
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
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import type { Dictionary } from '@/i18n/dictionaries/th'

const columnHelper = createColumnHelper<OrderType>()

/**
 * สถานะ → คีย์ใน dictionary (ไม่ใช่ข้อความ)
 *
 * ค่าคงที่ระดับ module ถูกประเมินตอน import ⇒ เก็บข้อความไว้ตรงนี้จะเป็นภาษาเดียวตลอดอายุ bundle
 * เก็บเป็นคีย์แล้ว `tsc` บังคับว่าคีย์นั้นมีจริงทั้งสองภาษา
 */
const STATUS_LABEL_KEY: Record<string, keyof Dictionary['dashboard']> = {
  PENDING:   'statusPending',
  SHIPPED:   'statusShipped',
  CONFIRMED: 'statusConfirmed',
  CANCELLED: 'statusCancelled',
}

const RecentOrder = ({ orders = [], orderNoun }: { orders?: OrderType[]; /** ชื่อของสิ่งที่แถวในตารางนี้เป็น ผันตามประเภทกิจการ (ORDER_VOCAB.noun) */ orderNoun?: string }) => {
  const t = useT()
  const noun = orderNoun || t.vocab.orderNoun.ONLINE_SALES
  const [data] = useState<OrderType[]>(orders)
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 5,
  })

  const columns = [
    columnHelper.accessor('token', {
      header: t.dashboard.colCode,
      // เลขคำสั่งซื้อ DP… (user 2026-07-25); ห้าม font-mono (Anuphan ไม่มี mono → fallback Courier หลุดธีม)
      cell: ({ row }) => (
        <span className="text-xs text-default-500">
          {formatOrderNo(row.original.token, row.original.createdAtISO)}
        </span>
      ),
    }),

    columnHelper.accessor('buyerLabel', {
      header: t.dashboard.colBuyer,
      cell: ({ getValue }) => (
        <span className="font-semibold">{getValue()}</span>
      ),
    }),

    columnHelper.accessor('createdAtISO', {
      header: t.dashboard.colDate,
      cell: ({ getValue }) => {
        // format วันที่ผ่าน util กลาง (พ.ศ., tz ไทย) — date-only, ไม่มีเวลาใน column นี้
        return formatDateTime(getValue())
      },
    }),

    columnHelper.accessor('totalAmount', {
      header: t.dashboard.colAmount,
      cell: ({ getValue }) =>
        new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(
          getValue()
        ),
    }),

    columnHelper.accessor('type', {
      header: t.dashboard.colType,
      cell: ({ getValue }) => {
        const typeLabel: Record<string, string> = {
          PHYSICAL: t.dashboard.typePhysical,
          DIGITAL: t.dashboard.typeDigital,
          SERVICE: t.dashboard.typeService,
        }
        return typeLabel[getValue()] ?? getValue()
      },
    }),

    columnHelper.accessor('status', {
      header: t.dashboard.colStatus,
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
            {(STATUS_LABEL_KEY[s] && t.dashboard[STATUS_LABEL_KEY[s]]) ?? toPascalCase(s)}
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
          {fmt(t.dashboard.recentOrdersTitle, { noun })}
        </h4>
        <div>
          <button className="btn btn-sm border-default-300 hover:border-default-400 font-semibold me-1">
            <Icon icon="cloud-upload" /> {t.dashboard.recentOrdersExport}
          </button>
          <button className="btn btn-sm bg-light hover:text-primary font-semibold">
            <Icon icon="download" /> {t.dashboard.recentOrdersImport}
          </button>
        </div>
      </div>
      <div className="card-body p-0">
        {data.length === 0 ? (
          // แทนที่ ad-hoc empty ด้วย SellerEmptyState (Unit-C) เพื่อ consistent empty pattern
          <SellerEmptyState
            compact
            icon="shopping-cart-off"
            title={fmt(t.dashboard.recentOrdersEmptyTitle, { noun })}
            description={fmt(t.dashboard.recentOrdersEmptyDesc, { noun })}
          />
        ) : (
          <DataTable<OrderType> table={table} emptyMessage={fmt(t.dashboard.recentOrdersNoMatch, { noun })} className="table-centered table-hover" />
        )}
      </div>
      {data.length > 0 && (
        <div className="card-footer">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            itemsName={orderNoun}
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
