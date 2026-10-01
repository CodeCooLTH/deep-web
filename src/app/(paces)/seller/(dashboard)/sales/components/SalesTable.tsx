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
import { useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { formatBaht } from '@/lib/format-money'
import type { DailyRow } from './data'

type Props = {
  rows: DailyRow[]
  /** มีสิทธิ์ดูข้อมูลการเงิน (feature 00016) — false = ไม่ render คอลัมน์ค่าใช้จ่าย/กำไรสุทธิเลย */
  showFinance?: boolean
  /** คำนับ — "งาน" สำหรับร้านบริการ (ชุดเดียวกับชีตหน้าหลัก) · ค่าเริ่มต้น "ออเดอร์" */
  countNoun?: string
  /** ร้านบริการ: แกนเงิน — วันที่ | งาน | ยอดขาย(ยอดบิล) ชุดเดียวกับการ์ดและชีตหน้าหลัก */
  moneyAxis?: boolean
  /** ต้นทุนยังตั้งไม่ครบ — คอลัมน์กำไรเป็นเพดานบน: สีเตือน + "(ไม่เกิน)" ให้ตรงกับการ์ดข้างบน */
  profitCapped?: boolean
}

const columnHelper = createColumnHelper<DailyRow>()

// formatter ฿ สกุลบาท — client-side เท่านั้น (Date→ISO ทำที่ RSC boundary แล้ว)
// รูปแบบเงินใช้ SSOT กลาง (src/lib/format-money.ts)

const buildBaseColumns = (noun: string) => [
  columnHelper.accessor('label', {
    header: 'วันที่',
    enableColumnFilter: false,
    // วันที่ห้ามตัดบรรทัด — มือถือเคยหักเป็นสองบรรทัด (user แจ้ง 2026-09-30)
    cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue()}</span>,
    // 🛑 เรียงจาก row.date (ISO) ไม่ใช่ข้อความ — "01-10-2569" < "30-09-2569" ถ้าเรียงเป็นสตริง
    sortingFn: (a, b) => a.original.date.localeCompare(b.original.date),
  }),
  columnHelper.accessor('orders', {
    header: noun,
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
    header: `เฉลี่ย/${noun}`,
    enableColumnFilter: false,
    cell: ({ getValue }) => formatBaht(getValue()),
  }),
]

// คอลัมน์การเงิน (feature 00016) — ต่อท้ายเฉพาะร้านที่ผ่าน gate สิทธิ์ค่าใช้จ่าย
const buildFinanceColumns = (capped: boolean) => [
  columnHelper.accessor('shippingCost', {
    header: 'ค่าส่ง',
    enableColumnFilter: false,
    /**
     * ค่าส่งที่ขนส่งคิดจริง + ค่าธรรมเนียมเก็บเงินปลายทางของวันนั้น
     *
     * ใบที่ขนส่งยังไม่เข้ารับจะใช้ราคาประมาณไปก่อน และ **แสดงเหมือนราคาจริงทุกประการ**
     * (user สั่ง 2026-08-10: "ไม่ต้องแสดงให้ user รู้ว่ายังเป็นราคาประเมิน ลูกค้ารู้อยู่แล้ว")
     * ตัวเลขจะขยับขึ้นเองเมื่อขนส่งชั่งน้ำหนักจริง
     */
    cell: ({ row }) => (
      <span className="text-danger-ink">{formatBaht(row.original.shippingCost ?? 0)}</span>
    ),
  }),
  columnHelper.accessor('netProfit', {
    header: capped ? 'กำไร (ไม่เกิน)' : 'กำไร',
    enableColumnFilter: false,
    cell: ({ row }) => {
      const v = row.original.netProfit ?? 0
      return (
        // เพดานบนห้ามเขียว (Verified-Means-Green) — สีเดียวกับการ์ดกำไรที่ capped
        <span className={`font-semibold ${v < 0 ? 'text-danger-ink' : capped ? 'text-warning-ink' : 'text-success-ink'}`}>
          {formatBaht(v)}
        </span>
      )
    },
  }),
]

const buildMoneyColumns = (noun: string) => [
  columnHelper.accessor('label', {
    header: 'วันที่',
    enableColumnFilter: false,
    cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue()}</span>,
    sortingFn: (a, b) => a.original.date.localeCompare(b.original.date),
  }),
  columnHelper.accessor('billCount', { header: noun, enableColumnFilter: false }),
  columnHelper.accessor((r) => r.revenue + r.unconfirmedRevenue, {
    id: 'billTotal',
    header: 'ยอดขาย',
    enableColumnFilter: false,
    cell: ({ getValue }) => formatBaht(getValue()),
  }),
  // เรียงตามเส้นทางของเงิน ยอดขาย → รับจริง → ค้างรับ (ชุดเดียวกับตารางในชีตหน้าหลัก) · ทุกแถว รับจริง + ค้างรับ = ยอดขาย
  columnHelper.accessor((r) => r.received ?? 0, {
    id: 'received',
    header: 'รับจริง',
    enableColumnFilter: false,
    cell: ({ getValue }) => <span className="text-success-ink">{formatBaht(getValue())}</span>,
  }),
  columnHelper.accessor((r) => r.revenue + r.unconfirmedRevenue - (r.received ?? 0), {
    id: 'outstanding',
    header: 'ค้างรับ',
    enableColumnFilter: false,
    cell: ({ getValue }) => {
      const v = getValue()
      // ติดลบ = บันทึกรับเกินบิล (คีย์ผิด/รวมบิลอื่น) — บอกด้วยคำ "เกิน" ไม่ใช่เครื่องหมายลบ
      // (นโยบาย format-money: ทิศทางเป็นหน้าที่ของคำ + สี) · ไม่ซ่อนเป็น 0 เพราะร้านต้องเห็นเพื่อแก้
      return (
        <span className={v > 0 ? 'text-warning-ink' : 'text-default-700'}>
          {v < 0 ? `รับเกิน ${formatBaht(v)}` : formatBaht(v)}
        </span>
      )
    },
  }),
]

const SalesTable = ({ rows, showFinance = false, countNoun = 'ออเดอร์', moneyAxis = false, profitCapped = false }: Props) => {
  const columns = useMemo(() => {
    if (moneyAxis) return buildMoneyColumns(countNoun)
    const base = buildBaseColumns(countNoun)
    return showFinance ? [...base, ...buildFinanceColumns(profitCapped)] : base
  }, [showFinance, countNoun, moneyAxis, profitCapped])

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
