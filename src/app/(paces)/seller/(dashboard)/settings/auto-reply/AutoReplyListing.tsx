'use client'

/**
 * AutoReplyListing — ตาราง listing กลุ่มคำตอบอัตโนมัติ (feature 00023, S-13)
 *
 * Base: src/app/(paces)/seller/(dashboard)/products/components/ProductsListing.tsx
 *   (ซึ่ง Base เดิม = theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/products/
 *    components/ProductsListing.tsx) — ยกมาทั้งโครง: DataTable + TanStack useReactTable,
 *   toolbar ใน card-header (ค้นหา `input-icon-group` / "กรอง:" / จำนวนต่อหน้า / ปุ่มสร้าง),
 *   mobile toolbar แยก (search pill + filter chips), mobileCard, card-footer + TablePagination,
 *   DeleteConfirmationModal
 *
 * เปลี่ยนจาก Base:
 *   - columns: name / โหมด / คำตรวจจับ / คำตอบ / สถานะ / แก้ไขล่าสุด / การจัดการ
 *   - ไม่มีรูปสินค้า → leading เป็นไอคอนกลุ่มคำแทน thumbnail
 *   - สถานะเป็น `form-switch` กดแล้วมีผลทันที ไม่ใช่ badge อ่านอย่างเดียว
 *     (บทเรียน 2026-07-29: user เปิดสวิตช์ในฟอร์มแล้วไม่ได้กดบันทึก → ระบบไม่ตอบ แล้วงงว่าทำไม)
 *   - ตัวเลือกจำนวนต่อหน้าใช้ ChoiceSelect ไม่ใช่ `<select>` ดิบ (Hard Rule 7 / theme-guard)
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ColumnDef,
  ColumnFiltersState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import DataTable from '@/components/table/DataTable'
import DeleteConfirmationModal from '@/components/table/DeleteConfirmationModal'
import TablePagination from '@/components/table/TablePagination'
import ChoiceSelect from '@/components/wrappers/ChoiceSelect'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { formatDateTime } from '@/lib/format-date'
import { cn } from '@/utils/helpers'

export type KeywordRow = {
  id: string
  name: string
  matchType: string
  priority: number
  isActive: boolean
  mode: string
  phraseCount: number
  ruleCount: number
  updatedAt: string
}

const MODE_OPTIONS = [
  { value: 'All', label: 'ทุกโหมด' },
  { value: 'LIVE', label: 'ใช้งานจริง' },
  { value: 'TEST', label: 'ทดสอบ' },
]

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20].map((n) => ({ value: String(n), label: String(n) }))

const STATUS_CHIPS = [
  { key: 'all' as const, label: 'ทั้งหมด' },
  { key: 'active' as const, label: 'เปิดใช้งาน' },
  { key: 'inactive' as const, label: 'ปิดอยู่' },
]

const columnHelper = createColumnHelper<KeywordRow>()

/** badge โหมด — ทดสอบ=เหลือง (เตือน) / ใช้งานจริง=น้ำเงิน
 *  ไม่ใช้เขียวเพราะเขียวสงวนให้ "เปิดใช้งานอยู่" ตาม Verified-Means-Green */
function ModeBadge({ mode }: { mode: string }) {
  return (
    <span
      className={cn(
        'badge text-2xs py-0 font-semibold',
        mode === 'TEST' ? 'bg-warning/15 text-warning' : 'bg-primary/15 text-primary',
      )}
    >
      {mode === 'TEST' ? 'ทดสอบ' : 'ใช้งานจริง'}
    </span>
  )
}

type Props = {
  keywords: KeywordRow[]
  canEdit: boolean
}

