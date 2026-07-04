'use client'

/**
 * Admin subscriptions overview — client-side filtered table (read-only, ไม่มี action ในแถว — S-13).
 *
 * Base: src/app/(paces)/admin/(dashboard)/users/components/UsersTable.tsx
 * (DataTable + @tanstack/react-table + badge helper + avatar/initial cell pattern เดียวกัน —
 *  itself derived from theme/paces/Admin/TS/src/app/(admin)/apps/users/contacts/).
 *
 * Toolbar หลาย FilterDropdown เรียงแถวเดียว: ดู precedent
 * src/app/(paces)/seller/(dashboard)/orders/components/OrdersTable.tsx
 *
 * 5 คอลัมน์: ร้าน(+badge kind) / เจ้าของ(ลิงก์ /u/{username}) / Stock Pro / แพ็กเกจธุรกิจ / กระเป๋า
 * ไม่มี toast/Swal — หน้านี้อ่านอย่างเดียว ไม่มี mutation ใด ๆ
 */

import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Select from '@/components/wrappers/Select'
import Icon from '@/components/wrappers/Icon'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import { PACKAGE_LABEL_TH } from '@/lib/inventory-addon'
import { BUSINESS_PACKAGE_TIER_CONFIG } from '@/lib/business-package'
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import type { AdminSubscriptionRow } from './data'

type StockFilter = 'All' | 'NOT_SUBSCRIBED' | 'ACTIVE' | 'LOCKED'
type BizFilter = 'All' | 'GROWTH' | 'PRO' | 'BUSINESS'

const columnHelper = createColumnHelper<AdminSubscriptionRow>()

// badge สถานะ Stock Pro — label = ชื่อ package เมื่อ ACTIVE, มิฉะนั้น label สถานะ
const stockBadge = (row: AdminSubscriptionRow): { label: string; className: string } => {
  if (row.stockStatus === 'NOT_SUBSCRIBED') {
    return { label: 'ยังไม่สมัคร', className: 'bg-default-100 text-default-500' }
  }
  if (row.stockStatus === 'LOCKED') {
    return { label: 'ล็อก', className: 'bg-danger/15 text-danger' }
  }
  return {
    label: row.stockPackage ? PACKAGE_LABEL_TH[row.stockPackage] : '—',
    className: 'bg-success/15 text-success',
  }
}

// badge สถานะแพ็กเกจธุรกิจ — label = ชื่อ tier เมื่อ ACTIVE, มิฉะนั้น label สถานะ
const bizBadge = (row: AdminSubscriptionRow): { label: string; className: string } => {
  if (row.bizStatus === 'NOT_SUBSCRIBED') {
    return { label: 'ยังไม่สมัคร', className: 'bg-default-100 text-default-500' }
  }
  if (row.bizStatus === 'LOCKED_RENEWAL_FAILED') {
    return { label: 'ล็อก (ต่ออายุไม่สำเร็จ)', className: 'bg-danger/15 text-danger' }
  }
  return {
    label: row.bizTier ? BUSINESS_PACKAGE_TIER_CONFIG[row.bizTier].label : '—',
    className: 'bg-success/15 text-success',
  }
}

