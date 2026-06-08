'use client'

import { cn } from '@/utils/helpers'
import { flexRender, Row, Table as TableType } from '@tanstack/react-table'
import clsx from 'clsx'
import Icon from '../wrappers/Icon'

type DataTableProps<TData> = {
  /**
   * The table instance from useReactTable
   */
  table: TableType<TData>
  /**
   * Optional class name for the table container
   */
  className?: string
  /**
   * Optional message to display when no data is available
   * @default 'Nothing found.'
   */
  emptyMessage?: React.ReactNode

  /**
   * Optional boolean to display headers
   * @default true
   */
  showHeaders?: boolean

  /**
   * Opt-in mobile card render — ถ้าส่ง prop นี้จะ render 2 โหมด:
   *   - desktop (lg:block): table เดิมไม่เปลี่ยน
   *   - mobile (<lg): card list แทนตาราง
   *
   * ถ้าไม่ส่ง → behavior เดิมเป๊ะ (backward-compatible 100%)
   *
   * ตัวอย่าง:
   *   mobileCard={(row) => <MyCard data={row.original} />}
   */
  mobileCard?: (row: Row<TData>) => React.ReactNode
}

const DataTable = <TData,>({ table, className = '', emptyMessage = 'Nothing found.', showHeaders = true, mobileCard }: DataTableProps<TData>) => {
  'use no memo'
  const columns = table.getAllColumns()
  const rows = table.getRowModel().rows

  // ตารางเดิม — ใช้ร่วมกันทั้งสองโหมด
  const tableEl = (
    <div className={clsx('table-wrapper', className)}>
      <table className="table table-hover">
        {showHeaders && (
          <thead className="thead-sm">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-light/25 text-2xs uppercase">
                {headerGroup.headers.map((header) => (
                  <th key={header.id} onClick={header.column.getToggleSortingHandler()} className={cn('select-none', header.column.getCanSort() ? 'cursor-pointer' : 'cursor-default')}>
                    <div className={cn('flex items-center', { 'justify-center': header.column.columnDef.header === 'Actions' })}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() &&
                        ({
                          asc: <Icon icon="arrow-up" className="ms-1" />,
                          desc: <Icon icon="arrow-down" className="ms-1" />,
                        }[header.column.getIsSorted() as string] ??
                          null)}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
        )}
        <tbody>
          {rows?.length ? (
            rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td suppressHydrationWarning key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="text-center text-default-400 py-3">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )

  // ถ้าไม่มี mobileCard → render ตารางเดิมเลย (backward-compatible เดิม 100%)
  if (!mobileCard) {
    return tableEl
  }

  // มี mobileCard → render 2 โหมด: desktop table (hidden บน mobile) + mobile card list
  return (
    <>
      {/* Desktop: ตารางเดิม — ซ่อนบน mobile */}
      <div className="hidden lg:block">{tableEl}</div>

      {/* Mobile: divided list — ซ่อนบน desktop
          ใช้ divide-y (ไม่ใช่ card ซ้อน) เพราะตารางอยู่ใน .card panel แล้ว
          → row-card มีขอบ = nested cards (impeccable ban). แต่ละ row จัดการ padding เอง */}
      <div className="lg:hidden divide-y divide-default-100">
        {rows?.length ? (
          rows.map((row) => <div key={row.id}>{mobileCard(row)}</div>)
        ) : (
          // empty state เดียวกับตาราง
          <div className="text-center text-default-400 py-6 px-4">{emptyMessage}</div>
        )}
      </div>
    </>
  )
}

export default DataTable
