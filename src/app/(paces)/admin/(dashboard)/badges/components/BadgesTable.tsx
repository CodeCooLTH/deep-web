'use client'

/**
 * Admin badges list — client-side filtered table.
 *
 * Base: src/app/(paces)/admin/(dashboard)/users/components/UsersTable.tsx
 * (same-theme Paces DataTable pattern; UsersTable itself was derived from
 *  theme/paces/Admin/TS/src/app/(admin)/apps/users/contacts/). Columns
 * adapted for badges: icon+name, type chip, criteria summary, awarded
 * count, edit action. Search + type chip filter (all / verification /
 * achievement). Edit opens the shared BadgeFormDialog via a Preline
 * hs-overlay trigger + a window event carrying the target row.
 */

import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Select from '@/components/wrappers/Select'
import Icon from '@/components/wrappers/Icon'
import { Icon as IconifyIcon } from '@iconify/react'
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'

export type AdminBadgeRow = {
  id: string
  name: string
  nameEN: string
  icon: string | null
  type: 'VERIFICATION' | 'ACHIEVEMENT'
  criteria: Record<string, unknown>
  awardedCount: number
}

type Filter = 'all' | 'verification' | 'achievement'

const columnHelper = createColumnHelper<AdminBadgeRow>()

// Summarise the criteria JSON into a single Thai sentence for the list view.
// Type names match the seed in `src/services/badge.service.ts` — new badges
// created via the form should use the same identifiers for `evaluateBadges`
// to recognise them on future iterations.
const criteriaSummary = (criteria: Record<string, unknown>): string => {
  const t = String(criteria.type ?? '')
  switch (t) {
    case 'FIRST_ORDER':
      return 'ออเดอร์แรกสำเร็จ'
    case 'ORDER_COUNT':
      return `ออเดอร์สำเร็จ ≥ ${criteria.count ?? '?'}`
    case 'PERFECT_RATING':
      return `คะแนนเฉลี่ย 5.0 (รีวิว ≥ ${criteria.minReviews ?? '?'})`
    case 'HIGH_RATING':
      return `คะแนนเฉลี่ย ≥ ${criteria.minRating ?? '?'} (รีวิว ≥ ${criteria.minReviews ?? '?'})`
    case 'ZERO_COMPLAINT':
      return `ไม่มียกเลิก (ออเดอร์ ≥ ${criteria.minOrders ?? '?'})`
    case 'VETERAN':
      return `สมัครมาแล้ว ≥ ${criteria.minDays ?? '?'} วัน + ออเดอร์ใน 30 วันล่าสุด`
    case 'FAST_SHIPPING':
      return `ส่งของเฉลี่ย ≤ ${criteria.maxHours ?? '?'} ชม. (ออเดอร์ ≥ ${criteria.minOrders ?? '?'})`
    case 'FULL_VERIFICATION':
      return 'ยืนยันครบทั้ง L1 + L2 + L3'
    case 'UNIQUE_REVIEWERS':
      return `ผู้รีวิวไม่ซ้ำ ≥ ${criteria.count ?? '?'}`
    default:
      return t || '—'
  }
}

const typeChipClass = (type: AdminBadgeRow['type']): string =>
  type === 'VERIFICATION' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'

const typeLabel = (type: AdminBadgeRow['type']): string =>
  type === 'VERIFICATION' ? 'Verification' : 'Achievement'

type BadgesTableProps = {
  rows: AdminBadgeRow[]
}

