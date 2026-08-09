/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(reports)/sales/components/SalesTable.tsx
 *
 * Re-sourced S15 (Phase B): ตัด card wrapper ออกเพื่อฝังใน card เดียวกับ SalesChart (ตาม Paces layout).
 * ข้อมูลเป็น DailyRow[] จาก real aggregation บน server — ไม่มี demo saleData จาก theme.
 * เพิ่ม filterFns: {} ตาม retro B1 (tanstack/react-table v8 constraint).
 * ยอดเงินแสดงเป็น ฿ (THB) ไม่ใช่ $.
 * PDPA: ตารางแสดงเฉพาะ aggregate (วันที่, ออเดอร์, สำเร็จ, ยอดขาย, เฉลี่ย) — ไม่มี buyer PII.
 */
'use client'

import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { formatBaht } from '@/lib/format-money'
import type { DailyRow } from './data'

type Props = {
  rows: DailyRow[]
  /** มีสิทธิ์ดูข้อมูลการเงิน (feature 00016) — false = ไม่ render คอลัมน์ค่าใช้จ่าย/กำไรสุทธิเลย */
  showFinance?: boolean
}

const columnHelper = createColumnHelper<DailyRow>()

// formatter ฿ สกุลบาท — client-side เท่านั้น (Date→ISO ทำที่ RSC boundary แล้ว)
// รูปแบบเงินใช้ SSOT กลาง (src/lib/format-money.ts)

const baseColumns = [
  columnHelper.accessor('label', {
    header: 'วันที่',
    enableColumnFilter: false,
  }),
  columnHelper.accessor('orders', {
    header: 'ออเดอร์',
    enableColumnFilter: false,
  }),
  columnHelper.accessor('completed', {
    header: 'สำเร็จ',
    enableColumnFilter: false,
  }),
  columnHelper.accessor('revenue', {
    header: 'ยอดขาย',
    enableColumnFilter: false,
    cell: ({ getValue }) => formatBaht(getValue()),
  }),
  columnHelper.accessor('avgOrder', {
    header: 'เฉลี่ย/ออเดอร์',
    enableColumnFilter: false,
    cell: ({ getValue }) => formatBaht(getValue()),
  }),
]

// คอลัมน์การเงิน (feature 00016) — ต่อท้ายเฉพาะร้านที่ผ่าน gate สิทธิ์ค่าใช้จ่าย
const financeColumns = [
  columnHelper.accessor('expense', {
    header: 'ค่าใช้จ่าย',
    enableColumnFilter: false,
    /**
     * 2 บรรทัด: ยอดรวมของวัน + ส่วนที่เป็นค่าส่งจริงจาก iShip
     *
     * 🛑 บรรทัดล่างเป็น **ส่วนย่อยของบรรทัดบน ไม่ใช่ยอดที่ต้องบวกเพิ่ม** — คำว่า "รวม" ในข้อความ
     * ต้องอ่านว่า "ในนั้นรวมค่าส่งอยู่ด้วย" ไม่ใช่ "ยอดรวมค่าส่ง"
     *
     * ห้ามแสดง "฿0.00" เมื่อวันนั้นมีพัสดุที่ยังไม่รู้ค่าส่ง — 0 อ่านว่า "ส่งฟรี" ไม่ใช่ "ยังไม่รู้"
     * (กติกาเดียวกับ order-profit-presentation.ts ที่เลือกไม่แสดงตัวเลขเลยเมื่อคำนวณไม่ได้)
     */
    cell: ({ row }) => {
      const expense = row.original.expense ?? 0
      const shipping = row.original.shippingCost ?? 0
      const pending = row.original.pendingShipmentCount ?? 0
      if (expense === 0 && pending > 0) {
        return (
          <span className="text-warning-ink text-nowrap">
            รอรับเข้า {pending.toLocaleString('th-TH')} ใบ
          </span>
        )
      }
      return (
        <span className="flex flex-col">
          <span className="text-danger-ink">{formatBaht(expense)}</span>
          {shipping > 0 && (
            <span className="text-default-500 text-2xs text-nowrap">
              ↳ รวมค่าส่งจริง {formatBaht(shipping)}
            </span>
          )}
        </span>
      )
    },
  }),
  columnHelper.accessor('netProfit', {
    header: 'กำไรสุทธิ',
    enableColumnFilter: false,
    cell: ({ row }) => {
      const v = row.original.netProfit ?? 0
      const pending = row.original.pendingShipmentCount ?? 0
      return (
        <span className="inline-flex items-center gap-1">
          {/* วันที่ยังมีพัสดุรอรับเข้า = ตัวเลขนี้เป็นเพดานบน ต้องมีป้ายกำกับ ไม่ใช่แสดงเงียบ ๆ
              ใช้ไอคอนเตือนแทนการเปลี่ยนสีตัวเลข เพราะสิ่งที่ไม่ชัวร์คือ "ครบไหม" ไม่ใช่ "บวกหรือลบ" */}
          {pending > 0 && (
            <Icon
              icon="alert-triangle"
              className="text-warning-ink size-3.5 shrink-0"
              role="img"
              aria-label="ยังไม่รวมค่าส่งของออเดอร์ที่ขนส่งยังไม่แจ้งราคา — ตัวเลขนี้อาจสูงกว่าจริง"
            />
          )}
          <span className={`font-semibold ${v >= 0 ? 'text-success-ink' : 'text-danger-ink'}`}>
            {formatBaht(v)}
          </span>
        </span>
      )
    },
  }),
]

const SalesTable = ({ rows, showFinance = false }: Props) => {
  const columns = showFinance ? [...baseColumns, ...financeColumns] : baseColumns

  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // filterFns ว่างเพื่อให้ type inference ถูกต้อง — ไม่มี custom column filter ใน page นี้ (retro B1)
    filterFns: {},
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  return (
    // ไม่มี .card wrapper — ฝังใน card เดียวกับ SalesChart บน page.tsx (ตาม Paces single-card layout)
    <>
      <div className="card-header flex items-center justify-between flex-wrap gap-3 border-t border-default-200">
        <h6 className="card-title text-sm">รายละเอียดรายวัน</h6>
        <div className="input-icon-group">
          <Icon icon="search" className="input-icon" />
          <input
            type="search"
            placeholder="ค้นหา..."
            className="form-input"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </div>
      </div>

      <DataTable table={table} emptyMessage="ไม่มีข้อมูลในช่วงเวลานี้" />

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
  )
}

export default SalesTable