export default function AutoReplyListing({ keywords, canEdit }: Props) {
  const router = useRouter()
  const [data, setData] = useState<KeywordRow[]>(() => [...keywords])
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [statusChip, setStatusChip] = useState<'all' | 'active' | 'inactive'>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  /** เปิด/ปิดกลุ่มคำทันทีที่กดสวิตช์ — optimistic แล้วคืนค่าเดิมถ้าเซิร์ฟเวอร์ปฏิเสธ
   *  (เปิดไม่ได้ถ้ายังไม่มีคำตรวจจับหรือคำตอบ — ต้องบอกเหตุผล ไม่ใช่เด้งกลับเงียบ ๆ) */
  async function toggleActive(row: KeywordRow, next: boolean) {
    if (!canEdit || busyId) return
    setBusyId(row.id)
    setData((rows) => rows.map((r) => (r.id === row.id ? { ...r, isActive: next } : r)))
    try {
      const res = await fetch(`/api/shops/auto-reply/keywords/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ isActive: next }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'บันทึกไม่สำเร็จ')
      pacesToast.success(next ? `เปิดใช้งาน "${row.name}" แล้ว` : `ปิด "${row.name}" แล้ว`)
    } catch (e) {
      setData((rows) => rows.map((r) => (r.id === row.id ? { ...r, isActive: !next } : r)))
      pacesToast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusyId(null)
    }
  }

  const columns: ColumnDef<KeywordRow, any>[] = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'กลุ่มคำ',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="bg-default-100 flex size-9 shrink-0 items-center justify-center rounded">
              <Icon icon="message-2-bolt" className="text-default-400 size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h5 className="mb-0.5">
                <Link
                  href={`/settings/auto-reply/${row.original.id}`}
                  className="hover:text-primary font-medium"
                >
                  {row.original.name}
                </Link>
              </h5>
              <p className="text-default-400 text-2xs mb-0">
                {row.original.phraseCount > 0
                  ? `${row.original.phraseCount} คำตรวจจับ`
                  : 'ยังไม่มีคำตรวจจับ'}
              </p>
            </div>
          </div>
        ),
      }),
      columnHelper.accessor('mode', {
        header: 'โหมด',
        filterFn: 'equalsString',
        enableColumnFilter: true,
        cell: ({ row }) => <ModeBadge mode={row.original.mode} />,
      }),
      columnHelper.accessor('phraseCount', {
        header: 'คำตรวจจับ',
        cell: ({ row }) => <span className="text-default-600">{row.original.phraseCount}</span>,
      }),
      columnHelper.accessor('ruleCount', {
        header: 'คำตอบ',
        cell: ({ row }) => <span className="text-default-600">{row.original.ruleCount}</span>,
      }),
      columnHelper.accessor('isActive', {
        header: 'สถานะ',
        filterFn: 'equals',
        enableColumnFilter: true,
        enableSorting: false,
        cell: ({ row }) => (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="form-switch"
              checked={row.original.isActive}
              disabled={!canEdit || busyId === row.original.id}
              onChange={(e) => toggleActive(row.original, e.target.checked)}
              aria-label={`เปิดใช้งาน ${row.original.name}`}
            />
            <span className={cn('text-xs', row.original.isActive ? 'text-success' : 'text-default-400')}>
              {row.original.isActive ? 'เปิดใช้งาน' : 'ปิดอยู่'}
            </span>
          </label>
        ),
      }),
      columnHelper.accessor('updatedAt', {
        header: 'แก้ไขล่าสุด',
        cell: ({ row }) => (
          <span className="text-default-500 text-sm">
            {formatDateTime(new Date(row.original.updatedAt))}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'การจัดการ',
        cell: ({ row }) => (
          <div className="flex items-center justify-center gap-1.5">
            <Link
              href={`/settings/auto-reply/${row.original.id}`}
              className="btn btn-icon btn-sm border-default-300 text-default-800 hover:border-default-400 border"
              aria-label={`แก้ไข ${row.original.name}`}
            >
              <Icon icon="pencil" className="text-base" aria-hidden="true" />
            </Link>
            {canEdit && (
              <button
                type="button"
                className="btn btn-icon btn-sm border-default-300 text-default-800 hover:border-default-400 border"
                onClick={() => {
                  'use no memo'
                  setDeletingId(row.original.id)
                }}
                data-hs-overlay="#confirm-delete-modal"
                suppressHydrationWarning
                aria-label={`ลบ ${row.original.name}`}
              >
                <Icon icon="trash" className="text-danger text-base" aria-hidden="true" />
              </button>
            )}
          </div>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, busyId],
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnFilters, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
    filterFns: {},
    enableColumnFilters: true,
    enableRowSelection: false,
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = pageIndex * pageSize + 1
  const end = Math.min(start + pageSize - 1, totalItems)

  const currentModeFilter = (table.getColumn('mode')?.getFilterValue() as string) ?? 'All'

  function handleChipChange(chip: 'all' | 'active' | 'inactive') {
    setStatusChip(chip)
    table.getColumn('isActive')?.setFilterValue(chip === 'all' ? undefined : chip === 'active')
  }

  async function handleDelete() {
    const id = deletingId
    if (!id) return
    try {
      const res = await fetch(`/api/shops/auto-reply/keywords/${id}`, {
        method: 'DELETE',
        cache: 'no-store',
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'ลบไม่สำเร็จ')
      setData((prev) => prev.filter((k) => k.id !== id))
      setDeletingId(null)
      setPagination((p) => ({ ...p, pageIndex: 0 }))
      pacesToast.success('ลบกลุ่มคำเรียบร้อย')
      router.refresh()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    } finally {
      window.HSOverlay?.close('#confirm-delete-modal')
    }
  }

  return (
    <div className="card">
      {/* ===== Mobile toolbar (ซ่อนบน lg ขึ้นไป) — Base ProductsListing.tsx ===== */}
      <div className="space-y-2.5 px-4 pt-3 pb-2 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="input-icon-group flex-1">
            <Icon icon="search" className="input-icon" />
            <input
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
              type="text"
              className="form-input"
              placeholder="ค้นหากลุ่มคำ..."
              aria-label="ค้นหากลุ่มคำ"
            />
          </div>
          {canEdit && (
            <Link
              href="/settings/auto-reply/new"
              /* min-h-11 (44px): tap-target มือถือ — btn-sm สูงราว 31px ไม่พอ
                 (Paces ไม่มี touch-min token, comment กำกับตาม Hard Rule 7) */
              className="btn btn-sm bg-primary hover:bg-primary-hover min-h-11 shrink-0 rounded-full text-white"
            >
              <Icon icon="plus" className="size-4" aria-hidden="true" />
              สร้าง
            </Link>
          )}
        </div>
        {/* no-scrollbar = safepay-overrides.css; Paces ไม่มี token สำหรับแถบเลื่อนแนวนอน */}
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 whitespace-nowrap">
          <div className="inline-flex gap-2">
            {STATUS_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => handleChipChange(chip.key)}
                className={cn(
                  'badge cursor-pointer rounded-full border px-3 py-1 text-xs font-medium',
                  statusChip === chip.key
                    ? 'bg-primary border-primary text-white'
                    : 'bg-default-100 text-default-500 border-transparent',
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Desktop card-header — Base ProductsListing.tsx ===== */}
      <div className="card-header hidden lg:flex">
        <div className="flex gap-2.5">
          <div className="input-icon-group">
            <Icon icon="search" className="input-icon" />
            <input
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
              type="text"
              className="form-input"
              placeholder="ค้นหากลุ่มคำ..."
              aria-label="ค้นหากลุ่มคำ"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 md:flex-nowrap">
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:gap-3">
            <span className="font-semibold">กรอง:</span>
            <div className="w-40">
              <ChoiceSelect
                options={MODE_OPTIONS}
                value={currentModeFilter}
                search={false}
                onChange={(v) =>
                  table.getColumn('mode')?.setFilterValue(v === 'All' ? undefined : v)
                }
                ariaLabel="กรองตามโหมด"
              />
            </div>
          </div>
          <div className="w-20">
            <ChoiceSelect
              options={PAGE_SIZE_OPTIONS}
              value={String(pageSize)}
              search={false}
              onChange={(v) => table.setPageSize(Number(v))}
              ariaLabel="จำนวนต่อหน้า"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canEdit && (
            <Link href="/settings/auto-reply/new" className="btn bg-primary hover:bg-primary-hover text-white">
              <Icon icon="plus" aria-hidden="true" />
              สร้างกลุ่มคำ
            </Link>
          )}
        </div>
      </div>

      <DataTable<KeywordRow>
        table={table}
        emptyMessage="ไม่พบกลุ่มคำ"
        mobileCard={(row) => {
          const k = row.original
          return (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="bg-default-100 flex size-11 shrink-0 items-center justify-center rounded-lg">
                <Icon icon="message-2-bolt" className="text-default-300 size-6" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/settings/auto-reply/${k.id}`}
                  className="text-default-800 hover:text-primary block truncate text-sm font-medium"
                >
                  {k.name}
                </Link>
                <p className="text-default-400 mt-0.5 mb-0 text-xs">
                  {k.phraseCount} คำตรวจจับ · {k.ruleCount} คำตอบ
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <ModeBadge mode={k.mode} />
                  <span
                    className={cn(
                      'badge text-2xs py-0 font-semibold',
                      k.isActive ? 'bg-success/15 text-success' : 'bg-default-100 text-default-500',
                    )}
                  >
                    {k.isActive ? 'เปิดใช้งาน' : 'ปิดอยู่'}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <input
                  type="checkbox"
                  className="form-switch"
                  checked={k.isActive}
                  disabled={!canEdit || busyId === k.id}
                  onChange={(e) => toggleActive(k, e.target.checked)}
                  aria-label={`เปิดใช้งาน ${k.name}`}
                />
                <Link
                  href={`/settings/auto-reply/${k.id}`}
                  /* size-11 (44px) tap-target มือถือ — เหตุผลเดียวกับปุ่มสร้างด้านบน */
                  className="btn btn-icon border-default-300 text-default-800 hover:border-default-400 size-11 min-h-0 border"
                  aria-label={`แก้ไข ${k.name}`}
                >
                  <Icon icon="pencil" className="text-base" aria-hidden="true" />
                </Link>
              </div>
            </div>
          )
        }}
      />

      {table.getRowModel().rows.length > 0 && (
        <div className="card-footer">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            itemsName="กลุ่มคำ"
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

      <DeleteConfirmationModal
        onConfirm={handleDelete}
        selectedCount={1}
        itemName="กลุ่มคำ"
        modalTitle="ยืนยันการลบ"
        confirmButtonText="ลบ"
        cancelButtonText="ยกเลิก"
      >
        <p className="text-default-500">
          ลบกลุ่มคำนี้แล้วคำตอบทั้งหมดในกลุ่มจะหายไปด้วย และกู้คืนไม่ได้
        </p>
      </DeleteConfirmationModal>
    </div>
  )
}