const BadgesTable = ({ rows }: BadgesTableProps) => {
  const [globalFilter, setGlobalFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<Filter>('all')
  const [sorting, setSorting] = useState<{ id: string; desc: boolean }[]>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  const filteredRows = useMemo(() => {
    if (typeFilter === 'all') return rows
    if (typeFilter === 'verification') return rows.filter((b) => b.type === 'VERIFICATION')
    if (typeFilter === 'achievement') return rows.filter((b) => b.type === 'ACHIEVEMENT')
    return rows
  }, [rows, typeFilter])

  const openEdit = (row: AdminBadgeRow) => {
    // Broadcast to BadgeFormDialog (lives at the page level) — it listens for
    // this event to prefill the form. Preline's data-hs-overlay trigger below
    // opens the dialog itself.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('badge-dialog:edit', { detail: row }))
    }
  }

  const openCreate = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('badge-dialog:create'))
    }
  }

  const columns = [
    columnHelper.accessor('name', {
      header: 'Badge',
      cell: ({ row }) => {
        const b = row.original
        return (
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-default-100">
              {b.icon ? (
                <IconifyIcon icon={b.icon} className="text-xl" />
              ) : (
                <Icon icon="award" className="text-xl text-default-400" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{b.name}</p>
              <p className="text-xs text-default-400 truncate">{b.nameEN}</p>
            </div>
          </div>
        )
      },
    }),
    columnHelper.accessor('type', {
      header: 'ประเภท',
      cell: ({ row }) => (
        <span
          className={`badge text-xs font-medium px-2 py-1 rounded-md ${typeChipClass(
            row.original.type,
          )}`}
        >
          {typeLabel(row.original.type)}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'criteria',
      header: 'เงื่อนไข',
      cell: ({ row }) => (
        <span className="text-sm text-default-600">{criteriaSummary(row.original.criteria)}</span>
      ),
    }),
    columnHelper.accessor('awardedCount', {
      header: 'มอบไปแล้ว',
      cell: ({ getValue }) => (
        <span className="text-sm font-medium">{getValue().toLocaleString('th-TH')}</span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: 'การจัดการ',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => openEdit(row.original)}
          data-hs-overlay="#badge-form-dialog"
          className="btn btn-sm border border-default-300 bg-card hover:bg-primary hover:text-white text-default-700 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
        >
          <Icon icon="pencil" className="text-sm" />
          แก้ไข
        </button>
      ),
    }),
  ]

  const table = useReactTable({
    data: filteredRows,
    columns,
    filterFns: {},
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
    enableColumnFilters: true,
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(pageIndex * pageSize + pageSize, totalItems)

  const chip = (value: Filter, label: string, count: number) => (
    <button
      key={value}
      type="button"
      onClick={() => {
        setTypeFilter(value)
        table.setPageIndex(0)
      }}
      className={
        typeFilter === value
          ? 'btn btn-sm bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md'
          : 'btn btn-sm border border-default-300 bg-card hover:bg-default-50 text-default-700 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md'
      }
    >
      <span>{label}</span>
      <span
        className={
          typeFilter === value
            ? 'text-[10px] font-semibold bg-white/20 px-1.5 py-0.5 rounded'
            : 'text-[10px] font-semibold bg-default-100 text-default-500 px-1.5 py-0.5 rounded'
        }
      >
        {count}
      </span>
    </button>
  )

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex gap-2.5 flex-1">
          <div className="input-icon-group w-full md:max-w-xs">
            <Icon icon="search" className="input-icon" />
            <input
              type="search"
              placeholder="ค้นหาชื่อ badge…"
              className="form-input"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2.5 items-center flex-wrap md:flex-nowrap">
          <div className="w-24">
            <Select
              className="select2 react-select"
              classNamePrefix="react-select"
              isSearchable={false}
              options={[
                { value: 5, label: '5' },
                { value: 10, label: '10' },
                { value: 25, label: '25' },
                { value: 50, label: '50' },
              ]}
              value={{
                value: pageSize,
                label: String(pageSize),
              }}
              onChange={(opt: any) => table.setPageSize(Number(opt?.value ?? 10))}
            />
          </div>
          <button
            type="button"
            onClick={openCreate}
            data-hs-overlay="#badge-form-dialog"
            className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md whitespace-nowrap"
          >
            <Icon icon="plus" className="text-base" />
            เพิ่ม Badge
          </button>
        </div>
      </div>

      <div className="px-base pb-3 flex flex-wrap items-center gap-2">
        {chip('all', 'ทั้งหมด', rows.length)}
        {chip('verification', 'Verification', rows.filter((b) => b.type === 'VERIFICATION').length)}
        {chip('achievement', 'Achievement', rows.filter((b) => b.type === 'ACHIEVEMENT').length)}
      </div>

      <div className="overflow-x-auto whitespace-normal">
        <DataTable table={table} emptyMessage="ยังไม่มี badge" />
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

export default BadgesTable
