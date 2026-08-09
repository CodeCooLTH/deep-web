'use client'

import { cn } from '@/utils/helpers'
import { flexRender, Row, Table as TableType } from '@tanstack/react-table'
import clsx from 'clsx'
import { Fragment } from 'react'
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

  /**
   * Opt-in แถวหัวกลุ่ม — render `<tr>` เพิ่มอีกหนึ่งแถวเหนือแถวข้อมูลของทุก row
   * โดยกิน colSpan เต็มความกว้าง (ผู้เรียกได้พื้นที่แนวนอนทั้งแถวไปจัดเอง)
   *
   * ทำไมต้องมี: ตารางที่มีคอลัมน์เยอะเกินกว่าจะพอดีจอ (seller /orders มี 12 คอลัมน์
   * ต้องการ 1691px แต่จอจริงให้พื้นที่แค่ ~1250px) แก้ด้วยการย้ายข้อมูล "ระดับใบ"
   * (เลขออเดอร์ / ที่มา / วันที่) ขึ้นไปอยู่แถบหัวแทนที่จะเบียดเป็นคอลัมน์ผอม ๆ
   *
   * ไม่ส่ง → behavior เดิมเป๊ะ (backward-compatible 100%) เหมือน mobileCard
   */
  groupRow?: (row: Row<TData>) => React.ReactNode

  /**
   * Opt-in คลิกทั้งแถวบนเดสก์ท็อป — คู่กับ `mobileCard` ที่ทั้งการ์ดกดได้อยู่แล้ว
   *
   * ทำไมต้องมี: ตารางที่การ์ดมือถือกดได้ทั้งใบ แต่เดสก์ท็อปเข้าได้ทางเดียวคือปุ่มไอคอน 30px
   * ในคอลัมน์สุดท้าย = object เดียวกันแต่ interaction คนละแบบตาม breakpoint ซึ่งผู้ใช้ที่สลับ
   * อุปกรณ์ต้องมาเรียนรู้ใหม่ (impeccable critique 2026-08-09 P2)
   *
   * ปุ่มไอคอนยังอยู่ในฐานะ affordance ที่มองเห็นได้ — คลิกทั้งแถวเป็นทางลัด ไม่ใช่ทางเดียว
   * คลิกที่ปุ่ม/ลิงก์/อินพุตข้างในถูกข้ามให้เอง (ตัวมันมี handler ของตัวเองอยู่แล้ว) และการ
   * ลากคัดลอกข้อความในแถวไม่นับเป็นคลิก
   *
   * ไม่ส่ง → behavior เดิมเป๊ะ (backward-compatible 100%) เหมือน mobileCard/groupRow
   */
  onRowClick?: (row: Row<TData>) => void
}

const DataTable = <TData,>({ table, className = '', emptyMessage = 'Nothing found.', showHeaders = true, mobileCard, groupRow, onRowClick }: DataTableProps<TData>) => {
  'use no memo'
  // visible ไม่ใช่ all — ตารางที่มีคอลัมน์ซ่อน (เช่น OrdersTable ที่เก็บ createdAtISO ไว้ให้
  // ตัวกรองเกาะอย่างเดียว) จะได้ colSpan ของแถว empty เกินจำนวนคอลัมน์จริงไป 1
  const columns = table.getVisibleLeafColumns()
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
                  <th key={header.id} onClick={header.column.getToggleSortingHandler()} className={cn('select-none', header.column.getCanSort() ? 'cursor-pointer' : 'cursor-default', (header.column.columnDef.meta as { headerClassName?: string } | undefined)?.headerClassName)}>
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
              <Fragment key={row.id}>
                {/* แถบหัวกลุ่ม — !border-b-0 เพื่อให้หัวกับเนื้อหาอ่านเป็นบล็อกเดียวกัน
                    ไม่ใช่สองแถวที่บังเอิญอยู่ติดกัน (เส้นคั่นเหลือเฉพาะท้ายบล็อก) */}
                {groupRow && (
                  <tr className="!border-b-0">
                    <td colSpan={row.getVisibleCells().length} className="bg-default-100/70 !py-2">
                      {groupRow(row)}
                    </td>
                  </tr>
                )}
                <tr
                  className={onRowClick ? 'cursor-pointer' : undefined}
                  onClick={
                    onRowClick
                      ? (e) => {
                          // ลากคัดลอกข้อความในแถวต้องไม่ถูกตีเป็นคลิก (click ยิงหลัง drag-select
                          // ที่จบในอิลิเมนต์เดียวกันเสมอ) — แพตเทิร์นเดียวกับแถวคอมเมนต์ใน
                          // CommentsClient.tsx
                          if (!window.getSelection()?.isCollapsed) return
                          // ของที่มี handler ของตัวเองอยู่แล้ว ปล่อยให้มันทำงานไป อย่าสั่งซ้ำ
                          if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label')) return
                          onRowClick(row)
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <td suppressHydrationWarning key={cell.id} className={cn((cell.column.columnDef.meta as { cellClassName?: string } | undefined)?.cellClassName)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              </Fragment>
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
