'use client'

// React Imports
import { useEffect, useMemo, useState } from 'react'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import TablePagination from '@mui/material/TablePagination'
import Typography from '@mui/material/Typography'
import type { TextFieldProps } from '@mui/material/TextField'

// Third-party Imports
import classnames from 'classnames'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFacetedMinMaxValues,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import TablePaginationComponent from '@components/TablePaginationComponent'
import { formatDate } from '@/lib/format-date'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

/**
 * Buyer order row shape — mirrors the projection returned by
 * `getOrdersByBuyer` in `src/services/order.service.ts`.
 */
export type BuyerOrderRow = {
  id: string
  publicToken: string
  status: string
  totalAmount: number | string
  createdAt: Date | string
  items: { id: string; name: string }[]
  shop: {
    id: string
    shopName: string
    user: { username: string; displayName: string }
  }
}

const STATUS_LABEL: Record<string, string> = {
  PENDING:   'รอดำเนินการ',
  SHIPPED:   'จัดส่งแล้ว',
  CONFIRMED: 'สำเร็จ',
  CANCELLED: 'ยกเลิก'
}

const STATUS_COLOR: Record<string, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  PENDING:   'warning',
  SHIPPED:   'info',
  CONFIRMED: 'success',
  CANCELLED: 'error'
}

const baht = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 0
})

const DebouncedInput = ({
  value: initialValue,
  onChange,
  debounce = 500,
  ...props
}: {
  value: string | number
  onChange: (value: string | number) => void
  debounce?: number
} & Omit<TextFieldProps, 'onChange'>) => {
  // States
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  useEffect(() => {
    const timeout = setTimeout(() => onChange(value), debounce)

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <CustomTextField {...props} value={value} onChange={e => setValue(e.target.value)} />
}

type RowWithAction = BuyerOrderRow & { action?: string }

const columnHelper = createColumnHelper<RowWithAction>()

/**
 * Buyer-side orders table.
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/orders/list/OrderListTable.tsx
 * Adapted columns to SafePay buyer view (สินค้า, ร้าน, ยอดรวม, สถานะ, วันที่, action).
 * Dropped: row checkbox, payment status column, payment method column, OptionMenu (replaced
 * with single "ดู" link), Export button.
 */
const OrderListTable = ({ orderData }: { orderData: BuyerOrderRow[] }) => {
  // States
  const [data] = useState<BuyerOrderRow[]>(orderData)
  const [globalFilter, setGlobalFilter] = useState('')

  const columns = useMemo<ColumnDef<RowWithAction, any>[]>(
    () => [
      columnHelper.accessor(row => row.items[0]?.name ?? '', {
        id: 'product',
        header: 'สินค้า',
        cell: ({ row }) => {
          const first = row.original.items[0]
          const extra = row.original.items.length - 1

          return (
            <div className='flex flex-col'>
              <Typography color='text.primary' className='font-medium'>
                {first?.name ?? 'คำสั่งซื้อ'}
              </Typography>
              {extra > 0 && (
                <Typography variant='body2' color='text.secondary'>
                  + อีก {extra} รายการ
                </Typography>
              )}
            </div>
          )
        }
      }),
      columnHelper.accessor(row => row.shop.shopName, {
        id: 'shop',
        header: 'ร้าน',
        cell: ({ row }) => (
          <Link
            href={`/u/${row.original.shop.user.username}`}
            className='text-[var(--mui-palette-primary-main)] hover:underline'
          >
            {row.original.shop.shopName}
          </Link>
        )
      }),
      columnHelper.accessor(row => Number(row.totalAmount), {
        id: 'total',
        header: 'ยอดรวม',
        cell: ({ row }) => (
          <Typography color='text.primary' className='font-medium'>
            {baht.format(Number(row.original.totalAmount))}
          </Typography>
        )
      }),
      columnHelper.accessor('status', {
        header: 'สถานะ',
        cell: ({ row }) => (
          <Chip
            size='small'
            variant='tonal'
            color={STATUS_COLOR[row.original.status] ?? 'default'}
            label={STATUS_LABEL[row.original.status] ?? row.original.status}
          />
        )
      }),
      columnHelper.accessor(row => new Date(row.createdAt).getTime(), {
        id: 'date',
        header: 'วันที่',
        cell: ({ row }) => (
          <Typography color='text.secondary'>
            {formatDate(row.original.createdAt)}
          </Typography>
        )
      }),
      columnHelper.accessor('action', {
        header: '',
        cell: ({ row }) => (
          <Link
            href={`/o/${row.original.publicToken}`}
            className='inline-flex items-center gap-1 text-sm text-[var(--mui-palette-primary-main)] hover:underline'
          >
            ดู
            <i className='tabler-chevron-right text-base' />
          </Link>
        ),
        enableSorting: false
      })
    ],
    []
  )

  const table = useReactTable({
    data,
    columns: columns as ColumnDef<BuyerOrderRow, any>[],
    filterFns: {},
    state: { globalFilter },
    initialState: { pagination: { pageSize: 10 } },
    globalFilterFn: 'includesString',
    getCoreRowModel: getCoreRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues()
  })

  return (
    <Card>
      <CardContent className='flex justify-between max-sm:flex-col sm:items-center gap-4'>
        <DebouncedInput
          value={globalFilter ?? ''}
          onChange={value => setGlobalFilter(String(value))}
          placeholder='ค้นหาคำสั่งซื้อ'
          className='sm:is-auto'
        />
        <CustomTextField
          select
          value={table.getState().pagination.pageSize}
          onChange={e => table.setPageSize(Number(e.target.value))}
          className='is-[70px] max-sm:is-full'
        >
          <MenuItem value='10'>10</MenuItem>
          <MenuItem value='25'>25</MenuItem>
          <MenuItem value='50'>50</MenuItem>
          <MenuItem value='100'>100</MenuItem>
        </CustomTextField>
      </CardContent>
      <div className='overflow-x-auto'>
        <table className={tableStyles.table}>
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id}>
                    {header.isPlaceholder ? null : (
                      <div
                        className={classnames({
                          'flex items-center': header.column.getIsSorted(),
                          'cursor-pointer select-none': header.column.getCanSort()
                        })}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: <i className='tabler-chevron-up text-xl' />,
                          desc: <i className='tabler-chevron-down text-xl' />
                        }[header.column.getIsSorted() as 'asc' | 'desc'] ?? null}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          {table.getFilteredRowModel().rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={table.getVisibleFlatColumns().length} className='text-center py-10'>
                  ไม่มีคำสั่งซื้อในหมวดนี้
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
      <TablePagination
        component={() => (
          <TablePaginationComponent table={table as unknown as ReturnType<typeof useReactTable>} />
        )}
        count={table.getFilteredRowModel().rows.length}
        rowsPerPage={table.getState().pagination.pageSize}
        page={table.getState().pagination.pageIndex}
        onPageChange={(_, page) => {
          table.setPageIndex(page)
        }}
      />
    </Card>
  )
}

export default OrderListTable
