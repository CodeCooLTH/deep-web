'use client'

/**
 * AuctionDataTable — desktop table view (≥lg) สำหรับ seller /auctions
 *
 * ใช้ DataTable + TanStack react-table ตามแบบ Paces theme (เหมือน orders/components/OrdersTable.tsx)
 * คอลัมน์ (ตาม UI-DESIGN-SPEC §Tablet/Desktop): สินค้า / ราคาปัจจุบัน / บิด / สถานะ / เวลา / ⋮
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/components/OrdersList.tsx
 *   (โครง .card > card-header(search+create) > DataTable > card-footer(pagination))
 * ต่าง OrdersTable ตรง action column ใช้ ⋮ (AuctionRowMenu) แทนปุ่มกลุ่มชัด — ตาม mockup D1
 * desktop table (`<span class="row-act"><iconify-icon icon="solar:menu-dots-bold">`) และ
 * deliverable ระบุคอลัมน์ "⋮" ตรง ๆ (ต่างจาก orders ที่ user เคย req ปุ่มชัดแยกไม่มี ⋮)
 */

import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import Icon from '@/components/wrappers/Icon'
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import Link from 'next/link'
import { useState } from 'react'
import type { SellerAuctionListItemDTO } from '@/services/auction.service'
import { STATUS_BADGE_CLASS, STATUS_LABEL } from './data'
import AuctionMeta from './AuctionMeta'
import AuctionRowMenu from './AuctionRowMenu'
import { toFileUrl } from '@/lib/file-url'

const columnHelper = createColumnHelper<SellerAuctionListItemDTO>()

type Props = {
  auctions: SellerAuctionListItemDTO[]
  onPublishRequest: (id: string) => void
  onCancelRequest: (id: string) => void
}

export default function AuctionDataTable({ auctions, onPublishRequest, onCancelRequest }: Props) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })

  const columns = [
    // ─ สินค้า ─
    columnHelper.accessor('title', {
      header: 'สินค้า',
      cell: ({ row }) => {
        const a = row.original
        const imageUrl = a.imageUrl
          ? toFileUrl(a.imageUrl)
          : null
        return (
          <div className="flex items-center gap-2.5">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={a.title} className="size-9 rounded-lg object-cover" />
            ) : (
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-default-100">
                <Icon icon="photo" className="text-sm text-default-400" />
              </div>
            )}
            <p className="line-clamp-1 text-sm font-medium text-default-900">{a.title}</p>
          </div>
        )
      },
    }),

    // ─ ราคาปัจจุบัน ─
    columnHelper.accessor('currentPrice', {
      header: 'ราคาปัจจุบัน',
      cell: ({ row }) => (
        <span className="tabular-nums text-sm font-semibold text-default-900">
          ฿{row.original.currentPrice.toLocaleString('th-TH')}
          {row.original.bidCount === 0 && (
            <span className="ms-1 text-xs font-normal text-default-400">เริ่มต้น</span>
          )}
        </span>
      ),
    }),

    // ─ บิด ─
    columnHelper.accessor('bidCount', {
      header: 'บิด',
      cell: ({ row }) => (
        <span className="tabular-nums text-sm text-default-700">{row.original.bidCount}</span>
      ),
    }),

    // ─ สถานะ ─
    columnHelper.accessor('status', {
      header: 'สถานะ',
      filterFn: 'equalsString',
      cell: ({ row }) => (
        <span
          className={`inline-flex items-center gap-1 badge ${STATUS_BADGE_CLASS[row.original.status]}`}
        >
          {row.original.status === 'live' && (
            <span className="size-1.5 animate-pulse rounded-full bg-success" />
          )}
          {STATUS_LABEL[row.original.status]}
        </span>
      ),
    }),

    // ─ เวลา ─
    {
      id: 'time',
      header: 'เวลา',
      cell: ({ row }: { row: { original: SellerAuctionListItemDTO } }) => (
        <AuctionMeta
          status={row.original.status}
          endTimeMs={row.original.endTimeMs}
          startTimeMs={row.original.startTimeMs}
        />
      ),
    },

    // ─ action (⋮) ─
    {
      id: 'action',
      header: () => <div />,
      meta: { headerClassName: 'w-px whitespace-nowrap', cellClassName: 'w-px whitespace-nowrap' },
      cell: ({ row }: { row: { original: SellerAuctionListItemDTO } }) => (
        <AuctionRowMenu
          id={row.original.id}
          status={row.original.status}
          bidCount={row.original.bidCount}
          onPublishRequest={onPublishRequest}
          onCancelRequest={onCancelRequest}
        />
      ),
    },
  ]

  const table = useReactTable({
    data: auctions,
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
  const start = pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex gap-2.5">
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" />
            <input
              type="text"
              className="form-input"
              placeholder="ค้นหาชื่อประมูล..."
              value={globalFilter}
              onChange={(e) => {
                setGlobalFilter(e.target.value)
                setPagination((p) => ({ ...p, pageIndex: 0 }))
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/auctions/new" className="btn bg-primary text-white hover:bg-primary-hover">
            <Icon icon="plus" className="size-4.5" />
            สร้างรายการประมูล
          </Link>
        </div>
      </div>

      <DataTable<SellerAuctionListItemDTO> table={table} emptyMessage="ไม่พบรายการประมูล" />

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
