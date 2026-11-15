'use client'

/**
 * ReportTable — การ์ดตาราง: ค้นหา + เลือกจำนวนแถว + เรียงคอลัมน์ + แบ่งหน้า + แถวรวม + (ถ้าส่ง expand) กางแถวลูก (00091 เฟส 3 · ใช้ร่วม 4 แท็บ)
 *
 * Base (แถบเครื่องมือ): theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 *   (ซ้าย = input-icon-group ค้นหา · select จำนวนแถว · ขวา = ปุ่มหลัก) · ตัวตาราง: src/components/table/DataTable.tsx (สำเนาธีม · tanstack) + TablePagination
 *   ท่า useReactTable + getFilteredRowModel/getSortedRowModel/getPaginationRowModel: theme/paces/Admin/TS/src/app/(admin)/dashboard/analytics/components/AnalyticsOverview.tsx
 *   แถวลูก: theme/paces/Admin/TS/src/app/(admin)/tables/datatables/child-rows/components/Table.tsx (คอลัมน์ควบคุม ⊕/⊖ ซ้ายสุด · `table-striped`)
 * 🛑 pinnedLast ใช้ `sortUndefined: 'last'` ของ tanstack: แถวที่ปักท้าย (ไม่ทราบแคมเปญ) คืนค่าเรียง undefined ⇒ อยู่ท้ายเสมอทั้งขึ้นและลง
 * 🛑 แถวรวมต้องส่งมาจากผู้เรียก = ทุกแถว ไม่ใช่เฉพาะหน้า/ผลค้นหา (HR16) · ตัวเลขจัดกลาง (meta.align) ตามหน้าพี่น้อง
 */
import {
  getCoreRowModel, getExpandedRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type ExpandedState, type SortingState,
} from '@tanstack/react-table'
import { useId, useMemo, useState } from 'react'

import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Icon from '@/components/wrappers/Icon'
import Select from '@/components/wrappers/Select'
import { useT } from '@/i18n/LocaleProvider'
import { cn } from '@/utils/helpers'

export type Col<T> = {
  id: string
  header: React.ReactNode
  cell: (r: T) => React.ReactNode
  /** มี = เรียงได้ · null เสมอท้ายสุด */
  sort?: (r: T) => number | string | null
  /** เฉพาะจอกว้าง (xl+) — ใช้กับคอลัมน์รอง */
  xlOnly?: boolean
  /** end = ตัวเลข (จัดกลางตามท่าของ AdTableCard) */
  align?: 'start' | 'end'
}

type Props<T> = {
  title: React.ReactNode
  /** ป้ายข้างชื่อการ์ด (เช่น ก่อนหักส่วนลดท้ายบิล · InfoTip) */
  badge?: React.ReactNode
  /** ปุ่มหลักชิดขวาของแถบเครื่องมือ (bg-primary) — ตารางที่ไม่มี action ไม่ใส่ */
  action?: React.ReactNode
  subHeader?: React.ReactNode
  rows: T[]
  rowKey: (r: T) => string
  columns: Col<T>[]
  footer?: React.ReactNode
  matches?: (r: T, q: string) => boolean
  defaultSort?: { id: string; desc: boolean }
  /** กดชื่อ (คอลัมน์แรก) ของแถว */
  onOpen?: (r: T) => void
  pinnedLast?: (r: T) => boolean
  empty: string
  itemsName: string
  /** แถวแม่กางแถวลูกได้ (ท่า child-rows ของธีม) — render = ตารางย่อใต้แถวแม่ */
  expand?: { isExpandable: (r: T) => boolean; render: (r: T) => React.ReactNode }
  striped?: boolean
}

const PAGE_SIZES = [10, 25, 50]

