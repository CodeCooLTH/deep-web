'use client'

// React Imports
import { useEffect, useMemo, useState } from 'react'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import MenuItem from '@mui/material/MenuItem'
import Rating from '@mui/material/Rating'
import TablePagination from '@mui/material/TablePagination'
import Typography from '@mui/material/Typography'
import type { TextFieldProps } from '@mui/material/TextField'

// Third-party Imports
import classnames from 'classnames'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFacetedMinMaxValues,
  getPaginationRowModel,
  getSortedRowModel
} from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import TablePaginationComponent from '@components/TablePaginationComponent'
import { formatDate } from '@/lib/format-date'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

/**
 * Buyer-authored review row — server page must pass `createdAt` already as an
 * ISO string (Date is not JSON-serialisable across the RSC boundary).
 */
export type BuyerReviewRow = {
  id: string
  rating: number
  comment: string | null
  createdAt: string
  order: {
    publicToken: string
    items: { id: string; name: string }[]
    shop: {
      user: {
        displayName: string
        username: string
      }
    }
  }
}

type RowWithAction = BuyerReviewRow & { action?: string }

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
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  useEffect(() => {
    const timeout = setTimeout(() => {
      onChange(value)
    }, debounce)

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <CustomTextField {...props} value={value} onChange={e => setValue(e.target.value)} />
}

const columnHelper = createColumnHelper<RowWithAction>()

/**
 * Buyer "My Reviews" table.
 *
 * Base: theme/vuexy/typescript-version/full-version/src/views/apps/ecommerce/manage-reviews/ManageReviewsTable.tsx
 * Adapted columns to the buyer-authored view:
 *   ร้านค้า / สินค้า / คะแนน / ความคิดเห็น / วันที่ / ดู
 * Dropped: product image column (not captured on review), seller reply, status/
 *   approval chip, row checkbox, Export button, OptionMenu (delete) — these are
 *   seller-review-management concepts, not applicable to a buyer-authored view.
 */
const ManageReviewsTable = ({ reviewsData }: { reviewsData: BuyerReviewRow[] }) => {
  // States
  const [data] = useState<BuyerReviewRow[]>(reviewsData)
  const [globalFilter, setGlobalFilter] = useState('')
  const [ratingFilter, setRatingFilter] = useState<string>('All')

  const filteredData = useMemo(() => {
    if (ratingFilter === 'All') return data

    return data.filter(r => r.rating === Number(ratingFilter))
  }, [data, ratingFilter])

  const columns = useMemo<ColumnDef<RowWithAction, any>[]>(
    () => [
      columnHelper.accessor(row => row.order.shop.user.displayName, {
        id: 'shop',
        header: 'ร้านค้า',
        cell: ({ row }) => {
          const seller = row.original.order.shop.user

          return (
            <div className='flex flex-col'>
              <Link
                href={`/u/${seller.username}`}
                className='font-medium text-[var(--mui-palette-primary-main)] hover:underline'
              >
                {seller.displayName}
              </Link>
              <Typography variant='body2' color='text.secondary'>
                @{seller.username}
              </Typography>
            </div>
          )
        }
      }),
      columnHelper.accessor(row => row.order.items[0]?.name ?? '', {
        id: 'product',
        header: 'สินค้า',
        cell: ({ row }) => {
          const first = row.original.order.items[0]
          const extra = row.original.order.items.length - 1

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
      columnHelper.accessor('rating', {
        header: 'คะแนน',
        sortingFn: (rowA, rowB) => rowA.original.rating - rowB.original.rating,
        cell: ({ row }) => (
          <Rating
            name='buyer-review'
            readOnly
            value={row.original.rating}
            emptyIcon={<i className='tabler-star-filled' />}
          />
        )
      }),
      columnHelper.accessor('comment', {
        header: 'ความคิดเห็น',
        cell: ({ row }) => {
          const c = row.original.comment

          if (!c) {
            return (
              <Typography variant='body2' color='text.disabled'>
                —
              </Typography>
            )
          }

          const truncated = c.length > 80 ? `${c.slice(0, 80)}…` : c

          return (
            <Typography className='text-wrap max-is-[360px]' title={c}>
              {truncated}
            </Typography>
          )
        },
        enableSorting: false
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
            href={`/o/${row.original.order.publicToken}`}
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
    data: filteredData,
    columns: columns as ColumnDef<BuyerReviewRow, any>[],
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
      <CardContent className='flex flex-wrap justify-between gap-4'>
        <DebouncedInput
          value={globalFilter ?? ''}
          onChange={value => setGlobalFilter(String(value))}
          placeholder='ค้นหาร้าน / สินค้า'
          className='max-sm:is-full'
        />
        <div className='flex max-sm:flex-col sm:items-center gap-4 max-sm:is-full'>
          <CustomTextField
            select
            value={table.getState().pagination.pageSize}
            onChange={e => table.setPageSize(Number(e.target.value))}
            className='sm:is-[140px] flex-auto is-full'
          >
            <MenuItem value='10'>10</MenuItem>
            <MenuItem value='25'>25</MenuItem>
            <MenuItem value='50'>50</MenuItem>
          </CustomTextField>
          <CustomTextField
            select
            value={ratingFilter}
            onChange={e => setRatingFilter(e.target.value)}
            className='is-full sm:is-[140px] flex-auto'
          >
            <MenuItem value='All'>ทุกคะแนน</MenuItem>
            <MenuItem value='5'>5 ดาว</MenuItem>
            <MenuItem value='4'>4 ดาว</MenuItem>
            <MenuItem value='3'>3 ดาว</MenuItem>
            <MenuItem value='2'>2 ดาว</MenuItem>
            <MenuItem value='1'>1 ดาว</MenuItem>
          </CustomTextField>
        </div>
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
                  ยังไม่มีรีวิวที่ให้
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className={classnames({ selected: row.getIsSelected() })}>
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

export default ManageReviewsTable
