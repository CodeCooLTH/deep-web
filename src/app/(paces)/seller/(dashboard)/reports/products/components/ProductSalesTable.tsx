'use client'

/**
 * ProductSalesTable — ตารางสินค้าของรายงานยอดขายรายสินค้า เดสก์ท็อป/แท็บเล็ต (feature 00063)
 *
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductsTable.tsx
 *   (useReactTable + DataTable + TablePagination + คอลัมน์รูป/ชื่อสินค้า)
 *   ซึ่ง copy มาจาก theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products/
 *   components/ProductsListing.tsx
 *
 * 🛑 การกดในแถวแยกหน้าที่ชัดเจน (user เคาะ 2026-08-29): ช่องติ๊ก = สลับเส้นบนกราฟ ·
 * ชื่อสินค้า = ลิงก์ไปหน้าสินค้า · ที่เหลือของแถวกดไม่ได้ — สองการกระทำที่ผลลัพธ์คนละโลก
 * (อยู่หน้าเดิม vs พาออกจากหน้า) ไม่ควรใช้พื้นที่กดร่วมกัน จึง **ไม่ส่ง `onRowClick`**
 */
import {
  createColumnHelper,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'

import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import { formatDayMonthTH } from '@/lib/format-date'
import { CUSTOM_ITEM_NOTE } from '@/lib/product-sales-month'
import { formatBaht, formatNumberNoSymbol } from '@/lib/format-money'
import DayStrip from './DayStrip'
import PatternBadge from './PatternBadge'
import ProductThumb from './ProductThumb'
import {
  UNIT_COLUMN_LABELS,
  rowSeries,
  rowTotal,
  runoutLabel,
  type ProductSalesViewRow,
  type SalesUnit,
} from './data'

const columnHelper = createColumnHelper<ProductSalesViewRow>()

type Props = {
  rows: ProductSalesViewRow[]
  unit: SalesUnit
  selected: Set<string>
  onToggle: (key: string) => void
  /** true = ติ๊กเพิ่มไม่ได้แล้ว (ครบเพดานเส้น) — ช่องที่ยังไม่ติ๊กต้องถูกปิด */
  atCap: boolean
  cap: number
  futureFrom: number | null
  /**
   * สีวงแหวนรอบรูป — คีย์คือ `row.key` ค่าคือสีเดียวกับเส้นบนกราฟ (คำนวณที่ ProductSalesClient
   * ที่เดียว) · แถวที่ไม่ได้อยู่บนกราฟจะไม่มีในแมพ = ขอบเทาเดิม
   */
  colorByKey: Map<string, string>
  year: number
  month0: number
  monthLabel: string
}

export default function ProductSalesTable({
  rows,
  unit,
  selected,
  onToggle,
  atCap,
  cap,
  futureFrom,
  colorByKey,
  year,
  month0,
  monthLabel,
}: Props) {
  // useReactTable คืนฟังก์ชันที่ memo ไม่ได้อย่างปลอดภัย — ปิด React Compiler
  // เฉพาะ component นี้ (ท่าเดียวกับ src/components/table/DataTable.tsx:71)
  'use no memo'

  const [sorting, setSorting] = useState<SortingState>([{ id: 'total', desc: true }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })

  /**
   * 🛑 ต้อง `useCallback` — ฟังก์ชันที่สร้างใหม่ทุก render จะทำให้ dep array ของ `columns`
   * ด้านล่างเปลี่ยนทุกครั้ง ⇒ สร้างคอลัมน์ใหม่ทั้งชุดทุก render แล้วส่งเข้า useReactTable
   * (คลาสเดียวกับ docs/conventions/hook-return-identity-in-deps.md — ตัวที่ผิดคือความเสถียร
   *  ของ identity ไม่ใช่ชนิดของค่า จึงไม่มี tsc/build ตัวไหนฟ้อง)
   */
  const fmtValue = useCallback(
    (v: number) => (unit === 'baht' ? formatBaht(v) : `${formatNumberNoSymbol(v)} ชิ้น`),
    [unit],
  )

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: () => <span className="sr-only">แสดงบนกราฟ</span>,
        cell: ({ row }) => {
          const r = row.original
          const isOn = selected.has(r.key)
          // ยอด 0 ทั้งเดือน = ไม่มีอะไรให้ลากเส้น
          const noData = r.totalQty === 0 && r.totalAmount === 0
          const blocked = !isOn && (atCap || noData)
          return (
            <input
              type="checkbox"
              className="form-checkbox form-checkbox-light size-4.5"
              checked={isOn}
              disabled={blocked}
              onChange={() => onToggle(r.key)}
              aria-label={`แสดงเส้นของ ${r.name} บนกราฟ`}
              title={
                noData
                  ? 'สินค้านี้ไม่มียอดขายในเดือนนี้ จึงไม่มีเส้นให้แสดง'
                  : blocked
                    ? `เลือกได้สูงสุด ${cap} รายการ — เอาออกก่อนจึงจะเลือกเพิ่มได้`
                    : undefined
              }
            />
          )
        },
        enableSorting: false,
      }),

      columnHelper.accessor('name', {
        header: 'สินค้า',
        cell: ({ row }) => {
          const r = row.original
          return (
            // min-w-0 ที่กล่อง + max-w-full ที่ลูก + truncate — ต้องมาเป็นชุด ไม่งั้นชื่อยาว
            // จะดันกล่องกว้างเกินจอแทนที่จะถูกตัด (docs/conventions/flex-header-truncation.md)
            <div className="flex min-w-0 items-center gap-3">
              <ProductThumb
                src={r.image}
                alt={r.name}
                isCustom={r.isCustom}
                sizeClass="size-10"
                ringColor={colorByKey.get(r.key)}
              />
              <div className="min-w-0">
                {r.isCustom ? (
                  <>
                    <span className="text-default-900 block max-w-full truncate text-sm font-medium">
                      {r.name}
                    </span>
                    {/* 🛑 คำอธิบายต้อง "เห็นได้" ไม่ใช่ซ่อนใน title= — ป้ายบอกน้อยกว่าความจริง
                        (แถวนี้รวมสินค้าที่ถูกลบและของจากการประมูลด้วย) */}
                    <span className="text-default-400 mt-0.5 block text-xs">{CUSTOM_ITEM_NOTE}</span>
                  </>
                ) : (
                  <Link
                    href={`/products/${r.key}`}
                    className="text-default-900 hover:text-primary block max-w-full truncate text-sm font-medium">
                    {r.name}
                  </Link>
                )}
                {!r.isActive && !r.isCustom && (
                  <span className="badge bg-default-100 text-default-500 mt-1 inline-flex">
                    ปิดการขาย
                  </span>
                )}
                {/* บรรทัดรอง — ของที่ช่วยตัดสินใจสั่งของ ไม่ใช่ของที่ต้องอ่านทุกแถว จึงจางกว่า */}
                {!r.isCustom && (
                  <span className="text-default-400 mt-0.5 block text-xs">
                    {r.price !== null && `${formatBaht(r.price)}/ชิ้น`}
                    {r.price !== null && runoutLabel(r.runout) && ' · '}
                    {/* สต็อกใกล้หมดเป็นเรื่องที่ต้องสะดุดตา — ตัวเดียวในบรรทัดนี้ที่มีสี */}
                    {runoutLabel(r.runout) && (
                      <span className={r.runout.kind === 'OK' && r.runout.low ? 'text-warning-ink' : ''}>
                        {runoutLabel(r.runout)}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          )
        },
      }),

      columnHelper.display({
        id: 'trend',
        // หัวคอลัมน์เป็นคำนามให้เข้าชุดกับหัวอื่นทั้งตาราง (สินค้า / รูปแบบการขาย / ขายล่าสุด)
        header: 'ขายวันไหน',
        cell: ({ row }) => {
          const r = row.original
          return (
            <>
              <DayStrip
                values={rowSeries(r, unit)}
                futureFrom={futureFrom}
                formatValue={fmtValue}
                monthLabel={monthLabel}
                className="min-w-40"
              />
              <span className="text-default-400 mt-1 block text-xs">
                {r.activeDays > 0 ? `ขายได้ ${r.activeDays} วัน` : 'ไม่มียอดขาย'}
                {r.best &&
                  ` · ดีสุด ${formatDayMonthTH(new Date(Date.UTC(year, month0, r.best.index + 1)))} (${formatNumberNoSymbol(r.best.value)})`}
              </span>
            </>
          )
        },
        enableSorting: false,
      }),

      columnHelper.accessor((r) => r.pattern.kind, {
        id: 'pattern',
        header: 'รูปแบบการขาย',
        cell: ({ row }) => <PatternBadge pattern={row.original.pattern} />,
      }),

      columnHelper.accessor((r) => r.lastSoldDayIndex ?? -1, {
        id: 'lastSold',
        header: 'ขายล่าสุด',
        cell: ({ row }) => {
          const idx = row.original.lastSoldDayIndex
          if (idx === null) return <span className="text-default-400">—</span>
          return (
            <span className="text-default-700 whitespace-nowrap text-sm">
              {formatDayMonthTH(new Date(Date.UTC(year, month0, idx + 1)))}
            </span>
          )
        },
      }),

      columnHelper.accessor((r) => rowTotal(r, unit), {
        id: 'total',
        header: UNIT_COLUMN_LABELS[unit],
        cell: ({ row }) => {
          const r = row.original
          const v = rowTotal(r, unit)
          return (
            <span className="block text-right">
              <span className="text-default-900 block text-sm font-semibold tabular-nums">
                {unit === 'baht' ? formatBaht(v) : `${formatNumberNoSymbol(v)} ชิ้น`}
              </span>
              {/* หน่วยอีกด้าน + สัดส่วน — ผู้ขายไม่ต้องกดสลับหน่วยเพื่อดูตัวเลขอีกตัว */}
              <span className="text-default-400 mt-0.5 block text-xs tabular-nums">
                {unit === 'baht'
                  ? `${formatNumberNoSymbol(r.totalQty)} ชิ้น`
                  : formatBaht(r.totalAmount)}
                {r.sharePct !== null && ` · ${r.sharePct}% ของร้าน`}
              </span>
            </span>
          )
        },
      }),
    ],
    [selected, unit, atCap, cap, futureFrom, colorByKey, fmtValue, monthLabel, year, month0, onToggle],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: false,
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  return (
    <>
      <DataTable<ProductSalesViewRow>
        table={table}
        emptyMessage="ไม่มีสินค้าที่มียอดขายในเดือนนี้"
      />
      {totalItems > 0 && (
        <div className="card-footer">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            itemsName="สินค้า"
            showInfo
            previousPage={table.previousPage}
            canPreviousPage={table.getCanPreviousPage()}
            pageCount={table.getPageCount()}
            pageIndex={pageIndex}
            setPageIndex={table.setPageIndex}
            nextPage={table.nextPage}
            canNextPage={table.getCanNextPage()}
          />
        </div>
      )}
    </>
  )
}