export default function ReportTable<T>(p: Props<T>) {
  // useReactTable คืนฟังก์ชันที่ memo ไม่ได้อย่างปลอดภัย — ปิด React Compiler เฉพาะ component นี้ (ท่าเดียวกับ AdTableCard)
  'use no memo'
  const t = useT().adRevenue
  const searchId = useId()
  const [sorting, setSorting] = useState<SortingState>(p.defaultSort ? [p.defaultSort] : [])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
  const [globalFilter, setGlobalFilter] = useState('')
  const [expanded, setExpanded] = useState<ExpandedState>({})

  const columns = useMemo<ColumnDef<T>[]>(() => {
    const defs: ColumnDef<T>[] = p.columns.map((c, i) => ({
      id: c.id,
      header: () => c.header,
      accessorFn: (r: T) => {
        if (!c.sort) return undefined
        const v = c.sort(r)
        return p.pinnedLast?.(r) || v === null ? undefined : v
      },
      enableSorting: Boolean(c.sort),
      sortUndefined: 'last' as const,
      sortingFn: (a, b, id) => {
        const x = a.getValue(id) as number | string, y = b.getValue(id) as number | string
        return typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y), 'th') : x - y
      },
      meta: {
        align: c.align === 'end' ? 'center' : undefined,
        headerClassName: c.xlOnly ? 'max-xl:hidden' : undefined,
        cellClassName: cn('tabular-nums', c.xlOnly && 'max-xl:hidden', c.align === 'end' && 'text-center', i === 0 && 'max-w-xs'),
      },
      cell: ({ row }) =>
        i === 0 && p.onOpen ? (
          <button type="button" onClick={() => p.onOpen!(row.original)} className="hover:text-primary flex min-h-11 w-full min-w-0 max-w-full items-center gap-2 text-start lg:min-h-0">
            <span className="flex min-w-0 items-center gap-2">{c.cell(row.original)}</span>
          </button>
        ) : i === 0 ? <div className="flex min-w-0 items-center gap-2">{c.cell(row.original)}</div> : c.cell(row.original),
    }))
    if (!p.expand) return defs
    // คอลัมน์ควบคุมซ้ายสุดแบบ dt-control ของธีม child-rows (ไอคอนวงกลม primary)
    const control: ColumnDef<T> = {
      id: '__control',
      header: () => <span className="sr-only">{t.expandCol}</span>,
      enableSorting: false,
      meta: { cellClassName: 'w-10' },
      cell: ({ row }) =>
        row.getCanExpand() ? (
          <button type="button" onClick={row.getToggleExpandedHandler()} aria-expanded={row.getIsExpanded()} aria-label={t.expandCol} className="text-primary flex min-h-11 items-center lg:min-h-0">
            <Icon icon={row.getIsExpanded() ? 'circle-minus' : 'circle-plus'} className="text-2xl" aria-hidden="true" />
          </button>
        ) : null,
    }
    return [control, ...defs]
    // columns/onOpen/expand ผูกกับ state ของผู้เรียกที่เสถียรในหนึ่งรอบ render — สร้างใหม่ทุกรอบตามท่า AdTableCard
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.columns, p.expand, p.onOpen, p.pinnedLast, t])

  const table = useReactTable({
    data: p.rows,
    columns,
    state: { sorting, pagination, globalFilter, expanded },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    onExpandedChange: setExpanded,
    getRowId: (r) => p.rowKey(r),
    getRowCanExpand: (row) => p.expand?.isExpandable(row.original) ?? false,
    globalFilterFn: (row, _id, q: string) => (p.matches ? p.matches(row.original, q.trim().toLowerCase()) : true),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    enableRowSelection: false,
  })

  const { pageIndex, pageSize } = table.getState().pagination
  const filtered = table.getFilteredRowModel().rows.length
  const start = filtered === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, filtered)

  return (
    <div className="card min-w-0">
      <div className="card-header flex-wrap gap-2">
        <h4 className="card-title">{p.title}</h4>
        {p.badge}
      </div>
      {/* แถบเครื่องมือตามธีม OrdersList: ซ้าย = ค้นหา · กลาง = จำนวนแถว · ขวา = ปุ่มหลัก (ถ้ามี) — ไม่มี checkbox/bulk action (รายงานอ่านอย่างเดียว) */}
      <div className="card-header flex-wrap gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          {p.matches && (
            <div className="input-icon-group w-56">
              <Icon icon="search" className="input-icon" aria-hidden="true" />
              <input
                id={searchId} type="search" className="form-input min-h-11 lg:min-h-0" placeholder={t.searchPlaceholder} aria-label={t.searchPlaceholder}
                value={globalFilter} onChange={(e) => { setGlobalFilter(e.target.value); setPagination((x) => ({ ...x, pageIndex: 0 })) }}
              />
            </div>
          )}
          {/* ห้าม select native (มติ user) → react-select ตามท่า Select2.tsx ของธีม */}
          <Select
            className="react-select w-24" classNamePrefix="react-select" aria-label={t.rowsPerPage} isSearchable={false}
            options={PAGE_SIZES.map((n) => ({ value: n, label: String(n) }))}
            value={{ value: pageSize, label: String(pageSize) }}
            onChange={(o) => { const v = (o as { value: number } | null)?.value; if (v) setPagination({ pageIndex: 0, pageSize: v }) }}
          />
        </div>
        {p.action}
      </div>
      {p.subHeader}
      <DataTable<T>
        table={table} emptyMessage={p.empty} footerRow={p.footer} striped={p.striped}
        subRow={p.expand ? (row) => p.expand!.render(row.original) : undefined}
      />
      {filtered > 0 && (
        <div className="card-footer">
          <TablePagination
            totalItems={filtered} start={start} end={end} itemsName={p.itemsName} showInfo
            previousPage={table.previousPage} canPreviousPage={table.getCanPreviousPage()}
            pageCount={table.getPageCount()} pageIndex={pageIndex} setPageIndex={table.setPageIndex}
            nextPage={table.nextPage} canNextPage={table.getCanNextPage()}
          />
        </div>
      )}
    </div>
  )
}