const SubscriptionsTable = ({ rows }: { rows: AdminSubscriptionRow[] }) => {
  const [globalFilter, setGlobalFilter] = useState('')
  const [stockFilter, setStockFilter] = useState<StockFilter>('All')
  const [bizFilter, setBizFilter] = useState<BizFilter>('All')
  const [sorting, setSorting] = useState<{ id: string; desc: boolean }[]>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  // filter ด้วย useMemo เหนือ rows (เหมือน UsersTable statusFilter) — Business filter = tier เท่านั้น
  // (ไม่ filter status ตาม S-14/scope baseline Change Log #2)
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (stockFilter !== 'All' && r.stockStatus !== stockFilter) return false
      if (bizFilter !== 'All' && r.bizTier !== bizFilter) return false
      return true
    })
  }, [rows, stockFilter, bizFilter])

  const columns = [
    columnHelper.accessor('shopName', {
      header: 'ร้าน',
      cell: ({ row }) => {
        const r = row.original
        return (
          <div className="flex gap-3 items-center">
            {r.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.logo}
                alt={r.shopName}
                className="size-9 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                {(r.shopName || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{r.shopName}</div>
              <span
                className={`badge text-xs font-medium px-2 py-0.5 rounded-md inline-block mt-0.5 ${
                  r.kind === 'BUSINESS' ? 'bg-primary/15 text-primary' : 'bg-default-100 text-default-500'
                }`}
              >
                {r.kind === 'BUSINESS' ? 'ธุรกิจ' : 'ร้านค้า'}
              </span>
            </div>
          </div>
        )
      },
    }),

    columnHelper.accessor('ownerName', {
      header: 'เจ้าของ',
      cell: ({ row }) => {
        const r = row.original
        return (
          <div className="min-w-0">
            {/* ลิงก์อ่านอย่างเดียวไปยังโปรไฟล์สาธารณะ — ไม่ใช่ปุ่มจัดการ (S-13) */}
            <a
              href={r.ownerProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-default-900 hover:text-primary"
            >
              <span className="truncate">{r.ownerName}</span>
              <Icon icon="external-link" className="text-xs shrink-0" />
            </a>
            <div className="text-default-400 text-xs truncate">@{r.ownerUsername}</div>
          </div>
        )
      },
    }),

    columnHelper.accessor('stockStatus', {
      header: 'Stock Pro',
      cell: ({ row }) => {
        const badge = stockBadge(row.original)
        return (
          <div>
            <span className={`badge text-xs font-medium px-2 py-1 rounded-md ${badge.className}`}>
              {badge.label}
            </span>
            <div className="text-default-400 text-xs mt-1">{row.original.stockRenewalTh}</div>
          </div>
        )
      },
    }),

    columnHelper.accessor('bizStatus', {
      header: 'แพ็กเกจธุรกิจ',
      cell: ({ row }) => {
        const badge = bizBadge(row.original)
        return (
          <div>
            <span className={`badge text-xs font-medium px-2 py-1 rounded-md ${badge.className}`}>
              {badge.label}
            </span>
            <div className="text-default-400 text-xs mt-1">{row.original.bizRenewalTh}</div>
          </div>
        )
      },
    }),

    columnHelper.accessor('walletBalance', {
      header: 'กระเป๋า',
      cell: ({ row }) => (
        // ห้าม font-mono — ทับ Anuphan (Hard Rule Font)
        <span className="text-sm font-medium">฿{row.original.walletBalance.toLocaleString('th-TH')}</span>
      ),
    }),
  ]

  const table = useReactTable({
    data: filteredRows,
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
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(pageIndex * pageSize + pageSize, totalItems)

  return (
    <div className="card">
      <div className="card-header">
        {/* ซ้าย: search */}
        <div className="flex gap-2.5 flex-1">
          <div className="input-icon-group w-full md:max-w-xs">
            <Icon icon="search" className="input-icon" />
            <input
              type="search"
              placeholder="ค้นหาชื่อร้านหรือเจ้าของ…"
              className="form-input"
              value={globalFilter}
              onChange={(e) => {
                setGlobalFilter(e.target.value)
                setPagination((p) => ({ ...p, pageIndex: 0 }))
              }}
            />
          </div>
        </div>

        {/* กลาง/ขวา: FilterDropdown สถานะ Stock Pro / tier ธุรกิจ + page size
            Base: src/app/(paces)/seller/(dashboard)/orders/components/OrdersTable.tsx
            (หลาย FilterDropdown เรียงแถวเดียว) */}
        <div className="flex flex-wrap items-center gap-2.5 lg:flex-nowrap">
          <span className="font-semibold text-nowrap">กรอง:</span>

          <FilterDropdown
            icon="package"
            defaultLabel="Stock Pro"
            resetValue="All"
            value={stockFilter}
            options={[
              { value: 'All', label: 'ทั้งหมด' },
              { value: 'NOT_SUBSCRIBED', label: 'ยังไม่สมัคร' },
              { value: 'ACTIVE', label: 'ใช้งาน' },
              { value: 'LOCKED', label: 'ล็อก' },
            ]}
            onChange={(v) => {
              setStockFilter(v as StockFilter)
              setPagination((p) => ({ ...p, pageIndex: 0 }))
            }}
          />

          <FilterDropdown
            icon="crown"
            defaultLabel="แพ็กเกจธุรกิจ"
            resetValue="All"
            value={bizFilter}
            options={[
              { value: 'All', label: 'ทั้งหมด' },
              { value: 'GROWTH', label: 'Growth' },
              { value: 'PRO', label: 'Pro' },
              { value: 'BUSINESS', label: 'Business' },
            ]}
            onChange={(v) => {
              setBizFilter(v as BizFilter)
              setPagination((p) => ({ ...p, pageIndex: 0 }))
            }}
          />

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
        </div>
      </div>

      <div className="overflow-x-auto whitespace-normal">
        <DataTable table={table} emptyMessage="ไม่พบร้านค้า" />
      </div>

      {table.getRowModel().rows.length > 0 && (
        <div className="card-footer">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            itemsName="ร้าน"
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

export default SubscriptionsTable
